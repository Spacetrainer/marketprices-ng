/**
 * generate-form-options.ts — rebuild the Google Form's option lists from the database (§3.2).
 *
 * The form asks a collector to pick a commodity, a collection site, a tier and a unit from
 * dropdowns rather than type them, because free text "produces 'Rice', 'rice', 'Local Rice'
 * and 'Ric' inside a week and no backend cleanup recovers from it" (§6.1). This script is
 * what keeps those dropdowns honest: the lists come from `commodities`, `collection_sites`
 * and `units`, so the form cannot drift from the database it will be resolved against.
 *
 * TWO CONSUMERS, ONE FILE.
 *
 *   1. POST /api/ingest/price reads `data/form-options.json` and resolves every submitted
 *      name to an id against it. It validates the file with `formOptionsSchema` and refuses
 *      the whole request with 503 `options_unavailable` if anything is off — so a malformed
 *      file here does not degrade intake, it stops it. This script therefore validates its
 *      own output against that same schema before writing, and writes atomically.
 *
 *   2. A human building the Google Form reads the `name` values. That is the only reason
 *      `tiers` is in the output at all — nothing in the running code reads it (`TIERS` in
 *      lib/validation/ingest.ts is the authority, and this file imports it rather than
 *      restating the two strings).
 *
 * THE FILE IS COMMITTED, AND THAT IS THE DESIGN. `app/api/ingest/price/route.ts` reads it
 * from `process.cwd()` at request time; Vercel builds from git, so a gitignored file would
 * simply not exist in production and every submission would 503. Committing it also makes a
 * change to what the form offered a reviewable diff, which is how the rest of this repo
 * treats reference data. `pnpm check:form-options` re-runs this against the live database in
 * CI and fails the build if the committed file no longer matches, so "committed" can never
 * quietly become "stale".
 *
 * THE PUBLISHABLE KEY, NOT THE SECRET ONE. All three tables carry anon SELECT policies that
 * already filter on `is_active` (0006, 0007), so RLS acts as a second lock agreeing with the
 * explicit filters below. A form-options generator has no business holding a service-role key.
 *
 * Usage:
 *   pnpm gen:form-options      write data/form-options.json
 *   pnpm check:form-options    compare the committed file against the database; exit 1 on drift
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { TIERS, formOptionsSchema, normaliseName, type Tier } from "../lib/validation/ingest";

/** Must stay in step with FORM_OPTIONS_PATH in app/api/ingest/price/route.ts. */
const OUTPUT_PATH = path.join(process.cwd(), "data", "form-options.json");

/**
 * What this script writes: the shape the route validates, plus `tiers` for the form builder.
 *
 * `formOptionsSchema` is a non-strict Zod object, so it STRIPS `tiers` when it parses. The
 * validation step below therefore gates on the parse result but writes this payload — parsing
 * and then writing `result.data` would silently drop the field.
 */
export interface GeneratedFormOptions {
  generated_at: string;
  commodities: { id: string; name: string; aliases: string[] }[];
  collection_sites: { id: string; name: string }[];
  units: { id: string; name: string; abbreviation: string }[];
  tiers: readonly Tier[];
}

/** Everything except `generated_at` — the part the drift check compares. */
export type FormOptionsContent = Omit<GeneratedFormOptions, "generated_at">;

export class GenerationError extends Error {}

function readEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new GenerationError(`Supabase environment incomplete — missing ${missing}`);
  }

  return { url, publishableKey };
}

/**
 * Refuse to emit two entries in one list whose names normalise to the same key.
 *
 * Neither `commodities.canonical_name` nor `collection_sites.name` is UNIQUE — only `slug`
 * is (0006), and 0007 constrains nothing. `resolveName`'s exact-match loop returns on its
 * first hit, so two rows sharing a normalised name would send every submission naming it to
 * whichever happens to sort first, silently and with no ambiguity warning. Better to fail
 * generation than to publish a list that misroutes prices into the wrong series.
 */
