"use server";

import { revalidatePath } from "next/cache";
import { readAdminSession } from "../../../../../lib/auth/session";
import { canDecidePriceSubmissions } from "../../../../../lib/auth/roles";
import {
  approveSubmission,
  rejectSubmission,
} from "../../../../../lib/queries/price-review";
import {
  approveSubmissionSchema,
  rejectSubmissionSchema,
} from "../../../../../lib/validation/price-review";
import { ADMIN_ROOT_PATH } from "../../../../../lib/constants";
import type { ReviewFormState } from "./review-state";

/**
 * The two decisions a reviewer can make about a price submission (P1.1).
 *
 * THREE LAYERS SAY NO, AND THIS IS THE FIRST OF THEM. The database is the last and the real
 * one: `approve_price_submission()` and `reject_price_submission()` read `auth.uid()` and
 * check the caller themselves, and after migration 0038 no signed-in role holds UPDATE on
 * `price_submissions` at all, so there is no path to a decision that does not pass an
 * authorisation check running as the owner. The role check below exists so a Contributor who
 * posts this action by hand gets a sentence rather than a raw Postgres exception, and so that
 * the refusal is visible in application code rather than only in SQL. It is NOT the guarantee.
 *
 * A SERVER ACTION IS A PUBLIC HTTP ENDPOINT. Next.js exposes every exported action at a
 * generated route, so "the button is hidden" secures nothing — the session is re-read here on
 * every call rather than trusted from the page that rendered the form.
 */

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/**
 * Who is asking, and may they decide?
 *
 * Returns null when they may. The deactivated and half-authenticated cases are covered by the
 * middleware and the shell layout before a page renders, but an action can be called without
 * either having run, so the full predicate is repeated rather than assumed.
 */
async function refuseUnlessDecider(): Promise<ReviewFormState | null> {
  const session = await readAdminSession();

  if (session.type !== "staff" || !session.account.isActive) {
    return {
      error: "Your session has ended. Sign in again.",
      fieldErrors: {},
      done: null,
    };
  }

  if (!canDecidePriceSubmissions(session.account.role)) {
    return {
      error:
        "Only an admin or editor can decide a price submission. You can see the whole queue; approving a price publishes it, and that is not yours to do.",
      fieldErrors: {},
      done: null,
    };
  }

  return null;
}

/**
 * Both surfaces that count this work have to be told.
 *
 * The radar redraws the queue; the Dashboard's sidebar badge counts pending submissions, and
 * it is rendered by the SHELL layout, so every admin screen carries a stale count until the
 * layout re-renders. `/admin` covers the layout because the shell wraps it.
 */
function revalidateQueue(): void {
  revalidatePath("/admin/radar");
  revalidatePath(ADMIN_ROOT_PATH);
}

/** Approve, or edit-and-approve. Publishes the observation in the same transaction (P1.1). */
export async function approveSubmissionAction(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const refusal = await refuseUnlessDecider();
  if (refusal) return refusal;

  const parsed = approveSubmissionSchema.safeParse({
    submissionId: formData.get("submissionId"),
    correctedPrice: formData.get("correctedPrice"),
    correctionReason: formData.get("correctionReason"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsOf(parsed.error.issues), done: null };
  }

  const result = await approveSubmission(parsed.data);

  if (!result.ok) {
    // The database's own sentence, carried through. Those messages name the rule and the way
    // out ("correcting it is supersede_price_observation() plus a new submission"), which is
    // more use to a reviewer than anything this layer could put in its place.
    return { error: result.message, fieldErrors: {}, done: null };
  }

  revalidateQueue();

  return {
    error: null,
    fieldErrors: {},
    done:
      parsed.data.correctedPrice === null
        ? "Approved and published."
        : "Approved with your corrected price and published. The submitted figure is kept on the record.",
  };
}

/** Reject with a mandatory reason (P1.4). Publishes nothing, and deletes nothing. */
export async function rejectSubmissionAction(
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  const refusal = await refuseUnlessDecider();
  if (refusal) return refusal;

  const parsed = rejectSubmissionSchema.safeParse({
    submissionId: formData.get("submissionId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsOf(parsed.error.issues), done: null };
  }

  const result = await rejectSubmission(parsed.data);

  if (!result.ok) {
    return { error: result.message, fieldErrors: {}, done: null };
  }

  revalidateQueue();

  return {
    error: null,
    fieldErrors: {},
    // Says what did NOT happen as well as what did, because "rejected" is ambiguous about
    // whether the row survives. It does: nothing is ever hard-deleted from this table (0009),
    // and the retained row with its reason is what makes a collector's accuracy score
    // defensible later (P1.2).
    done: "Rejected. Nothing was published, and the submission is kept with your reason on it.",
  };
}
