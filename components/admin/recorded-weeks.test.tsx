import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordedWeeks, gapBefore } from "./recorded-weeks";
import type { RecordedWeek } from "../../lib/queries/price-review";

function week(isoYear: number, isoWeek: number, price: number, weeksBefore: number): RecordedWeek {
  return {
    isoYear,
    isoWeek,
    price,
    currency: "NGN",
    collectedOn: "2026-09-09",
    siteName: "Ile-Epo",
    weeksBefore,
  };
}

describe("gapBefore", () => {
  it("reports no gap between adjacent weeks", () => {
    const weeks = [week(2026, 37, 1, 1), week(2026, 36, 2, 2), week(2026, 35, 3, 3)];
    expect([0, 1, 2].map((index) => gapBefore(weeks, index))).toEqual([0, 0, 0]);
  });

  it("counts the unpublished weeks between the submission and the newest entry", () => {
    // Submission in week 38, newest published week is 34 — so 35, 36 and 37 have no price.
    const weeks = [week(2026, 34, 1, 4)];
    expect(gapBefore(weeks, 0)).toBe(3);
  });

  it("counts the unpublished weeks between two entries", () => {
    const weeks = [week(2026, 37, 1, 1), week(2026, 33, 2, 5)];
    expect(gapBefore(weeks, 1)).toBe(3);
  });
});

describe("RecordedWeeks", () => {
  it("says there is no published history rather than drawing blanks", () => {
    const html = renderToStaticMarkup(<RecordedWeeks weeks={[]} isoYear={2026} />);

    expect(html).toContain("No published weeks yet");
    expect(html).toContain('data-recorded-weeks="0"');
    // Three dashes would read as "three weeks were checked and found missing", which is a
    // different and false claim (P0.2).
    expect(html).not.toContain("—");
  });

  it("renders each week with its absolute ISO week and its provenance", () => {
    const html = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2026, 37, 95000, 1)]} isoYear={2026} />,
    );

    expect(html).toContain("Week 37");
    expect(html).toContain("₦95,000");
    // A price without provenance does not ship (P1.6) — the date AND the site, every time.
    expect(html).toContain("Collected 9 Sep 2026");
    expect(html).toContain("Ile-Epo");
  });

  it("DRAWS a gap rather than closing it up (P2.8)", () => {
    const html = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2026, 37, 1, 1), week(2026, 33, 2, 5)]} isoYear={2026} />,
    );

    expect(html).toContain('data-gap="3"');
    expect(html).toContain("3 weeks with no published price");
  });

  it("singularises a one-week gap", () => {
    const html = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2026, 37, 1, 1), week(2026, 35, 2, 3)]} isoYear={2026} />,
    );

    expect(html).toContain("1 week with no published price");
    expect(html).not.toContain("1 weeks with no published price");
  });

  it("prints the ISO year only for a week from a different year", () => {
    const sameYear = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2026, 37, 1, 1)]} isoYear={2026} />,
    );
    expect(sameYear).not.toContain("2026<");

    // A week 52 sitting behind a week 1 is the case that would otherwise be ambiguous — the
    // reader has no way to tell last year's week 52 from this year's without the year (P2.7).
    const acrossYears = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2025, 52, 1, 1)]} isoYear={2026} />,
    );
    expect(acrossYears).toContain("Week 52");
    expect(acrossYears).toContain("2025");
  });

  it("renders no percentage or delta of any kind", () => {
    // The arithmetic that compares two weeks — including the rule that a change across a gap
    // is labelled a two-week change — lives in lib/anomalies.ts (Stage 4, not built). A
    // component computing its own would be a second, wrong implementation of it (P2.3, P2.8).
    const html = renderToStaticMarkup(
      <RecordedWeeks weeks={[week(2026, 37, 95000, 1), week(2026, 36, 90000, 2)]} isoYear={2026} />,
    );

    expect(html).not.toContain("%");
    expect(html).not.toContain("▲");
    expect(html).not.toContain("▼");
  });
});
