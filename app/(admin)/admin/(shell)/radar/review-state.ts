/**
 * Shared shape for the two decision forms on the Price radar.
 *
 * Lives OUTSIDE actions.ts for the reason `app/(admin)/admin/login/form-state.ts` records: a
 * "use server" module may only export async functions. Exporting a constant from there
 * compiles, then arrives as `undefined` on the client and every form crashes on first render.
 */
export interface ReviewFormState {
  /** Message shown above the form. Null when the last submission had no error. */
  error: string | null;
  /** Per-field validation messages, keyed by input name. */
  fieldErrors: Record<string, string>;
  /**
   * What happened, on success — "Approved and published as Week 38" rather than a silent
   * re-render.
   *
   * IT MATTERS THAT THIS IS STATED. An approval publishes a price to the public series and the
   * row then vanishes from the queue on revalidation, so without a sentence the reviewer's
   * only evidence that anything happened is a row that is no longer there — which looks
   * identical to a filter, a reload, or somebody else deciding it a second earlier.
   */
  done: string | null;
}

export const emptyReviewState: ReviewFormState = {
  error: null,
  fieldErrors: {},
  done: null,
};
