/**
 * poster.ts — the one door in, used one row at a time and paced to stay under the limit.
 *
 * Every planned row becomes one POST to /api/ingest/price, which is the only write path this
 * importer has (P1.1). It does not touch `price_submissions` directly even though the script
 * holds a service-role key and could: a second write path would be a second set of validation
 * rules, a second outlier check and a second place for the two-prices-per-week rule to be
 * enforced differently. Submissions arriving from the tracker are the same rows, checked the
 * same way, as any other.
 *
 * SELF-PACING. `createRateLimiter` in lib/validation/ingest.ts allows RATE_LIMIT_MAX (300)
 * submissions per collector per rolling hour and answers 429 beyond it. A whole tracker column
 * is well under that today, but the limit is per collector and the tracker has one collector,
 * so a re-run stacked on top of a first run could reach it. This module keeps its own count of
 * the timestamps it has sent and waits rather than earning a 429: a 429 is indistinguishable,
 * from here, from the endpoint being in trouble, and the right response to a limit you know
 * about is to slow down, not to retry into it.
 *
 * The ceiling is set slightly below the server's, because the server's window and this one do
 * not start at the same instant and a limiter that aims exactly at the edge will cross it.
 *
 * DRY RUN IS THE DEFAULT, and lives in the caller — `postPlan` is only reached when a human
 * has typed --commit. Nothing here has a "mostly safe" mode.
 */

import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "../validation/ingest";
import type { PlannedPost } from "./planner";

/** Aim below the server's 300/hour so the two windows cannot disagree at the boundary. */
export const POST_CEILING = RATE_LIMIT_MAX - 20;

export interface PostOutcome {
  post: PlannedPost;
  ok: boolean;
  status: number;
  /** The submission id on success, or the failure code the route returned. */
  detail: string;
}

export interface PosterOptions {
  baseUrl: string;
  secret: string;
  /** Injected so tests drive the clock and the waiting rather than living through it. */
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  onOutcome?: (outcome: PostOutcome, index: number, total: number) => void;
}

/** The JSON body the ingest route's Zod schema expects, built from one planned row. */
export function toPayload(post: PlannedPost): Record<string, unknown> {
  return {
    collector_name: post.collectorName,
    collector_phone: post.collectorPhone,
    collection_site: post.market,
    commodity: post.commodity,
    variety: post.variety,
    tier: post.tier,
    unit: post.unit,
    unit_role: post.unitRole,
    price: post.price,
    currency: "NGN",
    collected_on: post.collectedOn,
    // Where this row came from, so a reviewer opening the submission can find the cell it was
    // read from. The ISO week is deliberately NOT written here: the route derives it from
    // collected_on, and repeating it in prose would create a second copy of the same fact that
    // could drift from the one the series is keyed on.
    notes: `tracker import — ${post.sheet}, row ${post.rowNumber}, column ${post.column}`,
  };
}

/**
 * How long to wait before sending the next row, given what has already been sent.
 *
 * Returns 0 while there is room in the window. Once the ceiling is reached it returns the time
 * until the oldest send falls out of the rolling hour, which is the soonest a further send can
 * be inside the limit.
 */
export function delayBeforeNext(sentAt: readonly number[], now: number): number {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const inWindow = sentAt.filter((stamp) => stamp > windowStart);
  if (inWindow.length < POST_CEILING) return 0;

  const oldest = Math.min(...inWindow);
  return Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now + 1);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Post every planned row, in order, pausing when the window is full.
 *
 * It does NOT stop on the first failure. A refused row is reported and the run continues,
 * because the failures worth knowing about are the pattern across a column — twenty rows
 * refused for one reason is a mapping problem, one row refused is a row. It also does not
 * retry: the route is idempotent about nothing, and a retry after an ambiguous failure is how
 * one price becomes two.
 */
export async function postPlan(
  posts: readonly PlannedPost[],
  options: PosterOptions,
): Promise<PostOutcome[]> {
  const now = options.now ?? (() => Date.now());
  const wait = options.wait ?? sleep;
  const send = options.fetchImpl ?? fetch;
  const endpoint = new URL("/api/ingest/price", options.baseUrl).toString();

  const sentAt: number[] = [];
  const outcomes: PostOutcome[] = [];

  for (const [index, post] of posts.entries()) {
    const delay = delayBeforeNext(sentAt, now());
    if (delay > 0) await wait(delay);

    let outcome: PostOutcome;

    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.secret}`,
        },
        body: JSON.stringify(toPayload(post)),
      });

      const body: unknown = await response.json().catch(() => null);
      const record = (body ?? {}) as Record<string, unknown>;

      outcome = {
        post,
        ok: response.ok,
        status: response.status,
        detail: response.ok
          ? String(record.submission_id ?? "stored")
          : `${String(record.code ?? "unknown")}: ${String(record.message ?? response.statusText)}`,
      };
    } catch (error) {
      // A transport failure is reported like any other refusal and the run continues. It is
      // NOT retried: this row may or may not have been stored, and sending it again is the one
      // way to turn an uncertainty into a duplicate.
      outcome = {
        post,
        ok: false,
        status: 0,
        detail: `request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    sentAt.push(now());
    outcomes.push(outcome);
    options.onOutcome?.(outcome, index, posts.length);
  }

  return outcomes;
}
