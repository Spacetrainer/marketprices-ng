/**
 * xlsx.ts — the only part of the tracker importer that knows what a spreadsheet file is.
 *
 * WHY THIS EXISTS RATHER THAN A DEPENDENCY. The importer's whole shape is reader → planner →
 * poster, and this module is one of the two bottom halves of the reader: bytes in, a grid of
 * strings out. `sheets.ts` is the other, and `reader.ts`, `planner.ts` and the posting loop
 * cannot tell which one they were handed — they work against the `Workbook` in `grid.ts`
 * either way. Taking on a spreadsheet library to read one workbook one way would be a
 * dependency the project carried long after the reason for it had gone.
 *
 * IT IS NOT DEAD CODE NOW THAT THE TRACKER LIVES IN GOOGLE SHEETS. This is the fallback path,
 * and the only one that needs no credentials and no network: `--file <workbook>` reaches it.
 * A Google outage, a revoked key or a sheet somebody moved to another Drive all end with
 * someone exporting an .xlsx and importing that, so this keeps working and keeps its tests.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. No formulas (the tracker has none — verified across all
 * thirteen sheets), no styles, no merged-cell expansion, no dates. A cell arrives here as the
 * string the file stores and leaves as that same string. Turning "46291" into 2026-09-26 is
 * `reader.ts`'s job, because the rule that a date must be normalised and that the ISO week
 * comes only from the date is a rule about the TRACKER, not about the file format.
 *
 * A NOTE ON THE ZIP. An .xlsx is a zip of XML parts. Node ships the inflate this needs in
 * node:zlib, so the only thing missing is the container: read the End of Central Directory
 * record, walk the central directory, inflate each part. CRC is not verified — the file comes
 * off local disk, and a corrupt part fails the XML parse a few lines later with a message
 * about which part, which is more useful than a checksum mismatch.
 */

import { inflateRawSync } from "node:zlib";
import { columnLetterToIndex, type SheetGrid, type Workbook } from "./grid";

export class WorkbookError extends Error {}

// ---------------------------------------------------------------------------
// 1. Zip container
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/**
 * Find the End of Central Directory record.
 *
 * It is the last thing in the file, but a zip comment may follow it, so the signature is
 * searched for backwards. The comment cannot exceed 65535 bytes, which bounds the scan.
 */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const signature = 0x06054b50;
  const earliest = Math.max(0, buffer.length - 0xffff - 22);

  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }

  throw new WorkbookError("Not a zip file — no End of Central Directory record found");
}

function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new WorkbookError(`Central directory entry ${index} has a bad signature`);
    }

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);

    entries.push({
      name: buffer.toString("utf8", offset + 46, offset + 46 + nameLength),
      method: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  const header = entry.localHeaderOffset;

  if (buffer.readUInt32LE(header) !== 0x04034b50) {
    throw new WorkbookError(`${entry.name}: bad local header signature`);
  }

  // The local header repeats the name and extra-field lengths, and they may differ from the
  // central directory's, so the data offset is computed from the local header's own values.
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw.toString("utf8");
  if (entry.method === 8) return inflateRawSync(raw).toString("utf8");

  throw new WorkbookError(`${entry.name}: unsupported compression method ${entry.method}`);
}

// ---------------------------------------------------------------------------
// 2. The little XML this needs
// ---------------------------------------------------------------------------

/**
 * Decode the five predefined XML entities plus numeric references.
 *
 * Sheet names and cell text in this tracker really do contain "&" (🥩 Beef & Goat Meat,
 * BEANS & LEGUMES), so skipping this would silently produce "Beef &amp; Goat Meat" and every
 * lookup keyed on a sheet name would miss.
 */
export function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_all, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_all, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, so "&amp;lt;" decodes to "&lt;" rather than to "<".
    .replace(/&amp;/g, "&");
}

/** Concatenate every <t> run inside a fragment — a shared string may be split across runs. */
function textRuns(fragment: string): string {
  const matches = fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g);
  let text = "";
  for (const match of matches) text += decodeXmlText(match[1] ?? "");
  return text;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => textRuns(match[1]));
}

