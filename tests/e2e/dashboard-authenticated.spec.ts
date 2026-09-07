import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ADMIN_ROOT_PATH } from "../../lib/constants";
import { assuranceLevelOf } from "../../scripts/capture-admin-session";

/**
 * The Dashboard as an Admin actually sees it.
 *
 * Everything else in this suite tests the control room from outside the door: the guard
 * redirects, the login steps, a component mounted on its own. This is the only test that
 * renders the real page through the real shell with a real session, which makes it the only
 * place several claims can actually be checked rather than reasoned about — that the badges
 * read a measured 0 rather than an unavailable dash (which is what a failed RLS read would
 * produce), and that the three honest-unknown states survive the trip through the database
 * and into the DOM.
 *
 * It needs `auth.json` from `pnpm capture:session`. That session expires, so this skips
 * rather than fails when it is absent — a missing local credential is not a broken build.
 * The unattended-CI answer is a Contributor account, which needs no second factor.
 */

const AUTH_STATE = "auth.json";
const HAS_STATE = existsSync(AUTH_STATE);

/**
 * Admin and Editor require a second factor (§7.1, P9.4), so an aal1 file cannot reach any
 * surface. Naming that here turns an expired or half-finished capture into one legible line
 * instead of six redirect failures that look like the Dashboard is broken.
 */
const CAPTURED_AAL = HAS_STATE
  ? assuranceLevelOf(
      JSON.parse(readFileSync(AUTH_STATE, "utf8")) as { cookies: { value: string }[] },
    )
  : null;

test.describe("Dashboard, signed in as Admin", () => {
  test.skip(!HAS_STATE, "No captured session. Run `pnpm capture:session` first.");
  test.skip(
    HAS_STATE && CAPTURED_AAL !== "aal2",
    `Captured session is ${CAPTURED_AAL ?? "unreadable"}, not aal2 — re-run \`pnpm capture:session\`.`,
  );

  test.use({ storageState: AUTH_STATE, viewport: { width: 1440, height: 1000 } });

  test("renders the shell, both zones, and six nav items", async ({ page }) => {
    await page.goto(ADMIN_ROOT_PATH);

    // Not redirected. The middleware admits nothing below aal2 with an active profile, so
    // simply being here is the assertion that the whole guard chain passed.
    await expect(page).toHaveURL(ADMIN_ROOT_PATH);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Control room" });
    await expect(nav.getByRole("link")).toHaveCount(6);

    for (const label of [
      "Dashboard",
      "Signal feed",
      "Price radar",
      "Draft studio",
      "Publish queue",
      "Settings",
    ]) {
      await expect(nav.getByRole("link", { name: new RegExp(label) })).toHaveCount(1);
    }

    // Admin is the only role that sees all six (§7.2), and the sidebar is built from the
    // same visibleSurfaces() the route guard authorises with.
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

    // Four badges (§7.5: Signal feed, Price radar, Draft studio, Publish queue) and no
    // more. `queue-count` is only on the known arm of NavBadge.
    await expect(nav.locator(".queue-count")).toHaveCount(4);
    await expect(nav.locator(".queue-count")).toHaveText(["0", "0", "0", "0"]);

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
    await page.screenshot({
      path: "test-results/dashboard-admin.png",
      fullPage: true,
    });
  });
});