export function assertDistinct(label: string, entries: { id: string; name: string }[]): void {
  const seen = new Map<string, string>();

  for (const entry of entries) {
    const key = normaliseName(entry.name);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new GenerationError(
        `Two ${label} entries share the normalised name "${key}": "${previous}" and "${entry.name}". ` +
          `A submitted name matching it would resolve to whichever sorts first, so no file was written.`,
      );
    }
    seen.set(key, entry.name);
  }
}

async function fetchContent(): Promise<FormOptionsContent> {
  const { url, publishableKey } = readEnv();
  const supabase = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const [commodities, sites, units] = await Promise.all([
    // is_tracked AND is_active. `is_tracked` is the editorial commitment to price this
    // weekly; `is_active` is whether it exists to the product at all. A deactivated
    // commodity is invisible to every public read, so offering it on the form would collect
    // prices for a series the site will never render.
    supabase
      .from("commodities")
      .select("id, canonical_name, aliases")
      .eq("is_tracked", true)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),

    supabase
      .from("collection_sites")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),

    // No filter: `units` has no is_active column, and unlike the other two a unit cannot be
    // retired once it exists. seed.sql names this script as the reason only the 8 units
    // actually used by the seeded commodities were inserted rather than all 25 in the source
    // file — the whole table is what the form offers.
    supabase.from("units").select("id, name, abbreviation").order("name", { ascending: true }),
  ]);

  const failure = commodities.error ?? sites.error ?? units.error;
  if (failure) throw new GenerationError(`Database read failed: ${failure.message}`);

  const content: FormOptionsContent = {
    commodities: (commodities.data ?? []).map((row) => ({
      id: row.id,
      // The column is `canonical_name`; the JSON key the route reads is `name`.
      name: row.canonical_name,
      aliases: row.aliases,
    })),
    collection_sites: (sites.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    units: (units.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
    })),
    tiers: TIERS,
  };

  assertNonEmpty(content);
  assertDistinct("commodity", content.commodities);
  assertDistinct("collection site", content.collection_sites);
  assertDistinct("unit", content.units);

  return content;
}

/**
 * Refuse to emit a list with nothing in it.
 *
 * `formOptionsSchema` would reject an empty array anyway via `.min(1)`, but only once the
 * route had already read the file — as a 503 that stops all intake and says nothing about
 * which list is empty or why. Failing here instead names the list and the filter that
 * emptied it, at the moment someone could still act on it.
 */
export function assertNonEmpty(content: FormOptionsContent): void {
  const empty = [
    content.commodities.length === 0 && "no commodity is both is_tracked and is_active",
    content.collection_sites.length === 0 && "no collection site is is_active",
    content.units.length === 0 && "the units table is empty",
  ].filter((value): value is string => typeof value === "string");

  if (empty.length > 0) {
    throw new GenerationError(
      `The database has nothing to offer the form — ${empty.join("; ")}. No file was written.`,
    );
  }
}

/** Gate the payload on the exact schema the route will apply to it at request time. */
function validate(payload: GeneratedFormOptions): void {
  const result = formOptionsSchema.safeParse(payload);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new GenerationError(
      `The generated options would be rejected by the ingest route: ${detail}. No file was written.`,
    );
  }
}

/** 2-space indent and a trailing newline, so the committed file diffs like source. */
function serialise(payload: GeneratedFormOptions): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

async function write(payload: GeneratedFormOptions): Promise<void> {
  // Temp file then rename: a crashed or interrupted run must not be able to leave truncated
  // JSON behind, because the route reads this at request time and truncated JSON is a 503.
  const temporary = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporary, serialise(payload), "utf8");
  await rename(temporary, OUTPUT_PATH);
}

/** Key-sorted JSON, so the comparison cannot fail on key order alone. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (nested === null || typeof nested !== "object" || Array.isArray(nested)) return nested;
    const record = nested as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
  });
}

/**
 * Report how the committed file differs from the database, entry by entry.
 *
 * `generated_at` is excluded on purpose: it changes on every run, so comparing it would make
 * the check fail permanently and teach everyone to ignore it.
 */
