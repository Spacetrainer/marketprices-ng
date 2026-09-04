import { describe, expect, it } from "vitest";
import { formatElapsed, formatHours, formatPercent } from "./format";

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
