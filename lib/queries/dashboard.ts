import { createClient } from "../supabase/server";
import { formatElapsed, formatHours } from "../format";
import { isoWeekOf, weekLabel, weekStart } from "../weeks";
import { WAT_TIME_ZONE } from "../constants";
import type { BadgeKey } from "../auth/surfaces";

/**
 * Every figure on the Dashboard and every sidebar badge (§8.10, §7.5). Components never call
 * Supabase directly (CLAUDE.md), and nothing in here invents a value: a count is either
 * measured or explicitly `unavailable`, never a zero standing in for "we did not find out".
 * That distinction is P0.2, and it is what stops the Zone 1 collapse from lying.
 */

/**
 * A number the screen may print, or a stated reason it cannot.
 *
 * `unavailable` is NOT an error path — the commonest cause is a table this repo's schema does
 * not contain yet. Rendering it as 0 would claim a measurement nobody took.
 *
 * It carries BOTH strings because the two are read at different distances: `label` stands
 * where the figure would have stood, so it has to be short enough to scan in the two seconds
 * §8.10 allows Zone 1; `note` is the full reason, on the line beneath. Neither is composed in
 * a component — the reason a figure is missing is a property of the measurement, not of the
 * card that draws it.
 */
export type Measure =
  | { state: "known"; value: number }
  | { state: "unavailable"; label: string; note: string };

export type QueueCardId =
  | "ready"
  | "needs-work"
  | "going-out-today"
  | "dispatch-failures"
  | "hot-signals"
  | "critical-anomalies";

export interface QueueCard {
  id: QueueCardId;
  label: string;
  /** Where the card clicks through to (§8.10). The filtered view arrives with the surface. */
  href: string;
  /**
   * Whether a non-zero count earns the 3px amber left border. §8.10 makes the border
   * conditional on "non-zero AND time-sensitive", so the four clock-driven cards carry it:
   * today's schedule, a failed dispatch, a signal ageing out, an unactioned critical
   * anomaly. Ready and Needs work are backlog, not deadline, and stay unbordered.
   */
  timeSensitive: boolean;
  measure: Measure;
}

export type ReadoutId =
  | "last-news-sync"
  | "last-price-sync"
  | "items-ingested"
  | "verification-pass-rate"
  | "cycle-time"
  | "weekly-mix";

export interface Readout {
  id: ReadoutId;
  label: string;
  /** The figure. `null` means there is nothing honest to print, and `note` says why. */
  value: string | null;
  /** The second line — provenance, or the qualifier that keeps the figure honest. */
  detail: string | null;
  note: string | null;
  /** The amber attention dot (§8.10: news sync over 90 minutes; mix off target). */
  attention: boolean;
}

export interface SyncStatus {
  /** "Last sync 14 min ago", or the reason there is no such time yet. */
  lastSync: string;
  /** §7.5 draws "Next price sync 06:00" beneath it. See the note at readNextPriceSync. */
  nextPriceSync: string | null;
}

export interface DashboardData {
  queueCards: QueueCard[];
  readouts: Readout[];
  syncStatus: SyncStatus;
}

export type NavBadges = Record<BadgeKey, Measure>;

/** Over this, the news sync readout raises its amber dot (§8.10). */
const NEWS_SYNC_ATTENTION_MS = 90 * 60_000;
const HOT_SIGNAL_SCORE = 70;
/** §8.10: a hot signal counts as unactioned once it has sat for a day. */
const HOT_SIGNAL_AGE_MS = 24 * 60 * 60_000;
const CYCLE_TIME_WINDOW_DAYS = 30;
/** Bounded so the median never turns into an unbounded table scan as volume grows. */
const CYCLE_TIME_SAMPLE_LIMIT = 500;

/**
 * `social_content_queue` does not exist in this project's schema. It is absent from
 * types/database.ts, from every migration, and docs/exceptions.md records the search that
 * established it — the live Agent 3 pipeline runs against a different database, and which of
 * three possible resolutions applies is still an open question.
 *
 * So the Dispatch failures card cannot be measured, and says so. It must not read 0: a
 * silent zero on the most operationally urgent card is the exact failure P0.2 describes.
 */
