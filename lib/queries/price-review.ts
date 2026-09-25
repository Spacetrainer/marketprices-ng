import { createClient } from "../supabase/server";
import { isoWeekOf, weekStartDate, weeksBetween, type IsoWeek } from "../weeks";
import { WAT_TIME_ZONE } from "../constants";
import type { SubmissionFlag } from "../validation/ingest";
import type {
  ApproveSubmissionInput,
  RejectSubmissionInput,
} from "../validation/price-review";

/**
 * The Price radar's review queue (build plan 3.5, §8.12 region 0).
 *
 * Every read the queue needs, and the two writes it can make. Components never call Supabase
 * directly (CLAUDE.md), and the two writes are RPCs rather than table updates because after
 * migration 0038 there IS no table update: `price_submissions_update_staff` is dropped and
 * UPDATE is revoked from every signed-in role, so `approve_price_submission()` and
 * `reject_price_submission()` are the only doors. That is the point of them — the decision and
 * the publication are one transaction, and an approval cannot half-happen.
 *
 * NOTHING HERE INVENTS A FIGURE. A submission with no published history behind it says so; it
 * does not show three zeroes, and it does not carry a price forward from an earlier week
 * (P0.2, P2.8). Today that is every row, because `price_observations` is empty.
 */

/** One previously published week for a series, as the queue draws it beside a submission. */
export interface RecordedWeek {
  isoYear: number;
  isoWeek: number;
  price: number;
  currency: string;
  /** The collection date and site ride along because a price without provenance does not ship (P1.6). */
  collectedOn: string;
  siteName: string;
  /**
   * How many ISO weeks earlier than the submission's own week this one is. 1 is the week
   * immediately before; anything larger means the weeks between it and the submission have no
   * published price, and the row says so rather than drawing the gap closed (P2.8).
   */
  weeksBefore: number;
}

export interface PendingSubmission {
  id: string;
  isoYear: number;
  isoWeek: number;
  commodityName: string;
  /** The unit the price was quoted in. A price per sack and a price per plate are not comparable. */
  unitName: string;
  /** Optional descriptor within the commodity. Never published — `price_observations` has no column for it. */
  variety: string | null;
  tier: string;
  price: number;
  currency: string;
  collectedOn: string;
  siteName: string;
  collectorName: string;
  submittedAt: string;
  source: string;
  notes: string | null;
  photoUrl: string | null;
  flags: SubmissionFlag[];
  /**
   * The last three RECORDED weeks for this commodity and tier, newest first — not the last
   * three calendar weeks. The distinction is the whole honesty of the panel: three rows
   * labelled 38, 37, 36 and three labelled 38, 34, 29 look the same until you read them, and
   * only one of them means "steady weekly collection".
   */
  recentWeeks: RecordedWeek[];
}

/**
 * The queue, split by ISO week.
 *
 * `current` is the week the control room is standing in. `earlier` is everything still
 * pending from before it — STRAGGLERS ARE GROUPED, NEVER HIDDEN (confirmed 2026-09-17).
 * §8.12 describes the region as "shown only while pending rows exist for the current ISO
 * week", and a literal reading of that would make an unreviewed submission from three weeks
 * ago invisible the moment a new week began, which is precisely the row most likely to be
 * forgotten and most damaging to forget: an unreviewed price is a hole in the series.
 */
export interface ReviewQueue {
  /** The ISO week "now" falls in, read on the Lagos clock. */
  currentWeek: IsoWeek;
  current: PendingSubmission[];
  earlier: PendingSubmission[];
  /** A stated reason the queue could not be read. Null when it was read successfully. */
  unavailable: string | null;
}

/** How many published weeks are drawn beside each submission (build plan 3.5). */
export const RECENT_WEEK_COUNT = 3;

/**
 * The shape the join comes back in. Supabase types an embedded one-to-one as an object, but
 * the generated types describe some of these as arrays; both shapes are normalised in
 * `readName` rather than asserted, because guessing wrong renders "undefined" as a market name.
 */
type Embedded = { name?: string | null; canonical_name?: string | null };

