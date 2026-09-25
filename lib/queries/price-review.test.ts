import { describe, expect, it } from "vitest";
import {
  partitionByWeek,
  seriesKey,
  takeRecentWeeks,
  type PendingSubmission,
  type RecordedWeek,
} from "./price-review";

/**
 * The two pure decisions in the review queue's read path, tested without a database.
 *
 * Both exist as separate exported functions precisely so they can be tested here: the year
 * boundary and the gapped series are the cases that matter and the ones a live queue will
 * almost never exercise — 2026-W38 has neither, and by the time a real week 1 arrives the
 * failure would be a wrong baseline drawn beside a price someone is about to publish.
 */

function week(isoYear: number, isoWeek: number, price: number): RecordedWeek {
  return {
    isoYear,
    isoWeek,
    price,
    currency: "NGN",
    collectedOn: "2026-01-01",
    siteName: "Test site",
    weeksBefore: 0,
  };
}

function submission(isoYear: number, isoWeek: number, commodityName = "Test"): PendingSubmission {
  return {
    id: `${isoYear}-${isoWeek}-${commodityName}`,
    isoYear,
    isoWeek,
    commodityName,
    unitName: "Bag",
    variety: null,
    tier: "retail",
    price: 1,
    currency: "NGN",
    collectedOn: "2026-01-01",
    siteName: "Test site",
    collectorName: "Test collector",
    submittedAt: "2026-01-01T00:00:00Z",
    source: "form",
    notes: null,
    photoUrl: null,
    flags: [],
    recentWeeks: [],
  };
}

describe("takeRecentWeeks", () => {
  it("returns the three most recent published weeks, newest first", () => {
    const result = takeRecentWeeks(
      [week(2026, 34, 4), week(2026, 37, 1), week(2026, 35, 3), week(2026, 36, 2)],
      { isoYear: 2026, isoWeek: 38 },
    );

    expect(result.map((entry) => entry.isoWeek)).toEqual([37, 36, 35]);
    expect(result.map((entry) => entry.price)).toEqual([1, 2, 3]);
  });

  it("measures each week's distance back from the submission's own week", () => {
    const result = takeRecentWeeks([week(2026, 37, 1), week(2026, 33, 2)], {
      isoYear: 2026,
      isoWeek: 38,
    });

    // 1 is adjacent; 5 means four weeks between them carry no published price. The component
    // draws that difference — it is the whole reason the field exists.
    expect(result.map((entry) => entry.weeksBefore)).toEqual([1, 5]);
  });

  it("orders and measures correctly ACROSS A YEAR BOUNDARY", () => {
    // 2026-W01 is preceded by 2025-W52, not by 2026-W00, and 2025 has 52 ISO weeks. Naive
    // subtraction of week numbers would sort these backwards and report a distance of -51.
    const result = takeRecentWeeks(
      [week(2025, 50, 3), week(2025, 52, 1), week(2025, 51, 2)],
      { isoYear: 2026, isoWeek: 1 },
    );

    expect(result.map((entry) => `${entry.isoYear}-W${entry.isoWeek}`)).toEqual([
      "2025-W52",
      "2025-W51",
      "2025-W50",
    ]);
    expect(result.map((entry) => entry.weeksBefore)).toEqual([1, 2, 3]);
  });

  it("excludes the submission's own week and anything later", () => {
    // A live observation for this exact week means P1.7 is already satisfied and the approval
    // will be refused; drawing it as "history" would suggest the submission could still land.
    const result = takeRecentWeeks(
      [week(2026, 38, 1), week(2026, 39, 2), week(2026, 37, 3)],
      { isoYear: 2026, isoWeek: 38 },
    );

    expect(result.map((entry) => entry.isoWeek)).toEqual([37]);
  });

  it("returns an empty list for a series with no published history", () => {
    // Today this is every row, and it must be a list of length zero rather than three blanks:
    // the component renders "No published weeks yet" off exactly this (P0.2).
    expect(takeRecentWeeks([], { isoYear: 2026, isoWeek: 38 })).toEqual([]);
  });
});

describe("partitionByWeek", () => {
  it("splits the current week from the stragglers", () => {
    const { current, earlier } = partitionByWeek(
      [submission(2026, 38, "Yam"), submission(2026, 36, "Rice"), submission(2026, 38, "Beans")],
      { isoYear: 2026, isoWeek: 38 },
    );

    expect(current.map((entry) => entry.commodityName)).toEqual(["Yam", "Beans"]);
    expect(earlier.map((entry) => entry.commodityName)).toEqual(["Rice"]);
  });

  it("keeps a straggler from the previous ISO YEAR in the earlier group", () => {
    const { current, earlier } = partitionByWeek(
      [submission(2025, 52, "Rice"), submission(2026, 1, "Yam")],
      { isoYear: 2026, isoWeek: 1 },
    );

    expect(current.map((entry) => entry.commodityName)).toEqual(["Yam"]);
    expect(earlier.map((entry) => entry.commodityName)).toEqual(["Rice"]);
  });

  it("NEVER DROPS A ROW — every submission lands in exactly one group", () => {
    // The property that matters more than either grouping rule. A pending submission that
    // renders nowhere is an unreviewed price nobody can act on, and it becomes a permanent
    // gap in the published series (P2.8).
    const all = [
      submission(2026, 38, "Yam"),
      submission(2026, 37, "Rice"),
      submission(2025, 51, "Beans"),
      submission(2026, 39, "Maize"),
    ];
    const { current, earlier } = partitionByWeek(all, { isoYear: 2026, isoWeek: 38 });

    expect(current.length + earlier.length).toBe(all.length);
    expect([...current, ...earlier].map((entry) => entry.id).sort()).toEqual(
      all.map((entry) => entry.id).sort(),
    );
  });

  it("groups a FUTURE week with the current one rather than hiding it", () => {
    // Intake cannot produce this — `checkCollectionDate` refuses a future collection date —
    // but a row that should not exist still has to be visible to the person who can act on it.
    const { current, earlier } = partitionByWeek([submission(2026, 39, "Maize")], {
      isoYear: 2026,
      isoWeek: 38,
    });

    expect(current.map((entry) => entry.commodityName)).toEqual(["Maize"]);
    expect(earlier).toEqual([]);
  });
});

describe("seriesKey", () => {
  it("keys on commodity and tier, and on nothing else", () => {
    // P1.7 is one price per commodity, per ISO week, per tier. P1.8 forbids the collection
    // site from ever becoming a comparison axis — if a site ever appeared in this key, the
    // panel would start drawing a market-versus-market series, which this product does not have.
    expect(seriesKey("abc", "retail")).toBe("abc::retail");
    expect(seriesKey("abc", "retail")).not.toBe(seriesKey("abc", "wholesale"));
  });
});
