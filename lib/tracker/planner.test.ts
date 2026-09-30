import { describe, expect, it } from "vitest";
import { indexTrackerMap, parseTrackerMap, type MapIndex } from "./map";
import { parsePrice, planImport, recordedKey, type Plan, type PlannerCollector } from "./planner";
import { readTracker } from "./reader";
import type { SheetGrid } from "./xlsx";

/**
 * A map small enough to read in one screen, carrying one of each thing that can go wrong.
 *
 * It mirrors the real data/tracker-map.json in shape, including the two fields that only some
 * portion strings have: `unit_by_commodity`, which is how one string means a Big bundle for a
 * leaf and a Bunch (large) for plantain, and a `unit` of null, which is how a portion held
 * pending a ruling refuses rather than guesses.
 */
const MAP = parseTrackerMap({
  commodities: [
    {
      n: 1,
      sheet: "Yams",
      product: "Yam",
      variety: "Puna Yam",
      portions: ["Per tuber (large)", "Per tuber (medium)", "Per bag (50kg)", "Per heap"],
      slug: "puna-yam",
      name: "Puna Yam",
      status: "NEW",
    },
    {
      n: 2,
      sheet: "Yams",
      product: "Yam",
      variety: "Old Yam",
      portions: ["Per tuber (large)"],
      slug: "old-yam",
      name: "Old Yam",
      status: "EXISTING",
    },
    {
      n: 3,
      sheet: "Fish",
      product: "Ayoo (confirm species)",
      variety: "Frozen",
      portions: ["Per kg"],
      slug: null,
      name: null,
      status: "PENDING",
    },
    {
      n: 4,
      sheet: "Greens",
      product: "Ugu",
      variety: "Fresh Whole Leaf",
      portions: ["Per bunch (large)"],
      slug: "ugwu-leaf",
      name: "Ugwu Leaf",
      status: "EXISTING",
    },
    {
      n: 5,
      sheet: "Greens",
      product: "Plantain",
      variety: "Ripe Plantain",
      portions: ["Per bunch (large)"],
      slug: "plantain-ripe",
      name: "Plantain Ripe",
      status: "EXISTING",
    },
    // Two tabs reaching ONE commodity, which the map's own rule allows: "a tracker key is
    // (Product, Variety) within one sheet. Several keys may map to one commodity." Today's real
    // map happens to give every key its own slug, but the two-price cap has to hold when it does
    // not, and a cap counted per tab would let a third price through the gap between these two.
    {
      n: 6,
      sheet: "Yams A",
      product: "Yam",
      variety: "Puna Yam",
      portions: ["Per tuber (large)", "Per tuber (medium)"],
      slug: "puna-yam",
      name: "Puna Yam",
      status: "NEW",
    },
    {
      n: 7,
      sheet: "Yams B",
      product: "Yam",
      variety: "Puna Yam",
      portions: ["Per tuber (large)", "Per bag (50kg)"],
      slug: "puna-yam",
      name: "Puna Yam",
      status: "NEW",
    },
  ],
  units: {
    "Per tuber (large)": { unit: "Single tuber (large)", status: "NEW" },
    "Per tuber (medium)": { unit: "Single tuber (medium)", status: "EXISTING" },
    "Per bag (50kg)": { unit: "Bag (50 kg)", status: "EXISTING" },
    "Per kg": { unit: "1 kg", status: "EXISTING" },
    "Per bunch (large)": {
      unit: "Big bundle",
      status: "EXISTING",
      unit_by_commodity: { default: "Big bundle", overrides: { "plantain-ripe": "Bunch (large)" } },
    },
    "Per wrap": { unit: null, status: "PART-PENDING" },
  },
  primary_units: {
    rows: [
      { slug: "puna-yam", tier: "retail", primary_unit: "Single tuber (medium)", rule: "priced-in-tracker" },
      { slug: "puna-yam", tier: "wholesale", primary_unit: "Bag (50 kg)", rule: "first-portion" },
      { slug: "old-yam", tier: "retail", primary_unit: "Single tuber (large)", rule: "first-portion" },
      { slug: "ugwu-leaf", tier: "retail", primary_unit: "Big bundle", rule: "first-portion" },
      { slug: "plantain-ripe", tier: "retail", primary_unit: "Bunch (large)", rule: "first-portion" },
    ],
  },
});