function readEmbedded(value: unknown): Embedded | null {
  if (Array.isArray(value)) return (value[0] as Embedded | undefined) ?? null;
  if (value && typeof value === "object") return value as Embedded;
  return null;
}

/**
 * A name off an embedded row, or a stated absence.
 *
 * NEVER an empty string and never "Unknown" invented silently: a missing commodity name means
 * the join did not return, which is a fault worth seeing rather than smoothing over. The
 * em dash is the same absence mark `lib/format.ts` uses for a missing figure (P2.1).
 */
const ABSENT_NAME = "—";

function nameOf(value: unknown, field: "name" | "canonical_name" = "name"): string {
  const embedded = readEmbedded(value);
  const raw = embedded?.[field];
  return typeof raw === "string" && raw.trim() !== "" ? raw : ABSENT_NAME;
}

/**
 * A `numeric` column as a number.
 *
 * NOT DEFENSIVE PROGRAMMING — a required coercion. Postgres `numeric` has arbitrary precision
 * and JSON numbers do not, so the value can arrive over PostgREST as a STRING rather than a
 * number depending on how it is serialised. `types/database.ts` declares it `number`, which
 * means TypeScript will not catch the difference and nothing fails loudly: `formatNaira`
 * checks `Number.isFinite`, a string fails that check, and EVERY PRICE ON THE SCREEN RENDERS
 * AS AN EM DASH — the absence mark, on figures that are present. `app/api/ingest/price/route.ts`
 * already wraps the same column in `Number()` for the same reason; this is that practice, in
 * the one other place a price is read.
 */
