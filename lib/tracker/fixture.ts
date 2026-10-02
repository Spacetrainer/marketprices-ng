/**
 * fixture.ts — one grid of cells, rendered as each of the two things the importer can read.
 *
 * TEST SUPPORT ONLY. Nothing in `app/`, `scripts/` or the rest of `lib/` imports this; it ships
 * in no bundle. It lives beside the code it builds fixtures for rather than under a test folder
 * because two test files share it — `xlsx.test.ts`, which needs the zip writer, and
 * `equivalence.test.ts`, which needs both renderers — and a builder copied into two places stops
 * agreeing with itself.
 *
 * WHY A BUILDER AND NOT A CHECKED-IN .xlsx. A committed workbook is a binary nobody can read in
 * a diff, and the parser's job is to survive the shapes a real one takes. Those are easier to
 * state as a grid of strings here than to explain about an opaque blob.
 *
 * THE POINT OF HAVING BOTH RENDERERS IN ONE FILE. `equivalence.test.ts` asserts that the .xlsx
 * path and the Sheets path produce the same plan from the same data. That assertion is only
 * worth anything if the two renderings are built INDEPENDENTLY of the readers they feed — in
 * particular `sheetsPayloadFromGrids` must not call anything in `sheets.ts`, or the test would
 * be checking that a function agrees with itself.
 *
 * AND IT IS DELIBERATELY ADVERSARIAL on the one axis where the two sources genuinely differ:
 * a cell holding digits is written into the .xlsx as a NUMERIC cell (so the reader recovers the
 * digit string) and into the Sheets payload as a JSON NUMBER (so the reader has to render it
 * back). That is where a naive Sheets source diverges, so it is what the fixture forces.
 */

import { deflateRawSync } from "node:zlib";
import { columnIndexToLetter, type SheetGrid, type Workbook } from "./grid";

// ---------------------------------------------------------------------------
// A zip, by hand
// ---------------------------------------------------------------------------

/**
 * A zip container around some text parts.
 *
 * Only what `readWorkbook` reads: local headers, a central directory, an end record. The CRC is
 * written as zero because the parser does not verify it and says so.
 */
export function zip(files: Record<string, string>, { deflate = false } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const stored = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); // CRC — the parser does not verify it, and says so.
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + stored.length;
  }

  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(localBlock.length, 16);

  return Buffer.concat([localBlock, centralBlock, end]);
}

// ---------------------------------------------------------------------------
// Rendering a grid as an .xlsx
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Whether a cell would have been stored as a number rather than as text. */
export function looksNumeric(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value);
}

function sheetXml(grid: SheetGrid): string {
  const rows = grid.map((cells, rowIndex) => {
    const written = cells
      .map((value, columnIndex) => {
        // An empty cell is omitted entirely, which is what a real writer does — and what gives
        // `padRow` in reader.ts something to do.
        if (value === "") return "";
        const reference = `${columnIndexToLetter(columnIndex)}${rowIndex + 1}`;
        return looksNumeric(value)
          ? `<c r="${reference}"><v>${value}</v></c>`
          : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      })
      .join("");

    // A row with nothing in it is omitted too, and readWorkbook keeps its place as [].
    return written === "" ? "" : `<row r="${rowIndex + 1}">${written}</row>`;
  });

  return `<?xml version="1.0"?><worksheet><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

/** The grids as .xlsx bytes, with one worksheet part per tab, in order. */
export function xlsxFromGrids(grids: Workbook, options?: { deflate?: boolean }): Buffer {
  const titles = Object.keys(grids);

  const sheetTags = titles
    .map((title, position) => `<sheet name="${escapeXml(title)}" sheetId="${position + 1}" r:id="rId${position + 1}"/>`)
    .join("");
  const relationshipTags = titles
    .map((_title, position) => `<Relationship Id="rId${position + 1}" Target="worksheets/sheet${position + 1}.xml"/>`)
    .join("");

  const files: Record<string, string> = {
    "xl/workbook.xml": `<?xml version="1.0"?><workbook><sheets>${sheetTags}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships>${relationshipTags}</Relationships>`,
  };

  titles.forEach((title, position) => {
    files[`xl/worksheets/sheet${position + 1}.xml`] = sheetXml(grids[title]);
  });

  return zip(files, options);
}

// ---------------------------------------------------------------------------
// Rendering the same grid as the Sheets API's two responses
// ---------------------------------------------------------------------------

/** A cell as `UNFORMATTED_VALUE` would send it: digits as a JSON number, everything else as text. */
export type SheetsCell = string | number | boolean | null;

/**
 * The two API responses for these grids.
 *
 * Deliberately reproduces the three things the real API does that a hand-written fixture would
 * not think of, because each one is a way for the two sources to disagree:
 *
 *   - TRAILING EMPTY CELLS in a row are dropped, so rows come back at different widths;
 *   - TRAILING EMPTY ROWS are dropped, so `values` is shorter than the tab;
 *   - a cell holding digits comes back as a JSON NUMBER, losing any distinction between "4500"
 *     and 4500 that the .xlsx preserved as a cell type.
 *
 * A blank row in the MIDDLE is kept as `[]`, which is also what the API does and what
 * `readWorkbook` produces for an omitted `<row>`.
 */
export function sheetsPayloadFromGrids(grids: Workbook): {
  metadata: {
    properties: { title: string };
    sheets: { properties: { title: string; index: number; gridProperties: { rowCount: number; columnCount: number } } }[];
  };
  valueRanges: { range: string; values?: SheetsCell[][] }[];
} {
  const titles = Object.keys(grids);

  const metadata = {
    properties: { title: "Fixture Spreadsheet" },
    sheets: titles.map((title, index) => {
      const grid = grids[title];
      return {
        properties: {
          title,
          index,
          gridProperties: {
            rowCount: Math.max(1, grid.length),
            columnCount: Math.max(1, ...grid.map((row) => row.length), 1),
          },
        },
      };
    }),
  };

  const valueRanges = titles.map((title) => {
    const rows: SheetsCell[][] = grids[title].map((row) => {
      const trimmed = [...row];
      while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
      return trimmed.map((value) => (looksNumeric(value) ? Number(value) : value));
    });

    while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();

    return rows.length === 0
      ? { range: `'${title}'!A1:A1` }
      : { range: `'${title}'!A1:Z${rows.length}`, values: rows };
  });

  return { metadata, valueRanges };
}

// ---------------------------------------------------------------------------
// Comparing two workbooks fairly
// ---------------------------------------------------------------------------

/**
 * A workbook with trailing emptiness removed, per row and per sheet.
 *
 * NEEDED FOR AN HONEST COMPARISON, not to paper over a difference. The Sheets API drops trailing
 * empty cells and trailing empty rows; an .xlsx writer may or may not write them. So the two
 * sources can hand back grids of different LENGTHS that describe exactly the same spreadsheet,
 * and a plain deep-equal would fail on a difference that no caller can observe: `padRow` in
 * reader.ts treats a short row and an empty cell as one answer, and a row with no Product,
 * Variety or Portion is skipped whether it is `[]` or `["", "", ""]`.
 *
 * Every other difference is preserved, including a blank row in the middle and every cell's
 * exact text.
 */
export function trimmedWorkbook(workbook: Workbook): Workbook {
  const trimmed: Workbook = {};

  for (const [title, grid] of Object.entries(workbook)) {
    const rows = grid.map((row) => {
      const cells = [...row];
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells;
    });

    while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop();
    trimmed[title] = rows;
  }

  return trimmed;
}
