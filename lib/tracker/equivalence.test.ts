import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sheetsPayloadFromGrids, trimmedWorkbook, xlsxFromGrids } from "./fixture";
import type { Workbook } from "./grid";
import { indexTrackerMap, parseTrackerMap, type MapIndex } from "./map";
import { planImport, type Plan, type PlannerCollector } from "./planner";
import { readTracker } from "./reader";
import { sheetTitles, workbookFromSheets } from "./sheets";
import { readWorkbook } from "./xlsx";

/**
 * THE ONE ASSERTION THIS WHOLE FILE EXISTS FOR: the .xlsx path and the Google Sheets path
 * produce the SAME PLAN from the same data.
 *
 * The plan is the artefact that decides what gets posted, so plan equality is the claim worth
 * proving — grid equality is only the mechanism. Both are checked, in that order, because when
 * they disagree the grid comparison is what says where.
 *
 * WHY THE SHEETS SIDE IS BUILT IN fixture.ts AND NOT HERE. `sheetsPayloadFromGrids` renders the
 * API's JSON without calling anything in `sheets.ts`. If the payload were produced by the module
 * under test, this file would be asserting that a function agrees with itself.
 *
 * AND WHY THE COMPARISON IS NOT A NAIVE DEEP-EQUAL ON THE RAW GRIDS. The Sheets API drops
 * trailing empty cells and trailing empty rows; an .xlsx writer may keep them. Two grids of
 * different lengths can describe the same spreadsheet, and no caller can tell: `padRow` treats a
 * short row and an empty cell as one answer. `trimmedWorkbook` removes exactly that difference
 * and nothing else — a blank row in the MIDDLE is still compared, because that one shifts row
 * numbers and row numbers are quoted to humans.
 */

// ---------------------------------------------------------------------------
// Part A — a hand-written fixture, so this always runs, including in CI
// ---------------------------------------------------------------------------

/**
 * The map for the synthetic grids below. Fixture names throughout: a real commodity or market
 * name in `lib/` would be a value nobody entered (P0.2), and a real collector would be PII.
 */
const MAP = parseTrackerMap({
  commodities: [
    {
      n: 1,
      sheet: "🥬 Fixture Greens & Roots",
      product: "Fixture Root",
      variety: "Fixture Variety",
      portions: ["Per fixture tuber", "Per fixture bag"],
      slug: "fixture-root",
      name: "Fixture Root",
      status: "EXISTING",
    },
    {
      n: 2,
      sheet: "🥬 Fixture Greens & Roots",
      product: "Fixture Leaf",
      variety: "Fixture Whole",
      portions: ["Per fixture bundle"],
      slug: "fixture-leaf",
      name: "Fixture Leaf",
      status: "EXISTING",
    },
    {
      n: 3,
      sheet: "🐟 Fixture Fish",
      product: "Fixture Fish",
      variety: "Fixture Frozen",
      portions: ["Per fixture kg"],
      slug: "fixture-fish",
      name: "Fixture Fish",
      status: "EXISTING",
    },
  ],
  units: {
    "Per fixture tuber": { unit: "Fixture Tuber", status: "APPROVED" },
    "Per fixture bag": { unit: "Fixture Bag", status: "APPROVED" },
    "Per fixture bundle": { unit: "Fixture Bundle", status: "APPROVED" },
    "Per fixture kg": { unit: "Fixture Kilogram", status: "APPROVED" },
  },
  primary_units: {
    rows: [
      { slug: "fixture-root", tier: "retail", primary_unit: "Fixture Tuber", rule: "fixture" },
      { slug: "fixture-root", tier: "wholesale", primary_unit: "Fixture Bag", rule: "fixture" },
      { slug: "fixture-leaf", tier: "retail", primary_unit: "Fixture Bundle", rule: "fixture" },
      { slug: "fixture-fish", tier: "retail", primary_unit: "Fixture Kilogram", rule: "fixture" },
    ],
  },
});

const INDEX: MapIndex = indexTrackerMap(MAP);

const COLLECTORS: PlannerCollector[] = [
  { name: "Fixture Collector", phone: "08000000001", isActive: true },
];

/** The week column these fixtures price. H is the first column that is not one of the seven. */
const COLUMN = "H";

/**
 * Grids carrying, on purpose, every shape that could make the two sources disagree:
 *
 *   - a title with an emoji AND an ampersand, which is how the real tabs are named;
 *   - a tab with no "Publish as" header, which must be ignored by both paths identically;
 *   - a header on row 2 and the three metadata rows on 3-5, as the real tracker has;
 *   - a DATE COLLECTED cell holding a date SERIAL, which Sheets sends as a JSON number;
 *   - prices as bare digits (a JSON number from Sheets) and as text a human typed ("₦95,000");
 *   - an empty price cell, a blank column A, and a row the map does not know;
 *   - a blank row in the middle, and a short final row.
 */