function readPrice(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

/** The series a price belongs to: one commodity, one tier (P1.7). Never a site (P1.8). */
export function seriesKey(commodityId: string, tier: string): string {
  return `${commodityId}::${tier}`;
}

/**
 * The most recent `limit` published weeks for a series, newest first, each labelled with how
 * many weeks it sits before `week`.
 *
 * PURE, AND SEPARATED FROM THE READ so it can be tested against a gapped series without a
 * database. Ordering is by ISO year then ISO week rather than by `published_at`, because when
 * a week is approved is not when it happened — a late-entered week 34 is still week 34.
 */
export function takeRecentWeeks(
  rows: readonly RecordedWeek[],
  week: IsoWeek,
  limit: number = RECENT_WEEK_COUNT,
): RecordedWeek[] {
  return rows
    .filter((row) => weeksBetween({ isoYear: row.isoYear, isoWeek: row.isoWeek }, week) > 0)
    // Newest first. `weeksBetween(a, b)` is positive when b is the LATER week, which is
    // exactly the comparator that puts b before a — and it stays correct across a year
    // boundary, where subtracting week numbers would sort 2026-W01 below 2025-W52.
    .sort((a, b) =>
      weeksBetween(
        { isoYear: a.isoYear, isoWeek: a.isoWeek },
        { isoYear: b.isoYear, isoWeek: b.isoWeek },
      ),
    )
    .slice(0, limit)
    .map((row) => ({
      ...row,
      weeksBefore: weeksBetween({ isoYear: row.isoYear, isoWeek: row.isoWeek }, week),
    }));
}

/**
 * Split the pending rows into the current week and everything older.
 *
 * PURE for the same reason. A submission filed under a week LATER than the current one is
 * grouped with `current` rather than silently dropped: it should not be possible — intake
 * derives the week from `collected_on` and `checkCollectionDate` refuses a future date — but
 * a row that should not exist must still be visible to the person who can act on it.
 */
export function partitionByWeek(
  submissions: readonly PendingSubmission[],
  currentWeek: IsoWeek,
): { current: PendingSubmission[]; earlier: PendingSubmission[] } {
  const current: PendingSubmission[] = [];
  const earlier: PendingSubmission[] = [];

  for (const submission of submissions) {
    const distance = weeksBetween(
      { isoYear: submission.isoYear, isoWeek: submission.isoWeek },
      currentWeek,
    );
    if (distance > 0) earlier.push(submission);
    else current.push(submission);
  }

  return { current, earlier };
}

/** Newest submission first inside a group, then by commodity so a week reads alphabetically. */
function byWeekThenCommodity(a: PendingSubmission, b: PendingSubmission): number {
  const week = weeksBetween(
    { isoYear: a.isoYear, isoWeek: a.isoWeek },
    { isoYear: b.isoYear, isoWeek: b.isoWeek },
  );
  if (week !== 0) return week;
  return a.commodityName.localeCompare(b.commodityName);
}

/**
 * The whole queue: every pending submission, with its series' published history attached.
 *
 * TWO QUERIES, NOT N+1. The submissions come back first; the history for every series they
 * mention is then read in one pass and grouped in memory. A per-row query would be sixteen
 * round trips today and one per commodity forever after.
 */
export async function getReviewQueue(now: Date = new Date()): Promise<ReviewQueue> {
  const supabase = await createClient();
  const currentWeek = isoWeekOf(now, WAT_TIME_ZONE);

  const { data, error } = await supabase
    .from("price_submissions")
    .select(
      `id, commodity_id, tier, iso_year, iso_week, price, currency, variety,
       collected_on, submitted_at, source, notes, photo_url, flags,
       commodities!inner(canonical_name),
       units!inner(name),
       collection_sites!inner(name),
       collectors!inner(name)`,
    )
    .eq("status", "pending")
    .order("iso_year", { ascending: false })
    .order("iso_week", { ascending: false })
    .order("submitted_at", { ascending: false });

  if (error) {
    // Not an empty queue — an unread one. "Nothing is waiting" is a claim we cannot make
    // when the read failed, and drawing an empty state here would make it (P0.2).
    return {
      currentWeek,
      current: [],
      earlier: [],
      unavailable: "The submission queue could not be read.",
    };
  }

  const rows = data ?? [];
  const history = await readSeriesHistory(
    supabase,
    rows.map((row) => ({ commodityId: row.commodity_id, tier: row.tier })),
  );

  const submissions = rows
    .map((row): PendingSubmission => {
      const week = { isoYear: row.iso_year, isoWeek: row.iso_week };
      const series = history.get(seriesKey(row.commodity_id, row.tier)) ?? [];

      return {
        id: row.id,
        isoYear: row.iso_year,
        isoWeek: row.iso_week,
        commodityName: nameOf(row.commodities, "canonical_name"),
        unitName: nameOf(row.units),
        variety: row.variety,
        tier: row.tier,
        price: readPrice(row.price),
        currency: row.currency,
        collectedOn: row.collected_on,
        siteName: nameOf(row.collection_sites),
        collectorName: nameOf(row.collectors),
        submittedAt: row.submitted_at,
        source: row.source,
        notes: row.notes,
        photoUrl: row.photo_url,
        // `flags` is a text[] the database constrains to the four permitted values (0009), so
        // the cast states a fact the CHECK already enforces rather than trusting the payload.
        flags: (row.flags ?? []) as SubmissionFlag[],
        recentWeeks: takeRecentWeeks(series, week),
      };
    })
    .sort(byWeekThenCommodity);

  const { current, earlier } = partitionByWeek(submissions, currentWeek);
  return { currentWeek, current, earlier, unavailable: null };
}

/**
 * Published history for every series the queue mentions, keyed by commodity and tier.
 *
 * LIVE ROWS ONLY (`superseded_at is null`): a superseded figure is one the series has already
 * disowned, and drawing it beside a price awaiting approval would invite a reviewer to judge
 * against a number that has been corrected. The correction chain is the public row-expansion
 * history's business (P1.3), not this panel's.
 */
async function readSeriesHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  series: readonly { commodityId: string; tier: string }[],
): Promise<Map<string, RecordedWeek[]>> {
  const grouped = new Map<string, RecordedWeek[]>();
  const commodityIds = [...new Set(series.map((entry) => entry.commodityId))];
  if (commodityIds.length === 0) return grouped;

  const { data, error } = await supabase
    .from("price_observations")
    .select(
      `commodity_id, tier, iso_year, iso_week, price, currency, collected_on,
       collection_sites!inner(name)`,
    )
    .in("commodity_id", commodityIds)
    .is("superseded_at", null)
    .order("iso_year", { ascending: false })
    .order("iso_week", { ascending: false });

  // A failed history read leaves every series empty, which the row renders as "no published
  // weeks" — the same thing an empty series renders. That collapse is acceptable HERE and
  // nowhere else on this screen: the panel is context beside a figure, not the figure, and
  // `unavailable` on the queue itself already covers the case where the decision data is
  // unreadable. The reviewer is never shown a PRICE that was not read.
  if (error || !data) return grouped;

  for (const row of data) {
    const key = seriesKey(row.commodity_id, row.tier);
    const list = grouped.get(key) ?? [];
    list.push({
      isoYear: row.iso_year,
      isoWeek: row.iso_week,
      price: readPrice(row.price),
      currency: row.currency,
      collectedOn: row.collected_on,
      siteName: nameOf(row.collection_sites),
      // Filled in by `takeRecentWeeks`, which is the only place that knows which submission
      // week this history is being measured against.
      weeksBefore: 0,
    });
    grouped.set(key, list);
  }

  return grouped;
}

