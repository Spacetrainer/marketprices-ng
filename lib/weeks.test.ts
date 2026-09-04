import { describe, expect, it } from "vitest";
import { isoWeekOf, weekLabel, weekStart } from "./weeks";
import { WAT_TIME_ZONE } from "./constants";

/** A WAT wall-clock moment, written as the UTC instant it corresponds to (WAT is UTC+1). */
function wat(iso: string): Date {
  return new Date(`${iso}+01:00`);
}

describe("isoWeekOf", () => {
  it("numbers an ordinary mid-year week", () => {
    // Thursday 30 July 2026 is in ISO week 31 — the week the spec draws as "Week 31".
    expect(isoWeekOf(wat("2026-07-30T12:00:00"))).toEqual({ isoYear: 2026, isoWeek: 31 });
  });

  it("puts late December into week 1 of the FOLLOWING ISO year", () => {
    // 29 Dec 2025 is a Monday whose Thursday falls in 2026, so ISO calls it 2026-W01.
    expect(isoWeekOf(wat("2025-12-29T09:00:00"))).toEqual({ isoYear: 2026, isoWeek: 1 });
    expect(isoWeekOf(wat("2025-12-31T23:59:00"))).toEqual({ isoYear: 2026, isoWeek: 1 });
  });

  it("puts early January into the LAST week of the previous ISO year", () => {
    // 1 Jan 2027 is a Friday; its Monday is 28 Dec 2026, whose Thursday is still 2026.
    expect(isoWeekOf(wat("2027-01-01T10:00:00"))).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  it("handles a 53-week year", () => {
    // 2026 is a long year: it has a week 53, and 31 Dec 2026 sits in it.
    expect(isoWeekOf(wat("2026-12-31T12:00:00"))).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  it("reads the Monday boundary on the Lagos clock, not on UTC", () => {
    // 00:30 WAT on Monday is 23:30 UTC on the Sunday before. Read as UTC this instant would
    // fall in the previous week — which is precisely the bug this module exists to prevent.
    const justAfterMidnightWat = wat("2026-08-03T00:30:00");
    expect(justAfterMidnightWat.toISOString()).toBe("2026-08-02T23:30:00.000Z");
    expect(isoWeekOf(justAfterMidnightWat)).toEqual({ isoYear: 2026, isoWeek: 32 });
  });

  it("keeps the last minute of Sunday in the outgoing week", () => {
    expect(isoWeekOf(wat("2026-08-02T23:59:00"))).toEqual({ isoYear: 2026, isoWeek: 31 });
  });
});

describe("weekStart", () => {
  it("returns Monday 00:00 WAT", () => {
    const start = weekStart(2026, 31);
    expect(start.toISOString()).toBe("2026-07-26T23:00:00.000Z"); // 27 July 00:00 +01:00
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: WAT_TIME_ZONE,
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(start),
    ).toBe("Monday 00:00");
  });

  it("round-trips with isoWeekOf across year boundaries and week 53", () => {
    for (const week of [
      { isoYear: 2026, isoWeek: 1 },
      { isoYear: 2026, isoWeek: 31 },
      { isoYear: 2026, isoWeek: 53 },
      { isoYear: 2027, isoWeek: 1 },
    ]) {
      expect(isoWeekOf(weekStart(week.isoYear, week.isoWeek))).toEqual(week);
    }
  });

  it("starts 2026-W01 on 29 December 2025", () => {
    const start = weekStart(2026, 1);
    const civil = new Intl.DateTimeFormat("en-CA", {
      timeZone: WAT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start);
    expect(civil).toBe("2025-12-29");
  });

  it("puts exactly seven days between consecutive weeks", () => {
    const a = weekStart(2026, 31).getTime();
    const b = weekStart(2026, 32).getTime();
    expect(b - a).toBe(7 * 86_400_000);
  });
});

describe("weekLabel", () => {
  it("writes the absolute week, never a relative one (P2.7)", () => {
    expect(weekLabel(31)).toBe("Week 31");
    expect(weekLabel(1)).toBe("Week 1");
  });
});
