import { describe, expect, it } from "vitest";
import { approveSubmissionSchema, rejectSubmissionSchema } from "./price-review";

const ID = "1648ba35-0600-47f8-b0c2-8fcad96083d3";

/**
 * The boundary, tested for the cases where being lenient would publish a wrong figure.
 *
 * The database refuses all of these too (migration 0038: four raise branches and five named
 * CHECK constraints). These tests are not a substitute for that — they are here because the
 * form should refuse them first, in a sentence about the form, and because the ONE case that
 * must never be "helpfully" coerced is an empty price field becoming zero.
 */
describe("approveSubmissionSchema", () => {
  it("accepts a plain approval — no correction, no reason", () => {
    const result = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "",
      correctionReason: "",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.correctedPrice).toBeNull();
    expect(result.success && result.data.correctionReason).toBeNull();
  });

  it("treats absent fields as no correction, not as zero", () => {
    const result = approveSubmissionSchema.safeParse({ submissionId: ID });

    expect(result.success).toBe(true);
    expect(result.success && result.data.correctedPrice).toBeNull();
  });

  it("NEVER READS AN EMPTY OR BLANK PRICE FIELD AS 0", () => {
    // The single most costly coercion available here. `z.coerce.number()` turns "" and " "
    // into 0, and 0 is a LEGITIMATE price in both price columns (`check price >= 0`), so
    // nothing downstream would reject it — an untouched form field would publish a free yam
    // to the public series and satisfy every constraint on the way (P0.2).
    for (const blank of ["", "   ", "\t", null, undefined]) {
      const result = approveSubmissionSchema.safeParse({
        submissionId: ID,
        correctedPrice: blank,
      });
      expect(result.success, String(blank)).toBe(true);
      expect(result.success && result.data.correctedPrice, String(blank)).toBeNull();
    }
  });

  it("accepts an explicit zero, which is a real price", () => {
    // Given away, or promotional. 0 is kept everywhere else in this schema; it may only not
    // be ARRIVED AT by accident.
    const result = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "0",
      correctionReason: "stallholder gave the sample away",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.correctedPrice).toBe(0);
  });

  it("trims a reason and rejects one that is only whitespace", () => {
    const trimmed = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "6300",
      correctionReason: "  misread the board  ",
    });
    expect(trimmed.success && trimmed.data.correctionReason).toBe("misread the board");

    const blank = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "6300",
      correctionReason: "   ",
    });
    expect(blank.success).toBe(false);
  });

  it("refuses a corrected price with no reason", () => {
    const result = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "6300",
      correctionReason: "",
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual(["correctionReason"]);
  });

  it("refuses a reason with no corrected price", () => {
    const result = approveSubmissionSchema.safeParse({
      submissionId: ID,
      correctedPrice: "",
      correctionReason: "this looks wrong",
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual(["correctedPrice"]);
  });

  it("refuses a negative price and a non-numeric one", () => {
    for (const bad of ["-1", "abc", "6,300"]) {
      const result = approveSubmissionSchema.safeParse({
        submissionId: ID,
        correctedPrice: bad,
        correctionReason: "reason",
      });
      expect(result.success, bad).toBe(false);
    }
  });

  it("refuses an id that is not a uuid", () => {
    const result = approveSubmissionSchema.safeParse({ submissionId: "not-an-id" });
    expect(result.success).toBe(false);
  });
});

describe("rejectSubmissionSchema", () => {
  it("accepts a trimmed reason", () => {
    const result = rejectSubmissionSchema.safeParse({
      submissionId: ID,
      reason: "  duplicate of the Ile-Epo sheet  ",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.reason).toBe("duplicate of the Ile-Epo sheet");
  });

  it("refuses a missing, empty or whitespace reason (P1.4)", () => {
    for (const bad of [undefined, "", "   "]) {
      const result = rejectSubmissionSchema.safeParse({ submissionId: ID, reason: bad });
      expect(result.success, String(bad)).toBe(false);
    }
  });
});
