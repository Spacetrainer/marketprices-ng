/**
 * sheets.ts — the Google Sheets tracker as a `Workbook`, identical in shape to the .xlsx one.
 *
 * WHY THE TRACKER MOVED. Prices are collected in a market, on a phone. A workbook on a laptop
 * means the collection trip and the data entry are two separate events with a file transfer
 * between them, and the file transfer is where a week goes missing. A shared sheet removes it.
 *
 * THE SHEET IS AN INTAKE BUFFER AND NOTHING MORE. Supabase is the store of record. Nothing in
 * this module writes — the scope is `spreadsheets.readonly` and the service account is a Viewer
 * on one spreadsheet — and nothing downstream treats a cell as authoritative: every row still
 * enters through /api/ingest/price as a `pending` submission for a human to approve (P1.1), and
 * the engine still has no write access to price data at all (P5.2).
 * `docs/marketprices-build-plan.md:1568` names "Google Sheets becoming the database" as a known
 * way for a project like this one to fail. The read-only scope is what makes that structural
 * rather than a promise.
 *
 * THE FOUR THINGS THAT MAKE THE TWO SOURCES AGREE. `reader.ts` cannot tell which source it was
 * handed, and that is only true because of these:
 *
 *   1. `valueRenderOption=UNFORMATTED_VALUE` with `dateTimeRenderOption=SERIAL_NUMBER`. This is
 *      load-bearing. The tracker's DATE COLLECTED cell is formatted as a date, so it arrives as
 *      the serial 46291 from Sheets exactly as it does from the .xlsx — and Google Sheets uses
 *      the same 1899-12-30 epoch Excel does, which is what `normaliseDate` already assumes.
 *      `FORMATTED_VALUE` would hand it "26/09/2026", which `normaliseDate` correctly refuses:
 *      the failure would be loud, but it would be every row.
 *   2. RANGES ANCHORED AT A1, built from each tab's own `gridProperties` rather than from the
 *      bare tab title. Row 0 of a `SheetGrid` must be spreadsheet row 1, and every refusal
 *      quotes a row number back to a human who will go and look at that cell.
 *   3. TAB ORDER taken from `properties.index`, because `readTracker` iterates insertion order
 *      and the planner's tie-breaks depend on it.
 *   4. EVERY CELL AS A STRING, converted by one function with the rules written down.
 *
 * WHAT IT DOES NOT DO. No writing, no formulas evaluated here (the API has already done that),
 * no caching, and no attempt at a consistent snapshot — see `readSpreadsheet` for why that last
 * one is a real limitation and not an oversight.
 */

import { z } from "zod";
import { getAccessToken, readServiceAccount, SHEETS_READONLY_SCOPE, type EnvLike } from "./google-auth";
import { columnIndexToLetter, type SheetGrid, type Workbook } from "./grid";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Only the fields this module reads, so the metadata response stays small. */
const METADATA_FIELDS = "properties.title,sheets.properties(title,index,gridProperties)";

export class SheetsError extends Error {}

/** Everything that must be set for the Sheets source to be usable. */
export const TRACKER_SHEETS_ENV = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "TRACKER_SPREADSHEET_ID",
] as const;

/**
 * Which of those are absent, so a caller can refuse BEFORE doing any work.
 *
 * Exported as a list rather than thrown as an error because the useful message depends on who
 * is asking: the importer can offer `--file` as the fallback, and a future cron route cannot.
 */
export function missingSheetsEnv(env: EnvLike = process.env): string[] {
  return TRACKER_SHEETS_ENV.filter((name) => !env[name]?.trim());
}

// ---------------------------------------------------------------------------
// The two responses, validated at the boundary
// ---------------------------------------------------------------------------

const gridPropertiesSchema = z.object({
  rowCount: z.number().int().nonnegative().optional(),
  columnCount: z.number().int().nonnegative().optional(),
});

const sheetPropertiesSchema = z.object({
  title: z.string().min(1),
  index: z.number().int().nonnegative().optional(),
  gridProperties: gridPropertiesSchema.optional(),
});

export const spreadsheetMetadataSchema = z.object({
  properties: z.object({ title: z.string() }).optional(),
  sheets: z.array(z.object({ properties: sheetPropertiesSchema })).min(1, "the spreadsheet declares no tabs"),
});

export type SpreadsheetMetadata = z.infer<typeof spreadsheetMetadataSchema>;

/**
 * A cell as the API sends it.
 *
 * Under UNFORMATTED_VALUE a cell is a JSON string, number or boolean. `null` is not documented
 * but is accepted and treated as empty: a defensive null here costs one line, and the
 * alternative is a Zod failure that aborts a whole import over one blank cell.
 */
const cellSchema = z.union([z.string(), z.number(), z.boolean()]).nullable();

export const batchGetSchema = z.object({
  valueRanges: z.array(
    z.object({
      range: z.string().optional(),
      values: z.array(z.array(cellSchema)).optional(),
    }),
  ),
});

