/**
 * reader.ts — the tracker workbook as data, with nothing decided about it yet.
 *
 * Bytes became a grid in `xlsx.ts`. This module turns that grid into the tracker's own shape:
 * which tabs hold prices, where the data starts, what the chosen week column says, and which
 * (Product, Variety, Portion) each row is. It decides NOTHING about whether a row should be
 * posted — that is `planner.ts` — and it performs no I/O, so every rule below is testable
 * against a hand-written grid.
 *
 * FOUND BY CONTENT, NEVER BY POSITION OR NAME. Four things could have been hardcoded and are
 * not, because the workbook is a live document a human edits every week:
 *
 *   1. A DATA TAB is one whose header row reads "Publish as" in column A. Not a tab named in a
 *      list — the tracker has thirteen tabs, four of which (Guide & Legend, Product Review,
 *      Summary Dashboard, Price History Log) are not price data, and a fourteenth could be
 *      added tomorrow. Matching the header means a new sheet built like the others is picked up
 *      and a new sheet built differently is ignored, which is the safe way round.
 *   2. THE HEADER ROW is wherever that cell is, searched over the first few rows. It is row 2
 *      today. That is documentation, not a constant.
 *   3. THE THREE METADATA ROWS are found by their LABELS — MARKET VISITED, DATE COLLECTED,
 *      COLLECTED BY — not by being rows 3, 4 and 5, and data begins after the last one found.
 *      Adding a fourth metadata row must not silently make its contents the first price row.
 *   4. THE WEEK COLUMN is chosen by letter by the caller, and its header label is carried only
 *      so a human can be told which week they asked for.
 *
 * THE ISO WEEK IS NOT COMPUTED HERE, AND THAT IS DELIBERATE. The column labels read "Sep 2026
 * Wk4 · 22–30", which is a calendar-month week, not an ISO week, and they disagree: the K
 * column is labelled Sep Wk4 and its collection date of 2026-09-26 is ISO 2026-W39. A reader
 * that returned a week could return the wrong one. This module therefore exposes the
 * NORMALISED DATE and nothing else, and `planner.ts` derives the week from it through
 * lib/weeks.ts. The rule "the ISO week comes only from the date" is enforced by there being no
 * other value to reach for.
 */

import { isCivilDate } from "../weeks";
import { columnIndexToLetter, columnLetterToIndex, type SheetGrid, type Workbook } from "./xlsx";

/** Column A's label on the header row, and the thing that identifies a data tab. */
export const HEADER_CELL = "publish as";

/** How far down a sheet to look for the header row before deciding it is not a data tab. */
export const HEADER_SEARCH_ROWS = 10;

/** The seven fixed columns, A–G, that describe the row rather than a week. */
export const FIXED_COLUMNS = 7;

/** The metadata rows, by the label each one carries in column A. */
export const METADATA_LABELS = ["market visited", "date collected", "collected by"] as const;
export type MetadataLabel = (typeof METADATA_LABELS)[number];

/** What one week column says about the visit it records. */
export interface ColumnContext {
  /** The letter the caller asked for, e.g. "K". */
  letter: string;
  /** The header label, carried for reporting only — never used to derive a week. */
  label: string | null;
  /** MARKET VISITED, trimmed, or null when the cell is blank. */
  market: string | null;
  /** DATE COLLECTED as YYYY-MM-DD, or null when it is blank or unreadable. */
  collectedOn: string | null;
  /** What the date cell actually held, kept so a refusal can quote it. */
  rawDate: string | null;
  /** Why `collectedOn` is null despite `rawDate` having something in it. */
  dateProblem: string | null;
  /** COLLECTED BY, trimmed, or null when the cell is blank. */
  collector: string | null;
}

