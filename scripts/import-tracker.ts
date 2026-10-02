/**
 * import-tracker.ts — bring one week column of the Lagos tracker into the review queue.
 *
 * THE SHAPE, AND WHY IT IS FOUR PIECES. reader → planner → poster, and the I/O lives only at
 * the ends:
 *
 *   lib/tracker/sheets.ts   Google Sheet → a grid of strings    (network — the default source)
 *   lib/tracker/xlsx.ts     bytes        → a grid of strings    (disk — the --file fallback)
 *   lib/tracker/reader.ts   grid         → the tracker's shape  (pure)
 *   lib/tracker/planner.ts  shape        → post / skip / refuse (pure — every rule, no I/O)
 *   lib/tracker/poster.ts   posts        → one POST each, paced (network)
 *
 * The planner is the whole product and it cannot reach anything. That is what makes the refusal
 * rules testable as grids of cells instead of as a mocked database, and it is what let the
 * Google Sheets source drop in without a single decision moving: the two sources both produce
 * the `Workbook` in lib/tracker/grid.ts, and lib/tracker/equivalence.test.ts asserts that they
 * produce the same PLAN from the same data, on the real workbook as well as a fixture.
 *
 * THE SHEET IS AN INTAKE BUFFER, NOT THE DATABASE. It exists so prices can be entered on a phone
 * in a market instead of into a file on a laptop. Supabase remains the store of record, the
 * service account is a Viewer with a read-only scope, and every row still enters through
 * /api/ingest/price as a `pending` submission for a human (P1.1).
 *
 * A DRY RUN IS THE DEFAULT AND --commit IS THE ONLY WAY PAST IT. The report a dry run prints is
 * the same plan the commit would send, produced by the same function; there is no second code
 * path that might disagree with it. `--commit` additionally requires the endpoint and the
 * bearer token in the environment, so a half-configured run cannot post half a column.
 *
 * IT POSTS THROUGH /api/ingest/price AND NOWHERE ELSE (P1.1). The script holds a service-role
 * key — it needs one to read `price_submissions` past RLS — and it never writes with it. The
 * endpoint's validation, collector resolution, outlier check and duplicate flagging are the
 * same for a tracker row as for any other, because they are the same code.
 *
 * WHAT IT READS FROM THE DATABASE, AND NOTHING MORE:
 *   - `collectors`, to turn the COLLECTED BY name into the phone the endpoint identifies a
 *     collector by (P1.2). The phone is never written in this repo.
 *   - `price_submissions` (pending or approved) and `price_observations`, to know which series
 *     already exist for the week so the run skips them rather than proposing a correction.
 *
 * Usage:
 *   pnpm import:tracker --column K                 dry run from the Google Sheet: posts nothing
 *   pnpm import:tracker --column K --commit         post the plan
 *   pnpm import:tracker --column K --file data/price-tracker.xlsx    read a workbook instead
 *
 * Environment:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL                     the Sheets source (not needed with --file)
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY                 "
 *   TRACKER_SPREADSHEET_ID                             "
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY    the reads above
 *   IMPORT_BASE_URL                                  where /api/ingest/price lives (--commit)
 *   PRICE_INGEST_SECRET                              the bearer token the route checks (--commit)
 *
 * If a stale SUPABASE_SECRET_KEY is exported in the shell it wins over .env.local, so start
 * with `env -u SUPABASE_SECRET_KEY pnpm import:tracker ...` when in doubt.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "../lib/supabase/admin";
import type { Workbook } from "../lib/tracker/grid";
import {
  checkSheetNames,
  expectedSheetNames,
  indexTrackerMap,
  parseTrackerMap,
  type MapIndex,
  type SheetNameCheck,
} from "../lib/tracker/map";
import {
  planImport,
  recordedKey,
  type Plan,
  type PlannerCollector,
} from "../lib/tracker/planner";
import { postPlan } from "../lib/tracker/poster";
import { readTracker } from "../lib/tracker/reader";
import { missingSheetsEnv, readTrackerSpreadsheet } from "../lib/tracker/sheets";
import { readWorkbook } from "../lib/tracker/xlsx";

const DEFAULT_WORKBOOK = path.join(process.cwd(), "data", "price-tracker.xlsx");
const MAP_PATH = path.join(process.cwd(), "data", "tracker-map.json");

export class ImportError extends Error {}

export const SOURCES = ["sheets", "xlsx"] as const;
export type Source = (typeof SOURCES)[number];

export interface Arguments {
  column: string;
  commit: boolean;
  file: string;
  source: Source;
}

/**
 * Parse the command line, refusing anything ambiguous.
 *
 * --column has no default on purpose. Defaulting to "this week's column" would mean deriving a
 * column from a clock, and the tracker's column labels are calendar-month weeks that do not
 * line up with ISO weeks — the K column is labelled "Sep 2026 Wk4" and holds an ISO W39 date.
 * A human names the column they mean.
 *
 * --source DOES have a default, and it is `sheets`, because that is where the tracker is now
 * maintained. Naming a --file implies --source xlsx, since a run that named a workbook and then
 * read the sheet anyway would be doing something other than what was asked. Naming both
 * explicitly and contradictorily is refused rather than resolved: one of the two is a mistake
 * and only the person typing knows which.
 */