export type BatchGetResponse = z.infer<typeof batchGetSchema>;
export type ValueRange = BatchGetResponse["valueRanges"][number];

// ---------------------------------------------------------------------------
// Pure: the API's shapes into a Workbook
// ---------------------------------------------------------------------------

/**
 * The A1 range for one whole tab, anchored at A1.
 *
 * The bare-title form (`'Poultry'`) also returns a tab's values, but it does not promise that
 * the first row returned is row 1 — and a one-row shift would renumber every refusal in the
 * report. The explicit range removes the question.
 *
 * A title is wrapped in single quotes with any internal apostrophe doubled, which is A1
 * notation's own escaping. No tab in the tracker needs it today; a tab renamed on a phone
 * might, and the failure would otherwise be a 400 nobody could read.
 */
export function a1Range(title: string, rowCount: number, columnCount: number): string {
  const quoted = `'${title.replace(/'/g, "''")}'`;
  const lastColumn = columnIndexToLetter(Math.max(1, columnCount) - 1);
  return `${quoted}!A1:${lastColumn}${Math.max(1, rowCount)}`;
}

/**
 * One cell as the exact string the .xlsx path would have produced.
 *
 * The rules, and why each one:
 *   - a string is itself, untouched, including its whitespace (`reader.ts` does the trimming);
 *   - a number becomes its digits. `String(n)` would be right except at the extremes, where
 *     JavaScript switches to exponential notation and "1e+21" is not what any spreadsheet
 *     stores, so the plain decimal is forced. A value that large is not a price and will be
 *     refused downstream — but it must be refused for being absurd, not for being spelled
 *     differently by the two sources;
 *   - a boolean becomes TRUE/FALSE, which is how Sheets itself displays it. This is the one
 *     known divergence from the .xlsx path, which stores booleans as "1"/"0". No column in the
 *     tracker holds a boolean, so nothing reads it either way;
 *   - a missing or null cell is "", which is what `padRow` would have produced anyway.
 */
export function cellToString(value: z.infer<typeof cellSchema>, where: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";

  if (!Number.isFinite(value)) {
    throw new SheetsError(`${where} holds a number that is not finite, which no cell can be`);
  }

  const plain = String(value);
  if (!/e/i.test(plain)) return plain;

  return value.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** The tab titles, in the spreadsheet's own order. */
export function sheetTitles(metadata: SpreadsheetMetadata): string[] {
  return [...metadata.sheets]
    .map((sheet, position) => ({ title: sheet.properties.title, index: sheet.properties.index ?? position }))
    .sort((left, right) => left.index - right.index)
    .map((sheet) => sheet.title);
}

/**
 * Titles plus value ranges into a `Workbook`.
 *
 * Pure, and exported for that reason: every grid-shape assertion in the tests runs through this
 * with hand-written payloads and no network at all.
 *
 * `valueRanges` comes back in the order the ranges were requested, which is the order of
 * `titles`. That is the API's documented contract and it is the only thing tying a grid to its
 * tab name, so a length mismatch is refused rather than zipped as far as it goes.
 */
export function workbookFromSheets(
  titles: readonly string[],
  valueRanges: readonly ValueRange[],
): Workbook {
  if (titles.length !== valueRanges.length) {
    throw new SheetsError(
      `Asked for ${titles.length} tab${titles.length === 1 ? "" : "s"} and got ` +
        `${valueRanges.length} range${valueRanges.length === 1 ? "" : "s"} back, so a grid ` +
        "cannot be matched to the tab it came from.",
    );
  }

  const workbook: Workbook = {};

  titles.forEach((title, position) => {
    if (Object.hasOwn(workbook, title)) {
      // Google does not permit two tabs with one title, so this is a response that contradicts
      // itself. Silently keeping the last would drop a whole tab of prices.
      throw new SheetsError(`Two tabs came back with the title "${title}"`);
    }

    const rows = valueRanges[position].values ?? [];
    const grid: SheetGrid = rows.map((row, rowIndex) =>
      row.map((cell, columnIndex) =>
        cellToString(cell, `${title}!${columnIndexToLetter(columnIndex)}${rowIndex + 1}`),
      ),
    );

    workbook[title] = grid;
  });

  return workbook;
}

// ---------------------------------------------------------------------------
// The network half
// ---------------------------------------------------------------------------

export interface SpreadsheetSource {
  spreadsheetId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export interface SpreadsheetReading {
  /** The spreadsheet's own name, printed as provenance. Never the id, which is a secret. */
  title: string | null;
  workbook: Workbook;
}

async function getJson(url: string, source: SpreadsheetSource, what: string): Promise<unknown> {
  const fetchImpl = source.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${source.accessToken}`, accept: "application/json" },
    });
  } catch (error) {
    throw new SheetsError(`Could not reach the Google Sheets API to read ${what}.`, { cause: error });
  }

  const body = await response.text();
  if (!response.ok) throw new SheetsError(describeApiFailure(response.status, body, what));

  try {
    return JSON.parse(body);
  } catch {
    throw new SheetsError(`The Sheets API returned ${response.status} for ${what} with a body that is not JSON.`);
  }
}

/**
 * Three failures that look alike, told apart.
 *
 * Not shared with the service account → 403. Sheets API not enabled on the Cloud project → also
 * 403, with SERVICE_DISABLED or accessNotConfigured buried in the body. Wrong spreadsheet id →
 * 404. Without this, the first evening of setup is spent re-sharing a sheet that was already
 * shared. Neither the token nor the spreadsheet id is quoted.
 */
function describeApiFailure(status: number, body: string, what: string): string {
  const haystack = body.slice(0, 2000);
  const disabled = /SERVICE_DISABLED|accessNotConfigured|has not been used in project/i.test(haystack);

  if (status === 401) {
    return (
      `The Sheets API rejected the access token while reading ${what} (HTTP 401). The token is ` +
      "minted fresh on every run, so this is the credential itself: check " +
      "GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  if (status === 403 && disabled) {
    return (
      `The Google Sheets API is not enabled for this service account's Cloud project (HTTP 403, ` +
      `reading ${what}). Enable it at APIs & Services → Library → "Google Sheets API" → Enable, ` +
      "then run this again. Nothing is wrong with the sharing or the key."
    );
  }

  if (status === 403) {
    return (
      `The service account is not allowed to read this spreadsheet (HTTP 403, reading ${what}). ` +
      "Open the sheet, press Share, and add the address in GOOGLE_SERVICE_ACCOUNT_EMAIL as a " +
      "Viewer. It cannot receive mail, so untick Notify people."
    );
  }

  if (status === 404) {
    return (
      `No spreadsheet with that id (HTTP 404, reading ${what}). TRACKER_SPREADSHEET_ID should be ` +
      "the part of the sheet's URL between /d/ and /edit — not the whole URL, and not the gid."
    );
  }

  if (status === 429) {
    return `The Sheets API is rate-limiting this project (HTTP 429, reading ${what}). Nothing was read; try again shortly.`;
  }

  return `The Sheets API returned HTTP ${status} while reading ${what}.`;
}

