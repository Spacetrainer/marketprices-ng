import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_ROOT_PATH } from "../../../../lib/constants";
import {
  resolveLoginStep,
  type LoginStep,
} from "../../../../lib/auth/access";
import { readAdminSession } from "../../../../lib/auth/session";
import { ChallengeForm } from "./challenge-form";
import { CredentialsForm } from "./credentials-form";
import { EnrolForm } from "./enrol-form";
import { SignOutLink } from "./sign-out-link";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const HEADINGS: Record<Exclude<LoginStep, "complete">, string> = {
  credentials: "Sign in",
  unprovisioned: "Your account isn\u2019t fully set up yet",
  enrol: "Set up two-factor authentication",
  challenge: "Enter your authenticator code",
};

/**
 * The one auth route (P12.1). Credentials, TOTP enrolment and the TOTP challenge are three
 * STEPS of this single route, not three routes — `ADMIN_ROUTES` allows exactly six surfaces
 * plus `login` and `editor/[id]`, and a `/admin/login/2fa` would be a ninth entry in an
 * allowlist whose whole purpose is to make additions visible.
 *
 * The step is derived on the server on every load rather than held in client state, so a
 * refresh part-way through enrolment resumes instead of stranding a half-scanned QR code.
 */
export default async function AdminLoginPage() {
  const step = resolveLoginStep(await readAdminSession());

  // Nothing left to do here. The middleware normally catches this first; this is the
  // same decision made again locally so the page is never reachable in a finished state.
  if (step === "complete") redirect(ADMIN_ROOT_PATH);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-50 px-sp-4 py-sp-12">
      <div
        data-login-step={step}
        className="w-full max-w-[420px] rounded-r-card border border-line-200 bg-surface-0 p-sp-8 shadow-rest"
      >
        <h1 className="mb-sp-6 text-fs-h4 font-bold text-navy-deep">
          {HEADINGS[step]}
        </h1>

        {step === "credentials" ? <CredentialsForm /> : null}
        {step === "unprovisioned" ? <UnprovisionedNotice /> : null}
        {step === "enrol" ? <EnrolForm /> : null}
        {step === "challenge" ? <ChallengeForm /> : null}
      </div>
    </main>
  );
}

/**
 * The signed-in-but-not-staff dead end, said out loud.
 *
 * The credentials were correct — re-rendering the sign-in form here would tell the user the
 * opposite, and they would retype a working password indefinitely. This does NOT name the
 * fix or the missing table: a stranger who guesses a password learns only that this is not
 * their account to finish, which is the same thing GENERIC_CREDENTIALS_ERROR is protecting.
 */
function UnprovisionedNotice() {
  return (
    <div className="flex flex-col gap-sp-4">
      <p className="text-fs-body text-ink-900">
        You signed in successfully, but this account has not been given access
        to the control room yet.
      </p>
      <p className="text-fs-meta text-ink-500">
        An administrator has to finish setting it up. Nothing you can do on this
        screen will complete it.
      </p>
      <SignOutLink />
    </div>
  );
}
