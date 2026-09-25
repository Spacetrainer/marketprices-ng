import { weekEndDate, weekStartDate } from "./weeks";

/**
 * Every rendered date, time, week and money figure passes through here (CLAUDE.md).
 *
 * The price formatters below are §2.6 of the architecture, and two of its rows are
 * credibility rules rather than formatting ones: a price period is always an absolute ISO
 * week (P2.7), and provenance — the collection date and the site — renders with every price
 * at every breakpoint (P1.6). That is why `formatCollectedAt` takes the site name as a
 * REQUIRED argument: a caller that has not fetched the site cannot accidentally render a
 * price without it.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Rendered in place of any figure the system does not have (P2.1). Never `0`, never blank. */
const ABSENT = "—";

/**
 * How long ago, in the control room's compact voice: "just now", "14 min ago", "3 h ago",
 * "2 days ago". §7.5 draws the sidebar status block as "Last sync 14 min ago".
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, so the result is a pure
 * function of its inputs and can be tested without freezing the clock.
 *
 * A FUTURE timestamp is not silently rendered as "just now": a sync stamped ahead of the
 * clock means a broken writer or a skewed host, and smoothing it over would hide exactly
 * the fault the readout exists to surface (P0.2 — nothing displayed is assumed).
 */
export function formatElapsed(since: Date, now: Date): string {
  const elapsed = now.getTime() - since.getTime();

  if (elapsed < -MINUTE) return "clock ahead";
  if (elapsed < MINUTE) return "just now";

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }

  const days = Math.floor(elapsed / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Whole hours between two instants, rounded to one decimal. Cycle-time readouts use this. */
export function formatHours(hours: number): string {
  return hours >= 10 ? `${Math.round(hours)} h` : `${hours.toFixed(1)} h`;
}

/** A whole-number percentage. Never rendered for an empty denominator — see the callers. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Naira, as §2.6 draws it: `₦95,000` and `₦850`. Thousands separated, never any decimals —
 * kobo is not a thing anybody quotes a yam in, and a trailing `.00` reads as false precision
 * on a figure someone read off a market stall.
 *
 * The symbol is prepended rather than left to `style: "currency"`, whose placement and
 * spacing vary with the ICU build. Only the grouping comes from Intl.
 *
 * A null price renders as `—` (P2.1), and so does a non-finite one: `NaN` reaching this
 * function is a bug upstream, and `₦NaN` on a price card is a worse way to find out about it
 * than a visible gap. A negative price cannot exist in the database (both price columns
 * check `>= 0`) but is signed correctly rather than mangled if one is ever constructed.
 */
export function formatNaira(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return ABSENT;

  const grouped = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return value < 0 ? `-₦${grouped}` : `₦${grouped}`;
}

/**
 * `en-US` short months, reassembled day-first.
 *
 * Not `en-GB`, which would give the right order directly but renders September as "Sept" —
 * four characters where the other eleven are three. In a tabular price column that one
 * month is a visible jog, and `tabular-nums` does nothing for letters. Taking the parts and
 * composing them keeps all twelve at three characters and keeps the order fixed regardless
 * of the runtime's locale data.
 */
function civilDateParts(civil: string, withYear: boolean): string {
  const [year, month, day] = civil.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).formatToParts(instant);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const head = `${value("day")} ${value("month")}`;
  return withYear ? `${head} ${value("year")}` : head;
}

/**
 * A price period, absolute and never relative (P2.7): `Week 31 · 28 Jul – 3 Aug 2026`.
 *
 * The year prints once, at the end, because that is what §2.6 draws — EXCEPT when the week
 * straddles a year boundary, where one trailing year would be a lie about the opening date.
 * 2026-W01 runs `Week 1 · 29 Dec 2025 – 4 Jan 2026`, with both years stated. This is the
 * same class of rule as P2.7 itself: the label may be compact, but it may not be ambiguous
 * about which week in which year it is naming.
 */
export function formatWeek(isoYear: number, isoWeek: number): string {
  const start = weekStartDate(isoYear, isoWeek);
  const end = weekEndDate(isoYear, isoWeek);
  const spansYears = start.slice(0, 4) !== end.slice(0, 4);

  return `Week ${isoWeek} · ${civilDateParts(start, spansYears)} – ${civilDateParts(end, true)}`;
}

/**
 * Provenance, stated once per price and at every breakpoint (P1.6, §2.6):
 * `Collected 30 Jul 2026 · Ile-Epo`.
 *
 * `siteName` is required, not optional. P1.6 says "it didn't fit on mobile" is not a
 * permitted reason to drop the site, and an optional argument is the shape that lets it be
 * dropped by omission three months from now. `collected_at_site_id` is provenance only and
 * never a comparison axis (P1.8) — this renders it, nothing groups by it.
 */
export function formatCollectedAt(collectedOn: string, siteName: string): string {
  return `Collected ${civilDateParts(collectedOn, true)} · ${siteName}`;
}