const GRIDS: Workbook = {
  "🥬 Fixture Greens & Roots": [
    ["🛒 FIXTURE TRACKER"],
    ["Publish as", "Category", "Sub-Category", "Product", "Variety / Type", "Portion / Unit", "Unit Description", "Jul 2026 Wk1"],
    ["▶▶  MARKET VISITED", "", "", "", "", "", "", "Fixture Market"],
    // The serial for a Saturday in 2026, the same form the real DATE COLLECTED cell holds.
    ["▶▶  DATE COLLECTED", "", "", "", "", "", "", "46291"],
    ["▶▶  COLLECTED BY", "", "", "", "", "", "", "Fixture Collector"],
    ["retail", "CAT", "SUB", "Fixture Root", "Fixture Variety", "Per fixture tuber", "one tuber", "2500"],
    ["wholesale", "CAT", "SUB", "Fixture Root", "Fixture Variety", "Per fixture bag", "a bag", "₦95,000"],
    [],
    ["retail", "CAT", "SUB", "Fixture Leaf", "Fixture Whole", "Per fixture bundle", "a bundle", "1200"],
    // Column A blank: kept in the sheet only, skipped by both paths.
    ["", "CAT", "SUB", "Fixture Leaf", "Fixture Whole", "Per fixture bundle", "a bundle", "900"],
    // No price in the week column, so the row ends early.
    ["retail", "CAT", "SUB", "Fixture Root", "Fixture Variety", "Per fixture tuber"],
    // A row the map has never heard of: a refusal, and refusals are part of the plan too.
    ["retail", "CAT", "SUB", "Fixture Unknown", "Fixture Variety", "Per fixture tuber", "", "700"],
    // Kobo. Refused by both sources, and the one case where the Sheets payload sends a JSON
    // number with a fractional part rather than a string — so this is also the proof that
    // cellToString's rendering of a decimal does not quietly change what the planner decides.
    ["retail", "CAT", "SUB", "Fixture Root", "Fixture Variety", "Per fixture bag", "a bag", "1200.5"],
  ],
  "🐟 Fixture Fish": [
    ["🛒 FIXTURE TRACKER"],
    ["Publish as", "Category", "Sub-Category", "Product", "Variety / Type", "Portion / Unit", "Unit Description", "Jul 2026 Wk1"],
    ["▶▶  MARKET VISITED", "", "", "", "", "", "", "Fixture Market"],
    ["▶▶  DATE COLLECTED", "", "", "", "", "", "", "46291"],
    ["▶▶  COLLECTED BY", "", "", "", "", "", "", "Fixture Collector"],
    ["retail", "CAT", "SUB", "Fixture Fish", "Fixture Frozen", "Per fixture kg", "per kg", "8000"],
  ],
  "Fixture Guide": [["This tab carries no Publish as header and is not price data."]],
};

function planFrom(workbook: Workbook): Plan {
  return planImport({
    reading: readTracker(workbook, COLUMN),
    index: INDEX,
    collectors: COLLECTORS,
    alreadyRecorded: new Set<string>(),
  });
}

function sheetsWorkbook(grids: Workbook): Workbook {
  const { metadata, valueRanges } = sheetsPayloadFromGrids(grids);
  return workbookFromSheets(sheetTitles(metadata), valueRanges);
}

