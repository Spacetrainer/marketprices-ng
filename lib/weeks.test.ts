import { describe, expect, it } from "vitest";
import {
  isCivilDate,
  isoWeekOf,
  isoWeekOfCivilDate,
  previousWeek,
  weekEndDate,
  weekLabel,
  weekStart,
  weekStartDate,
  weeksBetween,
  weeksInIsoYear,
} from "./weeks";
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

describe("isCivilDate", () => {
  it("accepts a real calendar date", () => {
    expect(isCivilDate("2026-07-30")).toBe(true);
    expect(isCivilDate("2028-02-29")).toBe(true); // 2028 is a leap year
  });

  it("rejects a date that does not exist", () => {
    // The bug this guards: Date.UTC normalises 30 February to 2 March, so a bare parse
    // would file the price into a real week a week away without complaining once.
    expect(isCivilDate("2026-02-30")).toBe(false);
    expect(isCivilDate("2027-02-29")).toBe(false); // 2027 is not a leap year
    expect(isCivilDate("2026-13-01")).toBe(false);
    expect(isCivilDate("2026-00-10")).toBe(false);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(isCivilDate("30/07/2026")).toBe(false);
    expect(isCivilDate("2026-7-30")).toBe(false);
    expect(isCivilDate("2026-07-30T12:00:00Z")).toBe(false);
    expect(isCivilDate("")).toBe(false);
  });

  it("rejects a two-digit year rather than reading it as 19xx", () => {
    expect(isCivilDate("0099-01-01")).toBe(false);
  });
});

