import { describe, expect, it } from "vitest";
import {
  shouldCollapseQueueZone,
  type Measure,
  type QueueCard,
  type QueueCardId,
} from "./dashboard";

const IDS: QueueCardId[] = [
  "ready",
  "needs-work",
  "going-out-today",
  "dispatch-failures",
  "hot-signals",
  "critical-anomalies",
];

function cards(measures: Measure[]): QueueCard[] {
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

describe("shouldCollapseQueueZone", () => {
  it("collapses on six measured zeroes", () => {
    expect(shouldCollapseQueueZone(cards(Array<Measure>(6).fill(zero)))).toBe(true);
  });

  it("refuses to collapse on five zeroes plus one unknown", () => {
    const measures = Array<Measure>(6).fill(zero);
    measures[3] = unknown;
    // "Nothing needs you right now" is a claim about all six queues. One unread queue is
    // enough to make it unsayable — an unknown is not a zero (P0.2).
    expect(shouldCollapseQueueZone(cards(measures))).toBe(false);
  });

  it("refuses to collapse when a single count is non-zero", () => {
    for (let index = 0; index < 6; index += 1) {
      const measures = Array<Measure>(6).fill(zero);
      measures[index] = { state: "known", value: 1 };
      expect(shouldCollapseQueueZone(cards(measures)), IDS[index]).toBe(false);
    }
  });

  it("refuses to collapse when every count is unknown", () => {
    expect(shouldCollapseQueueZone(cards(Array<Measure>(6).fill(unknown)))).toBe(false);
  });
});
