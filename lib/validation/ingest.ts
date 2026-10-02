import { z } from "zod";
import { isCivilDate, isoWeekOfCivilDate, type IsoWeek } from "../weeks";
import { WAT_TIME_ZONE } from "../constants";

/**
 * The intake boundary for POST /api/ingest/price (§6.1, §3.4).
 *
 * A row arrives here from a Google Sheet, written by someone standing in a market on a
 * phone, relayed by an Apps Script trigger. Three consequences shape this whole module:
 *
 *   1. EVERY REJECTION IS SPECIFIC. The plan is explicit: "specific error messages, never a
 *      generic 400 — you will be debugging this over a phone call with someone standing in a
 *      market". So every failure carries a machine `code`, a human `message` naming the
 *      value that failed, and, where a near-miss exists, the name we think they meant.
 *
 *   2. NOTHING IS INFERRED (P0.2). A name that does not resolve is rejected, never guessed
 *      past. An unknown collector is rejected, never created. A price with no comparable
 *      history is flagged `new_series`, never silently compared against nothing.
 *
 *   3. THE PURE HALF LIVES HERE. Resolution, flagging and rate limiting are ordinary
 *      functions over plain data, so they are unit-testable against fixtures without a
 *      database, a network or a running Next.js. The route in app/api/ingest/price/route.ts
 *      is orchestration only: it fetches, calls these, and maps the result to a response.
 */

// ---------------------------------------------------------------------------
// 1. The payload
// ---------------------------------------------------------------------------

