import { describe, expect, it } from "vitest";
import { ingestPayloadSchema, parseNairaPrice, type PriceRefusal } from "./ingest";
import { parsePrice } from "../tracker/planner";

/**
 * ONE TABLE, ASSERTED AGAINST EVERY DOOR A PRICE CAN COME THROUGH.
 *
 * The requirement behind this file is that the tracker importer's dry run promises exactly what
 * /api/ingest/price will accept. The dry run is the artefact a human approves before anything is
 * posted, so a preview that is more permissive than the endpoint is a preview that lies — the
 * owner approves 332 rows and some number of them are refused on arrival.
 *
 * Sharing `parseNairaPrice` makes that structural rather than coincidental. This table is what
 * notices if someone later re-implements the rule in one of the two places: every case is run
 * through the predicate, through the planner's `parsePrice`, and through the Zod schema at the
 * endpoint, and all three have to agree.
 *
 * The reviewer's correction box calls the same predicate and is covered in price-review.test.ts,
 * where the wording is reviewer-facing rather than API-facing.
 */

/** `expect` is the whole-naira answer: a number when accepted, a reason when refused. */
const CASES: { input: string | number; expect: number | PriceRefusal; why: string }[] = [
  // --- accepted, exactly as before the whole-naira rule -------------------------------------
  { input: "95000", expect: 95000, why: "the ordinary case" },
  { input: 95000, expect: 95000, why: "a JSON number, which is what the Sheets API sends" },
  { input: "0", expect: 0, why: "a price of 0 is legitimate — given away, promotional" },
  { input: 0, expect: 0, why: "and as a number" },
  { input: "₦95,000", expect: 95000, why: "a human typed a currency sign and a separator" },
  { input: " 1 500 ", expect: 1500, why: "spaces inside and around the digits" },
  { input: "95,000.00", expect: 95000, why: "a trailing .00 IS a whole number of naira" },
  { input: "250.000", expect: 250, why: "and so is a longer run of zeros" },

  // --- refused, and these two are why this change exists ------------------------------------
  {
    input: "95000.00000000001",
    expect: "fractional",
    why: "floating-point residue that reads as 95000 to a reviewer and carries no flag",
  },
  { input: "250.5", expect: "fractional", why: "kobo, written deliberately" },
  { input: "0.5", expect: "fractional", why: "kobo with no naira at all" },

  // --- refused, exactly as before ------------------------------------------------------------
  { input: "-1", expect: "negative", why: "a data-entry error, not a discount" },
  { input: -1, expect: "negative", why: "and as a number" },
  { input: "n/a", expect: "not_a_number", why: "a cell holding a note instead of a price" },
  { input: "", expect: "not_a_number", why: "an empty cell reaching the parser" },
  { input: "   ", expect: "not_a_number", why: "whitespace, which strips to empty" },
];

/** The rest of a valid submission, so the schema is only ever refusing on the price. */
const PAYLOAD = {
  collector_name: "Fixture Collector",
  collector_phone: "08000000001",
  collection_site: "Fixture Market",
  commodity: "Fixture Commodity",
  unit: "Fixture Unit",
  tier: "retail",
  collected_on: "2026-09-26",
};

describe("parseNairaPrice — the one predicate", () => {
  for (const testCase of CASES) {
    const label = `${JSON.stringify(testCase.input)} → ${JSON.stringify(testCase.expect)}`;

    it(`${label} (${testCase.why})`, () => {
      const result = parseNairaPrice(testCase.input);

      if (typeof testCase.expect === "number") {
        expect(result).toEqual({ ok: true, value: testCase.expect });
      } else {
        expect(result).toEqual({ ok: false, reason: testCase.expect });
      }
    });
  }
});

describe("the importer's preview and the endpoint agree on every case", () => {
  for (const testCase of CASES) {
    it(`${JSON.stringify(testCase.input)} is treated the same by both`, () => {
      // The planner only ever sees a string, because a spreadsheet cell is one.
      const viaPlanner = parsePrice(String(testCase.input));
      const viaEndpoint = ingestPayloadSchema.safeParse({ ...PAYLOAD, price: testCase.input });

      if (typeof testCase.expect === "number") {
        expect(viaPlanner).toEqual({ ok: true, value: testCase.expect });
        expect(viaEndpoint.success).toBe(true);
        expect(viaEndpoint.success && viaEndpoint.data.price).toBe(testCase.expect);
      } else {
        expect(viaPlanner.ok).toBe(false);
        expect(viaEndpoint.success).toBe(false);
      }
    });
  }

  it("covers both accepted and refused cases, so agreement is not vacuous", () => {
    expect(CASES.filter((one) => typeof one.expect === "number").length).toBeGreaterThan(0);
    expect(CASES.filter((one) => typeof one.expect === "string").length).toBeGreaterThan(0);
  });
});

describe("what the endpoint says when it refuses", () => {
  it("names kobo, so the sentence explains what to change", () => {
    const result = ingestPayloadSchema.safeParse({ ...PAYLOAD, price: "250.5" });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toBe(
      "price 250.5 is not a whole number of naira. Prices are recorded in naira with no kobo.",
    );
  });

  it("keeps the two sentences that were already there", () => {
    // A 400 body is read by whoever is holding the phone; relearning a message costs more than
    // it is worth, so only the new refusal is new wording.
    const notNumber = ingestPayloadSchema.safeParse({ ...PAYLOAD, price: "abo" });
    expect(notNumber.success === false && notNumber.error.issues[0].message).toBe(
      'price "abo" is not a number',
    );

    const negative = ingestPayloadSchema.safeParse({ ...PAYLOAD, price: -1 });
    expect(negative.success === false && negative.error.issues[0].message).toBe(
      "price -1 is negative",
    );
  });
});
