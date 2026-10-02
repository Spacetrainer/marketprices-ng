import { describe, expect, it } from "vitest";
import {
  SheetsError,
  a1Range,
  cellToString,
  missingSheetsEnv,
  readSpreadsheet,
  sheetTitles,
  workbookFromSheets,
  type ValueRange,
} from "./sheets";

/**
 * The Sheets source, entirely offline.
 *
 * Every test here stubs `fetch`, because the thing worth testing is not that Google answers —
 * it is that the five properties `reader.ts` depends on survive the trip, and that the three
 * setup failures that look identical from the outside are told apart.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const metadata = (
  tabs: { title: string; index?: number; rowCount?: number; columnCount?: number }[],
  title = "Fixture Tracker",
) => ({
  properties: { title },
  sheets: tabs.map((tab, position) => ({
    properties: {
      title: tab.title,
      index: tab.index ?? position,
      gridProperties: { rowCount: tab.rowCount ?? 100, columnCount: tab.columnCount ?? 26 },
    },
  })),
});

describe("missingSheetsEnv", () => {
  it("lists all three names when nothing is set", () => {
    expect(missingSheetsEnv({})).toEqual([
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
      "TRACKER_SPREADSHEET_ID",
    ]);
  });

  it("treats whitespace as absent, because a blank line in .env.local is not a value", () => {
    expect(
      missingSheetsEnv({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.iam.gserviceaccount.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
        TRACKER_SPREADSHEET_ID: "   ",
      }),
    ).toEqual(["TRACKER_SPREADSHEET_ID"]);
  });

  it("is empty when all three are set", () => {
    expect(
      missingSheetsEnv({
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.iam.gserviceaccount.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
        TRACKER_SPREADSHEET_ID: "sheet-id",
      }),
    ).toEqual([]);
  });
});

describe("a1Range", () => {
  it("anchors at A1, because grid[0] must be spreadsheet row 1", () => {
    expect(a1Range("Tab", 100, 26)).toBe("'Tab'!A1:Z100");
  });

  it("quotes the title, which the tracker's tabs need", () => {
    // Emoji and ampersands are fine inside the quotes; it is the quoting itself that matters.
    expect(a1Range("🍗 Fixture & Other", 7, 11)).toBe("'🍗 Fixture & Other'!A1:K7");
  });

  it("doubles an apostrophe in a title, as A1 notation requires", () => {
    expect(a1Range("Ola's tab", 5, 2)).toBe("'Ola''s tab'!A1:B5");
  });

  it("asks for at least one cell when a tab reports no dimensions", () => {
    expect(a1Range("Tab", 0, 0)).toBe("'Tab'!A1:A1");
  });

  it("addresses past the two-letter boundary", () => {
    expect(a1Range("Tab", 2, 27)).toBe("'Tab'!A1:AA2");
  });
});

describe("cellToString", () => {
  it("passes a string through untouched, including its whitespace", () => {
    // reader.ts does the trimming, and one place deciding that is the whole point.
    expect(cellToString(" padded ", "A1")).toBe(" padded ");
  });

  it("renders a whole number as its digits, which is what the .xlsx stored", () => {
    expect(cellToString(4500, "A1")).toBe("4500");
  });

  it("keeps a decimal point", () => {
    expect(cellToString(4500.5, "A1")).toBe("4500.5");
  });

  it("renders a date serial as digits, which is how a date reaches reader.ts", () => {
    // Google Sheets shares Excel's 1899-12-30 epoch, so SERIAL_NUMBER means normaliseDate needs
    // no second code path. This serial is the one the K column holds.
    expect(cellToString(46291, "A1")).toBe("46291");
  });

  it("forces a plain decimal rather than exponential notation", () => {
    // String(1e21) is "1e+21", which no spreadsheet stores. A value this size is not a price and
    // will be refused downstream — but it must be refused for being absurd, not for the two
    // sources spelling it differently.
    expect(cellToString(1e21, "A1")).toBe("1000000000000000000000");
    expect(cellToString(0.0000001, "A1")).toBe("0.0000001");
  });

  it("treats an empty or null cell as empty text", () => {
    expect(cellToString("", "A1")).toBe("");
    expect(cellToString(null, "A1")).toBe("");
  });

  it("renders a boolean the way Sheets displays it", () => {
    // The one known divergence from the .xlsx path, which stores "1"/"0". No tracker column holds
    // a boolean, so nothing reads it either way — it is written down so it is not a surprise.
    expect(cellToString(true, "A1")).toBe("TRUE");
    expect(cellToString(false, "A1")).toBe("FALSE");
  });

  it("names the cell when a number is not finite", () => {
    expect(() => cellToString(Number.POSITIVE_INFINITY, "🍗 Tab!K7")).toThrow(/🍗 Tab!K7/);
  });
});

describe("sheetTitles", () => {
  it("returns the spreadsheet's own order, which the planner's tie-breaks rely on", () => {
    const parsed = metadata([
      { title: "Third", index: 2 },
      { title: "First", index: 0 },
      { title: "Second", index: 1 },
    ]);
    expect(sheetTitles(parsed)).toEqual(["First", "Second", "Third"]);
  });

  it("falls back to response order when a tab declares no index", () => {
    const parsed = { sheets: [{ properties: { title: "A" } }, { properties: { title: "B" } }] };
    expect(sheetTitles(parsed)).toEqual(["A", "B"]);
  });
});

describe("workbookFromSheets", () => {
  const ranges = (...sets: (string | number | boolean | null)[][][]): ValueRange[] =>
    sets.map((values) => ({ values }));

  it("keys each grid by its exact title, emoji and ampersand included", () => {
    const workbook = workbookFromSheets(
      ["🥬 Fixture & Greens", "Plain"],
      ranges([["a"]], [["b"]]),
    );
    expect(Object.keys(workbook)).toEqual(["🥬 Fixture & Greens", "Plain"]);
  });

  it("puts row 1 at index 0", () => {
    const workbook = workbookFromSheets(["Tab"], ranges([["row one"], ["row two"]]));
    expect(workbook["Tab"][0]).toEqual(["row one"]);
  });

  it("converts every cell through cellToString", () => {
    const workbook = workbookFromSheets(["Tab"], ranges([["text", 4500, true, null]]));
    expect(workbook["Tab"][0]).toEqual(["text", "4500", "TRUE", ""]);
  });

  it("keeps a short row short, because padRow is what fills it", () => {
    const workbook = workbookFromSheets(["Tab"], ranges([["a", "b"], ["c"]]));
    expect(workbook["Tab"][1]).toEqual(["c"]);
  });

  it("keeps a blank row in the middle as an empty row, so row numbers stay true", () => {
    const workbook = workbookFromSheets(["Tab"], ranges([["a"], [], ["c"]]));
    expect(workbook["Tab"]).toEqual([["a"], [], ["c"]]);
    expect(workbook["Tab"][2]).toEqual(["c"]);
  });

  it("gives a tab with no values an empty grid rather than omitting it", () => {
    const workbook = workbookFromSheets(["Empty"], [{ range: "'Empty'!A1:A1" }]);
    expect(workbook["Empty"]).toEqual([]);
  });

  it("refuses a response with fewer ranges than tabs rather than mismatching them", () => {
    // Zipping as far as it goes would silently file one tab's prices under another tab's name.
    expect(() => workbookFromSheets(["A", "B"], ranges([["x"]]))).toThrow(SheetsError);
    expect(() => workbookFromSheets(["A", "B"], ranges([["x"]]))).toThrow(/2 tabs and got 1 range/);
  });

  it("refuses two tabs with the same title rather than dropping one", () => {
    expect(() => workbookFromSheets(["Same", "Same"], ranges([["x"]], [["y"]]))).toThrow(
      /Two tabs came back with the title "Same"/,
    );
  });
});

describe("readSpreadsheet", () => {
  /** Answers the metadata call then the values call, recording both URLs. */
  function stub(
    tabs: Parameters<typeof metadata>[0],
    values: ValueRange[],
    title?: string,
  ): { urls: string[]; headers: (Headers | undefined)[]; fetchImpl: typeof fetch } {
    const urls: string[] = [];
    const headers: (Headers | undefined)[] = [];

    const fetchImpl: typeof fetch = async (url, init) => {
      urls.push(String(url));
      headers.push(init?.headers ? new Headers(init.headers) : undefined);
      return urls.length === 1
        ? jsonResponse(metadata(tabs, title))
        : jsonResponse({ valueRanges: values });
    };

    return { urls, headers, fetchImpl };
  }

  it("asks for unformatted values and date serials, which is what makes the two sources agree", async () => {
    const { urls, fetchImpl } = stub([{ title: "Tab" }], [{ values: [["a"]] }]);
    await readSpreadsheet({ spreadsheetId: "id", accessToken: "token", fetchImpl });

    expect(urls[1]).toContain("valueRenderOption=UNFORMATTED_VALUE");
    expect(urls[1]).toContain("dateTimeRenderOption=SERIAL_NUMBER");
    expect(urls[1]).toContain("majorDimension=ROWS");
  });

  it("asks for every tab in one batched call, each range anchored at A1", async () => {
    const { urls, fetchImpl } = stub(
      [
        { title: "One", rowCount: 10, columnCount: 3 },
        { title: "Two", rowCount: 4, columnCount: 2 },
      ],
      [{ values: [["a"]] }, { values: [["b"]] }],
    );
    await readSpreadsheet({ spreadsheetId: "id", accessToken: "token", fetchImpl });

    expect(urls).toHaveLength(2);
    const requested = [...new URL(urls[1]).searchParams.getAll("ranges")];
    expect(requested).toEqual(["'One'!A1:C10", "'Two'!A1:B4"]);
  });

  it("sends the token as a bearer header and never in the URL", async () => {
    const { urls, headers, fetchImpl } = stub([{ title: "Tab" }], [{ values: [["a"]] }]);
    await readSpreadsheet({ spreadsheetId: "id", accessToken: "secret-token", fetchImpl });

    expect(headers[0]?.get("authorization")).toBe("Bearer secret-token");
    for (const url of urls) expect(url).not.toContain("secret-token");
  });

  it("returns the spreadsheet's name as provenance, and the grids keyed by tab", async () => {
    const { fetchImpl } = stub(
      [{ title: "🍗 Fixture" }],
      [{ values: [["Publish as"], ["retail", 4500]] }],
      "Lagos Fixture Tracker",
    );
    const reading = await readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl });

    expect(reading.title).toBe("Lagos Fixture Tracker");
    expect(reading.workbook["🍗 Fixture"]).toEqual([["Publish as"], ["retail", "4500"]]);
  });

  it("tells a sharing problem from an API that is not enabled, and names the fix for each", async () => {
    const notShared: typeof fetch = async () =>
      jsonResponse({ error: { code: 403, message: "The caller does not have permission" } }, 403);
    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: notShared }),
    ).rejects.toThrow(/press Share, and add the address in GOOGLE_SERVICE_ACCOUNT_EMAIL as a Viewer/);

    const notEnabled: typeof fetch = async () =>
      jsonResponse(
        { error: { code: 403, status: "PERMISSION_DENIED", message: "Google Sheets API has not been used in project 123 before or it is disabled", details: [{ reason: "SERVICE_DISABLED" }] } },
        403,
      );
    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: notEnabled }),
    ).rejects.toThrow(/APIs & Services → Library/);
  });

  it("explains a 404 as the id, which is the half of the URL people copy wrongly", async () => {
    const missing: typeof fetch = async () => jsonResponse({ error: { code: 404 } }, 404);
    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: missing }),
    ).rejects.toThrow(/between \/d\/ and \/edit/);
  });

  it("explains a 401 as the credential, not the sharing", async () => {
    const unauthorised: typeof fetch = async () => jsonResponse({ error: { code: 401 } }, 401);
    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: unauthorised }),
    ).rejects.toThrow(/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/);
  });

  it("never quotes the spreadsheet id or the token in a failure", async () => {
    const failing: typeof fetch = async () => jsonResponse({ error: { code: 500 } }, 500);
    try {
      await readSpreadsheet({
        spreadsheetId: "secret-spreadsheet-id",
        accessToken: "secret-token",
        fetchImpl: failing,
      });
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-spreadsheet-id");
      expect((error as Error).message).not.toContain("secret-token");
    }
  });

  it("refuses a spreadsheet that declares no tabs rather than reading nothing", async () => {
    const empty: typeof fetch = async () => jsonResponse({ sheets: [] });
    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: empty }),
    ).rejects.toThrow(/declares no tabs/);
  });

  it("refuses a values response whose cells are not cells", async () => {
    const weird: typeof fetch = async (url) =>
      String(url).includes("values:batchGet")
        ? jsonResponse({ valueRanges: [{ values: [[{ nested: "object" }]] }] })
        : jsonResponse(metadata([{ title: "Tab" }]));

    await expect(
      readSpreadsheet({ spreadsheetId: "id", accessToken: "t", fetchImpl: weird }),
    ).rejects.toThrow(/cannot use/);
  });
});