export function parseArguments(argv: readonly string[]): Arguments {
  let column: string | null = null;
  let file = DEFAULT_WORKBOOK;
  let commit = false;
  let source: Source | null = null;
  let fileNamed = false;

  const chooseSource = (value: string | undefined): Source => {
    if (value === undefined || !(SOURCES as readonly string[]).includes(value)) {
      throw new ImportError(
        `--source must be one of ${SOURCES.join(", ")}${value === undefined ? "" : `, not "${value}"`}`,
      );
    }
    return value as Source;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--commit") {
      commit = true;
    } else if (argument === "--column") {
      column = argv[index + 1] ?? null;
      index += 1;
    } else if (argument.startsWith("--column=")) {
      column = argument.slice("--column=".length);
    } else if (argument === "--file") {
      file = argv[index + 1] ?? file;
      fileNamed = true;
      index += 1;
    } else if (argument.startsWith("--file=")) {
      file = argument.slice("--file=".length);
      fileNamed = true;
    } else if (argument === "--source") {
      source = chooseSource(argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--source=")) {
      source = chooseSource(argument.slice("--source=".length));
    } else {
      throw new ImportError(
        `Unrecognised argument "${argument}" — expected --column, --source, --file or --commit`,
      );
    }
  }

  if (!column || column.startsWith("--")) {
    throw new ImportError("--column <letter> is required, e.g. --column K");
  }

  if (source === "sheets" && fileNamed) {
    throw new ImportError(
      "--source sheets reads the Google Sheet and never a file, but --file names one. Drop one " +
        "of the two: --file alone reads the workbook, nothing at all reads the sheet.",
    );
  }

  return { column, commit, file, source: source ?? (fileNamed ? "xlsx" : "sheets") };
}