describe("isoWeekOfCivilDate", () => {
  it("numbers an ordinary mid-year date", () => {
    expect(isoWeekOfCivilDate("2026-07-30")).toEqual({ isoYear: 2026, isoWeek: 31 });
  });

  it("puts late December into week 1 of the FOLLOWING ISO year", () => {
    expect(isoWeekOfCivilDate("2025-12-29")).toEqual({ isoYear: 2026, isoWeek: 1 });
    expect(isoWeekOfCivilDate("2025-12-31")).toEqual({ isoYear: 2026, isoWeek: 1 });
  });

  it("puts early January into the LAST week of the previous ISO year", () => {
    expect(isoWeekOfCivilDate("2027-01-01")).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  it("handles a 53-week year", () => {
    expect(isoWeekOfCivilDate("2026-12-31")).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  it("agrees with isoWeekOf read on the Lagos clock, for every day of a week", () => {
    // The two entry points must never disagree: one is what the intake path uses on a
    // form's `collected_on`, the other is what the Dashboard uses on `now`.
    for (const day of ["27", "28", "29", "30", "31"]) {
      const civil = `2026-07-${day}`;
      expect(isoWeekOfCivilDate(civil)).toEqual(isoWeekOf(wat(`${civil}T12:00:00`)));
    }
  });

  it("throws on a date that does not exist, rather than sliding to a nearby one", () => {
    expect(() => isoWeekOfCivilDate("2026-02-30")).toThrow(/not a calendar date/);
  });
});

describe("weeksInIsoYear", () => {
  it("knows the long years", () => {
    // 2020, 2026 and 2032 have 53 ISO weeks; the years around them have 52.
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2026)).toBe(53);
    expect(weeksInIsoYear(2032)).toBe(53);
  });

  it("knows the ordinary years", () => {
    expect(weeksInIsoYear(2024)).toBe(52);
    expect(weeksInIsoYear(2025)).toBe(52);
    expect(weeksInIsoYear(2027)).toBe(52);
    expect(weeksInIsoYear(2028)).toBe(52);
  });
});

describe("weekStartDate / weekEndDate", () => {
  it("returns the Monday and the Sunday as civil date strings", () => {
    // A `date` column, not a timestamptz: handing it an instant would cast in UTC, and
    // Monday 00:00 WAT is Sunday 23:00 UTC — one day out, every row.
    expect(weekStartDate(2026, 31)).toBe("2026-07-27");
    expect(weekEndDate(2026, 31)).toBe("2026-08-02");
  });

  it("spans the year boundary in both directions", () => {
    expect(weekStartDate(2026, 1)).toBe("2025-12-29");
    expect(weekEndDate(2026, 1)).toBe("2026-01-04");
    expect(weekStartDate(2026, 53)).toBe("2026-12-28");
    expect(weekEndDate(2026, 53)).toBe("2027-01-03");
  });

  it("always returns a Monday, and always six days before its Sunday", () => {
    for (let week = 1; week <= 53; week += 1) {
      const start = weekStartDate(2026, week);
      expect(isoWeekOfCivilDate(start)).toEqual({ isoYear: 2026, isoWeek: week });
      expect(weekStart(2026, week).getTime()).toBe(
        new Date(`${start}T00:00:00+01:00`).getTime(),
      );
    }
  });

  it("refuses a week the year does not have", () => {
    expect(() => weekStartDate(2025, 53)).toThrow(/2025 has 52 weeks/);
    expect(() => weekStartDate(2026, 54)).toThrow(/does not exist/);
    expect(() => weekStartDate(2026, 0)).toThrow(/does not exist/);
  });
});

describe("previousWeek", () => {
  it("steps back inside a year", () => {
    expect(previousWeek({ isoYear: 2026, isoWeek: 31 })).toEqual({ isoYear: 2026, isoWeek: 30 });
  });

  it("steps back into the previous year's LAST week, not into week 0", () => {
    expect(previousWeek({ isoYear: 2026, isoWeek: 1 })).toEqual({ isoYear: 2025, isoWeek: 52 });
  });

  it("lands on week 53 when the previous year is a long one", () => {
    expect(previousWeek({ isoYear: 2027, isoWeek: 1 })).toEqual({ isoYear: 2026, isoWeek: 53 });
  });

  it("walks three weeks back across a year boundary, as the radar does", () => {
    let week = { isoYear: 2027, isoWeek: 2 };
    const walked = [];
    for (let i = 0; i < 3; i += 1) {
      week = previousWeek(week);
      walked.push(week);
    }
    expect(walked).toEqual([
      { isoYear: 2027, isoWeek: 1 },
      { isoYear: 2026, isoWeek: 53 },
      { isoYear: 2026, isoWeek: 52 },
    ]);
  });
});

describe("weeksBetween", () => {
  it("is zero for the same week", () => {
    expect(weeksBetween({ isoYear: 2026, isoWeek: 31 }, { isoYear: 2026, isoWeek: 31 })).toBe(0);
  });

  it("counts forward and backward with a sign", () => {
    expect(weeksBetween({ isoYear: 2026, isoWeek: 28 }, { isoYear: 2026, isoWeek: 31 })).toBe(3);
    expect(weeksBetween({ isoYear: 2026, isoWeek: 31 }, { isoYear: 2026, isoWeek: 28 })).toBe(-3);
  });

  it("crosses a year boundary as one week, not fifty-one", () => {
    // Subtracting week numbers would give -51 here. Measuring between the Mondays is what
    // makes the answer 1, and a wrong sign here would invert a week-on-week change.
    expect(weeksBetween({ isoYear: 2025, isoWeek: 52 }, { isoYear: 2026, isoWeek: 1 })).toBe(1);
    expect(weeksBetween({ isoYear: 2026, isoWeek: 53 }, { isoYear: 2027, isoWeek: 1 })).toBe(1);
  });

  it("counts a full 53-week year as 53 weeks", () => {
    expect(weeksBetween({ isoYear: 2026, isoWeek: 1 }, { isoYear: 2027, isoWeek: 1 })).toBe(53);
    expect(weeksBetween({ isoYear: 2025, isoWeek: 1 }, { isoYear: 2026, isoWeek: 1 })).toBe(52);
  });

  it("agrees with previousWeek stepped the same distance", () => {
    let week = { isoYear: 2027, isoWeek: 3 };
    for (let i = 1; i <= 60; i += 1) {
      week = previousWeek(week);
      expect(weeksBetween(week, { isoYear: 2027, isoWeek: 3 })).toBe(i);
    }
  });
});
