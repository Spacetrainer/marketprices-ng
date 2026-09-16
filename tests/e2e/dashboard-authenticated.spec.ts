import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN_ROOT_PATH } from "../../lib/constants";
import { ADMIN_SURFACES, visibleSurfaces } from "../../lib/auth/surfaces";
import {
  readSessionMeta,
  SESSION_STATE_PATH,
} from "../../scripts/capture-admin-session";

/**
 * The Dashboard as a signed-in member of staff actually sees it.
 *
 * Everything else in this suite tests the control room from outside the door: the guard
 * redirects, the login steps, a component mounted on its own. This is the only test that
 * renders the real page through the real shell with a real session, which makes it the only
 * place several claims can actually be checked rather than reasoned about — that the badges
 * read a measured 0 rather than an unavailable dash (which is what a failed RLS read would
 * produce), and that the three honest-unknown states survive the trip through the database
 * and into the DOM.
 *
 * IT IS NOT AN ADMIN TEST. The session it runs against is whichever one was captured: a
 * Contributor in CI (`tests/e2e/auth.setup.ts`), typically an Admin locally
 * (`pnpm capture:session`). The Zone 1 and Zone 2 assertions hold identically for both —
 * every policy those figures pass through gates on `is_staff()`, which is role-agnostic by
 * design (0008) — so the ONLY thing that varies is the sidebar, and that is read from the
 * role rather than assumed. See the note at SURFACES.
 *
 * It needs a captured session. That session expires, so this skips rather than fails when it
 * is absent — a missing local credential is not a broken build. In CI the setup project is a
 * hard dependency, so a failed login fails the run instead of skipping it.
 */

const meta = readSessionMeta();

/**
 * The guard, which now asks only whether there is a session to use.
 *
 * It used to require `aal === "aal2"`, and that was the wrong question twice over. It is not
 * NECESSARY — a Contributor has no mandatory second factor (P9.4), so aal1 is a complete
 * session for that role and the guard skipped the very runs it was added to enable. And it
 * was never SUFFICIENT — an expired token still reads `aal2`, so the stale file it was meant
 * to catch sailed straight past it into six confusing redirect failures.
 *
 * The real predicate is "would the middleware admit this session", and `captureSession` has
 * already answered it, from the inside, with the role in hand: it refuses to write either
 * file unless the Dashboard shell genuinely rendered. So the presence of BOTH files is the
 * assertion, and there is one statement of the 2FA rule in this codebase rather than three.
 *
 * IT MUST BE A FUNCTION, AND IT MUST BE PASSED TO `test.skip` AS A CALLBACK. Playwright
 * evaluates the value form of `test.skip(condition, …)` during the COLLECTION pass, which
 * runs before the `setup` project it depends on. On a fresh runner there is no `auth.json`
 * at that moment, so the skip was decided — and frozen — before the login that creates the
 * file had happened, and the suite skipped itself every time despite setup then succeeding.
 * It only ever passed locally because a session captured by an earlier `pnpm capture:session`
 * was already sitting on disk when collection ran. The callback form is evaluated at run
 * time, after the dependency has finished, which is the only moment the question has a
 * meaningful answer.
 */
function hasSession(): boolean {
  return existsSync(SESSION_STATE_PATH) && readSessionMeta() !== null;
}

/**
 * What the sidebar should hold for the role that was actually captured.
 *
 * Derived, not hardcoded to six. That is the honest form of the §7.2 claim: the assertion is
 * that the SERVER read a real `profiles` row and rendered the nav for that role — an
 * end-to-end binding from database to DOM that `components/admin/sidebar.test.tsx` cannot
 * make against a role it passes in itself. HIDDEN is the half that carries the weight: for a
 * Contributor it is exactly `Settings`, and proving it absent is proving the role reached the
 * renderer at all.
 *
 * Empty when there is no session, which is unreachable — the describe skips first.
 *
 * Module scope is safe here even though the guard above is not, and the difference is worth
 * stating. Playwright loads this file twice: once to collect, and again inside the worker
 * that runs the tests. Only the worker's load matters for these three, and it happens after
 * `setup` has written both files — so `meta` is the role that was actually captured, not the
 * `null` collection saw on a cold runner. What could not survive at module scope was the
 * SKIP, because a modifier is read from the collection pass and never revisited.
 */
