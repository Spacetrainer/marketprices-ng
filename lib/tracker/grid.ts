/**
 * grid.ts — what a spreadsheet grid is, and how its columns are addressed.
 *
 * WHY THIS IS ITS OWN MODULE. The tracker importer has two sources now: an .xlsx on disk and a
 * Google Sheet read over the API. Both produce a `Workbook` and nothing above them can tell
 * which one it got. Before this file existed the types lived in `xlsx.ts`, which meant the
 * Sheets source would have had to import from the zip reader to describe its own return value —
 * a dependency with no reason behind it beyond where the types happened to be declared first.
 *
 * The contract is deliberately tiny, and every part of it is load-bearing. `reader.ts` depends
 * on exactly five properties of a `Workbook`, and a source that breaks any one of them corrupts
 * the import silently rather than loudly:
 *
 *   1. The KEY is the tab title exactly as a human spells it, emoji and ampersands included —
 *      `data/tracker-map.json` resolves rows by that title.
 *   2. The ORDER is the spreadsheet's own. `readTracker` iterates insertion order and the
 *      planner's tie-breaks ("the first row in the sheet wins") are only meaningful if it is.
 *   3. `grid[0]` is spreadsheet ROW 1. Row numbers are quoted back to a human in every refusal,
 *      so an off-by-one here sends someone to the wrong cell.
 *   4. Every cell is the RAW string the sheet stores — not a formatted one. A date arrives as
 *      its serial, and `reader.ts` normalises it. Formatting is where two sources diverge.
 *   5. A row may be SHORT, or absent, when its trailing cells are empty. `padRow` in reader.ts
 *      treats "the cell is empty" and "the row stopped before that column" as one answer.
 */

/** One sheet as a grid of raw cell strings. Row 0 of the array is spreadsheet row 1. */
export type SheetGrid = string[][];

/** Every sheet in a spreadsheet, keyed by the tab title exactly as it is spelled. */
export type Workbook = Record<string, SheetGrid>;

/** "BK" → 62. Spreadsheet columns are base-26 with no zero digit. */
export function columnLetterToIndex(letters: string): number {
  let index = 0;
  for (const character of letters.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** 62 → "BK". The inverse, used to label columns back to a human and to build A1 ranges. */
export function columnIndexToLetter(index: number): string {
  let letters = "";
  let remaining = index + 1;
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + digit) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}