const DISPATCH_UNAVAILABLE = {
  state: "unavailable",
  label: "Not connected yet",
  note: "The dispatch queue lives outside this database.",
} as const satisfies Measure;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Reads a bare `count` without pulling rows back. Any failure becomes a stated absence. */
async function countRows(
  run: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<Measure> {
  const { count, error } = await run();
  if (error || count === null) {
    return {
      state: "unavailable",
      label: "Unavailable",
      note: "The count could not be read.",
    };
  }
  return { state: "known", value: count };
}

/** Midnight-to-midnight on the Lagos clock, which is the only "today" this product has. */
function watDayBounds(now: Date): { start: Date; end: Date } {
  const { isoYear, isoWeek } = isoWeekOf(now, WAT_TIME_ZONE);
  const mondayStart = weekStart(isoYear, isoWeek, WAT_TIME_ZONE);
  const daysIn = Math.floor((now.getTime() - mondayStart.getTime()) / 86_400_000);
  const start = new Date(mondayStart.getTime() + daysIn * 86_400_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function getQueueCards(now: Date = new Date()): Promise<QueueCard[]> {
  const supabase = await createClient();
  const day = watDayBounds(now);
  const hotSignalCutoff = new Date(now.getTime() - HOT_SIGNAL_AGE_MS).toISOString();

  const [ready, needsWork, goingOut, hotSignals, criticalAnomalies] = await Promise.all([
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "ready"),
    ),
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "needs_work"),
    ),
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "scheduled")
        .gte("scheduled_for", day.start.toISOString())
        .lt("scheduled_for", day.end.toISOString()),
    ),
    countRows(() =>
      supabase
        .from("signals")
        .select("*", { count: "exact", head: true })
        .eq("state", "new")
        .gte("signal_score", HOT_SIGNAL_SCORE)
        .lt("created_at", hotSignalCutoff),
    ),
    countRows(() =>
      supabase
        .from("price_anomalies")
        .select("*", { count: "exact", head: true })
        .eq("state", "new")
        .eq("severity", "critical"),
    ),
  ]);

  return [
    { id: "ready", label: "Ready to schedule", href: "/admin/studio?status=ready", timeSensitive: false, measure: ready },
    { id: "needs-work", label: "Needs work", href: "/admin/studio?status=needs_work", timeSensitive: false, measure: needsWork },
    { id: "going-out-today", label: "Going out today", href: "/admin/queue?view=day", timeSensitive: true, measure: goingOut },
    {
      id: "dispatch-failures",
      label: "Dispatch failures",
      href: "/admin/queue?status=failed",
      timeSensitive: true,
      measure: DISPATCH_UNAVAILABLE,
    },
    { id: "hot-signals", label: "Hot signals unactioned", href: "/admin/signals", timeSensitive: true, measure: hotSignals },
    { id: "critical-anomalies", label: "Critical anomalies unactioned", href: "/admin/radar", timeSensitive: true, measure: criticalAnomalies },
  ];
}

/**
 * Zone 1 collapses to one line ONLY when every card is a measured zero (§8.10, P4.4).
 *
 * An `unavailable` card is not a zero and does not permit the collapse: "Nothing needs you
 * right now" is a factual claim about all six queues, and it cannot be made while one of
 * them is unmeasured. Today that keeps the zone expanded, which is the honest outcome
 * rather than a missing feature.
 */
export function shouldCollapseQueueZone(cards: readonly QueueCard[]): boolean {
  return cards.every((card) => card.measure.state === "known" && card.measure.value === 0);
}

export async function getNavBadges(): Promise<NavBadges> {
  const supabase = await createClient();

  // What each badge counts is "what is waiting on this screen" — the same reading the six
  // surfaces have in §7.5: unactioned intake, and items sitting in production or scheduled.
  const [signals, radar, studio, queue] = await Promise.all([
    countRows(() =>
      supabase.from("signals").select("*", { count: "exact", head: true }).eq("state", "new"),
    ),
    countRows(() =>
      supabase
        .from("price_anomalies")
        .select("*", { count: "exact", head: true })
        .eq("state", "new"),
    ),
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .in("status", ["queued", "producing", "ready", "needs_work"]),
    ),
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .in("status", ["scheduled", "dispatching", "failed"]),
    ),
  ]);

  return { signals, radar, studio, queue };
}

