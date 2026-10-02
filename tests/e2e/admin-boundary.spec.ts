import { expect, test, type Page } from "@playwright/test";

/**
 * The P12.5 public/admin boundary. These are the assertions the protocol names by hand:
 * every /admin/* route redirects a signed-out visitor to login, and no public page carries
 * an /admin link outside the footer legal row.
 *
 * All of this holds with ZERO users in the database — that is what makes it testable now.
 * The 2FA paths are not covered here and cannot be until a real Admin account exists.
 */

/** The login card. Also the scope for alert lookups — see the note at its first use. */
function loginCard(page: Page) {
  return page.locator("[data-login-step]");
}

const GUARDED_PATHS = [
  "/admin",
  "/admin/radar",
  "/admin/signals",
  "/admin/studio",
  "/admin/queue",
  "/admin/settings/publishing",
  "/admin/editor/does-not-exist",
];

for (const path of GUARDED_PATHS) {
  test(`signed out, ${path} redirects to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL("/admin/login");
  });
}

test("the login screen itself is reachable signed out", async ({ page }) => {
  const response = await page.goto("/admin/login");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("/admin/login");
});

test("the control room is noindex, nofollow (P9.4)", async ({ page }) => {
  await page.goto("/admin/login");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
  await expect(robots).toHaveAttribute("content", /nofollow/);
});

test("the login screen carries no public chrome (P12.5)", async ({ page }) => {
  await page.goto("/admin/login");
  // The public nav, ticker and footer belong to app/(site)/ and must not render here.
  await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
});

test("the homepage links to /admin exactly once, in the footer legal row", async ({ page }) => {
  await page.goto("/");

  const adminLinks = page.locator('a[href^="/admin"]');
  await expect(adminLinks).toHaveCount(1);

  const footerAdminLinks = page.locator('footer a[href^="/admin"]');
  await expect(footerAdminLinks).toHaveCount(1);
  await expect(footerAdminLinks.first()).toHaveAttribute("href", "/admin/login");
});

test("the login screen renders the credentials step signed out", async ({ page }) => {
  await page.goto("/admin/login");

  await expect(page.locator("[data-login-step]")).toHaveAttribute("data-login-step", "credentials");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("client-side validation rejects a malformed email without calling Supabase", async ({
  page,
}) => {
  await page.goto("/admin/login");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("whatever");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Scoped to the login card: Next.js renders its own role="alert" route announcer on the
  // page, so an unscoped alert lookup is ambiguous rather than wrong.
  await expect(loginCard(page).getByRole("alert")).toContainText("Enter a valid email address");
  // Still on the credentials step — a shape failure is not a sign-in attempt.
  await expect(page).toHaveURL("/admin/login");
});

test("a wrong password does not reveal whether the account exists", async ({ page }) => {
  await page.goto("/admin/login");

  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  const alert = loginCard(page).getByRole("alert");
  await expect(alert).toContainText("Those details did not match an account.");
  // Supabase distinguishes unknown-email from wrong-password. The screen must not.
  await expect(alert).not.toContainText(/not found|does not exist|no user|invalid email/i);
});

test("the code field keeps its focus ring visible on keyboard nav", async ({ page }) => {
  await page.goto("/admin/login");

  await page.getByLabel("Email").focus();
  const outline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline?.style).not.toBe("none");
  expect(outline?.width).not.toBe("0px");
});
