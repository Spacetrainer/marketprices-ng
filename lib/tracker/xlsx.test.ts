import { describe, expect, it } from "vitest";
import { zip } from "./fixture";
import { WorkbookError, decodeXmlText, readWorkbook } from "./xlsx";

/**
 * The workbook below is built here rather than checked in as a binary fixture.
 *
 * A committed .xlsx would be a file nobody can read in a diff, and the parser's job is to
 * survive the shapes a real workbook takes — inline strings, shared strings, addressed cells
 * with gaps, an ampersand in a sheet name, both compression methods. Those are easier to state
 * as XML here than to explain about an opaque blob. Every test below therefore builds exactly
 * the workbook it is about, with no network and no filesystem.
 *
 * The zip container itself comes from `fixture.ts`, because `equivalence.test.ts` needs the same
 * writer and a copy in two files stops agreeing with itself.
 */

const WORKBOOK_XML = `<?xml version="1.0"?><workbook><sheets>
  <sheet name="Prices &amp; Units" sheetId="1" r:id="rId1"/>
  <sheet name="Notes" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;

const RELS_XML = `<Relationships>
  <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/>
</Relationships>`;

const SHARED_XML = `<sst><si><t>Shared one</t></si><si><t>Efo </t><t>Tete</t></si></sst>`;

const SHEET1_XML = `<worksheet><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>Inline</t></is></c><c r="C1" t="s"><v>0</v></c></row>
  <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>4500</v></c><c r="D3" t="inlineStr"><is><t xml:space="preserve"> padded </t></is></c></row>
</sheetData></worksheet>`;

const SHEET2_XML = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Beef &amp; Goat</t></is></c></row></sheetData></worksheet>`;

function sampleWorkbook(options?: { deflate?: boolean }): Buffer {
  return zip(
    {
      "xl/workbook.xml": WORKBOOK_XML,
      "xl/_rels/workbook.xml.rels": RELS_XML,
      "xl/sharedStrings.xml": SHARED_XML,
      "xl/worksheets/sheet1.xml": SHEET1_XML,
      "xl/worksheets/sheet2.xml": SHEET2_XML,
    },
    options,
  );
}

describe("decodeXmlText", () => {
  it("decodes the five predefined entities", () => {
    expect(decodeXmlText("Beef &amp; Goat &lt;1&gt; &quot;x&quot; &apos;y&apos;")).toBe(
      "Beef & Goat <1> \"x\" 'y'",
    );
  });

  it("decodes numeric references, including the sheets' emoji", () => {
    expect(decodeXmlText("&#x1F969; Beef")).toBe("🥩 Beef");
    expect(decodeXmlText("&#65;")).toBe("A");
  });

  it("decodes the ampersand last, so &amp;lt; is text and not a tag", () => {
    expect(decodeXmlText("&amp;lt;")).toBe("&lt;");
  });
});

describe("readWorkbook", () => {
  it("reads every sheet, keyed by its decoded tab name", () => {
    const workbook = readWorkbook(sampleWorkbook());
    expect(Object.keys(workbook)).toEqual(["Prices & Units", "Notes"]);
  });

  it("keeps the workbook's own sheet order, which the planner's tie-breaks rely on", () => {
    const workbook = readWorkbook(sampleWorkbook());
    expect(Object.keys(workbook)[0]).toBe("Prices & Units");
  });

  it("resolves inline strings, shared strings and bare numeric cells alike", () => {
    const grid = readWorkbook(sampleWorkbook())["Prices & Units"];
    expect(grid[0][0]).toBe("Inline");
    expect(grid[0][2]).toBe("Shared one");
    expect(grid[2][1]).toBe("4500");
  });

  it("joins a shared string split across runs", () => {
    const grid = readWorkbook(sampleWorkbook())["Prices & Units"];
    expect(grid[2][0]).toBe("Efo Tete");
  });

  it("preserves whitespace a cell declares with xml:space", () => {
    const grid = readWorkbook(sampleWorkbook())["Prices & Units"];
    expect(grid[2][3]).toBe(" padded ");
  });

  it("fills the gaps addressed cells leave, so row 1 has a B", () => {
    const grid = readWorkbook(sampleWorkbook())["Prices & Units"];
    expect(grid[0][1]).toBe("");
  });

  it("leaves a skipped row present but empty, so row numbers stay true", () => {
    const grid = readWorkbook(sampleWorkbook())["Prices & Units"];
    expect(grid[1]).toEqual([]);
  });

  it("reads deflated parts as well as stored ones", () => {
    const workbook = readWorkbook(sampleWorkbook({ deflate: true }));
    expect(workbook["Prices & Units"][0][0]).toBe("Inline");
  });

  it("accepts a relationship target with or without the xl/ prefix", () => {
    const workbook = readWorkbook(sampleWorkbook());
    expect(workbook["Notes"][0][0]).toBe("Beef & Goat");
  });

  it("refuses a file that is not a zip", () => {
    expect(() => readWorkbook(Buffer.from("not a zip at all"))).toThrow(WorkbookError);
  });

  it("refuses a zip with no workbook part, naming what is missing", () => {
    expect(() => readWorkbook(zip({ "hello.txt": "hi" }))).toThrow(/xl\/workbook\.xml is missing/);
  });

  it("refuses a workbook whose sheet part is absent rather than returning an empty sheet", () => {
    const bytes = zip({
      "xl/workbook.xml": WORKBOOK_XML,
      "xl/_rels/workbook.xml.rels": RELS_XML,
    });
    expect(() => readWorkbook(bytes)).toThrow(/is missing from the archive/);
  });

  it("works without a sharedStrings part, which the real tracker has none of", () => {
    const bytes = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Only" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Publish as</t></is></c></row></sheetData></worksheet>`,
    });
    expect(readWorkbook(bytes)["Only"][0][0]).toBe("Publish as");
  });
});