describe("the Sheets source and the .xlsx source, on a hand-written tracker", () => {
  const fromXlsx = readWorkbook(xlsxFromGrids(GRIDS));
  const fromSheets = sheetsWorkbook(GRIDS);

  it("keys the same tabs in the same order", () => {
    expect(Object.keys(fromSheets)).toEqual(Object.keys(fromXlsx));
    expect(Object.keys(fromSheets)).toEqual(Object.keys(GRIDS));
  });

  it("produces the same grids, cell for cell", () => {
    expect(trimmedWorkbook(fromSheets)).toEqual(trimmedWorkbook(fromXlsx));
  });

  it("renders a date serial identically, which is the cell a wrong week comes from", () => {
    // Sheets sends 46291 as a JSON number under UNFORMATTED_VALUE; the .xlsx stores the digits.
    // If this diverged, every price in the column would be filed under the wrong ISO week.
    const row = (workbook: Workbook) => workbook["🥬 Fixture Greens & Roots"][3][7];
    expect(row(fromSheets)).toBe("46291");
    expect(row(fromSheets)).toBe(row(fromXlsx));
  });

  it("produces the identical plan — the whole point", () => {
    const fromFile = planFrom(fromXlsx);
    const fromApi = planFrom(fromSheets);

    expect(fromApi).toEqual(fromFile);
  });

  it("produces a plan with something in it, so the comparison is not vacuous", () => {
    const plan = planFrom(fromSheets);

    expect(plan.posts.length).toBeGreaterThan(0);
    expect(plan.skipped.length).toBeGreaterThan(0);
    expect(plan.refusals.length).toBeGreaterThan(0);
    expect(plan.ignoredSheets.map((sheet) => sheet.name)).toEqual(["Fixture Guide"]);
  });

  it("agrees on the week, the market and the collector, not just on the prices", () => {
    const fromApi = planFrom(fromSheets);
    const fromFile = planFrom(fromXlsx);

    for (const [position, post] of fromApi.posts.entries()) {
      expect(post.isoYear).toBe(fromFile.posts[position].isoYear);
      expect(post.isoWeek).toBe(fromFile.posts[position].isoWeek);
      expect(post.collectedOn).toBe(fromFile.posts[position].collectedOn);
      expect(post.market).toBe(fromFile.posts[position].market);
      expect(post.collectorPhone).toBe(fromFile.posts[position].collectorPhone);
    }
  });

  it("refuses kobo identically from both sources", () => {
    const refusals = (workbook: Workbook) =>
      planFrom(workbook).refusals.filter((note) => note.code === "fractional_price");

    expect(refusals(fromSheets)).toHaveLength(1);
    expect(refusals(fromSheets)).toEqual(refusals(fromXlsx));
    expect(refusals(fromSheets)[0].detail).toContain("1200.5");
  });

  it("agrees on a price a human typed with a currency sign and a comma", () => {
    const wholesale = planFrom(fromSheets).posts.filter((post) => post.tier === "wholesale");
    expect(wholesale).toHaveLength(1);
    expect(wholesale[0].price).toBe(95000);
  });
});

// ---------------------------------------------------------------------------
// Part B — the real workbook, when it is on disk
// ---------------------------------------------------------------------------

/**
 * THE SAME PROOF AGAINST THE REAL TRACKER: nine tabs, 244 mapped commodities, the emoji and
 * ampersands exactly as they are spelled, and whatever a human has actually typed into the
 * cells. The Sheets payload is synthesised from the real workbook's own grids, so this needs no
 * network and no credentials — it is the strongest offline evidence available before the live
 * dry run.
 *
 * IT SKIPS IN CI, AND LOUDLY. `data/price-tracker.xlsx` is in .git/info/exclude, so CI has no
 * copy. A silently skipped test is not evidence, hence the warning below.
 *
 * COLLECTORS ARE DELIBERATELY EMPTY. The real sheet names a real collector, whose phone number
 * is PII that does not belong in a test fixture. With no collectors every row refuses as
 * `unknown_collector` — and a refusal is part of the plan, so the comparison is just as strict.
 * What is being proved is that the two sources read the same cells, not that the rows post.
 */
const WORKBOOK_PATH = path.join(process.cwd(), "data", "price-tracker.xlsx");
const MAP_PATH = path.join(process.cwd(), "data", "tracker-map.json");
const hasRealData = existsSync(WORKBOOK_PATH) && existsSync(MAP_PATH);

if (!hasRealData) {
  console.warn(
    "\n  equivalence (real data): SKIPPED — data/price-tracker.xlsx or data/tracker-map.json is " +
      "not on disk (the workbook is git-excluded, so CI never has it). Part A still ran.\n",
  );
}

describe.skipIf(!hasRealData)("the two sources, on the real Lagos tracker", () => {
  const realGrids = readWorkbook(readFileSync(WORKBOOK_PATH));
  const realIndex = indexTrackerMap(parseTrackerMap(JSON.parse(readFileSync(MAP_PATH, "utf8"))));
  const viaSheets = sheetsWorkbook(realGrids);

  /** Several columns, because one empty week would make a passing comparison mean nothing. */
  const COLUMNS = ["H", "I", "J", "K", "L"] as const;

  it("reads the same tabs, in the same order, with the same titles", () => {
    expect(Object.keys(viaSheets)).toEqual(Object.keys(realGrids));
  });

  it("reads the same cells across every tab", () => {
    expect(trimmedWorkbook(viaSheets)).toEqual(trimmedWorkbook(realGrids));
  });

  it("plans identically for every week column tried", () => {
    let totalRows = 0;

    for (const column of COLUMNS) {
      const fromFile = planImport({
        reading: readTracker(realGrids, column),
        index: realIndex,
        collectors: [],
        alreadyRecorded: new Set<string>(),
      });
      const fromApi = planImport({
        reading: readTracker(viaSheets, column),
        index: realIndex,
        collectors: [],
        alreadyRecorded: new Set<string>(),
      });

      expect(fromApi, `column ${column}`).toEqual(fromFile);
      totalRows += fromApi.posts.length + fromApi.skipped.length + fromApi.refusals.length;
    }

    // Guards against a comparison of five empty plans quietly passing.
    expect(totalRows).toBeGreaterThan(0);
  });
});
