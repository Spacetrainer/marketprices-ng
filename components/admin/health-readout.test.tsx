import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HealthReadout } from "./health-readout";
import type { Readout } from "../../lib/queries/dashboard";

function readout(overrides: Partial<Readout> = {}): Readout {
  return {
    id: "cycle-time",
    label: "Promote to publish, median",
    value: null,
    detail: null,
    note: null,
    attention: false,
    ...overrides,
  };
}

describe("HealthReadout", () => {
  it("prints the figure and its provenance line", () => {
    const html = renderToStaticMarkup(
      <HealthReadout
        readout={readout({ value: "6.4 h", detail: "12 published in 30 days" })}
      />,
    );
    expect(html).toContain("6.4 h");
    expect(html).toContain("12 published in 30 days");
  });

  it("prints the reason, not a zero, when there is no honest figure", () => {
    const html = renderToStaticMarkup(
      <HealthReadout
        readout={readout({
          id: "verification-pass-rate",
          label: "Verification pass rate, 30d",
          note: "Awaiting definition — no first-pass signal is recorded yet.",
        })}
      />,
    );

    expect(html).toContain("Awaiting definition");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("kpi");
  });

  it("shows a counted figure alongside the note that no target exists", () => {
    const html = renderToStaticMarkup(
      <HealthReadout
        readout={readout({
          id: "weekly-mix",
          label: "This week's mix",
          value: "0 articles · 0 videos",
          detail: "Week 36 · 2026",
          note: "Counted, not compared — no weekly target is set in Settings.",
        })}
      />,
    );

    expect(html).toContain("0 articles");
    expect(html).toContain("Counted, not compared");
  });

  it("raises the amber dot only when attention is set", () => {
    const quiet = renderToStaticMarkup(
      <HealthReadout readout={readout({ value: "12 min ago" })} />,
    );
    expect(quiet).not.toContain("bg-amber-action");

    const loud = renderToStaticMarkup(
      <HealthReadout readout={readout({ value: "4 h ago", attention: true })} />,
    );
    expect(loud).toContain("bg-amber-action");
    expect(loud).toContain("Needs attention");
  });
});