export const TIERS = ["retail", "wholesale"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * The two roles a price can hold within one commodity, week and tier (P1.7 as amended by
 * migration 0041).
 *
 * THE VOCABULARY IS THE CAP. A commodity may carry at most two prices per week per tier, in
 * different units — rodo by the paint bucket and by the plate — and with exactly two role
 * values a third live price has no role left to take. `primary` is the figure public surfaces
 * show first. Two prices in different units are never averaged or compared: `base_multiplier`
 * is null on every unit (0036, "not yet weighed"), so no conversion between them exists.
 */
export const UNIT_ROLES = ["primary", "secondary"] as const;
export type UnitRole = (typeof UNIT_ROLES)[number];

/**
 * What the Apps Script sends. Field names mirror §6.1's form fields, snake_cased, because
 * the Sheet's column headers are what the bridge has to hand and a rename between the two
 * is one more place for the form and the endpoint to drift apart.
 *
 * `collected_on` is validated in two steps deliberately: the regex proves the SHAPE, and
 * `isCivilDate` proves the date EXISTS. Zod's own date coercion would accept "2026-02-30"
 * and normalise it to 2 March — silently filing the price into a real week seven days away.
 */
/** Why a price was refused. Each one is a different sentence to a different reader. */
export const PRICE_REFUSALS = ["not_a_number", "negative", "fractional"] as const;
export type PriceRefusal = (typeof PRICE_REFUSALS)[number];

export type PriceResult = { ok: true; value: number } | { ok: false; reason: PriceRefusal };

/**
 * A price cell as a whole number of naira, or a named refusal.
 *
 * THE ONE PLACE THIS RULE LIVES. Four doors accept a price — the tracker importer's preview, this
 * endpoint, the reviewer's correction box, and `approve_price_submission()` in SQL. The first
 * three now call this function, so they cannot drift: the importer's dry run promises exactly
 * what the endpoint will accept, which matters because the dry run is what a human approves. The
 * fourth is SQL and is held by a CHECK constraint, because a reviewer's correction never passes
 * through Zod at all.
 *
 * A PRICE IS A WHOLE NUMBER OF NAIRA (owner decision). Kobo are not collected, not displayed and
 * not meaningful at market prices, so a fractional value is a data-entry artefact rather than a
 * finer measurement — most often a spreadsheet's floating-point residue, which is how
 * "95000.00000000001" reaches here looking exactly like 95000 to a reviewer.
 *
 * WHAT IS STILL ACCEPTED, DELIBERATELY:
 *   - "₦95,000", " 1 500 " — a human typed a price, and the currency sign, the thousands
 *     separators and the spaces are decoration, not malformation;
 *   - "95,000.00" — a trailing .00 IS a whole number of naira. Refusing it would be refusing a
 *     correctly entered price for the way it was spelled;
 *   - 0 — a price of 0 is legitimate (given away, promotional) and is what `price >= 0` permits
 *     in both price columns.
 *
 * THE CHECK IS ON THE PARSED VALUE, NOT ON THE DIGITS TYPED, and `Number` bounds it: a value with
 * enough zeros ("95000.000000000000001") parses to exactly 95000 and is accepted as 95000, and an
 * integer past Number.MAX_SAFE_INTEGER is rounded before any rule here sees it. The first is
 * benign — it accepts the right naira figure. The second is part of the magnitude question this
 * function deliberately does NOT answer: 1e21 is a whole number and passes, and it is the outlier
 * flag's job to put it in front of a human.
 */
export function parseNairaPrice(raw: string | number): PriceResult {
  const cleaned = typeof raw === "number" ? String(raw) : raw.replace(/[₦\s,]/g, "");
  if (cleaned === "") return { ok: false, reason: "not_a_number" };

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" };
  if (value < 0) return { ok: false, reason: "negative" };
  if (!Number.isInteger(value)) return { ok: false, reason: "fractional" };

  return { ok: true, value };
}

/**
 * A refusal as the endpoint words it.
 *
 * The first two sentences are unchanged from before the whole-naira rule, because a 400 body is
 * read by whoever is holding the phone and relearning a message costs more than it is worth.
 */
export function describePriceRefusal(reason: PriceRefusal, raw: string | number): string {
  if (reason === "not_a_number") return `price "${String(raw)}" is not a number`;
  if (reason === "negative") return `price ${Number(String(raw).replace(/[₦\s,]/g, ""))} is negative`;
  return (
    `price ${String(raw)} is not a whole number of naira. Prices are recorded in naira with no kobo.`
  );
}

export const ingestPayloadSchema = z.object({
  collector_name: z.string().trim().min(1, "collector_name is empty"),
  collector_phone: z.string().trim().min(1, "collector_phone is empty"),
  collection_site: z.string().trim().min(1, "collection_site is empty"),
  commodity: z.string().trim().min(1, "commodity is empty"),
  variety: z.string().trim().min(1).nullish(),
  tier: z.enum(TIERS, { message: `tier must be one of: ${TIERS.join(", ")}` }),
  unit: z.string().trim().min(1, "unit is empty"),

  // A price arrives from a spreadsheet cell, so it may be a number or the string the cell
  // rendered. Every rule about what a price IS lives in parseNairaPrice above, which the tracker
  // importer and the review screen also call — this transform only maps its answer onto Zod.
  price: z.union([z.number(), z.string()]).transform((value, ctx) => {
    const result = parseNairaPrice(value);
    if (result.ok) return result.value;

    ctx.addIssue({ code: "custom", message: describePriceRefusal(result.reason, value) });
    return z.NEVER;
  }),

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "currency must be a three-letter ISO code, e.g. NGN")
    .default("NGN"),

  collected_on: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "collected_on must be a date in YYYY-MM-DD form")
    .superRefine((value, ctx) => {
      if (!isCivilDate(value)) {
        ctx.addIssue({ code: "custom", message: `collected_on "${value}" is not a real date` });
      }
    }),

  photo_url: z.string().trim().url("photo_url is not a URL").nullish(),
  notes: z.string().trim().min(1).nullish(),

  /**
   * Which of the at-most-two prices for this week this one is PROPOSED to be (P1.7).
   *
   * OPTIONAL, AND ABSENT ON EVERY SUBMISSION THE GOOGLE FORM SENDS. The form does not ask,
   * and it should not: a collector standing in a market has no view on which measure a page
   * should show first. That is an editorial decision, and migration 0041 puts it where the
   * decision is made — `approve_price_submission()` resolves the final role and writes it onto
   * the submission before publishing.
   *
   * IT IS ACCEPTED HERE SO THE TRACKER IMPORTER HAS A DOOR. `scripts/import-tracker.ts` reads
   * a reviewed map file that names the primary unit per commodity per tier, and that proposal
   * has to reach the submission through the one door in (P1.1) rather than by a second write
   * path. Until that script exists nothing sends this field, and a submission arriving without
   * it is the normal case, not a degraded one — which is why there is NO DEFAULT. Inferring a
   * role from arrival order is exactly the assumption P0.2 forbids.
   */
  unit_role: z.enum(UNIT_ROLES, { message: `unit_role must be one of: ${UNIT_ROLES.join(", ")}` }).nullish(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// ---------------------------------------------------------------------------
// 2. Failures
// ---------------------------------------------------------------------------

/**
 * Every way intake can refuse a row. The code is what the Apps Script writes back into the
 * sheet's status column, so a failed row is visible rather than silent; the message is what
 * a human reads back down the phone.
 */
export type IngestFailureCode =
  | "unauthorized"
  | "invalid_payload"
  | "future_collection_date"
  | "unknown_commodity"
  | "unknown_site"
  | "unknown_unit"
  | "unknown_collector"
  | "inactive_collector"
  | "rate_limited"
  | "options_unavailable"
  | "threshold_unavailable"
  | "storage_failure";

export interface IngestFailure {
  code: IngestFailureCode;
  message: string;
  /** Field-level detail for `invalid_payload`; the near-miss candidate for a name failure. */
  detail?: string;
}

export type IngestResult<T> = { ok: true; value: T } | { ok: false; failure: IngestFailure };

const fail = (code: IngestFailureCode, message: string, detail?: string): IngestResult<never> => ({
  ok: false,
  failure: detail === undefined ? { code, message } : { code, message, detail },
});

/** Zod's issue list flattened into one line a human can act on without reading JSON. */
export function describePayloadIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// 3. Name → ID resolution
// ---------------------------------------------------------------------------

/**
 * The dropdown lists the Google Form shows, generated from the database by
 * scripts/generate-form-options.ts (§3.2) so the form and the database cannot drift.
 *
 * Resolution runs against THIS rather than against a live query on purpose: it is the same
 * list the collector actually chose from, so a name that fails to resolve here is evidence
 * the form is stale, which is a fact worth surfacing rather than papering over with a
 * database lookup that would quietly succeed against an option the form never offered.
 */
export const formOptionsSchema = z.object({
  generated_at: z.string().min(1),
  commodities: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1),
        aliases: z.array(z.string().min(1)).default([]),
      }),
    )
    .min(1, "form options contain no commodities"),
  collection_sites: z
    .array(z.object({ id: z.uuid(), name: z.string().min(1) }))
    .min(1, "form options contain no collection sites"),
  units: z
    .array(z.object({ id: z.uuid(), name: z.string().min(1), abbreviation: z.string().min(1) }))
    .min(1, "form options contain no units"),
});