/** One priced line of the tracker: what it is, and what the chosen column says it costs. */
export interface TrackerRow {
  sheet: string;
  /** The spreadsheet row number, so a refusal names a cell a human can go and look at. */
  rowNumber: number;
  /** Column A. Blank means "kept in this sheet only" and is not a tier. */
  publishAs: string | null;
  category: string | null;
  subCategory: string | null;
  product: string;
  variety: string;
  portion: string;
  unitDescription: string | null;
  /** The raw cell from the chosen week column, or null when empty. Never parsed here. */
  price: string | null;
}

export interface TrackerSheet {
  name: string;
  headerRow: number;
  firstDataRow: number;
  context: ColumnContext;
  rows: TrackerRow[];
}

export interface TrackerReading {
  column: string;
  sheets: TrackerSheet[];
  /** Tabs that carry no "Publish as" header, with the reason they were passed over. */
  ignoredSheets: { name: string; reason: string }[];
}

export class ReaderError extends Error {}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/**
 * A row as wide as the sheet needs it to be.
 *
 * xlsx.ts writes only the cells a row actually contains, so a row whose trailing cells are
 * empty simply ends early and `row[10]` is `undefined`. Every lookup below goes through this,
 * so "the cell is empty" and "the row stopped before that column" are the same answer — which
 * they are, to a reader.
 */
export function padRow(row: string[] | undefined, width: number): string[] {
  const padded = [...(row ?? [])];
  while (padded.length < width) padded.push("");
  return padded;
}

/** A trimmed cell, or null when there is nothing in it. */
export function cellOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The tracker's date cell as YYYY-MM-DD.
 *
 * Two forms arrive in practice. A cell someone typed comes through as the text they typed; a
 * cell formatted as a date comes through as an Excel serial — the K column holds "46291".
 * Both are normalised here, and anything else is REFUSED rather than guessed at, because a
 * misread date is a price filed under the wrong ISO week and P2.7 makes the week the thing the
 * whole series is keyed on.
 *
 * The serial epoch is 1899-12-30, which is what makes serial 46291 fall on 2026-09-26 — it
 * absorbs Excel's fictitious 1900-02-29 for every serial at or above 61. Serials below that
 * are 1900 dates, off by one under this epoch, and are refused rather than silently shifted:
 * the tracker starts in 2026 and a value that small is a wrong cell, not a date.
 */
export function normaliseDate(raw: string | null): { date: string | null; problem: string | null } {
  if (raw === null) return { date: null, problem: null };

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (!isCivilDate(raw)) return { date: null, problem: `"${raw}" is not a real date` };
    return { date: raw, problem: null };
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Math.floor(Number(raw));
    if (serial < 61) {
      return { date: null, problem: `"${raw}" is too small to be a date serial` };
    }
    const epoch = Date.UTC(1899, 11, 30);
    const instant = new Date(epoch + serial * 86_400_000);
    const iso = instant.toISOString().slice(0, 10);
    return { date: iso, problem: null };
  }

  return {
    date: null,
    problem: `"${raw}" is neither YYYY-MM-DD nor a date serial`,
  };
}

// ---------------------------------------------------------------------------
// Finding the shape of a sheet
// ---------------------------------------------------------------------------

/** The row index (0-based) whose column A reads "Publish as", or null if there is none. */
export function findHeaderRow(grid: SheetGrid): number | null {
  const limit = Math.min(grid.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index += 1) {
    if ((padRow(grid[index], 1)[0] ?? "").trim().toLowerCase() === HEADER_CELL) return index;
  }
  return null;
}

/**
 * Which rows after the header are metadata, found by label.
 *
 * Returns the 0-based index of each label that was found. A label may be absent — the sheet is
 * still readable, and the planner refuses the column for a missing market, date or collector
 * with a message naming which. What must not happen is a metadata row being mistaken for data,
 * so the scan looks for the labels rather than counting rows.
 */
export function findMetadataRows(grid: SheetGrid, headerRow: number): Map<MetadataLabel, number> {
  const found = new Map<MetadataLabel, number>();
  const limit = Math.min(grid.length, headerRow + 1 + HEADER_SEARCH_ROWS);

  for (let index = headerRow + 1; index < limit; index += 1) {
    const label = (padRow(grid[index], 1)[0] ?? "").toLowerCase();
    for (const candidate of METADATA_LABELS) {
      if (!found.has(candidate) && label.includes(candidate)) found.set(candidate, index);
    }
  }

  return found;
}

