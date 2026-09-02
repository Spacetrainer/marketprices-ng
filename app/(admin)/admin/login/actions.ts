"use server";

import { redirect } from "next/navigation";
import { ADMIN_ROOT_PATH } from "../../../../lib/constants";
import {
  credentialsSchema,
  enrolmentVerificationSchema,
  totpCodeSchema,
} from "../../../../lib/validation/credentials";
import { createClient } from "../../../../lib/supabase/server";
import type { LoginFormState } from "./form-state";

/**
 * Supabase distinguishes a wrong password from an unknown email. We do not surface that
 * distinction: it turns the login screen into an account-existence oracle.
 */
const GENERIC_CREDENTIALS_ERROR = "Those details did not match an account.";
const GENERIC_CODE_ERROR = "That code was not accepted. Codes expire every 30 seconds.";

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export async function signInAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: GENERIC_CREDENTIALS_ERROR, fieldErrors: {} };
  }

  // Straight to the Dashboard. If two-factor is still outstanding the middleware bounces
  // this back to the login screen at the right step — the guard is the single authority on
  // where a session may go, and duplicating that decision here would let the two drift.
  redirect(ADMIN_ROOT_PATH);
}

/** Verifies the code for an already-enrolled factor. Promotes the session to aal2. */
export async function verifyChallengeAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = totpCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (factorsError || !factor) {
    return { error: "No authenticator is enrolled on this account.", fieldErrors: {} };
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  });
  if (challengeError || !challenge) {
    return { error: GENERIC_CODE_ERROR, fieldErrors: {} };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: parsed.data.code,
  });
  if (verifyError) {
    return { error: GENERIC_CODE_ERROR, fieldErrors: {} };
  }

  redirect(ADMIN_ROOT_PATH);
}

/** Verifies a freshly enrolled factor, which is what makes the enrolment stick. */
export async function verifyEnrolmentAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = enrolmentVerificationSchema.safeParse({
    code: formData.get("code"),
    factorId: formData.get("factorId"),
  });
  if (!parsed.success) {
    return { error: null, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeError || !challenge) {
    return { error: GENERIC_CODE_ERROR, fieldErrors: {} };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });
  if (verifyError) {
    return { error: GENERIC_CODE_ERROR, fieldErrors: {} };
  }

  redirect(ADMIN_ROOT_PATH);
}

/** The way out of a half-finished two-factor step. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
