import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Zone 1's cards are a fixed 96px box holding variable-length text, and the `unavailable`
 * state holds three pieces where the other five hold two. That is a LAYOUT contract, and no
 * markup assertion can check it: the whole suite was green while "Not connected yet" was
 * clipped in half and the note read "...lives outside this". Only a browser can measure it.
 *
 * So this renders the real component against the app's real compiled CSS and measures it.
 * It needs no session — the Dashboard route is behind the guard, but the defect is pure CSS
 * at a given width, so mounting the component into a page that IS reachable signed out keeps
 * the check running on every CI job rather than only when someone can log in.
 *
 * The two widths are the ones that matter. 1200px is the narrowest the six-column grid ever
 * gets — below it the grid drops to three columns and the cards get wider — so it is the
 * worst case, not the 1440px design comp.
 */

const FIXTURES = join(__dirname, "fixtures");

/** See render-queue-zone.tsx for why this is a subprocess and not an import. */
const ZONE_MARKUP = execFileSync(
  "npx",
  ["tsx", join(FIXTURES, "render-queue-zone.tsx")],
  {
    encoding: "utf8",
    env: { ...process.env, TSX_TSCONFIG_PATH: join(FIXTURES, "tsconfig.jsx.json") },
  },
);

/** The shell's own wrapper classes, so the zone is measured at its real content width. */
const SHELL = (zone: string) => `
  <div class="flex min-h-screen bg-surface-50 font-ui text-fs-body leading-[1.4] text-ink-900">
    <aside class="w-[var(--admin-side)] shrink-0 bg-navy-deep"></aside>
    <main class="min-w-0 flex-1 p-sp-6">
      <div class="flex flex-col gap-sp-6">
        <h1 class="text-fs-h4 font-bold text-navy-deep">Dashboard</h1>
        ${zone}
      </div>
    </main>
  </div>`;

/**
 * Mounts the zone on a standalone document carrying the app's real stylesheets.
 *
 * It deliberately does NOT inject into a live app page. Doing that races Next's hydration,
 * which re-renders the route and silently throws the injected markup away — the first
 * version of this test passed alone and failed in a full run for exactly that reason. Here
 * the styles are borrowed from a real page and the document is then replaced wholesale, so
 * there is no client bundle left to overwrite anything.
 */
async function mountZone(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });

  // This page is visited for its compiled CSS, not its DOM. It is the one admin route
  // reachable signed out, which is what keeps this test session-free.
  await page.goto("/admin/login");
  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--navy-deep")
        .trim() !== "",
  );

  const styles = await page.evaluate(() => ({
    links: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
      (link) => link.href,
    ),
    inline: [...document.querySelectorAll("style")].map((tag) => tag.textContent ?? ""),
  }));

  await page.setContent(
    `<!doctype html><html><head>` +
      styles.links.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
      `<style>${styles.inline.join("\n")}</style>` +
      `</head><body>${SHELL(ZONE_MARKUP)}</body></html>`,
    { waitUntil: "load" },
  );

  await page.waitForFunction(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--navy-deep")
        .trim() !== "" && document.querySelectorAll("[data-card]").length === 6,
  );
}

interface CardMetrics {
  card: string;
  state: string;
  overflowPx: number;
  figureTop: number;
  labelBottom: number;
}

// 1200 is the narrowest six-column layout; 1440 is the design comp.
for (const width of [1200, 1440]) {
  test(`Zone 1 cards fit their 96px box and share a baseline at ${width}px`, async ({
    page,
  }) => {
    await mountZone(page, width);

    const metrics: CardMetrics[] = await page.evaluate(() =>
      [...document.querySelectorAll("[data-card]")].map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          card: el.getAttribute("data-card") ?? "",
          state: el.getAttribute("data-measure") ?? "",
          // The card clips with overflow-hidden, so anything over 0 is invisible text.
          overflowPx: el.scrollHeight - el.clientHeight,
          figureTop: Math.round(
            el.children[0].getBoundingClientRect().top - rect.top,
          ),
          labelBottom: Math.round(
            rect.bottom - el.children[1].getBoundingClientRect().bottom,
          ),
        };
      }),
    );

    expect(metrics).toHaveLength(6);

    for (const card of metrics) {
      // No card may hide any of its own text. This is the assertion that fails on the
      // original bug: the dispatch card overflowed by 41px and clipped at both ends.
      expect(card.overflowPx, `${card.card} overflows its card`).toBe(0);
    }

    // One figure line and one label line across the whole row, whatever each card holds.
    // Centring made these depend on whether a card's own label wrapped, which is what made
    // the row look ragged next to the broken card.
    const figureTops = new Set(metrics.map((m) => m.figureTop));
    const labelBottoms = new Set(metrics.map((m) => m.labelBottom));
    expect(figureTops, "figures do not share a baseline").toHaveProperty("size", 1);
    expect(labelBottoms, "labels do not share a baseline").toHaveProperty("size", 1);

    // The unavailable card is the one under test — prove it is actually present and in
    // that state, so a future refactor cannot make this suite pass by dropping it.
    expect(metrics.find((m) => m.card === "dispatch-failures")?.state).toBe(
      "unavailable",
    );
  });
}