/**
 * What a decision returns to the action that called it.
 *
 * The database's message is carried through verbatim on failure. Those messages were written
 * to be read by the reviewer — "the corrected price equals the submitted price; an edit that
 * changes nothing is not a correction" is better copy than anything this layer could
 * substitute, and replacing it with "Something went wrong" would throw away the one sentence
 * that says what to do next.
 */
export type DecisionResult =
  | { ok: true; observationId: string | null }
  | { ok: false; message: string };

/**
 * Approve, or edit-and-approve, publishing the observation in the same transaction (P1.1).
 *
 * THE MONDAY IS COMPUTED HERE, FROM `lib/weeks.ts`, AND FROM THE SUBMISSION'S OWN STORED WEEK
 * — never from the form. Two separate reasons, both load-bearing:
 *
 *   - The function takes `week_start_date` as an argument and only ever CHECKS it, because a
 *     second implementation of ISO week boundaries in SQL is the one duplication this project
 *     cannot afford (P2.7). `weekStartDate` is that one implementation.
 *   - Re-reading `iso_year`/`iso_week` from the row means a tampered or stale form cannot file
 *     a price into a week the collector never claimed. The function would catch a mismatch
 *     anyway; this means there is nothing to catch.
 */
export async function approveSubmission(
  input: ApproveSubmissionInput,
): Promise<DecisionResult> {
  const supabase = await createClient();

  const { data: submission, error: readError } = await supabase
    .from("price_submissions")
    .select("iso_year, iso_week, status")
    .eq("id", input.submissionId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: "That submission could not be read. Nothing was approved." };
  }
  if (!submission) {
    return { ok: false, message: "That submission no longer exists." };
  }
  if (submission.status !== "pending") {
    // A friendlier version of the refusal the function would raise, and the commonest race on
    // this screen: two reviewers with the queue open, one of them a few seconds behind.
    return {
      ok: false,
      message: `That submission has already been ${submission.status}. Reload the queue to see who decided it.`,
    };
  }

  const { data, error } = await supabase.rpc("approve_price_submission", {
    p_submission_id: input.submissionId,
    p_week_start_date: weekStartDate(submission.iso_year, submission.iso_week),
    // `null` and "argument omitted" are the same thing to this function — both parameters are
    // `default null` — but the generated Args type spells the absent case `undefined`. The
    // schema keeps `null` because the both-or-neither refinement is written against it, so the
    // two representations meet here, at the boundary, and nowhere else. `??` and not `||`: a
    // corrected price of 0 is a value, not an absence.
    p_corrected_price: input.correctedPrice ?? undefined,
    p_correction_reason: input.correctionReason ?? undefined,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, observationId: typeof data === "string" ? data : null };
}

/** Reject with a mandatory reason (P1.4). Publishes nothing, and deletes nothing. */
export async function rejectSubmission(
  input: RejectSubmissionInput,
): Promise<DecisionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("reject_price_submission", {
    p_submission_id: input.submissionId,
    p_reason: input.reason,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, observationId: null };
}
