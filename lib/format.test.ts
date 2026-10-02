import { describe, expect, it } from "vitest";
import {
  formatCollectedAt,
  formatElapsed,
  formatHours,
  formatNaira,
  formatPercent,
  formatWeek,
} from "./format";

const now = new Date("2026-09-03T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("formatElapsed", () => {
  it("says 'just now' inside the first minute", () => {
    expect(formatElapsed(ago(0), now)).toBe("just now");
    expect(formatElapsed(ago(59_000), now)).toBe("just now");
  });

  it("counts whole minutes up to the hour", () => {
    expect(formatElapsed(ago(60_000), now)).toBe("1 min ago");
    expect(formatElapsed(ago(14 * 60_000), now)).toBe("14 min ago");
    expect(formatElapsed(ago(59 * 60_000), now)).toBe("59 min ago");
  });

  it("switches to hours at the hour", () => {
    expect(formatElapsed(ago(60 * 60_000), now)).toBe("1 h ago");
    expect(formatElapsed(ago(23 * 3_600_000), now)).toBe("23 h ago");
  });

  it("switches to days at the day, and singularises one", () => {
    expect(formatElapsed(ago(86_400_000), now)).toBe("1 day ago");
    expect(formatElapsed(ago(3 * 86_400_000), now)).toBe("3 days ago");
  });

  it("names a future timestamp rather than smoothing it to 'just now'", () => {
    expect(formatElapsed(new Date(now.getTime() + 3_600_000), now)).toBe("clock ahead");
  });

  it("tolerates sub-minute skew without crying about it", () => {
    expect(formatElapsed(new Date(now.getTime() + 5_000), now)).toBe("just now");
  });
});

describe("formatHours", () => {
  it("keeps a decimal below ten hours, drops it above", () => {
    expect(formatHours(3.25)).toBe("3.3 h");
    expect(formatHours(9.9)).toBe("9.9 h");
    expect(formatHours(26.4)).toBe("26 h");
  });
});

describe("formatPercent", () => {
  it("renders whole percentages", () => {
    expect(formatPercent(0.9)).toBe("90%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatNaira", () => {
  it("groups thousands and never shows decimals (§2.6)", () => {
    expect(formatNaira(95_000)).toBe("₦95,000");
    expect(formatNaira(1_234_567)).toBe("₦1,234,567");
  });

  it("uses the same shape below a thousand", () => {
    expect(formatNaira(850)).toBe("₦850");
  });

  it("rounds rather than exposing kobo", () => {
    expect(formatNaira(95_000.4)).toBe("₦95,000");
    expect(formatNaira(95_000.6)).toBe("₦95,001");
  });

  it("renders a null price as an em dash, never as zero (P2.1)", () => {
    expect(formatNaira(null)).toBe("—");
  });

  it("distinguishes a real zero from a missing figure", () => {
    // 0 is a legitimate submitted price (given away, promotional) and both price columns
    // check `>= 0`, so it must render as a price and not collapse into the null branch.
    expect(formatNaira(0)).toBe("₦0");
  });

  it("renders a non-finite value as absent rather than '₦NaN'", () => {
    expect(formatNaira(Number.NaN)).toBe("—");
    expect(formatNaira(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("signs a negative outside the symbol", () => {
    expect(formatNaira(-500)).toBe("-₦500");
  });
});

describe("formatWeek", () => {
  it("writes an absolute period with its date range (§2.6, P2.7)", () => {
    // 27 July 2026 is a Monday. The architecture doc draws this row as "28 Jul – 3 Aug
    // 2026", which is one day out against the real 2026 calendar — the specs' numbers are
    // illustrative drawings, not data, and copying one into a test would bake in the error.
    expect(formatWeek(2026, 31)).toBe("Week 31 · 27 Jul – 2 Aug 2026");
  });

  it("prints the year once when the week sits inside one year", () => {
    expect(formatWeek(2026, 36)).toBe("Week 36 · 31 Aug – 6 Sep 2026");
  });

  it("prints BOTH years when the week straddles a year boundary", () => {
    // A single trailing year would claim 29 Dec belongs to 2026. It does not.
    expect(formatWeek(2026, 1)).toBe("Week 1 · 29 Dec 2025 – 4 Jan 2026");
    expect(formatWeek(2026, 53)).toBe("Week 53 · 28 Dec 2026 – 3 Jan 2027");
  });

  it("keeps every month abbreviation at three characters", () => {
    // en-GB renders September as "Sept", which jogs a tabular column. Week 36 of 2026 is
    // the one that would expose it.
    expect(formatWeek(2026, 36)).toContain("Sep ");
    expect(formatWeek(2026, 36)).not.toContain("Sept");
  });

  it("refuses a week its year does not have", () => {
    expect(() => formatWeek(2025, 53)).toThrow(/2025 has 52 weeks/);
  });
});

describe("formatCollectedAt", () => {
  it("states the collection date and site together (P1.6, §2.6)", () => {
    expect(formatCollectedAt("2026-07-30", "Ile-Epo")).toBe("Collected 30 Jul 2026 · Ile-Epo");
  });

  it("carries the year, because a price period is never relative (P2.7)", () => {
    expect(formatCollectedAt("2025-12-29", "Mile 12")).toBe("Collected 29 Dec 2025 · Mile 12");
  });
});
