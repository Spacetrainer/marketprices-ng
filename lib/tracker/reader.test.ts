import { describe, expect, it } from "vitest";
import {
  HEADER_SEARCH_ROWS,
  ReaderError,
  cellOrNull,
  findHeaderRow,
  findMetadataRows,
  normaliseDate,
  padRow,
  readTracker,
} from "./reader";
import type { SheetGrid, Workbook } from "./xlsx";

/**
 * A tracker sheet as cells, with the header NOT on row 2 on purpose.
 *
 * Every test that uses this is really testing that nothing in the reader counts rows: the
 * header here sits on row 3, the metadata on 4–6 in a different order from the real workbook,
 * and data therefore starts on row 7. The real file has the header on row 2 and data on row 6,
 * and both must read identically.
 */
function sheet(options?: {
  market?: string;
  date?: string;
  collector?: string;
  omitDateRow?: boolean;
  rows?: string[][];
}): SheetGrid {
  const {
    market = "Ile-Epo Market",
    date = "46291",
    collector = "Abolaji",
    omitDateRow = false,
    rows = [
      ["Retail", "YAMS", "Fresh Yam", "Yam", "Puna Yam", "Per tuber (large)", "Big tuber", "", "", "", "3000"],
    ],
  } = options ?? {};

  const grid: SheetGrid = [
    ["🛒 LAGOS FRESH MARKET PRICE TRACKER"],
    [],
    ["Publish as", "Category", "Sub-Category", "Product", "Variety / Type", "Portion / Unit", "Unit Description", "Sep 2026\nWk1 · 1–7", "Sep 2026\nWk2", "Sep 2026\nWk3", "Sep 2026\nWk4 · 22–30"],
    ["▶▶  COLLECTED BY  →  who recorded these prices", "", "", "", "", "", "", "", "", "", collector],
    ["▶▶  MARKET VISITED THIS WEEK  →  pick the market", "", "", "", "", "", "", "", "", "", market],
  ];

  if (!omitDateRow) {
    grid.push(["▶▶  DATE COLLECTED  →  e.g. 2026-09-26", "", "", "", "", "", "", "", "", "", date]);
  }

  grid.push(...rows);
  return grid;
}

const workbook = (grids: Record<string, SheetGrid>): Workbook => grids;

describe("padRow", () => {
  it("widens a short row, because xlsx.ts writes only the cells a row has", () => {
    expect(padRow(["a"], 3)).toEqual(["a", "", ""]);
  });

  it("treats a missing row as an empty one of the right width", () => {
    expect(padRow(undefined, 2)).toEqual(["", ""]);
  });

  it("never truncates a row that is already wider", () => {
    expect(padRow(["a", "b", "c"], 2)).toEqual(["a", "b", "c"]);
  });
});

describe("cellOrNull", () => {
  it("trims, and calls whitespace nothing", () => {
    expect(cellOrNull("  Retail ")).toBe("Retail");
    expect(cellOrNull("   ")).toBeNull();
    expect(cellOrNull(undefined)).toBeNull();
  });
});

describe("normaliseDate", () => {
  it("turns the tracker's Excel serial into the date the owner named", () => {
    // 46291 is what column K's DATE COLLECTED cell actually holds, and the owner recorded the
    // visit as 26 September — which is ISO 2026-W39, not the "Wk4" its column label says.
    expect(normaliseDate("46291")).toEqual({ date: "2026-09-26", problem: null });
  });

  it("passes a typed ISO date straight through", () => {
    expect(normaliseDate("2026-09-26")).toEqual({ date: "2026-09-26", problem: null });
  });

  it("refuses an ISO-shaped string that is not a real date", () => {
    const result = normaliseDate("2026-02-30");
    expect(result.date).toBeNull();
    expect(result.problem).toMatch(/not a real date/);
  });

  it("refuses a serial too small to be a tracker date rather than shifting it by a day", () => {
    const result = normaliseDate("42");
    expect(result.date).toBeNull();
    expect(result.problem).toMatch(/too small/);
  });

  it("refuses free text, quoting what the cell held", () => {
    const result = normaliseDate("last Tuesday");
    expect(result.date).toBeNull();
    expect(result.problem).toMatch(/"last Tuesday" is neither/);
  });

  it("reports a blank cell as absent, not as a problem", () => {
    expect(normaliseDate(null)).toEqual({ date: null, problem: null });
  });
});

describe("findHeaderRow", () => {
  it("finds the header by its content, wherever it sits", () => {
    expect(findHeaderRow(sheet())).toBe(2);
  });

  it("finds it on row 2 as well, which is where the real workbook keeps it", () => {
    const grid: SheetGrid = [["Title"], ["Publish as", "Category"]];
    expect(findHeaderRow(grid)).toBe(1);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(findHeaderRow([[" PUBLISH AS "]])).toBe(0);
  });

  it("returns null for a tab that has no such header", () => {
    expect(findHeaderRow([["Guide & Legend"], ["How to use this sheet"]])).toBeNull();
  });

  it("gives up after the search window rather than scanning a whole sheet", () => {
    const grid: SheetGrid = Array.from({ length: HEADER_SEARCH_ROWS + 2 }, () => [""]);
    grid[HEADER_SEARCH_ROWS + 1] = ["Publish as"];
    expect(findHeaderRow(grid)).toBeNull();
  });
});