const INDEX: MapIndex = indexTrackerMap(MAP);

const COLLECTORS: PlannerCollector[] = [
  { name: "Abolaji", phone: "08103124722", isActive: true },
  { name: "Retired Rita", phone: "08000000000", isActive: false },
];

/** A sheet with the header on row 2 and the three metadata rows on 3–5, as the real one has. */
function sheet(rows: string[][], context?: { market?: string; date?: string; collector?: string }): SheetGrid {
  const { market = "Ile-Epo Market", date = "2026-09-26", collector = "Abolaji" } = context ?? {};
  return [
    ["🛒 TRACKER"],
    ["Publish as", "Category", "Sub-Category", "Product", "Variety / Type", "Portion / Unit", "Unit Description", "Wk1", "Wk2", "Wk3", "Sep 2026 Wk4"],
    ["▶▶  MARKET VISITED", "", "", "", "", "", "", "", "", "", market],
    ["▶▶  DATE COLLECTED", "", "", "", "", "", "", "", "", "", date],
    ["▶▶  COLLECTED BY", "", "", "", "", "", "", "", "", "", collector],
    ...rows,
  ];
}

/** One data row: tier, product, variety, portion, price in column K. */
function row(tier: string, product: string, variety: string, portion: string, price: string): string[] {
  return [tier, "CAT", "SUB", product, variety, portion, "desc", "", "", "", price];
}

function plan(
  grids: Record<string, SheetGrid>,
  options?: { alreadyRecorded?: string[]; collectors?: PlannerCollector[] },
): Plan {
  return planImport({
    reading: readTracker(grids, "K"),
    index: INDEX,
    collectors: options?.collectors ?? COLLECTORS,
    alreadyRecorded: new Set(options?.alreadyRecorded ?? []),
  });
}

const codes = (notes: readonly { code: string }[]): string[] => notes.map((note) => note.code);

describe("parsePrice", () => {
  it("accepts what a spreadsheet cell actually contains", () => {
    expect(parsePrice("3000")).toBe(3000);
    expect(parsePrice("₦95,000")).toBe(95000);
    expect(parsePrice(" 1 500 ")).toBe(1500);
    expect(parsePrice("4500.5")).toBe(4500.5);
  });

  it("rejects anything that is not a price, including a negative one", () => {
    expect(parsePrice("n/a")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-100")).toBeNull();
  });

  it("keeps zero, which is a price someone can charge", () => {
    expect(parsePrice("0")).toBe(0);
  });
});

describe("planner — what it posts", () => {
  it("posts a resolved row with the week taken from the date, not the column label", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000")]) });

    expect(result.refusals).toEqual([]);
    expect(result.posts).toHaveLength(1);
    // The column is labelled "Sep 2026 Wk4"; 2026-09-26 is ISO 2026-W39.
    expect(result.posts[0]).toMatchObject({
      slug: "puna-yam",
      commodity: "Puna Yam",
      tier: "retail",
      unit: "Single tuber (medium)",
      unitRole: "primary",
      price: 2000,
      isoYear: 2026,
      isoWeek: 39,
      collectedOn: "2026-09-26",
      market: "Ile-Epo Market",
      collectorName: "Abolaji",
      column: "K",
    });
  });

  it("takes the collector's phone from the database and never from the sheet", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000")]) });
    expect(result.posts[0].collectorPhone).toBe("08103124722");
  });

  it("proposes primary for the map's approved unit and secondary for the other", () => {
    const result = plan({
      Yams: sheet([
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000"),
      ]),
    });

    const roles = Object.fromEntries(result.posts.map((post) => [post.unit, post.unitRole]));
    expect(roles).toEqual({
      "Single tuber (medium)": "primary",
      "Single tuber (large)": "secondary",
    });
  });

  it("reads the per-commodity unit override, so plantain and ugwu do not share a unit", () => {
    const result = plan({
      Greens: sheet([
        row("Retail", "Ugu", "Fresh Whole Leaf", "Per bunch (large)", "1500"),
        row("Retail", "Plantain", "Ripe Plantain", "Per bunch (large)", "2500"),
      ]),
    });

    expect(result.posts.map((post) => post.unit).sort()).toEqual(["Big bundle", "Bunch (large)"]);
  });

  it("counts retail and wholesale separately, so a commodity may have two of each", () => {
    const result = plan({
      Yams: sheet([
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000"),
        row("Wholesale", "Yam", "Puna Yam", "Per bag (50kg)", "80000"),
      ]),
    });

    expect(result.posts).toHaveLength(3);
    expect(result.refusals).toEqual([]);
  });
});