export type FormOptions = z.infer<typeof formOptionsSchema>;

/** One candidate a submitted name can resolve to, with every string that may stand for it. */
export interface NameCandidate {
  id: string;
  /** The canonical name, used in error messages and suggestions. */
  name: string;
  /** Canonical name plus aliases and abbreviations — everything that resolves to this id. */
  synonyms: string[];
}

/**
 * pg_trgm's own normalisation: lowercase, then split on anything that is not a letter or a
 * digit. Written to match the extension because commodities.aliases is documented as feeding
 * "the pg_trgm fuzzy match during fusion/ingest" — when that match eventually moves into the
 * database, it must not start disagreeing with what intake accepted.
 */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A normalised key for exact matching: case, punctuation and spacing all collapsed. */
export function normaliseName(value: string): string {
  return words(value).join(" ");
}

/**
 * pg_trgm's trigram set: each word padded with two leading spaces and one trailing space,
 * then cut into overlapping three-character windows.
 */
function trigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (const word of words(value)) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** pg_trgm's `similarity()`: shared trigrams over the union of both trigram sets. */
export function trigramSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 && right.size === 0) return 1;

  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;

  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** pg_trgm's default `similarity_threshold`. Kept identical for the same reason as above. */
export const TRIGRAM_THRESHOLD = 0.3;

/**
 * How much clear water a fuzzy winner needs over the runner-up before intake will act on it.
 *
 * Without this, "Yam" against a list holding "White Yam" and "Water Yam" resolves to
 * whichever happens to sort first, and the wrong commodity's series is corrupted by a price
 * that looked fine. A near-tie is reported as a question, not resolved as a guess (P0.2).
 */