async function readLastNewsSync(supabase: Supabase, now: Date): Promise<Readout> {
  const { data, error } = await supabase
    .from("sources")
    .select("last_polled_at")
    .not("last_polled_at", "is", null)
    .order("last_polled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = { id: "last-news-sync" as const, label: "Last news sync" };

  if (error) {
    return { ...base, value: null, detail: null, note: "Unavailable.", attention: false };
  }
  if (!data?.last_polled_at) {
    return {
      ...base,
      value: null,
      detail: null,
      note: "No source has been polled yet.",
      attention: false,
    };
  }

  const polled = new Date(data.last_polled_at);
  return {
    ...base,
    value: formatElapsed(polled, now),
    detail: null,
    note: null,
    attention: now.getTime() - polled.getTime() > NEWS_SYNC_ATTENTION_MS,
  };
}

async function readLastPriceSync(supabase: Supabase): Promise<Readout> {
  const base = { id: "last-price-sync" as const, label: "Last price sync" };

  const { data, error } = await supabase
    .from("price_observations")
    .select("iso_year, iso_week, collected_on, collection_sites!inner(name)")
    .order("iso_year", { ascending: false })
    .order("iso_week", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ...base, value: null, detail: null, note: "Unavailable.", attention: false };
  }
  if (!data) {
    return {
      ...base,
      value: null,
      detail: null,
      note: "No prices recorded yet.",
      attention: false,
    };
  }

  // Every displayed price carries its ISO week AND its collection date (CLAUDE.md). The week
  // is the figure; the ISO year and collection date ride along in the detail line so the
  // readout is absolute rather than "week 31 of some year" (P2.7).
  const site = (data.collection_sites as unknown as { name: string } | null)?.name ?? null;
  return {
    ...base,
    value: site ? `${weekLabel(data.iso_week)} · ${site}` : weekLabel(data.iso_week),
    detail: `${data.iso_year} · collected ${data.collected_on}`,
    note: null,
    attention: false,
  };
}

async function readItemsIngested(supabase: Supabase, now: Date): Promise<Readout> {
  const base = { id: "items-ingested" as const, label: "Items ingested, 24h" };
  const cutoff = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  const [ingested, hot] = await Promise.all([
    countRows(() =>
      supabase
        .from("raw_items")
        .select("*", { count: "exact", head: true })
        .gte("fetched_at", cutoff),
    ),
    countRows(() =>
      supabase
        .from("signals")
        .select("*", { count: "exact", head: true })
        .gte("scored_at", cutoff)
        .gte("signal_score", HOT_SIGNAL_SCORE),
    ),
  ]);

  if (ingested.state === "unavailable") {
    return { ...base, value: null, detail: null, note: ingested.note, attention: false };
  }

  return {
    ...base,
    value: String(ingested.value),
    detail:
      hot.state === "known"
        ? `${hot.value} scoring ${HOT_SIGNAL_SCORE} or above`
        : "Share scoring 70+ unavailable",
    note: null,
    attention: false,
  };
}

/**
 * Verification pass rate has no computable definition yet.
 *
 * §8.10 asks for a "first-pass percentage", but `content_items.verification_log` is jsonb
 * whose shape migration 0018 deliberately leaves unenforced and undocumented, and nothing
 * else records whether an item passed verification on its first attempt. There is no honest
 * number to derive, so the slot is built and labelled rather than filled with a guess.
 */
function readVerificationPassRate(): Readout {
  return {
    id: "verification-pass-rate",
    label: "Verification pass rate, 30d",
    value: null,
    detail: null,
    note: "Awaiting definition — no first-pass signal is recorded yet.",
    attention: false,
  };
}

