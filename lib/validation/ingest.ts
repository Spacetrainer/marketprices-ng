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
 * What the Apps Script sends. Field names mirror §6.1's form fields, snake_cased, because
 * the Sheet's column headers are what the bridge has to hand and a rename between the two
 * is one more place for the form and the endpoint to drift apart.
 *
 * `collected_on` is validated in two steps deliberately: the regex proves the SHAPE, and
 * `isCivilDate` proves the date EXISTS. Zod's own date coercion would accept "2026-02-30"
 * and normalise it to 2 March — silently filing the price into a real week seven days away.
 */
export const ingestPayloadSchema = z.object({
  collector_name: z.string().trim().min(1, "collector_name is empty"),
  collector_phone: z.string().trim().min(1, "collector_phone is empty"),
  collection_site: z.string().trim().min(1, "collection_site is empty"),
  commodity: z.string().trim().min(1, "commodity is empty"),
  variety: z.string().trim().min(1).nullish(),
  tier: z.enum(TIERS, { message: `tier must be one of: ${TIERS.join(", ")}` }),
  unit: z.string().trim().min(1, "unit is empty"),

  // A price arrives from a spreadsheet cell, so it may be a number or the string the cell
  // rendered. Thousands separators and a naira sign are stripped before the number check —
  // a collector typing "₦95,000" has entered a valid price, not a malformed one.
  price: z.union([z.number(), z.string()]).transform((value, ctx) => {
    const raw = typeof value === "number" ? String(value) : value.replace(/[₦\s,]/g, "");
    const parsed = Number(raw);
    if (raw === "" || !Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: `price "${String(value)}" is not a number` });
      return z.NEVER;
    }
    // 0 is a legitimate submitted price (given away, promotional) and is kept; a negative
    // one is a data-entry error. Same call as the price_submissions CHECK constraint.
    if (parsed < 0) {
      ctx.addIssue({ code: "custom", message: `price ${parsed} is negative` });
      return z.NEVER;
    }
    return parsed;
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

export const RATE_LIMIT_MAX = 60;
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
 * What the series already knows about this commodity and tier, read once by the route.
 *
 * `latest` is the most recent LIVE observation (superseded_at is null). Null means the
 * series has no published history at all.
 */
export interface SeriesBaseline {
  latest: { price: number; unitId: string; isoYear: number; isoWeek: number } | null;
  /** A pending or approved submission, or a live observation, already holds this exact key. */
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
    // The unit changed. A sack against a plate is not a ratio, and units.base_multiplier is
    // null across the board (seed.sql: "not yet weighed"), so no conversion exists to make
    // it one. NO OUTLIER FLAG IS RAISED, because the comparison was never performed —
    // raising one would claim a check that did not happen. See the module note in the
    // handover: this is a real gap and wants its own flag value.
  } else {
    const previous = baseline.latest.price;
    const current = payload.price;

    // A move off zero, or onto it, has no finite ratio but is exactly the shape of a slip.
    const crossesZero = (previous === 0) !== (current === 0);
    const ratio =
      previous > 0 && current > 0 ? Math.max(previous, current) / Math.min(previous, current) : 0;

    if (crossesZero || ratio >= magnitudeRatio) flags.push("outlier");
  }

  if (baseline.hasEntryForWeek) flags.push("duplicate");

  return flags;
}
