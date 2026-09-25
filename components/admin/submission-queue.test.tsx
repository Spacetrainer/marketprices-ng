import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueCollapsed, SubmissionQueue } from "./submission-queue";
import type { PendingSubmission } from "../../lib/queries/price-review";

function submission(overrides: Partial<PendingSubmission> = {}): PendingSubmission {
  return {
    id: "1648ba35-0600-47f8-b0c2-8fcad96083d3",
    isoYear: 2026,
    isoWeek: 38,
    commodityName: "Yam",
    unitName: "Tuber",
    variety: null,
    tier: "retail",
    price: 4000,
    currency: "NGN",
    collectedOn: "2026-09-16",
    siteName: "Ile-Epo",
    collectorName: "A. Collector",
    submittedAt: "2026-09-16T10:00:00Z",
    source: "form",
    notes: null,
    photoUrl: null,
    flags: ["new_series"],
    recentWeeks: [],
    ...overrides,
  };
}

const decision = () => <span data-test-decision>decision</span>;

describe("SubmissionQueue", () => {
  it("renders a real table with a caption and column headers", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        submissions={[submission()]}
        caption="Price submissions awaiting review"
        renderDecision={decision}
      />,
    );

    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    expect(html).toContain("Price submissions awaiting review");
    expect(html).toContain('scope="col"');
  });

  it("carries the ISO week AND the collection provenance on the submitted price", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue submissions={[submission()]} caption="c" renderDecision={decision} />,
    );

    expect(html).toContain("₦4,000");
    // Absolute period, never relative (P2.7), and the collection date and site with it (P1.6).
    expect(html).toContain("Week 38");
    expect(html).toContain("Collected 16 Sep 2026");
    expect(html).toContain("Ile-Epo");
  });

  it("states the unit, which is what keeps two prices from being compared wrongly", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue submissions={[submission()]} caption="c" renderDecision={decision} />,
    );

    expect(html).toContain("per Tuber");
  });

  it("names the collector (P1.2)", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue submissions={[submission()]} caption="c" renderDecision={decision} />,
    );

    expect(html).toContain("A. Collector");
  });

  it("tags each row with its id and its absolute ISO week", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue submissions={[submission()]} caption="c" renderDecision={decision} />,
    );

    expect(html).toContain('data-submission="1648ba35-0600-47f8-b0c2-8fcad96083d3"');
    expect(html).toContain('data-iso-week="2026-W38"');
  });

  it("delegates the decision cell entirely to its caller", () => {
    // The slot is what lets the page hand an Editor three buttons and a Contributor a
    // sentence without this component knowing anything about roles.
    const html = renderToStaticMarkup(
      <SubmissionQueue
        submissions={[submission()]}
        caption="c"
        renderDecision={() => <span data-role-specific>read only</span>}
      />,
    );

    expect(html).toContain("read only");
    expect(html).toContain("data-role-specific");
  });

  it("renders a row per submission", () => {
    const html = renderToStaticMarkup(
      <SubmissionQueue
        submissions={[
          submission({ id: "a", commodityName: "Yam" }),
          submission({ id: "b", commodityName: "Rice" }),
        ]}
        caption="c"
        renderDecision={decision}
      />,
    );

    expect(html).toContain('data-submission="a"');
    expect(html).toContain('data-submission="b"');
  });

  it("omits the variety line when there is no variety, rather than printing an empty one", () => {
    const without = renderToStaticMarkup(
      <SubmissionQueue submissions={[submission()]} caption="c" renderDecision={decision} />,
    );
    const with_ = renderToStaticMarkup(
      <SubmissionQueue
        submissions={[submission({ variety: "Ofada" })]}
        caption="c"
        renderDecision={decision}
      />,
    );

    expect(with_).toContain("Ofada");
    expect(without).not.toContain("Ofada");
  });
});

describe("QueueCollapsed", () => {
  it("names the week it is making the claim about", () => {
    const html = renderToStaticMarkup(<QueueCollapsed isoYear={2026} isoWeek={38} />);

    // "Nothing is waiting" unattached to a period says nothing useful: an empty week 38 is
    // not a statement about week 37, and the reviewer needs to know which is which (P2.7).
    expect(html).toContain("Week 38");
    expect(html).toContain("2026");
    expect(html).toContain('data-queue-collapsed="true"');
  });
});
