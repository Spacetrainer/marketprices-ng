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
 * TWO KINDS OF INPUT, and keeping them apart is the point of this module. An INSTANT is a
 * moment on the clock and needs a timezone to be read as a date. A CIVIL DATE is already a
 * date — "2026-07-30" off a form — and needs no timezone at all, because nobody wrote a
 * time down. Functions taking an instant carry a `timeZone`; functions taking a civil date
 * deliberately do not.
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

/**
 * The ISO year and week a calendar cursor falls in. The shared core: every public entry
 * point resolves its input to a cursor and comes through here, so an instant read in Lagos
 * and a civil date off a form cannot disagree about what week they are in.
 */
function isoWeekOfCursor(cursor: number): IsoWeek {
  const monday = cursor - isoDayIndex(cursor) * MS_PER_DAY;

  // The ISO year is the year OF THE THURSDAY, which is what makes 29 December 2025 belong
  // to week 1 of 2026 rather than to week 53 of 2025.
  const thursday = monday + 3 * MS_PER_DAY;
  const isoYear = new Date(thursday).getUTCFullYear();

  const isoWeek = Math.round((monday - week1MondayCursor(isoYear)) / (7 * MS_PER_DAY)) + 1;
  return { isoYear, isoWeek };
}

/** The Monday of an ISO week, as a calendar cursor. Throws if the week does not exist. */
function weekMondayCursor(isoYear: number, isoWeek: number): number {
  const weeks = weeksInIsoYear(isoYear);
  if (!Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > weeks) {
    throw new RangeError(`ISO year ${isoYear} has ${weeks} weeks; week ${isoWeek} does not exist`);
  }
  return week1MondayCursor(isoYear) + (isoWeek - 1) * 7 * MS_PER_DAY;
}

/** A calendar cursor written back out as a civil date string, `YYYY-MM-DD`. */
function cursorToCivilString(cursor: number): string {
  const date = new Date(cursor);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` → a civil date, or null if the string is not one.
 *
 * The round-trip is the whole point. `Date.UTC` silently normalises overflow — 2026-02-30
 * becomes 2 March — so a bare parse would accept an impossible date and quietly file the
 * price into a real week seven days away. Building the cursor and checking the three fields
 * come back unchanged rejects it instead. This also catches a two-digit year, because
 * `Date.UTC(99, …)` maps to 1999 and fails the same comparison.
 */
function parseCivilDate(value: string): CivilDate | null {
  const match = CIVIL_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Whether a string is a real calendar date in `YYYY-MM-DD`. For the validation boundary:
 * a Zod regex proves the shape, this proves the date exists (P0.2 — 30 February is not a
 * day anybody collected a price on).
 */
export function isCivilDate(value: string): boolean {
  return parseCivilDate(value) !== null;
}

/** The ISO year and week the given instant falls in, read on `timeZone`'s calendar. */
export function isoWeekOf(instant: Date, timeZone: string = WAT_TIME_ZONE): IsoWeek {
  return isoWeekOfCursor(civilCursor(civilDateIn(timeZone, instant)));
}

/**
 * The ISO year and week a civil date falls in — `isoWeekOfCivilDate("2026-07-30")`.
 *
 * THIS is what the intake path uses. A form's `collected_on` is a bare date with no time
 * and no zone attached, and turning it into an instant first only invents a moment in order
 * to throw it away again. `new Date("2026-07-30")` parses as UTC midnight, which happens to
 * read as the same civil day in Lagos purely because WAT is a POSITIVE offset — the same
 * code in a negative-offset zone lands on the day before, and in the first days of January
 * that is a different ISO year. No timezone parameter, because there is no instant here to
 * localise.
 *
 * Throws on a string that is not a real date; call `isCivilDate` at the boundary first.
 */
export function isoWeekOfCivilDate(value: string): IsoWeek {
  const civil = parseCivilDate(value);
  if (!civil) {
    throw new RangeError(`"${value}" is not a calendar date in YYYY-MM-DD form`);
  }
  return isoWeekOfCursor(civilCursor(civil));
}

/**
 * How many ISO weeks a year has — 52 or 53.
 *
 * Derived, not tabulated: 28 December is always in the final ISO week of its own year
 * (it is the latest date that always is, the mirror of 4 January), so asking which week it
 * falls in answers the question without a leap-year rule to get wrong.
 */
export function weeksInIsoYear(isoYear: number): number {
  return isoWeekOfCursor(Date.UTC(isoYear, 11, 28)).isoWeek;
}

/** The instant ISO week `isoWeek` of `isoYear` begins — Monday 00:00 on `timeZone`'s clock. */
export function weekStart(
  isoYear: number,
  isoWeek: number,
  timeZone: string = WAT_TIME_ZONE,
): Date {
  const monday = new Date(weekMondayCursor(isoYear, isoWeek));
  return startOfCivilDay(timeZone, {
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  });
}

/**
 * The Monday of an ISO week as a civil date string — what goes into
 * `price_observations.week_start_date`, which is a `date` column, not a `timestamptz`.
 *
 * Handing that column an instant and letting the driver cast it is how a row ends up one
 * day off: the cast reads the instant in UTC, and Monday 00:00 WAT is Sunday 23:00 UTC. The
 * database then rejects the row against its own three checks — `extract(isodow) = 1`,
 * `extract(isoyear) = iso_year`, `extract(week) = iso_week` — which is the good outcome, but
 * only because someone wrote those checks. This returns the date the checks expect.
 */
export function weekStartDate(isoYear: number, isoWeek: number): string {
  return cursorToCivilString(weekMondayCursor(isoYear, isoWeek));
}

/** The Sunday of an ISO week as a civil date string. The closing half of a printed range. */
export function weekEndDate(isoYear: number, isoWeek: number): string {
  return cursorToCivilString(weekMondayCursor(isoYear, isoWeek) + 6 * MS_PER_DAY);
}

/**
 * The week before this one, stepping across the year boundary correctly.
 *
 * Week 1 goes back to the LAST week of the previous ISO year, which is 52 or 53 depending
 * on the year — never a fixed 52, and never week 0. The radar's "last three recorded weeks"
 * walks this backwards, so a wrong answer here draws the wrong three prices next to a
 * submission and makes the approval judgement worse than useless.
 */
export function previousWeek({ isoYear, isoWeek }: IsoWeek): IsoWeek {
  if (isoWeek > 1) return { isoYear, isoWeek: isoWeek - 1 };
  return { isoYear: isoYear - 1, isoWeek: weeksInIsoYear(isoYear - 1) };
}

/**
 * Weeks from `from` to `to`, signed: positive when `to` is later, negative when earlier,
 * zero for the same week.
 *
 * Measured between the two Mondays rather than by subtracting week numbers, which is what
 * makes it correct across a year boundary — 2025-W52 to 2026-W01 is 1, not −51.
 */
export function weeksBetween(from: IsoWeek, to: IsoWeek): number {
  const fromMonday = weekMondayCursor(from.isoYear, from.isoWeek);
  const toMonday = weekMondayCursor(to.isoYear, to.isoWeek);
  return Math.round((toMonday - fromMonday) / (7 * MS_PER_DAY));
}

/**
 * How a week is written wherever one is displayed (§2.6, P2.7: absolute, never relative).
 * The ISO year is carried by the caller when the surface has room for it — this is the
 * short form the spec draws, e.g. "Week 31". The full form with the date range lives in
 * `lib/format.ts` as `formatWeek`, because composing a date range is display, not arithmetic.
 */
export function weekLabel(isoWeek: number): string {
  return `Week ${isoWeek}`;
}
