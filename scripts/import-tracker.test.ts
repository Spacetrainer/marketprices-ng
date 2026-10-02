import { describe, expect, it } from "vitest";
import { ImportError, describePlan, describeSheetNames, parseArguments } from "./import-tracker";
import type { Plan } from "../lib/tracker/planner";

/**
 * The command line and the report — the two parts of the script that are not I/O.
 *
 * THE DRY-RUN GATE IS THE POINT OF THE FIRST BLOCK. `--commit` is the only thing standing
 * between a reading of a spreadsheet and rows landing in the review queue, so "commit is false
 * unless the word was typed" is asserted directly rather than inferred from the absence of a
 * network call. `--column` having no default is asserted the same way: defaulting it would mean
 * deriving a column from a clock, and the tracker's column labels are calendar-month weeks that
 * do not line up with ISO weeks.
 *
 * Importing this module must not run `main()`, which is what the `invokedDirectly` guard at the
 * bottom of the script is for. If that guard ever breaks, this file is where it shows up: the
 * test run would try to open a database connection.
 */

describe("parseArguments", () => {
  it("is a DRY RUN unless --commit is typed", () => {
    expect(parseArguments(["--column", "K"]).commit).toBe(false);
    expect(parseArguments(["--column", "K", "--commit"]).commit).toBe(true);
  });

  it("requires --column, because a week is never derived from a clock", () => {
    expect(() => parseArguments([])).toThrow(ImportError);
    expect(() => parseArguments(["--commit"])).toThrow(/--column <letter> is required/);
  });

  it("refuses --column with the next flag swallowed as its value", () => {
    expect(() => parseArguments(["--column", "--commit"])).toThrow(/--column <letter> is required/);
  });

  it("accepts both --column K and --column=K", () => {
    expect(parseArguments(["--column", "K"]).column).toBe("K");
    expect(parseArguments(["--column=K"]).column).toBe("K");
  });

  it("defaults the workbook but lets one be named", () => {
    expect(parseArguments(["--column", "K"]).file).toMatch(/data\/price-tracker\.xlsx$/);
    expect(parseArguments(["--column", "K", "--file", "other.xlsx"]).file).toBe("other.xlsx");
    expect(parseArguments(["--column", "K", "--file=other.xlsx"]).file).toBe("other.xlsx");
  });

  it("refuses an argument it does not recognise rather than ignoring it", () => {
    // A typo'd flag silently ignored is how a run does something other than what was asked.
    expect(() => parseArguments(["--column", "K", "--comit"])).toThrow(/Unrecognised argument/);
  });

  it("reads the Google Sheet by default, because that is where the tracker is now", () => {
    expect(parseArguments(["--column", "K"]).source).toBe("sheets");
  });

  it("switches to the workbook when one is named, in either spelling", () => {
    // Naming a file and then reading the sheet anyway would be doing something other than asked.
    expect(parseArguments(["--column", "K", "--file", "other.xlsx"]).source).toBe("xlsx");
    expect(parseArguments(["--column", "K", "--file=other.xlsx"]).source).toBe("xlsx");
  });

  it("accepts --source explicitly, in either spelling", () => {
    expect(parseArguments(["--column", "K", "--source", "xlsx"]).source).toBe("xlsx");
    expect(parseArguments(["--column", "K", "--source=sheets"]).source).toBe("sheets");
  });

  it("still defaults the workbook path, so --source xlsx alone works", () => {
    const args = parseArguments(["--column", "K", "--source", "xlsx"]);
    expect(args.file).toMatch(/data\/price-tracker\.xlsx$/);
  });

  it("refuses a source it does not have", () => {
    expect(() => parseArguments(["--column", "K", "--source", "csv"])).toThrow(
      /--source must be one of sheets, xlsx, not "csv"/,
    );
    expect(() => parseArguments(["--column", "K", "--source"])).toThrow(/--source must be one of/);
  });

  it("refuses --source sheets together with --file rather than ignoring one of them", () => {
    // Resolving this silently would mean reading something other than what was named, and only
    // the person typing knows which half was the mistake.
    expect(() => parseArguments(["--column", "K", "--source", "sheets", "--file", "x.xlsx"])).toThrow(
      /--source sheets reads the Google Sheet and never a file/,
    );
  });

  it("still requires --commit when reading the sheet", () => {
    // The source changed; the gate did not.
    expect(parseArguments(["--column", "K"]).commit).toBe(false);
    expect(parseArguments(["--column", "K", "--source", "sheets"]).commit).toBe(false);
  });
});

describe("describeSheetNames", () => {
  it("says nothing when the titles match, which is every normal run", () => {
    expect(describeSheetNames({ missing: [], unexpected: [] })).toEqual([]);
    expect(describeSheetNames(undefined)).toEqual([]);
  });

  it("names a tab the map expects and the spreadsheet did not offer", () => {
    const lines = describeSheetNames({ missing: ["🍗 Fixture Tab"], unexpected: [] }).join("\n");
    expect(lines).toContain("TAB TITLES do not match data/tracker-map.json");
    expect(lines).toContain("missing     🍗 Fixture Tab");
  });

  it("names a data tab the map has never seen", () => {
    const lines = describeSheetNames({ missing: [], unexpected: ["🍗 Fixture Tab "] }).join("\n");
    expect(lines).toContain("unexpected  🍗 Fixture Tab ");
  });

  it("shows a one-character rename as both at once, which is what it looks like", () => {
    // The whole reason the check exists: a trailing space is invisible in the sheet, so the only
    // way to see it is the same title appearing on both lines.
    const lines = describeSheetNames({
      missing: ["🍗 Fixture Tab"],
      unexpected: ["🍗 Fixture Tab "],
    });

    expect(lines.filter((line) => line.includes("missing"))).toHaveLength(1);
    expect(lines.filter((line) => line.includes("unexpected"))).toHaveLength(1);
    expect(lines.join("\n")).toContain("renamed by one character");
  });
});