describe("planner — what it skips", () => {
  it("skips a row whose column A is blank, because that means sheet-only", () => {
    const result = plan({ Yams: sheet([row("", "Yam", "Puna Yam", "Per tuber (large)", "3000")]) });
    expect(codes(result.skipped)).toEqual(["not_published"]);
    expect(result.posts).toEqual([]);
  });

  it("skips a row with no price in the chosen column", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "")]) });
    expect(codes(result.skipped)).toEqual(["no_price"]);
  });

  it("skips a series already submitted or published for that week", () => {
    const already = recordedKey("puna-yam", "retail", "Single tuber (large)", 2026, 39);
    const result = plan(
      { Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")]) },
      { alreadyRecorded: [already] },
    );

    expect(codes(result.skipped)).toEqual(["already_recorded"]);
    expect(result.posts).toEqual([]);
  });

  it("counts an already-recorded series against the two-price cap", () => {
    // One unit is already in the database, a second is posted, and the third is refused rather
    // than posted — the cap is about what ends up stored, not about what this run sends.
    const already = recordedKey("puna-yam", "retail", "Single tuber (medium)", 2026, 39);
    const result = plan(
      {
        Yams: sheet([
          row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000"),
          row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
          row("Retail", "Yam", "Puna Yam", "Per heap", "900"),
        ]),
      },
      { alreadyRecorded: [already] },
    );

    expect(codes(result.skipped)).toEqual(["already_recorded"]);
    expect(result.posts.map((post) => post.unit)).toEqual(["Single tuber (large)"]);
    expect(codes(result.refusals)).toEqual(["unknown_portion"]);
  });

  it("asks nothing of a column with no prices at all, not even its provenance", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "")], {
        market: "",
        date: "",
        collector: "",
      }),
    });

    expect(codes(result.skipped)).toEqual(["no_price"]);
    expect(result.refusals).toEqual([]);
  });
});

