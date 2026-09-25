/**
 * Shared shape for the three login forms.
 *
 * This lives OUTSIDE actions.ts deliberately: a "use server" module may only export async
 * functions. Exporting this object from there compiles, then arrives as `undefined` on the
 * client and every form crashes on first render.
 */
export interface LoginFormState {
  /** Message shown above the form. Null when the last submission had no error. */
  error: string | null;
  /** Per-field validation messages, keyed by input name. */
  fieldErrors: Record<string, string>;
}

export const emptyFormState: LoginFormState = { error: null, fieldErrors: {} };
