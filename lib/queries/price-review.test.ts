import { describe, expect, it } from "vitest";
import {
  availableUnitRole,
  groupBySeries,
  groupByWeek,
  partitionByWeek,
  seriesKey,
  takeRecentWeeks,
  type ObservedPrice,
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
    unitName: "Bag",
    unitRole: "primary",
    weeksBefore: 0,
  };
}

/** One row as `readSeriesHistory` returns it, before either grouping. */
function observed(overrides: Partial<ObservedPrice> = {}): ObservedPrice {
  return {
    commodityId: "commodity-1",
    tier: "retail",
    unitId: "unit-bucket",
    unitName: "Bucket",
    unitRole: "primary",
    isoYear: 2026,
    isoWeek: 38,
    price: 1,
    currency: "NGN",
    collectedOn: "2026-01-01",
    siteName: "Test site",
    ...overrides,
  };
}

function submission(isoYear: number, isoWeek: number, commodityName = "Test"): PendingSubmission {
  return {
    id: `${isoYear}-${isoWeek}-${commodityName}`,
    isoYear,
    isoWeek,
    commodityName,
    unitName: "Bag",
    unitId: "unit-bag",
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
    liveThisWeek: [],
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
  it("keys on commodity, tier and unit, and on nothing else", () => {
    // P1.7 as amended (0041) allows two prices per commodity per week per tier, in different
    // units, so the unit is part of the series. P1.8 forbids the collection site from ever
    // becoming a comparison axis — if a site appeared in this key the panel would start drawing
    // a market-versus-market series, which this product does not have.
    expect(seriesKey("abc", "retail", "unit-1")).toBe("abc::retail::unit-1");
    expect(seriesKey("abc", "retail", "unit-1")).not.toBe(seriesKey("abc", "wholesale", "unit-1"));
    expect(seriesKey("abc", "retail", "unit-1")).not.toBe(seriesKey("abc", "retail", "unit-2"));
  });
});

describe("groupBySeries", () => {
  it("keeps two units in the same week as SEPARATE series", () => {
    // The whole reason the unit joined the key. Rodo at ₦7,000 the paint bucket and ₦1,000 the
    // plate are both true for one week; grouped together they read as a collapse, and a reviewer
    // would approve the next price against a baseline that never existed. No conversion between
    // the two exists — base_multiplier is null on every unit (0036).
    const grouped = groupBySeries([
      observed({ unitId: "unit-bucket", unitName: "Paint bucket", price: 7, unitRole: "primary" }),
      observed({ unitId: "unit-plate", unitName: "Plate", price: 1, unitRole: "secondary" }),
    ]);

    expect(grouped.size).toBe(2);
    expect(grouped.get(seriesKey("commodity-1", "retail", "unit-bucket"))?.[0].price).toBe(7);
    expect(grouped.get(seriesKey("commodity-1", "retail", "unit-plate"))?.[0].price).toBe(1);
  });

  it("carries the unit and its role onto every entry", () => {
    const grouped = groupBySeries([observed({ unitName: "Mudu", unitRole: "secondary" })]);
    const entry = grouped.get(seriesKey("commodity-1", "retail", "unit-bucket"))?.[0];

    expect(entry?.unitName).toBe("Mudu");
    expect(entry?.unitRole).toBe("secondary");
  });

  it("keeps the two tiers apart", () => {
    const grouped = groupBySeries([
      observed({ tier: "retail" }),
      observed({ tier: "wholesale" }),
    ]);

    expect(grouped.size).toBe(2);
  });
});

describe("groupByWeek", () => {
  it("collects both of a week's prices under one key, primary first", () => {
    // The reviewer is being asked to sit a second price beside the headline, so the headline is
    // read first. Deliberately not sorted by price: which figure heads the week is an editorial decision,
    // not a consequence of one figure being larger.
    const grouped = groupByWeek([
      observed({ unitId: "unit-plate", unitName: "Plate", price: 1, unitRole: "secondary" }),
      observed({ unitId: "unit-bucket", unitName: "Paint bucket", price: 7, unitRole: "primary" }),
    ]);

    expect(grouped.size).toBe(1);
    const live = grouped.get("commodity-1::retail::2026::38");
    expect(live?.map((entry) => entry.unitRole)).toEqual(["primary", "secondary"]);
    expect(live?.map((entry) => entry.unitName)).toEqual(["Paint bucket", "Plate"]);
  });

  it("does not mix weeks, tiers or commodities", () => {
    const grouped = groupByWeek([
      observed({ isoWeek: 38 }),
      observed({ isoWeek: 37 }),
      observed({ tier: "wholesale" }),
      observed({ commodityId: "commodity-2" }),
    ]);

    expect(grouped.size).toBe(4);
  });

  it("returns an empty map for a series with no published history", () => {
    // Which is what makes one-click Approve correct on an empty week: nothing is live, so
    // nothing has to be chosen between (P1.7).
    expect(groupByWeek([]).size).toBe(0);
  });
});

describe("availableUnitRole", () => {
  it("offers primary for a week that holds nothing", () => {
    // Which is why plain Approve is one click on the ordinary path: there is nothing to choose
    // between, and a lone price is the figure every surface shows.
    expect(availableUnitRole([])).toBe("primary");
  });

  it("offers secondary once the week has a headline figure", () => {
    expect(
      availableUnitRole([
        { unitName: "Paint bucket", unitRole: "primary", price: 7000, currency: "NGN" },
      ]),
    ).toBe("secondary");
  });

  it("offers nothing once both roles are held", () => {
    // Null is what removes the approve controls entirely. There is no third role, so a third
    // unit cannot be published and a disabled button would invite a hunt for a permission that
    // does not exist (P1.7).
    expect(
      availableUnitRole([
        { unitName: "Paint bucket", unitRole: "primary", price: 7000, currency: "NGN" },
        { unitName: "Plate", unitRole: "secondary", price: 1000, currency: "NGN" },
      ]),
    ).toBeNull();
  });

  it("offers primary when the only live price is somehow a secondary", () => {
    // Unreachable through approval — 0041 refuses a secondary into an empty week, because its
    // only published figure would be one nothing displays. Asserted anyway: the function must
    // answer from what is TAKEN rather than from how many rows there are, so that a week in a
    // state this product cannot create is still described correctly rather than read as full.
    expect(
      availableUnitRole([
        { unitName: "Plate", unitRole: "secondary", price: 1000, currency: "NGN" },
      ]),
    ).toBe("primary");
  });
});