export const FUZZY_MARGIN = 0.05;

export type NameResolution =
  | { status: "exact"; id: string; name: string }
  | { status: "alias"; id: string; name: string }
  | { status: "fuzzy"; id: string; name: string; score: number }
  | { status: "unresolved"; suggestion?: string; ambiguous?: [string, string] };

/**
 * Resolve a submitted name to an id: exact first, then the alias list, then trigram fuzzy
 * match as the last resort.
 *
 * Exact and alias hits are the expected path — the form uses dropdowns, so a submitted name
 * should be a verbatim option. A fuzzy hit means something has drifted (the form was edited
 * by hand, or an option was renamed after the sheet was filled) and is worth accepting, but
 * it is reported as `fuzzy` so the caller can record how the row was matched.
 */
export function resolveName(submitted: string, candidates: NameCandidate[]): NameResolution {
  const key = normaliseName(submitted);

  for (const candidate of candidates) {
    if (normaliseName(candidate.name) === key) {
      return { status: "exact", id: candidate.id, name: candidate.name };
    }
  }

  for (const candidate of candidates) {
    if (candidate.synonyms.some((synonym) => normaliseName(synonym) === key)) {
      return { status: "alias", id: candidate.id, name: candidate.name };
    }
  }

  // Score every candidate by its best-matching synonym, then take the top two.
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        ...[candidate.name, ...candidate.synonyms].map((synonym) =>
          trigramSimilarity(key, synonym),
        ),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < TRIGRAM_THRESHOLD) {
    return best && best.score > 0
      ? { status: "unresolved", suggestion: best.candidate.name }
      : { status: "unresolved" };
  }

  const runnerUp = scored[1];
  if (runnerUp && best.score - runnerUp.score < FUZZY_MARGIN) {
    return {
      status: "unresolved",
      ambiguous: [best.candidate.name, runnerUp.candidate.name],
    };
  }

  return { status: "fuzzy", id: best.candidate.id, name: best.candidate.name, score: best.score };
}

/** The three option lists as resolution candidates. Units resolve by name OR abbreviation. */
export function commodityCandidates(options: FormOptions): NameCandidate[] {
  return options.commodities.map(({ id, name, aliases }) => ({ id, name, synonyms: aliases }));
}

export function siteCandidates(options: FormOptions): NameCandidate[] {
  return options.collection_sites.map(({ id, name }) => ({ id, name, synonyms: [] }));
}

export function unitCandidates(options: FormOptions): NameCandidate[] {
  return options.units.map(({ id, name, abbreviation }) => ({
    id,
    name,
    synonyms: [abbreviation],
  }));
}

export interface ResolvedNames {
  commodityId: string;
  collectionSiteId: string;
  unitId: string;
  /** Which of the three, if any, needed a fuzzy match — recorded on the submission's notes. */
  fuzzyMatches: string[];
}

/** Resolve all three names, failing on the first that does not resolve, with its own code. */
export function resolveSubmissionNames(
  payload: Pick<IngestPayload, "commodity" | "collection_site" | "unit">,
  options: FormOptions,
): IngestResult<ResolvedNames> {
  const targets = [
    { code: "unknown_commodity" as const, label: "commodity", submitted: payload.commodity, candidates: commodityCandidates(options) },
    { code: "unknown_site" as const, label: "collection site", submitted: payload.collection_site, candidates: siteCandidates(options) },
    { code: "unknown_unit" as const, label: "unit", submitted: payload.unit, candidates: unitCandidates(options) },
  ];

  const ids: string[] = [];
  const fuzzyMatches: string[] = [];

  for (const target of targets) {
    const resolution = resolveName(target.submitted, target.candidates);

    if (resolution.status === "unresolved") {
      const suggestion = resolution.ambiguous
        ? `"${target.submitted}" is equally close to "${resolution.ambiguous[0]}" and "${resolution.ambiguous[1]}" — it was not guessed between them`
        : resolution.suggestion
          ? `closest option on the form is "${resolution.suggestion}"`
          : "no option on the form is close to it";

      return fail(
        target.code,
        `Unknown ${target.label} "${target.submitted}" — it is not an option on the form`,
        suggestion,
      );
    }

    ids.push(resolution.id);
    if (resolution.status === "fuzzy") {
      fuzzyMatches.push(
        `${target.label} "${target.submitted}" matched "${resolution.name}" by similarity ${resolution.score.toFixed(2)}`,
      );
    }
  }

  return {
    ok: true,
    value: { commodityId: ids[0], collectionSiteId: ids[1], unitId: ids[2], fuzzyMatches },
  };
}

