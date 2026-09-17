import { defineConfig } from "@playwright/test";

/**
 * The specs that need a real session, and the setup project that produces it.
 *
 * Matched on the `-authenticated.spec.ts` SUFFIX rather than named one by one. The naming
 * convention is the enrolment: a new signed-in suite joins the `authenticated` project by
 * being called the right thing, instead of by someone remembering to edit two lists here. The
 * failure mode that avoids is specific and quiet — a spec added to `testIgnore` but not to
 * `testMatch` runs nowhere at all and reports green.
 */
const AUTHENTICATED_SPEC = /-authenticated\.spec\.ts$/;
const SETUP_SPEC = /auth\.setup\.ts$/;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
  },
  /**
   * Three projects, split on one question: does this test need to be signed in?
   *
   * Almost nothing does. The boundary, chrome and queue-card suites all run signed out by
   * design — `dashboard-queue-card.spec.ts` says so outright, mounting the component into a
   * reachable page precisely so it runs on every job rather than only when someone can log
   * in. Keeping them in their own project means the login never becomes a dependency of the
   * checks that do not need one: `setup` can fail, and they still report.
   *
   * `authenticated` depends on `setup`, so a failed login fails the run instead of quietly
   * skipping — which is the whole point of the exercise. `setup` itself skips when no
   * credentials are present, leaving a locally captured session untouched.
   */
  projects: [
    /**
     * The setup gets its own timeout, and it is not a convenience.
     *
     * `captureSession` is written to wait up to 30s for the login to settle and a further 15s
     * for the Dashboard's nav — 45s of deliberate patience, each wait with its own error
     * message naming what did not happen ("Sign-in refused: …", "Ended at … rather than the
     * Dashboard"). Under Playwright's 30s default those messages were UNREACHABLE: the test
     * died first and reported a bare "Test timeout of 30000ms exceeded", which says nothing
     * about whether the credentials were wrong, the profile was missing or the page was
     * simply still compiling.
     *
     * That is what happened locally on 2026-09-17 — a cold `.next` made `next dev` compile
     * /admin/login and /admin on demand, the capture crossed 30s, and a perfectly good login
     * was indistinguishable from a broken one. The same command passed in 14.7s once the
     * cache was warm. CI has been passing at ~12s on a faster machine, which made a real
     * config defect look like a local quirk.
     *
     * 90s is the capture's own budget plus room for those two compilations. It raises a
     * ceiling and changes nothing about a healthy run.
     */
    { name: "setup", testMatch: SETUP_SPEC, timeout: 90_000 },
    {
      name: "public",
      // Both exclusions are needed: without them this project would re-run the authenticated
      // spec with no storageState, and run the setup as an ordinary test.
      testIgnore: [SETUP_SPEC, AUTHENTICATED_SPEC],
    },
    {
      name: "authenticated",
      testMatch: AUTHENTICATED_SPEC,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
