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
 * spec goes on using it.
 */
setup("capture a Contributor session", async ({ baseURL }) => {
  const email = process.env.E2E_CONTRIBUTOR_EMAIL;
  const password = process.env.E2E_CONTRIBUTOR_PASSWORD;

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