export function describeDrift(
  committed: FormOptionsContent,
  fresh: FormOptionsContent,
): string[] {
  const lines: string[] = [];

  const lists = [
    ["commodities", committed.commodities, fresh.commodities],
    ["collection_sites", committed.collection_sites, fresh.collection_sites],
    ["units", committed.units, fresh.units],
  ] as const;

  for (const [label, was, now] of lists) {
    // Where this list's findings start. Membership changes already imply the order differs,
    // so the reorder line below is only worth adding when THIS list reported nothing else —
    // measured against this mark, not against the whole array, or a reorder in `units` would
    // go unreported whenever `commodities` happened to change too.
    const mark = lines.length;

    const before = new Map(was.map((entry) => [entry.id, entry]));
    const after = new Map(now.map((entry) => [entry.id, entry]));

    for (const [id, entry] of after) {
      const previous = before.get(id);
      if (!previous) lines.push(`  + ${label}: "${entry.name}" (${id}) is in the database but not the file`);
      else if (canonical(previous) !== canonical(entry)) {
        lines.push(`  ~ ${label}: ${id} changed — file has ${canonical(previous)}, database has ${canonical(entry)}`);
      }
    }

    for (const [id, entry] of before) {
      if (!after.has(id)) lines.push(`  - ${label}: "${entry.name}" (${id}) is in the file but not the database`);
    }

    // Same members, different order: the form's dropdown order is part of what is committed.
    if (lines.length === mark && was.map((e) => e.id).join() !== now.map((e) => e.id).join()) {
      lines.push(`  ~ ${label}: same entries, different order`);
    }
  }

  if (canonical(committed.tiers) !== canonical(fresh.tiers)) {
    lines.push(`  ~ tiers: file has ${canonical(committed.tiers)}, TIERS is ${canonical(fresh.tiers)}`);
  }

  return lines;
}

async function check(fresh: FormOptionsContent): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(OUTPUT_PATH, "utf8");
  } catch {
    throw new GenerationError(
      `${OUTPUT_PATH} is missing. The ingest route reads it at request time, so intake would ` +
        `503 on every submission — run 'pnpm gen:form-options' and commit the result.`,
    );
  }

  let committed: unknown;
  try {
    committed = JSON.parse(raw);
  } catch {
    throw new GenerationError(`${OUTPUT_PATH} is not valid JSON — run 'pnpm gen:form-options'.`);
  }

  const { generated_at: _ignored, ...content } = committed as GeneratedFormOptions;
  const drift = describeDrift(content, fresh);

  if (drift.length > 0) {
    throw new GenerationError(
      [
        "The committed form options no longer match the database:",
        ...drift,
        "",
        "The Google Form is built from this file and the ingest route resolves submitted names",
        "against it, so a stale file means collectors are offered options intake will reject.",
        "Run 'pnpm gen:form-options', rebuild the form's dropdowns to match, and commit.",
      ].join("\n"),
    );
  }

  console.log(
    `✓ data/form-options.json matches the database — ` +
      `${fresh.commodities.length} commodities, ${fresh.collection_sites.length} collection sites, ` +
      `${fresh.units.length} units.`,
  );
}

async function main(): Promise<void> {
  const checking = process.argv.includes("--check");
  const content = await fetchContent();

  if (checking) {
    // Validate the DATABASE's view too, so a check run cannot pass against a database that
    // could not produce a usable file in the first place.
    validate({ generated_at: new Date().toISOString(), ...content });
    await check(content);
    return;
  }

  const payload: GeneratedFormOptions = { generated_at: new Date().toISOString(), ...content };
  validate(payload);
  await write(payload);

  console.log(
    `Wrote data/form-options.json — ${payload.commodities.length} commodities, ` +
      `${payload.collection_sites.length} collection sites, ${payload.units.length} units, ` +
      `${payload.tiers.length} tiers.`,
  );
  console.log(
    "Commit it, and rebuild the Google Form's dropdowns from the `name` values so the form " +
      "and the database still agree.",
  );
}

// Same guard as capture-admin-session.ts: the pure helpers above are imported by
// generate-form-options.test.ts, and importing this module must not open a database
// connection or overwrite the committed file as a side effect.
const invokedDirectly = (process.argv[1] ?? "").includes("generate-form-options");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof GenerationError ? `✗ ${error.message}` : error);
    process.exit(1);
  });
}