describe("findMetadataRows", () => {
  it("finds all three by label, in whatever order they appear", () => {
    const found = findMetadataRows(sheet(), 2);
    expect(found.get("collected by")).toBe(3);
    expect(found.get("market visited")).toBe(4);
    expect(found.get("date collected")).toBe(5);
  });

  it("reports only what is there when a row is absent", () => {
    const found = findMetadataRows(sheet({ omitDateRow: true }), 2);
    expect(found.has("date collected")).toBe(false);
    expect(found.size).toBe(2);
  });
});

describe("readTracker", () => {
  it("reads the chosen column's market, date and collector", () => {
    const reading = readTracker(workbook({ Yams: sheet() }), "K");
    expect(reading.sheets[0].context).toMatchObject({
      letter: "K",
      market: "Ile-Epo Market",
      collectedOn: "2026-09-26",
      collector: "Abolaji",
    });
  });

  it("carries the column label for reporting but never turns it into a week", () => {
    const reading = readTracker(workbook({ Yams: sheet() }), "K");
    // The label says Wk4; the date says ISO W39. The reader exposes the label as text and the
    // date as a date, and offers no week at all — so nothing downstream can read the label
    // by mistake.
    expect(reading.sheets[0].context.label).toBe("Sep 2026 Wk4 · 22–30");
    expect(Object.keys(reading.sheets[0].context)).not.toContain("isoWeek");
  });

  it("starts data after the LAST metadata row, not at a fixed row number", () => {
    const reading = readTracker(workbook({ Yams: sheet() }), "K");
    expect(reading.sheets[0].headerRow).toBe(3);
    expect(reading.sheets[0].firstDataRow).toBe(7);
    expect(reading.sheets[0].rows).toHaveLength(1);
    expect(reading.sheets[0].rows[0].rowNumber).toBe(7);
  });

  it("reads the price out of the column asked for, and nothing else", () => {
    const reading = readTracker(workbook({ Yams: sheet() }), "K");
    expect(reading.sheets[0].rows[0].price).toBe("3000");
    expect(readTracker(workbook({ Yams: sheet() }), "H").sheets[0].rows[0].price).toBeNull();
  });

  it("pads a row that stops before the chosen column instead of failing on it", () => {
    const rows = [["Retail", "YAMS", "Fresh Yam", "Yam", "Puna Yam", "Per tuber (large)", "Big tuber"]];
    const reading = readTracker(workbook({ Yams: sheet({ rows }) }), "K");
    expect(reading.sheets[0].rows[0].price).toBeNull();
  });

  it("passes over a tab with no Publish as header, and says which and why", () => {
    const reading = readTracker(
      workbook({ Guide: [["Guide & Legend"], ["How to use"]], Yams: sheet() }),
      "K",
    );
    expect(reading.sheets.map((entry) => entry.name)).toEqual(["Yams"]);
    expect(reading.ignoredSheets).toEqual([
      { name: "Guide", reason: expect.stringContaining("no \"Publish as\" header") },
    ]);
  });

  it("drops a row that does not name a product, variety and portion", () => {
    const rows = [
      ["Retail", "YAMS", "Fresh Yam", "Yam", "Puna Yam", "Per tuber (large)", "Big tuber", "", "", "", "3000"],
      ["", "", "", "", "", "", ""],
      ["Retail", "YAMS", "Fresh Yam", "Yam", "", "Per tuber (small)", "", "", "", "", "1000"],
      ["ℹ️  Prices in ₦ (Naira). Never delete old data."],
    ];
    const reading = readTracker(workbook({ Yams: sheet({ rows }) }), "K");
    expect(reading.sheets[0].rows).toHaveLength(1);
  });

  it("keeps a blank column A as null rather than inventing a tier", () => {
    const rows = [["", "YAMS", "Fresh Yam", "Yam", "Puna Yam", "Per cup", "", "", "", "", "500"]];
    const reading = readTracker(workbook({ Yams: sheet({ rows }) }), "K");
    expect(reading.sheets[0].rows[0].publishAs).toBeNull();
  });

  it("reports an unreadable date as a problem rather than a date", () => {
    const reading = readTracker(workbook({ Yams: sheet({ date: "last Tuesday" }) }), "K");
    expect(reading.sheets[0].context.collectedOn).toBeNull();
    expect(reading.sheets[0].context.rawDate).toBe("last Tuesday");
    expect(reading.sheets[0].context.dateProblem).toMatch(/neither/);
  });

  it("refuses a column letter that is one of the seven describing a row", () => {
    expect(() => readTracker(workbook({ Yams: sheet() }), "D")).toThrow(/not a week column/);
  });

  it("refuses something that is not a column letter at all", () => {
    expect(() => readTracker(workbook({ Yams: sheet() }), "11")).toThrow(ReaderError);
  });

  it("refuses a workbook with no data tab, rather than reporting an empty import", () => {
    expect(() => readTracker(workbook({ Guide: [["Guide"]] }), "K")).toThrow(/No data tab found/);
  });
});