// ---------------------------------------------------------------------------
// 4. Collector resolution
// ---------------------------------------------------------------------------

/**
 * A Nigerian mobile number reduced to the digits that identify it, so the same phone
 * matches however it was typed: "0803 123 4567", "+234 803 123 4567", "234-803-123-4567"
 * and "8031234567" are one collector, not four.
 *
 * Returns the national significant number (10 digits, no leading zero) when the input is
 * recognisably Nigerian, and otherwise the bare digits unchanged — an unrecognised format
 * is not rewritten into something that might collide with a real number. Matching is done
 * on this value at BOTH ends: the stored collectors.phone is normalised the same way before
 * comparison, because the column holds whatever a human typed into Settings.
 */
export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("234")) return digits.slice(3);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;

  return digits;
}

export interface CollectorRecord {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
}

/**
 * Match the submitted phone to a registered collector. NEVER auto-creates one (P1.2).
 *
 * Confirmed with the user: an unrecognised collector is a 422 naming the person and the
 * number that failed to match. Trusting a new submitter is a deliberate human act performed
 * in Settings, not something an HTTP endpoint does on someone's behalf — and auto-creation
 * would let anyone holding the bearer token mint rows in a table carrying PII (P9.2).
 *
 * The submitted NAME is not part of the match. A collector who marries, or whose name was
 * typed differently this week, is still the same phone; matching on both would reject them.
 * The name is carried into the submission's notes when it disagrees, for a human to see.
 */
export function resolveCollector(
  payload: Pick<IngestPayload, "collector_name" | "collector_phone">,
  collectors: CollectorRecord[],
): IngestResult<CollectorRecord> {
  const key = normalisePhone(payload.collector_phone);

  const match = collectors.find((collector) => normalisePhone(collector.phone) === key);

  if (!match) {
    return fail(
      "unknown_collector",
      `No registered collector has the phone number ${payload.collector_phone} (submitted as "${payload.collector_name}")`,
      "Register the collector in Settings before their submissions can be accepted — intake does not create collector records",
    );
  }

  if (!match.isActive) {
    return fail(
      "inactive_collector",
      `Collector ${match.name} (${payload.collector_phone}) is deactivated and cannot submit prices`,
      "Reactivate them in Settings if this submission is genuine",
    );
  }

  return { ok: true, value: match };
}

// ---------------------------------------------------------------------------
// 5. Collection date
// ---------------------------------------------------------------------------