/**
 * One worksheet part into a dense grid.
 *
 * Cells are addressed, not ordered — a row writes only the cells it has — so the grid is
 * built by address and the gaps are filled with "". That is also why `padRow` in reader.ts
 * has something to do: a row whose last cells are empty simply ends early here.
 */
function parseSheet(xml: string, sharedStrings: string[]): SheetGrid {
  const grid: SheetGrid = [];

  for (const rowMatch of xml.matchAll(/<row\s[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row\s[^>]*?r="(\d+)"[^>]*\/>/g)) {
    const rowNumber = Number(rowMatch[1] ?? rowMatch[3]);
    const body = rowMatch[2] ?? "";
    const cells: string[] = [];

    for (const cellMatch of body.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const inner = cellMatch[2] ?? "";

      const reference = /r="([A-Z]+)\d+"/.exec(attributes);
      if (!reference) continue;
      const columnIndex = columnLetterToIndex(reference[1]);

      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? "n";
      let value = "";

      if (type === "inlineStr") {
        value = textRuns(inner);
      } else if (type === "s") {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
      } else {
        // "n", "str", "b", "d" and a bare cell all carry their value in <v>. The importer
        // treats every cell as text and lets reader.ts decide what a given column means.
        value = decodeXmlText(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }

      while (cells.length < columnIndex) cells.push("");
      cells[columnIndex] = value;
    }

    while (grid.length < rowNumber - 1) grid.push([]);
    grid[rowNumber - 1] = cells;
  }

  return grid;
}

// ---------------------------------------------------------------------------
// 3. The workbook
// ---------------------------------------------------------------------------

/**
 * Read an .xlsx into one grid per sheet, keyed by tab name.
 *
 * Sheet order is the workbook's own, which the tracker relies on: `reader.ts` reports rows in
 * the order a human sees them, and the planner's tie-breaks ("the first row in the sheet
 * wins") are only meaningful if that order is the file's.
 */
export function readWorkbook(bytes: Buffer): Workbook {
  const entries = new Map(readCentralDirectory(bytes).map((entry) => [entry.name, entry]));

  const read = (name: string): string | undefined => {
    const entry = entries.get(name);
    return entry ? readEntry(bytes, entry) : undefined;
  };

  const workbookXml = read("xl/workbook.xml");
  if (!workbookXml) throw new WorkbookError("Not an .xlsx — xl/workbook.xml is missing");

  const relationshipsXml = read("xl/_rels/workbook.xml.rels") ?? "";
  const targets = new Map<string, string>();
  for (const match of relationshipsXml.matchAll(/<Relationship\s([^>]*?)\/>/g)) {
    const id = /Id="([^"]+)"/.exec(match[1])?.[1];
    const target = /Target="([^"]+)"/.exec(match[1])?.[1];
    if (id && target) targets.set(id, target);
  }

  const sharedStrings = parseSharedStrings(read("xl/sharedStrings.xml"));
  const workbook: Workbook = {};

  for (const match of workbookXml.matchAll(/<sheet\s([^>]*?)\/>/g)) {
    const attributes = match[1];
    const name = /name="([^"]*)"/.exec(attributes)?.[1];
    const relationshipId = /r:id="([^"]+)"/.exec(attributes)?.[1];
    if (!name || !relationshipId) continue;

    const target = targets.get(relationshipId);
    if (!target) throw new WorkbookError(`Sheet "${decodeXmlText(name)}" has no part for ${relationshipId}`);

    // A target may be "worksheets/sheet1.xml", "/xl/worksheets/sheet1.xml" or already
    // prefixed. Normalise all three to the archive path.
    const trimmed = target.replace(/^\/+/, "");
    const path = trimmed.startsWith("xl/") ? trimmed : `xl/${trimmed}`;

    const sheetXml = read(path);
    if (sheetXml === undefined) throw new WorkbookError(`Sheet part ${path} is missing from the archive`);

    workbook[decodeXmlText(name)] = parseSheet(sheetXml, sharedStrings);
  }

  if (Object.keys(workbook).length === 0) throw new WorkbookError("The workbook declares no sheets");

  return workbook;
}
