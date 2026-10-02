import { describe, expect, it } from "vitest";
import { columnIndexToLetter, columnLetterToIndex } from "./grid";

/**
 * Column addressing, which both sources depend on and neither owns.
 *
 * `xlsx.ts` converts a cell reference like "BK7" into an index; `sheets.ts` converts a column
 * count back into a letter to build the A1 range it asks for. A fault here is an off-by-one in
 * which column a week's prices were read from, which is silent — the prices are real, they are
 * just the wrong week's.
 */
describe("columnLetterToIndex / columnIndexToLetter", () => {
  it("round-trips the letters the tracker actually uses", () => {
    for (const [letter, index] of [
      ["A", 0],
      ["G", 6],
      ["H", 7],
      ["K", 10],
      ["Z", 25],
      ["AA", 26],
      ["CY", 102],
    ] as const) {
      expect(columnLetterToIndex(letter)).toBe(index);
      expect(columnIndexToLetter(index)).toBe(letter);
    }
  });

  it("is case-insensitive, because a human types --column k", () => {
    expect(columnLetterToIndex("k")).toBe(columnLetterToIndex("K"));
  });

  it("round-trips every index a spreadsheet can address", () => {
    // Sheets caps a tab at 18278 columns (ZZZ), and the A1 range is built from that count, so
    // the three-letter boundary is reached in practice rather than hypothetically.
    for (const index of [0, 25, 26, 51, 52, 676, 701, 702, 18277]) {
      expect(columnLetterToIndex(columnIndexToLetter(index))).toBe(index);
    }
  });
});