/** Today's civil date on the product's one clock (§WAT), as YYYY-MM-DD. */
export function todayInLagos(now: Date, timeZone: string = WAT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/**
 * Reject a collection date in the future.
 *
 * A future date is always an error — a fat-fingered year, or a phone with the wrong clock —
 * and it is the worst kind, because the ISO week derived from it files a real price into a
 * week that has not happened yet, where nothing will ever reconcile it. Compared on Lagos's
 * civil date, not UTC: for the first hour of a Lagos day, UTC is still on yesterday and
 * would reject a price collected this morning.
 */
export function checkCollectionDate(
  collectedOn: string,
  now: Date,
  timeZone: string = WAT_TIME_ZONE,
): IngestResult<IsoWeek> {
  const today = todayInLagos(now, timeZone);

  if (collectedOn > today) {
    return fail(
      "future_collection_date",
      `collected_on ${collectedOn} is in the future — today is ${today} in Lagos`,
      "Check the date on the collecting phone; a price cannot be collected before it happens",
    );
  }

  return { ok: true, value: isoWeekOfCivilDate(collectedOn) };
}

// ---------------------------------------------------------------------------
// 6. Rate limiting
// ---------------------------------------------------------------------------

/**
 * A sliding-window limiter, keyed per collector (§ security review: "rate limits on
 * /api/ingest").
 *
 * Per COLLECTOR rather than per IP: every request arrives from Google's Apps Script
 * infrastructure, so IP tells us nothing about who is submitting. The limit exists to
 * contain a stuck trigger re-firing the same row, or a bearer token used to flood the
 * review queue — not to ration honest collection, so the window is generous relative to one
 * market visit a week.
 *
 * IN-MEMORY, therefore PER-INSTANCE. On serverless the true limit is this multiplied by the
 * number of warm instances. That is a real weakness and it is stated rather than hidden: a
 * shared store is the fix when one is worth its cost.
 */
export interface RateLimiter {
  check(key: string, now: Date): IngestResult<{ remaining: number }>;
}

/**
 * 300 per collector per hour.
 *
 * WHY IT WAS 60, AND WHY THAT IS NOW THE WRONG NUMBER. 60 was sized for a human filling a
 * form one row at a time, which is what intake was when it was written. The weekly price
 * tracker is the other caller: one spreadsheet column, posted row by row through this same
 * door (P1.1). The column collected on 2026-09-26 carries 79 postable rows, and the largest
 * column the tracker can declare — every publishable product, both tiers, both units — is 332.
 * At 60 an ordinary week's import 429s on the sixty-first row.
 *
 * WHAT THE LIMIT IS ACTUALLY FOR, unchanged: containing a stuck Apps Script trigger re-firing
 * the same row, or a bearer token used to flood the review queue. Not rationing honest
 * collection. 300 is five times the largest real column to date and still plainly below a
 * runaway loop.
 *
 * THE HONEST CONSEQUENCE: a fully priced column (332) spans two windows and takes just over an
 * hour. That is the importer pausing deliberately — it sleeps to the next window rather than
 * taking a 429 — not a failure. Chosen at 300 by the project owner on 2026-09-29 with that
 * cost known.
 *
 * THE PER-INSTANCE WEAKNESS IS UNCHANGED AND GETS NO NEW CLAIM. See the note above: on
 * serverless the true ceiling is this number multiplied by the count of warm instances.
 */
export const RATE_LIMIT_MAX = 300;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export function createRateLimiter(
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now) {
      const cutoff = now.getTime() - windowMs;
      const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);

      if (recent.length >= max) {
        const retryAfterMs = recent[0] - cutoff;
        hits.set(key, recent);
        return fail(
          "rate_limited",
          `This collector has submitted ${recent.length} prices in the last hour, which is the limit`,
          `Retry in about ${Math.ceil(retryAfterMs / 60000)} minute(s)`,
        );
      }

      recent.push(now.getTime());
      hits.set(key, recent);
      return { ok: true, value: { remaining: max - recent.length } };
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Flags
// ---------------------------------------------------------------------------

/** The four values price_submissions.flags permits (0009's CHECK constraint). */
export type SubmissionFlag = "outlier" | "new_series" | "duplicate" | "site_switch";

/**
 * What the series already knows about this commodity, tier AND UNIT, read once by the route.
 *
 * A SERIES IS COMMODITY + TIER + UNIT (P1.7 as amended, migration 0041). Since a week can hold
 * two prices in different units, "the last published price for this commodity and tier" is no
 * longer a single thing, and a ratio taken across two units is not a ratio at all. So the
 * route's three baseline queries all filter on `unit_id`, and both fields below describe the
 * submission's own unit only.
 *
 * `latest` is the most recent LIVE observation (superseded_at is null) in that unit. Null means
 * this unit has no published history — which is now common and ordinary: the first paint-bucket
 * price of a commodity that has been priced by the plate for months is a new series, and saying
 * so is more useful than comparing it to the plate.
 */
export interface SeriesBaseline {
  latest: { price: number; unitId: string; isoYear: number; isoWeek: number } | null;
  /**
   * A pending or approved submission, or a live observation, already holds this exact
   * (commodity, tier, week, UNIT). Keyed on the unit because a second price in a DIFFERENT unit
   * is not a duplicate — it is the other half of the week, and flagging it would put a warning
   * on 20 of the 79 rows of the tracker's first import for something that is not a problem.
   */
  hasEntryForWeek: boolean;
}

/**
 * How many times a submitted price may differ from the last published one before intake
 * flags it for a closer look.
 *
 * THE VALUE IS NOT IN THIS FILE, AND DELIBERATELY HAS NO DEFAULT HERE. It lives in
 * `editorial_rules` as (scope 'ingest', key 'magnitude_ratio'), versioned and human-owned
 * (P16.2), and the route reads it on every request. A fallback constant would be a hardcoded
 * threshold wearing a disguise: the moment the rule row went missing, the system would go on
 * flagging against a number nobody chose and nothing would say so.
 *
 * `computeFlags` therefore REQUIRES the ratio as an argument rather than defaulting it. When
 * the rule cannot be read the route refuses the submission with `threshold_unavailable`
 * (503) instead of storing a row whose outlier check silently did not run — the Apps Script
 * retries and writes the failure into the sheet, so the row stays visible and re-postable.
 * A submission that reaches the queue unflagged must mean "checked and ordinary", never
 * "not checked".
 *
 * Confirmed with the user on 2026-09-07 and seeded at 4: they would rather a human glance at
 * a real price swing than let a plausible extra zero through unnoticed. A threshold of 10
 * would catch only exact order-of-magnitude slips and pass a ₦95,000 → ₦400,000 typo.
 */
export const magnitudeRatioSchema = z
  .number()
  .finite()
  // At or below 1 every price is an outlier including an unchanged one, which is the same as
  // having no check at all while looking like one.
  .gt(1, "magnitude_ratio must be greater than 1");

/**
 * Decide the flags a submission carries into the review queue. These are advisory: a
 * flagged row is still stored as `pending` for a human to judge, never rejected. Rejecting
 * an unusual price at the door would lose the exact rows that matter most — a genuine price
 * shock looks identical to a typo until someone who knows the market looks at it.
 */
export function computeFlags(
  payload: Pick<IngestPayload, "price">,
  resolved: Pick<ResolvedNames, "unitId">,
  baseline: SeriesBaseline,
  magnitudeRatio: number,
): SubmissionFlag[] {
  const flags: SubmissionFlag[] = [];

  if (baseline.latest === null) {
    // No published history: this is the first price in the series. It cannot be an outlier,
    // because there is nothing to be an outlier from — saying otherwise would be an
    // assumption (P0.2). The reviewer is told it is a first, which is the useful fact.
    flags.push("new_series");
  } else if (baseline.latest.unitId !== resolved.unitId) {
    // UNREACHABLE ON THE ROUTE'S OWN PATH, AND KEPT ANYWAY.
    //
    // This branch was the documented gap: the baseline used to be the latest price for the
    // commodity and tier in ANY unit, so a plate price arriving after a sack price got no
    // outlier check at all and nothing said so. Migration 0041 closes it from the other end —
    // a series is commodity + tier + unit, the route's baseline query filters on `unit_id`,
    // and a mismatch can no longer occur there. A unit with no history is `new_series` above,
    // which is the true statement.
    //
    // The branch stays because this function does not get to assume its caller filtered
    // correctly. If a future caller hands over a baseline from a different unit, the honest
    // outcome is still NO OUTLIER FLAG: a sack against a plate is not a ratio,
    // units.base_multiplier is null across the board (0036, "not yet weighed"), and raising a
    // flag would claim a check that did not happen. There is deliberately NO FIFTH FLAG VALUE
    // for it (ruled 2026-09-29): the case is unreachable in practice, and a flag nobody can
    // trigger is worse than a guard nobody needs.
  } else {
    const previous = baseline.latest.price;
    const current = payload.price;

    // A move off zero, or onto it, has no finite ratio but is exactly the shape of a slip.
    const crossesZero = (previous === 0) !== (current === 0);
    const ratio =
      previous > 0 && current > 0 ? Math.max(previous, current) / Math.min(previous, current) : 0;

    if (crossesZero || ratio >= magnitudeRatio) flags.push("outlier");
  }

  // `duplicate` now means what the word says: this commodity, tier, week AND UNIT is already
  // in the queue or already published. A second price in a different unit does not reach here
  // flagged, because the route's two week-lookups filter on `unit_id` (P1.7, 0041).
  if (baseline.hasEntryForWeek) flags.push("duplicate");

  return flags;
}