function readColumnContext(
  grid: SheetGrid,
  headerRow: number,
  metadata: Map<MetadataLabel, number>,
  columnIndex: number,
  letter: string,
): ColumnContext {
  const width = columnIndex + 1;
  const at = (label: MetadataLabel): string | null => {
    const rowIndex = metadata.get(label);
    if (rowIndex === undefined) return null;
    return cellOrNull(padRow(grid[rowIndex], width)[columnIndex]);
  };

  const rawDate = at("date collected");
  const { date, problem } = normaliseDate(rawDate);

  return {
    letter,
    // The label is normalised only for whitespace: it is reported, never parsed.
    label: cellOrNull(padRow(grid[headerRow], width)[columnIndex])?.replace(/\s+/g, " ") ?? null,
    market: at("market visited"),
    collectedOn: date,
    rawDate,
    dateProblem: problem,
    collector: at("collected by"),
  };
}

// ---------------------------------------------------------------------------
// The reading
// ---------------------------------------------------------------------------

/**
 * Read one week column out of every data tab in the workbook.
 *
 * A row is returned when it names a product, a variety and a portion — that triple is what the
 * map is keyed on, so a row missing any of it is not a tracker row at all and is dropped here
 * rather than refused later. Everything else about the row, including an empty price and a
 * blank column A, is passed through for the planner to rule on.
 */
export function readTracker(workbook: Workbook, columnLetter: string): TrackerReading {
  const letter = columnLetter.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(letter)) {
    throw new ReaderError(`"${columnLetter}" is not a column letter`);
  }

  const columnIndex = columnLetterToIndex(letter);
  if (columnIndex < FIXED_COLUMNS) {
    throw new ReaderError(
      `Column ${letter} is one of the seven that describe a row (A–${columnIndexToLetter(FIXED_COLUMNS - 1)}), not a week column`,
    );
  }

  const sheets: TrackerSheet[] = [];
  const ignoredSheets: { name: string; reason: string }[] = [];

  for (const [name, grid] of Object.entries(workbook)) {
    const headerRow = findHeaderRow(grid);
    if (headerRow === null) {
      ignoredSheets.push({ name, reason: `no "Publish as" header in the first ${HEADER_SEARCH_ROWS} rows` });
      continue;
    }

    const metadata = findMetadataRows(grid, headerRow);
    const lastMetadataRow = metadata.size === 0 ? headerRow : Math.max(...metadata.values());
    const firstDataRow = lastMetadataRow + 1;
    const context = readColumnContext(grid, headerRow, metadata, columnIndex, letter);
    const width = Math.max(columnIndex + 1, FIXED_COLUMNS);

    const rows: TrackerRow[] = [];

    for (let index = firstDataRow; index < grid.length; index += 1) {
      const cells = padRow(grid[index], width);

      const product = cellOrNull(cells[3]);
      const variety = cellOrNull(cells[4]);
      const portion = cellOrNull(cells[5]);
      if (!product || !variety || !portion) continue;

      rows.push({
        sheet: name,
        rowNumber: index + 1,
        publishAs: cellOrNull(cells[0]),
        category: cellOrNull(cells[1]),
        subCategory: cellOrNull(cells[2]),
        product,
        variety,
        portion,
        unitDescription: cellOrNull(cells[6]),
        price: cellOrNull(cells[columnIndex]),
      });
    }

    sheets.push({ name, headerRow: headerRow + 1, firstDataRow: firstDataRow + 1, context, rows });
  }

  if (sheets.length === 0) {
    throw new ReaderError(
      `No data tab found — no sheet has "Publish as" in column A within its first ${HEADER_SEARCH_ROWS} rows`,
    );
  }

  return { column: letter, sheets, ignoredSheets };
}
