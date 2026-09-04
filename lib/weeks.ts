import { WAT_TIME_ZONE } from "./constants";

/**
 * ISO week arithmetic. The ONE module allowed to do week maths (CLAUDE.md).
 *
 * Wrong week maths silently corrupts every week-on-week figure the product will ever
 * publish, and the corruption looks exactly like a market movement — so this is written
 * against the ISO 8601 definition rather than against intuition:
 *
 *   - a week runs Monday → Sunday, and
 *   - week 1 is the week containing the first Thursday of the year.
 *
 * Everything is computed on the CIVIL date in `Africa/Lagos`, not on UTC. An observation
 * collected at 00:30 WAT on a Monday belongs to that Monday's week; read as UTC it would
 * fall on the Sunday before and land in the previous week.
 *
 * Stage 6 needs three of the five functions §3.1 plans for this module. `weeksBetween` and
 * `previousWeek` arrive with the price stages that use them — absent, not stubbed.
 */

export interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

const MS_PER_DAY = 86_400_000;

/** A civil (wall-clock) date in some zone, carried as its own value so the two never mix. */
interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/**
 * What `timeZone`'s clock reads at `instant`, and by how much it is offset from UTC.
 * Derived through Intl rather than assuming WAT's fixed +01:00, so the module stays correct
 * if it is ever pointed at a zone that observes DST.
 */
function zonedParts(timeZone: string, instant: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  // Intl renders midnight as hour 24 in the h23-vs-h24 edge; normalise it to 0.
  const hour = parts.hour === 24 ? 0 : parts.hour;

  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    parts.minute,
    parts.second,
  );

  return {
    civil: { year: parts.year, month: parts.month, day: parts.day },
    offsetMs: asIfUtc - instant.getTime(),
  };
}

/** The civil date `timeZone`'s clock shows at `instant`. */
function civilDateIn(timeZone: string, instant: Date): CivilDate {
  return zonedParts(timeZone, instant).civil;
}

/**
 * The instant at which `timeZone`'s clock reads midnight on this civil date.
 *
 * Computed, then corrected once against the offset actually in force at the result — a
 * single pass is enough for every real zone, because an offset shift is never large enough
 * to move the answer across a second boundary.
 */
function startOfCivilDay(timeZone: string, civil: CivilDate): Date {
  const naive = Date.UTC(civil.year, civil.month - 1, civil.day);
  const firstGuess = new Date(naive - zonedParts(timeZone, new Date(naive)).offsetMs);
  return new Date(naive - zonedParts(timeZone, firstGuess).offsetMs);
}

/** Days since Monday, 0-6. The ISO week's own numbering, not JavaScript's Sunday-first one. */
function isoDayIndex(utcDate: number): number {
  return (new Date(utcDate).getUTCDay() + 6) % 7;
}

/** A civil date as a UTC-midnight instant, used purely as a calendar cursor for day maths. */
function civilCursor(civil: CivilDate): number {
  return Date.UTC(civil.year, civil.month - 1, civil.day);
}

/** The Monday of ISO week 1 of `isoYear`, as a calendar cursor. */
function week1MondayCursor(isoYear: number): number {
  // 4 January is in week 1 by definition — it is the earliest date that always is.
  const jan4 = Date.UTC(isoYear, 0, 4);
  return jan4 - isoDayIndex(jan4) * MS_PER_DAY;
}

/** The ISO year and week the given instant falls in, read on `timeZone`'s calendar. */
export function isoWeekOf(instant: Date, timeZone: string = WAT_TIME_ZONE): IsoWeek {
  const cursor = civilCursor(civilDateIn(timeZone, instant));
  const monday = cursor - isoDayIndex(cursor) * MS_PER_DAY;

  // The ISO year is the year OF THE THURSDAY, which is what makes 29 December 2025 belong
  // to week 1 of 2026 rather than to week 53 of 2025.
  const thursday = monday + 3 * MS_PER_DAY;
  const isoYear = new Date(thursday).getUTCFullYear();

  const isoWeek = Math.round((monday - week1MondayCursor(isoYear)) / (7 * MS_PER_DAY)) + 1;
  return { isoYear, isoWeek };
}

/** The instant ISO week `isoWeek` of `isoYear` begins — Monday 00:00 on `timeZone`'s clock. */
export function weekStart(
  isoYear: number,
  isoWeek: number,
  timeZone: string = WAT_TIME_ZONE,
): Date {
  const cursor = week1MondayCursor(isoYear) + (isoWeek - 1) * 7 * MS_PER_DAY;
  const monday = new Date(cursor);
  return startOfCivilDay(timeZone, {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  });
}

/**
 * How a week is written wherever one is displayed (§2.6, P2.7: absolute, never relative).
 * The ISO year is carried by the caller when the surface has room for it — this is the
 * short form the spec draws, e.g. "Week 31".
 */
export function weekLabel(isoWeek: number): string {
  return `Week ${isoWeek}`;
}