describe("planner — what it refuses", () => {
  it("refuses a column missing its market", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], { market: "" }),
    });
    expect(codes(result.refusals)).toEqual(["column_incomplete"]);
    expect(result.refusals[0].detail).toMatch(/MARKET VISITED/);
  });

  it("refuses a column missing its date, quoting what the cell held", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], { date: "soon" }),
    });
    expect(codes(result.refusals)).toEqual(["column_incomplete"]);
    expect(result.refusals[0].detail).toMatch(/"soon" is neither/);
  });

  it("refuses a column missing its collector", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], { collector: "" }),
    });
    expect(codes(result.refusals)).toEqual(["column_incomplete"]);
    expect(result.refusals[0].detail).toMatch(/COLLECTED BY/);
  });

  it("names every missing part at once rather than only the first", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], {
        market: "",
        date: "",
        collector: "",
      }),
    });
    expect(result.refusals[0].detail).toMatch(/MARKET VISITED/);
    expect(result.refusals[0].detail).toMatch(/DATE COLLECTED/);
    expect(result.refusals[0].detail).toMatch(/COLLECTED BY/);
  });

  it("refuses a PENDING commodity — Ayoo — instead of posting it under a guess", () => {
    const result = plan({ Fish: sheet([row("Retail", "Ayoo (confirm species)", "Frozen", "Per kg", "4500")]) });
    expect(codes(result.refusals)).toEqual(["pending_commodity"]);
    expect(result.refusals[0].detail).toMatch(/PENDING/);
    expect(result.posts).toEqual([]);
  });

  it("refuses a product the map does not know", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Invented Yam", "Per tuber (large)", "3000")]) });
    expect(codes(result.refusals)).toEqual(["unknown_product"]);
  });

  it("refuses a portion string the map does not know", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per calabash", "3000")]) });
    expect(codes(result.refusals)).toEqual(["unknown_portion"]);
  });

  it("refuses a portion whose unit is still held pending a ruling", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per wrap", "3000")]) });
    expect(codes(result.refusals)).toEqual(["unit_pending"]);
  });

  it("refuses a column A that is neither Retail nor Wholesale", () => {
    const result = plan({ Yams: sheet([row("Maybe", "Yam", "Puna Yam", "Per tuber (large)", "3000")]) });
    expect(codes(result.refusals)).toEqual(["unknown_tier"]);
  });

  it("refuses a cell that is not a price", () => {
    const result = plan({ Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "ask")]) });
    expect(codes(result.refusals)).toEqual(["unreadable_price"]);
  });

  it("refuses an unregistered collector and never creates one (P1.2)", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], { collector: "Somebody New" }),
    });
    expect(codes(result.refusals)).toEqual(["unknown_collector"]);
    expect(result.refusals[0].detail).toMatch(/never auto-created/);
  });

  it("refuses an inactive collector", () => {
    const result = plan({
      Yams: sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")], { collector: "Retired Rita" }),
    });
    expect(codes(result.refusals)).toEqual(["inactive_collector"]);
  });

  it("refuses ALL rows when several price one slot, rather than choosing between them", () => {
    const result = plan({
      Yams: sheet([
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3200"),
      ]),
    });

    expect(codes(result.refusals)).toEqual(["duplicate_slot", "duplicate_slot"]);
    expect(result.posts).toEqual([]);
    expect(result.refusals[0].detail).toMatch(/human decision/);
  });

  it("refuses the third unit for a commodity, tier and week, and keeps the primary", () => {
    const result = plan({
      Yams: sheet([
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Puna Yam", "Per bag (50kg)", "80000"),
        row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000"),
      ]),
    });

    expect(codes(result.refusals)).toEqual(["too_many_units"]);
    // The approved primary is Single tuber (medium), which is the LAST row here. It is kept and
    // the excess is the one that is neither primary nor first.
    expect(result.posts.map((post) => post.unit).sort()).toEqual([
      "Single tuber (large)",
      "Single tuber (medium)",
    ]);
    expect(result.refusals[0].detail).toMatch(/P1\.7 allows two/);
  });

  it("counts the two-price cap across the whole workbook, not per tab", () => {
    // The same commodity, tier and week reached from two different tabs. Counting per sheet
    // would let a third price through the gap between them.
    const result = plan({
      "Yams A": sheet([
        row("Retail", "Yam", "Puna Yam", "Per tuber (medium)", "2000"),
        row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
      ]),
      "Yams B": sheet([row("Retail", "Yam", "Puna Yam", "Per bag (50kg)", "80000")]),
    });

    expect(result.posts).toHaveLength(2);
    expect(codes(result.refusals)).toEqual(["too_many_units"]);
    expect(result.refusals[0].sheet).toBe("Yams B");
  });

  it("refuses a duplicate slot even when the two rows are on different tabs", () => {
    const result = plan({
      "Yams A": sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")]),
      "Yams B": sheet([row("Retail", "Yam", "Puna Yam", "Per tuber (large)", "3000")]),
    });

    expect(codes(result.refusals)).toEqual(["duplicate_slot", "duplicate_slot"]);
  });
});

describe("planner — the report", () => {
  it("keeps skips and refusals apart, and reports both in sheet order", () => {
    const result = plan({
      Yams: sheet([
        row("", "Yam", "Puna Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Invented Yam", "Per tuber (large)", "3000"),
        row("Retail", "Yam", "Old Yam", "Per tuber (large)", "3000"),
      ]),
    });

    expect(codes(result.skipped)).toEqual(["not_published"]);
    expect(codes(result.refusals)).toEqual(["unknown_product"]);
    expect(result.posts).toHaveLength(1);
    expect(result.skipped[0].rowNumber).toBe(6);
    expect(result.refusals[0].rowNumber).toBe(7);
  });

  it("carries the tabs it passed over into the plan, so the report can say so", () => {
    const result = plan({
      Guide: [["Guide & Legend"]],
      Yams: sheet([row("Retail", "Yam", "Old Yam", "Per tuber (large)", "3000")]),
    });
    expect(result.ignoredSheets).toHaveLength(1);
    expect(result.column).toBe("K");
  });
});