const emptyPlan = (overrides: Partial<Plan> = {}): Plan => ({
  column: "K",
  posts: [],
  skipped: [],
  refusals: [],
  ignoredSheets: [],
  ...overrides,
});

describe("describePlan", () => {
  it("says DRY RUN when nothing will be posted, and COMMIT when it will", () => {
    expect(describePlan(emptyPlan(), false)[0]).toBe("DRY RUN — column K");
    expect(describePlan(emptyPlan(), true)[0]).toBe("COMMIT — column K");
  });

  it("names where the data came from, directly under the heading", () => {
    // Two sources now produce the same report, so the report has to say which one it read.
    const lines = describePlan(emptyPlan(), false, { source: 'google sheet "Fixture Tracker"' });
    expect(lines[1]).toBe('source       google sheet "Fixture Tracker"');
  });

  it("omits the source line when there is nothing to say, so old output is unchanged", () => {
    expect(describePlan(emptyPlan(), false)[1]).toBe("");
  });

  it("splits the post count by tier, which is what the owner reads first", () => {
    const plan = emptyPlan({
      posts: [
        {
          sheet: "Tab",
          rowNumber: 6,
          column: "K",
          slug: "fixture-root",
          commodity: "Fixture Root",
          variety: "Fixture Variety",
          tier: "retail",
          unit: "Fixture Bundle",
          unitRole: "primary",
          price: 2500,
          market: "Fixture Market A",
          collectedOn: "2026-09-26",
          isoYear: 2026,
          isoWeek: 39,
          collectorName: "Fixture Collector",
          collectorPhone: "08000000001",
        },
        {
          sheet: "Tab",
          rowNumber: 7,
          column: "K",
          slug: "fixture-root",
          commodity: "Fixture Root",
          variety: "Fixture Variety",
          tier: "wholesale",
          unit: "Fixture Sack",
          unitRole: "primary",
          price: 80000,
          market: "Fixture Market A",
          collectedOn: "2026-09-26",
          isoYear: 2026,
          isoWeek: 39,
          collectorName: "Fixture Collector",
          collectorPhone: "08000000001",
        },
      ],
    });

    expect(describePlan(plan, false)).toContain("would post   2  (1 retail, 1 wholesale)");
  });

  it("prints every refusal in full, because a truncated list is one nobody acts on", () => {
    const plan = emptyPlan({
      refusals: Array.from({ length: 30 }, (_value, index) => ({
        code: "unknown_product" as const,
        sheet: "Tab",
        rowNumber: index + 6,
        subject: `Product ${index} / Variety / Portion`,
        detail: "the map has no entry for it",
      })),
    });

    const lines = describePlan(plan, false);
    for (let index = 0; index < 30; index += 1) {
      expect(lines.some((line) => line.includes(`Product ${index} /`))).toBe(true);
    }
  });

  it("counts skips by reason rather than listing all of them", () => {
    const plan = emptyPlan({
      skipped: [
        { code: "not_published", sheet: "Tab", rowNumber: 6, subject: "a", detail: "blank" },
        { code: "not_published", sheet: "Tab", rowNumber: 7, subject: "b", detail: "blank" },
        { code: "no_price", sheet: "Tab", rowNumber: 8, subject: "c", detail: "empty" },
      ],
    });

    const lines = describePlan(plan, false);
    expect(lines).toContain("skipped      3");
    expect(lines.some((line) => line.trim() === "2  not_published")).toBe(true);
    expect(lines.some((line) => line.trim() === "1  no_price")).toBe(true);
    // The sheet-only rows are counted, not enumerated — there are ~200 of them every week.
    expect(lines.some((line) => line.includes("row 6"))).toBe(false);
  });

  it("lists the already-recorded skips, the one skip that is about the database", () => {
    const plan = emptyPlan({
      skipped: [
        {
          code: "already_recorded",
          sheet: "Tab",
          rowNumber: 9,
          subject: "c",
          detail: "Fixture Root retail in Fixture Bundle for 2026-W39 is already submitted",
        },
      ],
    });

    const lines = describePlan(plan, false);
    expect(lines.some((line) => line.includes("Tab row 9: Fixture Root retail"))).toBe(true);
  });

  it("names the tabs it passed over, so a missing tab is visible rather than silent", () => {
    const plan = emptyPlan({
      ignoredSheets: [{ name: "Guide & Legend", reason: 'no "Publish as" header' }],
    });
    const lines = describePlan(plan, false);
    expect(lines.some((line) => line.includes("Guide & Legend"))).toBe(true);
  });
});