/** The reviewed map, parsed and indexed. */
export async function loadMap(mapPath: string = MAP_PATH): Promise<MapIndex> {
  let raw: string;
  try {
    raw = await readFile(mapPath, "utf8");
  } catch {
    throw new ImportError(`${mapPath} is missing — the importer has nothing to resolve rows against`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ImportError(`${mapPath} is not valid JSON`);
  }

  return indexTrackerMap(parseTrackerMap(parsed));
}

/** A workbook and a sentence saying where it came from, for the report's provenance line. */
interface LoadedWorkbook {
  workbook: Workbook;
  provenance: string;
}

/**
 * The tracker, from whichever source was chosen.
 *
 * THE MISSING-ENVIRONMENT MESSAGE NAMES THE WAY OUT. The Sheets source is the default, so the
 * first run on a machine that has not been set up yet fails here — and "GOOGLE_SERVICE_ACCOUNT_
 * EMAIL is not set" on its own tells someone what is absent without telling them that there is a
 * path that needs none of it. The workbook on disk still works and still produces the same plan;
 * that is the whole point of keeping it.
 *
 * The check runs BEFORE the map is parsed or the database is read, so a half-configured machine
 * fails in under a second rather than after thirty seconds of work it is going to discard.
 */
async function loadWorkbook(args: Arguments): Promise<LoadedWorkbook> {
  if (args.source === "xlsx") {
    const bytes = await readFile(args.file).catch(() => {
      throw new ImportError(`${args.file} could not be read`);
    });
    return { workbook: readWorkbook(bytes), provenance: `workbook ${path.relative(process.cwd(), args.file) || args.file}` };
  }

  const missing = missingSheetsEnv();
  if (missing.length > 0) {
    const fallback = path.relative(process.cwd(), DEFAULT_WORKBOOK);
    throw new ImportError(
      `The Google Sheet is the default source and ${missing.join(", ")} ` +
        `${missing.length === 1 ? "is" : "are"} not set, so nothing was read. Either set ` +
        `${missing.length === 1 ? "it" : "them"} in .env.local, or read the workbook on disk ` +
        `instead with --file ${fallback}`,
    );
  }

  const { title, workbook } = await readTrackerSpreadsheet();
  // The spreadsheet's NAME, never its id: the id is configuration a report gets copied out of.
  return { workbook, provenance: `google sheet "${title ?? "(untitled)"}"` };
}

interface DatabaseState {
  collectors: PlannerCollector[];
  alreadyRecorded: Set<string>;
}

/**
 * Everything the planner needs from the database, read once.
 *
 * The already-recorded set is built from BOTH tables. A pending submission counts: the row is
 * in the queue waiting for a human, and sending it again would put a second copy in front of
 * them. An approved-and-published observation counts for the obvious reason. A rejected
 * submission does NOT count — someone looked at it and said no, and a fresh reading of the
 * sheet is a new proposal, not a retry of the old one.
 */
async function readDatabaseState(): Promise<DatabaseState> {
  const supabase = createAdminClient();

  const [collectorRows, submissions, observations] = await Promise.all([
    supabase.from("collectors").select("name, phone, is_active"),
    supabase
      .from("price_submissions")
      .select("iso_year, iso_week, tier, commodities(slug), units(name)")
      .in("status", ["pending", "approved"]),
    supabase
      .from("price_observations")
      .select("iso_year, iso_week, tier, commodities(slug), units(name)")
      .is("superseded_at", null),
  ]);

  const failure = collectorRows.error ?? submissions.error ?? observations.error;
  if (failure) throw new ImportError(`Database read failed: ${failure.message}`);

  const alreadyRecorded = new Set<string>();

  for (const rows of [submissions.data ?? [], observations.data ?? []]) {
    for (const row of rows) {
      const slug = row.commodities?.slug;
      const unit = row.units?.name;
      if (!slug || !unit) continue;
      alreadyRecorded.add(recordedKey(slug, row.tier, unit, row.iso_year, row.iso_week));
    }
  }

  return {
    collectors: (collectorRows.data ?? []).map((row) => ({
      name: row.name,
      phone: row.phone,
      isActive: row.is_active,
    })),
    alreadyRecorded,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function countBy<T extends string>(values: readonly { code: T }[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value.code, (counts.get(value.code) ?? 0) + 1);
  return counts;
}

/**
 * The tab-title check, printed only when it has something to say.
 *
 * A renamed tab is the one failure that is otherwise invisible: the run succeeds, the numbers
 * look plausible, and a whole tab's prices are quietly absent. Renaming a tab is now something
 * done with a thumb, so this is worth four lines of report.
 *
 * It does not block. A tab mid-rename is not a reason to hold back the eight tabs that are fine,
 * which is the same stance the planner takes on refusals.
 */
export function describeSheetNames(names: SheetNameCheck | undefined): string[] {
  if (!names) return [];
  if (names.missing.length === 0 && names.unexpected.length === 0) return [];

  const lines: string[] = ["TAB TITLES do not match data/tracker-map.json:"];

  for (const name of names.missing) {
    lines.push(`  missing     ${name} — the map resolves rows against this tab and it was not read`);
  }
  for (const name of names.unexpected) {
    lines.push(`  unexpected  ${name} — this tab claims to hold prices but the map has never seen it`);
  }

  lines.push(
    "  A tab renamed by one character reads as both at once. Every row on a tab the map does",
    "  not know is refused below as unknown_product.",
    "",
  );

  return lines;
}

/**
 * The report, which is the product of a dry run.
 *
 * Refusals are printed in full, every one of them, because a refusal is the thing a human has
 * to act on and a truncated list is a list nobody acts on. Skips are counted by reason and
 * listed only for `already_recorded`, which is the one skip that says something about the
 * database rather than about the sheet.
 */
export function describePlan(
  plan: Plan,
  commit: boolean,
  context?: { source?: string; names?: SheetNameCheck },
): string[] {
  const lines: string[] = [];
  const retail = plan.posts.filter((post) => post.tier === "retail").length;
  const wholesale = plan.posts.filter((post) => post.tier === "wholesale").length;

  lines.push(`${commit ? "COMMIT" : "DRY RUN"} — column ${plan.column}`);
  if (context?.source) lines.push(`source       ${context.source}`);

  lines.push(
    "",
    `would post   ${plan.posts.length}  (${retail} retail, ${wholesale} wholesale)`,
    `skipped      ${plan.skipped.length}`,
    `refused      ${plan.refusals.length}`,
    "",
  );

  // Printed high, above the per-row detail, because a renamed tab explains a whole block of
  // refusals further down and reading it afterwards is reading it too late.
  lines.push(...describeSheetNames(context?.names));

  const skipCounts = countBy(plan.skipped);
  if (skipCounts.size > 0) {
    lines.push("skipped, by reason:");
    for (const [code, count] of [...skipCounts].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(count).padStart(4)}  ${code}`);
    }
    lines.push("");
  }

  const alreadyRecorded = plan.skipped.filter((note) => note.code === "already_recorded");
  if (alreadyRecorded.length > 0) {
    lines.push("already submitted or published, so left alone:");
    for (const note of alreadyRecorded) {
      lines.push(`  ${note.sheet} row ${note.rowNumber}: ${note.detail}`);
    }
    lines.push("");
  }

  if (plan.refusals.length > 0) {
    lines.push("REFUSED — each of these needs a human:");
    for (const [code, count] of [...countBy(plan.refusals)].sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${String(count).padStart(4)}  ${code}`);
    }
    lines.push("");
    for (const note of plan.refusals) {
      lines.push(`  ${note.sheet} row ${note.rowNumber} — ${note.subject}`);
      lines.push(`    ${note.code}: ${note.detail}`);
    }
    lines.push("");
  }

  if (plan.posts.length > 0) {
    lines.push(`the ${plan.posts.length} rows that would post:`);
    for (const post of plan.posts) {
      lines.push(
        `  ${post.sheet} row ${String(post.rowNumber).padStart(3)}  ` +
          `${post.slug} / ${post.tier} / ${post.unit} (${post.unitRole})  ` +
          `${post.isoYear}-W${post.isoWeek}  ${post.collectedOn}  ${post.market}`,
      );
    }
    lines.push("");
  }

  if (plan.ignoredSheets.length > 0) {
    lines.push("tabs passed over:");
    for (const sheet of plan.ignoredSheets) lines.push(`  ${sheet.name} — ${sheet.reason}`);
    lines.push("");
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));

  const [index, loaded] = await Promise.all([loadMap(), loadWorkbook(args)]);

  const reading = readTracker(loaded.workbook, args.column);
  const names = checkSheetNames(
    expectedSheetNames(index.map),
    reading.sheets.map((sheet) => sheet.name),
  );

  const { collectors, alreadyRecorded } = await readDatabaseState();
  const plan = planImport({ reading, index, collectors, alreadyRecorded });

  for (const line of describePlan(plan, args.commit, { source: loaded.provenance, names })) {
    console.log(line);
  }

  if (!args.commit) {
    console.log(
      "Nothing was posted. This was a dry run — add --commit to send the rows listed above.",
    );
    return;
  }

  // Refusals never block the rows that resolved cleanly: a column where one row is unmapped is
  // still a column of good prices, and holding them back would mean the weekly import stops
  // dead on the first oddity. The refusals are printed above and stay printed.
  if (plan.posts.length === 0) {
    console.log("Nothing to post.");
    return;
  }

  const baseUrl = process.env.IMPORT_BASE_URL;
  const secret = process.env.PRICE_INGEST_SECRET;
  if (!baseUrl || !secret) {
    const missing = [!baseUrl && "IMPORT_BASE_URL", !secret && "PRICE_INGEST_SECRET"]
      .filter(Boolean)
      .join(", ");
    throw new ImportError(`--commit needs ${missing}, so nothing was posted`);
  }

  const outcomes = await postPlan(plan.posts, {
    baseUrl,
    secret,
    onOutcome: (outcome, position, total) => {
      const label = `${outcome.post.slug} ${outcome.post.tier} ${outcome.post.unit}`;
      console.log(
        `  [${position + 1}/${total}] ${outcome.ok ? "ok " : "FAIL"} ${outcome.status} ${label} — ${outcome.detail}`,
      );
    },
  });

  const stored = outcomes.filter((outcome) => outcome.ok).length;
  console.log("");
  console.log(`${stored} of ${outcomes.length} rows stored as pending submissions.`);

  if (stored < outcomes.length) {
    console.log("Some rows were not stored — see the FAIL lines above. Nothing was retried.");
    process.exitCode = 1;
  }
}

// Same guard as generate-form-options.ts: the helpers above are imported by the test file, and
// importing this module must not open a database connection or post anything as a side effect.
const invokedDirectly = (process.argv[1] ?? "").includes("import-tracker");

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `✗ ${error.message}` : error);
    process.exit(1);
  });
}
