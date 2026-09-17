import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { canDecidePriceSubmissions } from "../../lib/auth/roles";
import { readSessionMeta, SESSION_STATE_PATH } from "../../scripts/capture-admin-session";

/**
 * The Price radar's submission queue, rendered through the real shell with a real session.
 *
 * WHAT ONLY THIS TEST CAN CHECK. Everything in the unit suite renders a component against
 * props it supplies itself. This is the only place the queue is drawn from the DATABASE —
 * which means it is the only place that proves `price_submissions_select_staff` actually
 * permits the read, that the joins to `commodities`, `units`, `collection_sites` and
 * `collectors` come back (the last of those sits one step from PII and has bitten this
 * project before), and that a Contributor — the role CI signs in as — sees the queue at all.
 *
 * IT IS NOT AN ADMIN TEST, and the role is read rather than assumed, the same way
 * `dashboard-authenticated.spec.ts` reads it. The one assertion that VARIES with the role is
 * the decision cell, and that variation is the point of the third test below.
 *
 * NOTHING HERE APPROVES OR REJECTS ANYTHING. A decision publishes to the public price series
 * and is irreversible by design — correcting a published figure is a supersede plus a fresh
 * submission (P1.3), and a rejection is one-way. An end-to-end test that clicked Approve
 * would be writing real prices into the real series on every CI run. The refusals are
 * verified in SQL, in a rolled-back transaction, where they can be exercised exhaustively
 * without consequence; this verifies that the screen renders and that the CONTROLS are
 * correctly present or absent.
 */

const meta = readSessionMeta();

/** Evaluated at RUN time, not collection time — see the long note in the Dashboard spec. */
function hasSession(): boolean {
  return existsSync(SESSION_STATE_PATH) && readSessionMeta() !== null;
}

test.describe("Price radar, signed in", () => {
  test.skip(
    () => !hasSession(),
    "No captured session. Run `pnpm capture:session`, or set E2E_CONTRIBUTOR_* and let the setup project capture one.",
  );

  test.use({ storageState: SESSION_STATE_PATH, viewport: { width: 1440, height: 1000 } });

  test("renders the surface, and the current week's section is always present", async ({ page }) => {
    await page.goto("/admin/radar");

    // Not redirected: the middleware admits no session that has not finished what its role
    // requires, and every role that reaches this surface may see it (§7.2).
    await expect(page).toHaveURL("/admin/radar");
    await expect(page.getByRole("heading", { name: "Price radar", level: 1 })).toBeVisible();

    // The current-week section renders whether or not it has rows — either the table or the
    // collapsed line. What must NOT happen is the region vanishing, which would make an empty
    // queue and a broken query look identical.
    //
    // KEYED ON THE ID, NOT THE HEADING TEXT. The id is the section's own contract: `section`
    // carries `aria-labelledby="current-week-heading"`, so if this element is missing the
    // region has no accessible name either, which is the failure worth catching. Matching the
    // text was both weaker and wrong — the heading renders `&rsquo;`, so its accessible name
    // holds U+2019 while the selector held an ASCII apostrophe, and Playwright normalises
    // whitespace in accessible names but never punctuation. That mismatch is invisible in a
    // diff and cost a CI run.
    await expect(page.locator("#current-week-heading")).toBeVisible();

    // An unread queue must never be drawn as an empty one (P0.2). Its absence here is the
    // assertion that the read genuinely succeeded.
    await expect(page.locator("[data-queue-unavailable]")).toHaveCount(0);

    // P12.5: no public chrome anywhere in the control room.
    await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
  });

  test("every rendered row carries a price, its ISO week and its provenance", async ({ page }) => {
    await page.goto("/admin/radar");

    const rows = page.locator("[data-submission]");
    const count = await rows.count();

    // The queue's contents are whatever the database holds, so this asserts a PROPERTY of
    // every row rather than a fixed number — the sixteen pending rows on disk today are data,
    // not a fact this test may hardcode (P0.2).
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);

      // An absolute ISO week on the row itself (P2.7) — never a relative "last week".
      await expect(row).toHaveAttribute("data-iso-week", /^\d{4}-W\d{1,2}$/);

      // A price and its provenance, together (P1.6). "Collected" appears once for the
      // submitted figure and once per published week beside it.
      await expect(row).toContainText("₦");
      await expect(row).toContainText("Collected");
      await expect(row).toContainText("Week ");

      // Nothing is invented where there is no history. `price_observations` is empty today,
      // so every row says so rather than drawing three zeroes (P0.2, P2.8).
      const recorded = row.locator("[data-recorded-weeks]");
      await expect(recorded).toHaveCount(1);
    }
  });

  test("the decision controls match the role this session actually holds", async ({ page }) => {
    await page.goto("/admin/radar");

    const rows = page.locator("[data-submission]");
    const count = await rows.count();
    test.skip(count === 0, "No pending submissions in this database, so there is no decision cell to inspect.");

    const mayDecide = canDecidePriceSubmissions(meta?.role ?? "analyst");
    const approve = page.locator('[data-action="approve"]');
    const readOnly = page.locator('[data-decision="read-only"]');

    if (mayDecide) {
      await expect(approve).toHaveCount(count);
      await expect(page.locator('[data-action="edit"]')).toHaveCount(count);
      await expect(page.locator('[data-action="reject"]')).toHaveCount(count);
      await expect(readOnly).toHaveCount(0);
    } else {
      // THE HALF THAT CARRIES THE WEIGHT, and the one CI actually runs: a Contributor sees
      // every row and is offered no way to decide any of it (confirmed intended, §7.2). The
      // database refuses them regardless — `approve_price_submission()` checks the caller and
      // no signed-in role holds UPDATE on the table — so this is the third layer, not the
      // only one. It is still worth asserting: a button that refuses is a worse screen than
      // no button, and its absence is the evidence the role reached the renderer.
      await expect(approve).toHaveCount(0);
      await expect(page.locator('[data-action="edit"]')).toHaveCount(0);
      await expect(page.locator('[data-action="reject"]')).toHaveCount(0);
      await expect(readOnly).toHaveCount(count);
      await expect(readOnly.first()).toContainText("An admin or editor approves prices");
    }
  });

  test("the sidebar badge counts what the queue is showing", async ({ page }) => {
    await page.goto("/admin/radar");

    const rows = await page.locator("[data-submission]").count();
    const nav = page.getByRole("navigation", { name: "Control room" });
    const badge = nav.getByRole("link", { name: /Price radar/ }).locator(".queue-count");

    // The badge counts PENDING SUBMISSIONS as of 2026-09-17 — not anomalies, which Stage 4
    // has not built and which therefore made it read 0 over a full queue. The two numbers are
    // read from the same table by two different queries, so this is a real cross-check: it
    // catches the badge and the page disagreeing about what is waiting.
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText(String(rows));

    // A dash means the count could not be read, which is a different claim from zero.
    await expect(nav.getByText("The count could not be read.")).toHaveCount(0);
  });

  test("screenshot of the rendered radar", async ({ page }) => {
    await page.goto("/admin/radar");
    await expect(page.getByRole("heading", { name: "Price radar", level: 1 })).toBeVisible();
    await page.screenshot({
      path: `test-results/radar-${meta?.role ?? "unknown"}.png`,
      fullPage: true,
    });
  });
});
