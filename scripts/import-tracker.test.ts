import { describe, expect, it } from "vitest";
import { ImportError, describePlan, parseArguments } from "./import-tracker";
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