async function readCycleTime(supabase: Supabase, now: Date): Promise<Readout> {
  const base = { id: "cycle-time" as const, label: "Promote to publish, median" };
  const cutoff = new Date(now.getTime() - CYCLE_TIME_WINDOW_DAYS * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("content_items")
    .select("created_at, published_at")
    .not("published_at", "is", null)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(CYCLE_TIME_SAMPLE_LIMIT);

  if (error) {
    return { ...base, value: null, detail: null, note: "Unavailable.", attention: false };
  }

  // The row is created at promotion (`queued`), so created_at → published_at IS the cycle.
  const hours = (data ?? [])
    .filter((row): row is { created_at: string; published_at: string } => row.published_at !== null)
    .map((row) => (new Date(row.published_at).getTime() - new Date(row.created_at).getTime()) / 3_600_000)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (hours.length === 0) {
    return {
      ...base,
      value: null,
      detail: null,
      note: "Nothing published in the last 30 days.",
      attention: false,
    };
  }

  const middle = Math.floor(hours.length / 2);
  const median =
    hours.length % 2 === 0 ? (hours[middle - 1] + hours[middle]) / 2 : hours[middle];

  return {
    ...base,
    value: formatHours(median),
    detail: `${hours.length} published in ${CYCLE_TIME_WINDOW_DAYS} days`,
    note: null,
    attention: false,
  };
}

/**
 * This week's mix, counted for real — but WITHOUT the target comparison §8.10 draws.
 *
 * The comparison needs the weekly article target and video cap from Settings group 8. Those
 * live in `editorial_rules`, which is empty, has no seed, and has no agreed shape for a
 * target row — Settings group 8 is stage 17. The spec's "2 articles · 1 video" is an
 * illustration, and copying it into code would make the amber over/under state a fiction
 * (P0.2).
 *
 * So the counts are real and the qualifier is UNCONDITIONAL. This deliberately does not
 * probe `editorial_rules` to decide whether to print the qualifier: a probe would drop the
 * caveat the moment any rule row appeared, while still rendering no comparison — a readout
 * that quietly stops saying it is uncompared is worse than one that never said it. The
 * qualifier and the comparison get built in the same commit, or neither does.
 */
async function readWeeklyMix(supabase: Supabase, now: Date): Promise<Readout> {
  const base = { id: "weekly-mix" as const, label: "This week's mix" };
  const { isoYear, isoWeek } = isoWeekOf(now, WAT_TIME_ZONE);
  const start = weekStart(isoYear, isoWeek, WAT_TIME_ZONE).toISOString();

  const [articles, videos] = await Promise.all([
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "published")
        .eq("format", "article")
        .gte("published_at", start),
    ),
    countRows(() =>
      supabase
        .from("content_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "published")
        .eq("format", "video")
        .gte("published_at", start),
    ),
  ]);

  if (articles.state === "unavailable" || videos.state === "unavailable") {
    return {
      ...base,
      value: null,
      detail: null,
      note: "The week's published counts could not be read.",
      attention: false,
    };
  }

  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

  return {
    ...base,
    value: `${plural(articles.value, "article")} · ${plural(videos.value, "video")}`,
    detail: `${weekLabel(isoWeek)} · ${isoYear}`,
    note: "Counted, not compared — no weekly target is set in Settings.",
    // No target, no over/under, and therefore no amber: an attention state derived from a
    // target that does not exist would be decoration.
    attention: false,
  };
}

/**
 * The sidebar's bottom status block (§7.5).
 *
 * "Next price sync" stays null until a schedule genuinely exists: the cron table in the build
 * plan is a plan, there is no `vercel.json` in this repo, and no job is registered anywhere.
 * Printing a time from the document would be exactly the copied-example-value P0.2 forbids.
 */
async function readSyncStatus(supabase: Supabase, now: Date): Promise<SyncStatus> {
  const { data } = await supabase
    .from("sources")
    .select("last_polled_at")
    .not("last_polled_at", "is", null)
    .order("last_polled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    lastSync: data?.last_polled_at
      ? `Last sync ${formatElapsed(new Date(data.last_polled_at), now)}`
      : "No sync yet",
    nextPriceSync: null,
  };
}

/** The sidebar's status block on its own — the shell renders it on every surface, not just
 *  the Dashboard, and must not pay for the Dashboard's other seven queries to get it. */
export async function getSyncStatus(now: Date = new Date()): Promise<SyncStatus> {
  return readSyncStatus(await createClient(), now);
}

export async function getDashboardData(now: Date = new Date()): Promise<DashboardData> {
  const supabase = await createClient();

  const [queueCards, lastNewsSync, lastPriceSync, itemsIngested, cycleTime, weeklyMix, syncStatus] =
    await Promise.all([
      getQueueCards(now),
      readLastNewsSync(supabase, now),
      readLastPriceSync(supabase),
      readItemsIngested(supabase, now),
      readCycleTime(supabase, now),
      readWeeklyMix(supabase, now),
      readSyncStatus(supabase, now),
    ]);

  return {
    queueCards,
    // Spec order (§8.10). The strip is read left to right and the order is part of the spec.
    readouts: [
      lastNewsSync,
      lastPriceSync,
      itemsIngested,
      readVerificationPassRate(),
      cycleTime,
      weeklyMix,
    ],
    syncStatus,
  };
}
