import { expect, test, type Page } from "@playwright/test";

const widths = [1440, 1200, 992, 768, 375] as const;

async function hasVisibleFocusRing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const style = window.getComputedStyle(el);
    return style.outlineStyle !== "none" && style.outlineWidth !== "0px";
  });
}

for (const width of widths) {
  test(`renders the chrome at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    // UtilityBar and Footer are present at every width.
    await expect(page.locator("footer")).toBeVisible();

    const desktopNav = page.getByRole("navigation", { name: "Sections" }).first();
    const menuButton = page.getByRole("button", { name: "Menu" });

    if (width >= 992) {
      await expect(desktopNav).toBeVisible();
      await expect(menuButton).toBeHidden();
    } else {
      await expect(menuButton).toBeVisible();
    }

    // No price data source exists yet — the ticker must render nothing (zero height),
    // never an empty navy band.
    await expect(page.locator(".animate-\\[marquee_40s_linear_infinite\\]")).toHaveCount(0);

    await page.screenshot({ path: `test-results/chrome-${width}.png`, fullPage: false });
  });
}

test("hamburger toggles the mobile menu below 992px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "Menu" });
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "Prices" }).first()).toBeVisible();
});

test("every interactive element shows a visible focus ring on keyboard nav", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // Tab through the first dozen or so focusable elements in the chrome (nav links, search
  // button, admin link, etc.) and confirm none of them lost their outline.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const ringed = await hasVisibleFocusRing(page);
    expect(ringed, `element #${i} after Tab has no visible focus ring`).toBe(true);
  }
});
