/**
 * Every rendered date, time and week passes through here (CLAUDE.md). Stage 6 needs the
 * elapsed-time form the Dashboard's sync readouts are drawn with; `formatNaira`,
 * `formatChange` and `formatCollectedAt` arrive with the price surfaces that display them.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
