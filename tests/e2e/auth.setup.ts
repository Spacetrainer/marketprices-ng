import { test as setup } from "@playwright/test";
import { captureSession } from "../../scripts/capture-admin-session";

/**
 * Signs CI in, so `dashboard-authenticated.spec.ts` runs unattended instead of always skipping.
 *
 * It runs as a Playwright SETUP PROJECT rather than a separate CI step, and that placement is
 * the point: `pnpm test:e2e` owns the dev server through `webServer`, so a step outside
 * Playwright would have nothing to log in to. By the time this executes the server is up and
 * the authenticated project is waiting on it.
 *
 * The account is a Contributor (§7.2). That role never has a mandatory second factor (P9.4),
 * which is the only reason an unattended capture is possible at all — an Admin or Editor
 * would need a TOTP code and there is deliberately nothing stored anywhere that could produce
 * one. It is also why `captureSession` is called WITHOUT `requestTotpCode`: if this account
 * ever gains a factor, or is ever promoted to a role that mandates one, this fails with that
 * reason rather than hanging.
 *
 * LOCAL BEHAVIOUR IS UNCHANGED. With no credentials in the environment this skips and touches
 * nothing, so a session captured by `pnpm capture:session` is left exactly as it was and the
 * spec goes on using it. In CI, where nobody can capture one by hand, the same absence is a
 * hard failure instead — see the check in the body.
 */
setup("capture a Contributor session", async ({ baseURL }) => {
  const email = process.env.E2E_CONTRIBUTOR_EMAIL;
  const password = process.env.E2E_CONTRIBUTOR_PASSWORD;

  /**
   * In CI, absent credentials are a broken build, not a reason to stand down.
   *
   * Skipping is the right answer on a laptop and the wrong one on a runner. If these secrets
   * are ever unset, renamed, or scoped away from a fork, the skip cascades — no session is
   * captured, `dashboard-authenticated.spec.ts` skips with it, and the job reports green
   * having verified nothing about the signed-in Dashboard. That is the same false pass the
   * collection-time skip produced, arriving from a different direction, and it is worth
   * failing loudly for: CI is the only place these tests ever run unattended.
   */
  if (process.env.CI && (!email || !password)) {
    throw new Error(
      "E2E_CONTRIBUTOR_EMAIL and E2E_CONTRIBUTOR_PASSWORD must be set in CI.\n" +
        "Without them no session is captured and the authenticated Dashboard suite skips, " +
        "which would let the job pass without testing anything it was added to test.\n" +
        "Check the repository secrets of that name are present and in scope for this workflow.",
    );
  }

  setup.skip(
    !email || !password,
    "No E2E_CONTRIBUTOR_* credentials. Leaving any locally captured session alone.",
  );

  // Narrowing for TypeScript. `setup.skip()` has already stopped the run when either is
  // missing, so neither can be undefined here, but the compiler cannot see through it.
  if (!email || !password) return;

  const result = await captureSession({
    baseUrl: baseURL ?? "http://localhost:3000",
    email,
    password,
  });

  // The role is not asserted here. `captureSession` already refused anything the middleware
  // would not admit, and the spec reads the recorded role rather than assuming one — so a
  // Contributor and an Admin session both produce a correct run, and neither needs this step
  // to hold an opinion about which it got.
  console.log(
    `Captured a ${result.role} session (${result.aal}) to ${result.statePath} and ${result.metaPath}.`,
  );
});
