import { z } from "zod";

/**
 * The validation boundary for the two price decisions (CLAUDE.md: every external input is
 * validated with Zod at the boundary).
 *
 * WHAT THIS LAYER IS FOR, AND WHAT IT IS NOT FOR. Migration 0038 makes the database the
 * authority on every one of these rules: `approve_price_submission()` refuses a blank reason,
 * a negative correction, a no-op correction and a lone reason, and five named CHECK
 * constraints refuse them again underneath it. None of that is repeated here because the
 * database might be wrong — it is repeated because a reviewer who typed a blank reason should
 * be told so by the form, in a sentence about their form, rather than by a Postgres exception
 * surfacing as a generic failure. The schema is the FIRST answer; the database is the LAST.
 *
 * THE ONE RULE THIS LAYER CANNOT CHECK is `corrected_price <> price`: the submitted price is
 * not in the form, and putting it there would mean trusting the client's copy of the figure
 * it is being compared against. That check lives where the real figure is — in the function,
 * which re-reads the submission under `for update`. The action surfaces its message.
 *
 * NO FIGURE IS PARSED LOOSELY. `z.coerce.number()` accepts `""` as 0 and `" "` as 0, which on
 * this form would publish a free yam (P0.2 — never render or store an assumed value). The
 * price is parsed from its string form explicitly and an empty field is "no correction", never
 * zero.
 */

/** A UUID as it arrives from a hidden form field. */
const submissionId = z.uuid({ message: "That submission id is not a valid id." });

/**
 * The corrected price, read from a text input.
 *
 * Absent, empty or whitespace means NO CORRECTION — the reviewer pressed Approve without
 * editing, and `null` is what the function wants. Anything else must be a finite, non-negative
 * number. 0 stays legitimate (a price of 0 is what `price >= 0` deliberately permits in both
 * price columns), which is exactly why the empty string may not be allowed to become it.
 */
const correctedPrice = z
  // `.optional()` is what makes a MISSING key legal, which a union containing `z.undefined()`
  // does not: that union accepts an explicit `undefined` value and still requires the key to
  // be present. Plain Approve posts no price field at all, so the difference is the whole
  // difference between the common path working and failing validation.
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .transform((value) => (value === "" ? null : value))
  .superRefine((value, ctx) => {
    if (value === null) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: "That is not a price. Enter a number, or leave it blank to approve as submitted." });
      return;
    }
    if (parsed < 0) {
      ctx.addIssue({ code: "custom", message: "A price cannot be negative." });
    }
  })
  .transform((value) => (value === null ? null : Number(value)));

/**
 * A reason, from a textarea. Trimmed, because a reason of three spaces is a null wearing a
 * disguise — the same call `price_submissions_correction_reason_not_blank` makes in SQL.
 */
const reason = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => (typeof value === "string" ? value.trim() : ""))
  .transform((value) => (value === "" ? null : value));

/**
 * Approve, or edit-and-approve. One schema, because they are one decision with one optional
 * edit attached — the function signature says the same thing.
 *
 * The both-or-neither refinement is `price_submissions_correction_both_or_neither` restated:
 * a changed price with no stated reason cannot be defended to the collector it contradicts,
 * and a reason attached to nothing is noise.
 */
export const approveSubmissionSchema = z
  .object({
    submissionId,
    correctedPrice,
    correctionReason: reason,
  })
  .superRefine((value, ctx) => {
    if (value.correctedPrice !== null && value.correctionReason === null) {
      ctx.addIssue({
        code: "custom",
        path: ["correctionReason"],
        message:
          "Say why you changed it. The submitted price is what the collector reported, and the record has to say why it was not the one published.",
      });
    }
    if (value.correctedPrice === null && value.correctionReason !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["correctedPrice"],
        message: "You gave a reason but no new price. Enter the corrected price, or clear the reason.",
      });
    }
  });

export type ApproveSubmissionInput = z.infer<typeof approveSubmissionSchema>;

/**
 * Reject. The reason is mandatory and always has been (P1.4, enforced as a table CHECK since
 * 0009) — this is the first place a human hears about it rather than the last.
 */
export const rejectSubmissionSchema = z.object({
  submissionId,
  reason: z
    .string({ message: "A rejection needs a reason." })
    .trim()
    .min(1, "Say why you are rejecting it. A rejected price with no reason cannot be explained to the collector who reported it."),
});

export type RejectSubmissionInput = z.infer<typeof rejectSubmissionSchema>;