const SURFACES = meta ? visibleSurfaces(meta.role) : [];
const HIDDEN = ADMIN_SURFACES.filter((surface) => !SURFACES.includes(surface));
const BADGED = SURFACES.filter((surface) => surface.badge !== null);

test.describe("Dashboard, signed in", () => {
  test.skip(
    () => !hasSession(),
    "No captured session. Run `pnpm capture:session`, or set E2E_CONTRIBUTOR_* and let the setup project capture one.",
  );

  test.use({ storageState: SESSION_STATE_PATH, viewport: { width: 1440, height: 1000 } });

  test("renders the shell, both zones, and this role's nav items", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);

    // Not redirected. The middleware admits no session that has not finished whatever its
    // role requires, so simply being here is the assertion that the whole guard chain passed.
    await expect(page).toHaveURL(ADMIN_ROOT_PATH);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Control room" });
    await expect(nav.getByRole("link")).toHaveCount(SURFACES.length);

    for (const surface of SURFACES) {
      await expect(nav.getByRole("link", { name: new RegExp(surface.label) })).toHaveCount(1);
    }

    // The half that actually tests the role. A hidden nav item is not a closed door, but it
    // IS the visible evidence that `visibleSurfaces(role)` ran on the server against the role
    // this session really holds — for a Contributor that means Settings is absent (§7.2).
    for (const surface of HIDDEN) {
      await expect(nav.getByRole("link", { name: new RegExp(surface.label) })).toHaveCount(0);
    }

    // Every role can see the Dashboard, so this one is unconditional.
    await expect(
      nav.getByRole("link", { name: /Dashboard/ }),
    ).toHaveAttribute("aria-current", "page");

    // P12.5: no public chrome anywhere in the control room.
    await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
  });

  test("badges read a measured zero, not an unavailable dash", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);
    const nav = page.getByRole("navigation", { name: "Control room" });

    // §7.5 badges Signal feed, Price radar, Draft studio and Publish queue; Dashboard and
    // Settings carry none. Counted from the role's own surfaces so the number follows the
    // sidebar — it is four for Admin and four for Contributor, since the only item a
    // Contributor loses is the unbadged one. `queue-count` is only on NavBadge's known arm.
    await expect(nav.locator(".queue-count")).toHaveCount(BADGED.length);
    await expect(nav.locator(".queue-count")).toHaveText(BADGED.map(() => "0"));

    // The distinction this test exists for. An RLS denial and an empty table both count 0
    // rows, but a FAILED read returns an unavailable measure and renders a dash with this
    // note. Its absence is what proves the count came back through a permitting policy.
    await expect(nav.getByText("The count could not be read.")).toHaveCount(0);
  });

  test("Zone 1 shows six cards and stays expanded on the unknown", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);

    const cards = page.locator("[data-card]");
    await expect(cards).toHaveCount(6);

    // Five measured zeroes.
    for (const id of [
      "ready",
      "needs-work",
      "going-out-today",
      "hot-signals",
      "critical-anomalies",
    ]) {
      const card = page.locator(`[data-card="${id}"]`);
      await expect(card).toHaveAttribute("data-measure", "known");
      await expect(card.locator(".queue-count")).toHaveText("0");
    }

    // …and one honest unknown, which is why the zone does not collapse. Five zeroes plus an
    // unknown is not "Nothing needs you right now" (P0.2, P4.4).
    const dispatch = page.locator('[data-card="dispatch-failures"]');
    await expect(dispatch).toHaveAttribute("data-measure", "unavailable");
    await expect(dispatch).toContainText("Not connected yet");
    await expect(dispatch).toContainText(
      "The dispatch queue lives outside this database.",
    );

    await expect(page.locator("[data-collapsed]")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    await expect(page.getByText("Nothing needs you right now.")).toHaveCount(0);
  });

  test("Zone 2 renders six readouts, including the two with no honest figure", async ({
    page,
  }) => {
    await page.goto(ADMIN_ROOT_PATH);

    const readouts = page.locator("[data-readout]");
    await expect(readouts).toHaveCount(6);

    for (const id of [
      "last-news-sync",
      "last-price-sync",
      "items-ingested",
      "verification-pass-rate",
      "cycle-time",
      "weekly-mix",
    ]) {
      await expect(page.locator(`[data-readout="${id}"]`)).toHaveCount(1);
    }

    // The two slots that are built but deliberately uncomputed, reaching the DOM intact.
    await expect(page.locator('[data-readout="verification-pass-rate"]')).toContainText(
      "Awaiting definition",
    );
    await expect(page.locator('[data-readout="weekly-mix"]')).toContainText(
      "Counted, not compared",
    );

    // An empty database has no sync to report, and the sidebar says so rather than
    // inventing a time. "Next price sync" stays absent while no job is registered.
    await expect(page.getByText("No sync yet")).toBeVisible();
    await expect(page.getByText("Next price sync")).toHaveCount(0);
  });

  test("no queue card overflows its box on the real page", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);
    await expect(page.locator("[data-card]")).toHaveCount(6);

    // The same layout contract dashboard-queue-card.spec.ts holds against the component in
    // isolation, re-checked here against the real shell — the shell owns the width, and a
    // change to the sidebar or the main padding would break the cards without touching them.
    const metrics = await page.evaluate(() =>
      [...document.querySelectorAll("[data-card]")].map((el) => ({
        card: el.getAttribute("data-card") ?? "",
        overflowPx: el.scrollHeight - el.clientHeight,
        figureTop: Math.round(
          el.children[0].getBoundingClientRect().top - el.getBoundingClientRect().top,
        ),
      })),
    );

    for (const card of metrics) {
      expect(card.overflowPx, `${card.card} overflows its card`).toBe(0);
    }
    expect(new Set(metrics.map((m) => m.figureTop))).toHaveProperty("size", 1);
  });

  /**
   * The same hierarchy dashboard-queue-card.spec.ts holds against the mounted component,
   * re-checked on the real page — where the defect was actually spotted. The component test
   * borrows the login screen's stylesheet; only this one proves the Dashboard's own render
   * carries the same computed weight and colour.
   */
  test("Dispatch failures leads with its value, not with its name", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);
    await expect(page.locator("[data-card]")).toHaveCount(6);

    const read = await page.evaluate(() => {
      const style = (el: Element | null | undefined) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { weight: Number(cs.fontWeight), color: cs.color };
      };
      const dispatch = document.querySelector('[data-card="dispatch-failures"]');
      const measured = document.querySelector('[data-card="ready"]');
      return {
        value: style(dispatch?.children[0].querySelector("span")),
        name: style(dispatch?.children[1].querySelector("span")),
        digit: style(measured?.querySelector(".queue-count")),
        digitName: style(measured?.children[1].querySelector("span")),
      };
    });

    // "Not connected yet" wears the digit's weight and colour; "Dispatch failures" wears the
    // caption every other card's name wears. Size is the one thing the value cannot borrow —
    // --fs-queue does not fit a fifteen-character phrase in this box.
    expect(read.value?.weight).toBe(read.digit?.weight);
    expect(read.value?.color).toBe(read.digit?.color);
    expect(read.name).toEqual(read.digitName);
    expect(read.value?.weight).toBeGreaterThan(read.name?.weight ?? 0);
  });

  test("screenshot of the rendered Dashboard", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);
    await expect(page.locator("[data-card]")).toHaveCount(6);
    await expect(page.locator("[data-readout]")).toHaveCount(6);
    // Named for the role, because the sidebar differs between them and an image filed under
    // the wrong role is worse than no image.
    await page.screenshot({
      path: `test-results/dashboard-${meta?.role ?? "unknown"}.png`,
      fullPage: true,
    });
  });
});
