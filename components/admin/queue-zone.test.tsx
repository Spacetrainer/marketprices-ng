import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueZone } from "./queue-zone";
import type {
  Measure,
  QueueCard as QueueCardData,
  QueueCardId,
} from "../../lib/queries/dashboard";

const IDS: QueueCardId[] = [
  "ready",
  "needs-work",
  "going-out-today",
  "dispatch-failures",
  "hot-signals",
  "critical-anomalies",
];

function cards(measures: Measure[]): QueueCardData[] {
  return IDS.map((id, index) => ({
    id,
    label: id,
    href: `/admin/${id}`,
    timeSensitive: true,
    measure: measures[index],
  }));
}

const zero: Measure = { state: "known", value: 0 };
const unknown: Measure = {
  state: "unavailable",
  label: "Not connected yet",
  note: "The dispatch queue lives outside this database.",
};

describe("QueueZone", () => {
  it("collapses to one line when all six counts are measured zeroes", () => {
    const html = renderToStaticMarkup(
      <QueueZone cards={cards(Array<Measure>(6).fill(zero))} />,
    );
    expect(html).toContain("Nothing needs you right now.");
    expect(html).toContain('data-collapsed="true"');
  });

  it("does NOT collapse on five zeroes plus one unknown", () => {
    const measures = Array<Measure>(6).fill(zero);
    measures[3] = unknown;

    const html = renderToStaticMarkup(<QueueZone cards={cards(measures)} />);

    expect(html).not.toContain("Nothing needs you right now.");
    expect(html).toContain('data-collapsed="false"');
    // …and the unmeasured card states its reason rather than showing a sixth zero.
    expect(html).toContain("Not connected yet");
  });

  it("does not collapse when any count is non-zero", () => {
    const measures = Array<Measure>(6).fill(zero);
    measures[0] = { state: "known", value: 1 };

    const html = renderToStaticMarkup(<QueueZone cards={cards(measures)} />);
    expect(html).not.toContain("Nothing needs you right now.");
  });

  it("renders all six cards when expanded", () => {
    const measures = Array<Measure>(6).fill(zero);
    measures[3] = unknown;

    const html = renderToStaticMarkup(<QueueZone cards={cards(measures)} />);
    for (const id of IDS) {
      expect(html).toContain(`data-card="${id}"`);
    }
  });
});
