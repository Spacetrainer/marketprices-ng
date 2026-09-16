import { defineConfig } from "@playwright/test";

/** The one spec that needs a real session, and the setup project that produces it. */
const AUTHENTICATED_SPEC = /dashboard-authenticated\.spec\.ts$/;
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
    { name: "setup", testMatch: SETUP_SPEC },
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