/**
 * The spreadsheet as a `Workbook`: one metadata call, then one batched values call.
 *
 * TWO CALLS ARE NOT A SNAPSHOT, and the v4 API offers no revision to pin (that is a Drive API
 * concept). Someone typing into the sheet while this runs could in principle have a tab's
 * dimensions read before an edit and its values after. The practical consequence is bounded —
 * a price might be read a minute stale, or a half-typed cell refused — but it is real, and it
 * is the reason the importer prints the plan it is actually about to post rather than trusting
 * the one printed by an earlier dry run.
 */
export async function readSpreadsheet(source: SpreadsheetSource): Promise<SpreadsheetReading> {
  const metadataUrl = `${SHEETS_API}/${encodeURIComponent(source.spreadsheetId)}?fields=${encodeURIComponent(METADATA_FIELDS)}`;
  const metadataResult = spreadsheetMetadataSchema.safeParse(
    await getJson(metadataUrl, source, "the list of tabs"),
  );

  if (!metadataResult.success) {
    throw new SheetsError(
      `The Sheets API described this spreadsheet in a way this importer cannot use — ${describeIssues(metadataResult.error)}`,
    );
  }

  const metadata = metadataResult.data;
  const titles = sheetTitles(metadata);

  const byTitle = new Map(metadata.sheets.map((sheet) => [sheet.properties.title, sheet.properties]));

  const parameters = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
    majorDimension: "ROWS",
  });

  for (const title of titles) {
    const grid = byTitle.get(title)?.gridProperties;
    parameters.append("ranges", a1Range(title, grid?.rowCount ?? 1, grid?.columnCount ?? 1));
  }

  const valuesUrl = `${SHEETS_API}/${encodeURIComponent(source.spreadsheetId)}/values:batchGet?${parameters.toString()}`;
  const batchResult = batchGetSchema.safeParse(await getJson(valuesUrl, source, "the tabs' values"));

  if (!batchResult.success) {
    throw new SheetsError(
      `The Sheets API returned values this importer cannot use — ${describeIssues(batchResult.error)}`,
    );
  }

  return {
    title: metadata.properties?.title ?? null,
    workbook: workbookFromSheets(titles, batchResult.data.valueRanges),
  };
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/**
 * The whole Sheets source, from the environment to a `Workbook`.
 *
 * The caller is expected to have checked `missingSheetsEnv` already — this throws a plain
 * message if not, but only the caller knows what the fallback is.
 */
export async function readTrackerSpreadsheet(
  env: EnvLike = process.env,
  fetchImpl?: typeof fetch,
): Promise<SpreadsheetReading> {
  const spreadsheetId = env.TRACKER_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new SheetsError("TRACKER_SPREADSHEET_ID is not set");

  const account = readServiceAccount(env);
  const { token } = await getAccessToken({ account, scope: SHEETS_READONLY_SCOPE, fetchImpl });

  return readSpreadsheet({ spreadsheetId, accessToken: token, fetchImpl });
}