/**
 * The card's visual hierarchy, measured rather than reasoned about.
 *
 * Five cards say "big bold figure, small quiet name". The unavailable card said the reverse
 * — its value was --ink-500 at 12px under a 13px near-black name, so the loudest text on the
 * card was its own caption. Class assertions cannot see that; only computed style can, which
 * is why this lives in the browser suite next to the layout contract.
 *
 * It does NOT assert the value matches the digit's 28px. It cannot: "Not connected yet" is
 * 134.6px bold at 13px against 126.7px of clear width, so --fs-meta is the largest step that
 * stays on one line. The claim here is about weight and colour, and about the value never
 * being quieter than the name beneath it.
 */
test("the unavailable card's value is emphasised over its name, as on every other card", async ({
  page,
}) => {
  await mountZone(page, 1440);

  const read = await page.evaluate(() => {
    const style = (el: Element | null | undefined) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        px: Math.round(parseFloat(cs.fontSize)),
        weight: Number(cs.fontWeight),
        color: cs.color,
      };
    };

    const dispatch = document.querySelector('[data-card="dispatch-failures"]');
    const measured = document.querySelector('[data-card="ready"]');

    return {
      // The unavailable card: figure line, then the name under it.
      value: style(dispatch?.children[0].querySelector("span")),
      name: style(dispatch?.children[1].querySelector("span")),
      // The same two slots on a measured card, which is the reference.
      digit: style(measured?.querySelector(".queue-count")),
      digitName: style(measured?.children[1].querySelector("span")),
    };
  });

  const { value, name, digit, digitName } = read;
  expect(value, "no value line on the unavailable card").not.toBeNull();
  expect(digit, "no digit on the measured card").not.toBeNull();

  // The value wears the figure's weight and colour — the two things it can borrow.
  expect(value?.weight).toBe(digit?.weight);
  expect(value?.color).toBe(digit?.color);

  // The name wears the caption, byte for byte the same one a measured card's name wears.
  expect(name).toEqual(digitName);

  // And the hierarchy itself: the value is never quieter than the name below it. This is
  // the assertion that fails on the original bug, where the value was lighter AND greyer.
  expect(value?.weight).toBeGreaterThan(name?.weight ?? 0);
  expect(name?.weight).toBeLessThan(digit?.weight ?? 0);
});

test("the unavailable card keeps all of its text inside the card", async ({ page }) => {
  // 1440, not 1200: this is the six-column width, where each card is at its narrowest and
  // the unavailable state has the least room. At 1200 the grid is three columns and the
  // cards are wide enough that even the broken layout fitted.
  await mountZone(page, 1440);

  // Geometric containment, not a text assertion. The original bug rendered every character
  // — `toContainText` passed against it — while the first and last lines sat outside the
  // card's bounds. Only comparing rectangles catches that.
  const escaped = await page.evaluate(() => {
    const card = document.querySelector('[data-card="dispatch-failures"]');
    if (!card) return ["card missing"];
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll("span")]
      .filter((span) => span.textContent?.trim())
      .filter((span) => {
        const r = span.getBoundingClientRect();
        return r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5;
      })
      .map((span) => (span.textContent ?? "").slice(0, 40));
  });
  expect(escaped, "text escapes the card's bounds").toEqual([]);

  const card = page.locator('[data-card="dispatch-failures"]');
  await expect(card).toContainText("Not connected yet");
  await expect(card).toContainText("The dispatch queue lives outside this database.");
});
