import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmissionFlags } from "./submission-flags";
import type { SubmissionFlag } from "../../lib/validation/ingest";

const ALL_FLAGS: SubmissionFlag[] = ["outlier", "new_series", "duplicate", "site_switch"];

describe("SubmissionFlags", () => {
  it("distinguishes 'checked and ordinary' from an empty cell", () => {
    const html = renderToStaticMarkup(<SubmissionFlags flags={[]} />);

    // A submission that reaches the queue unflagged means "checked and ordinary", never "not
    // checked" — the ingest route refuses the submission outright when it cannot read its
    // threshold, precisely so that distinction holds. A blank cell would erase it.
    expect(html).toContain("Checked, nothing flagged");
    expect(html).toContain('data-flags="none"');
  });

  it("renders every permitted flag with a human label", () => {
    const html = renderToStaticMarkup(<SubmissionFlags flags={ALL_FLAGS} />);

    expect(html).toContain("Outlier");
    expect(html).toContain("First price");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Site switch");
    expect(html).toContain('data-flags="outlier new_series duplicate site_switch"');
  });

  it("gives every flag a description, not just a label", () => {
    const html = renderToStaticMarkup(<SubmissionFlags flags={["new_series"]} />);

    // "First price" alone invites the reading "this is the first of something"; the sentence
    // says what was actually checked, which is that there was nothing to compare against.
    expect(html).toContain("Nothing has been published for this commodity and tier yet");
  });

  it("USES NO DIRECTION OR SEVERITY COLOUR on any flag", () => {
    // --rise and --fall mean a rising and a falling price and nothing else, and the navy
    // severity ramp is a rating lib/anomalies.ts computes (Stage 4). An intake ratio test is
    // neither, so wearing either channel would claim a measurement nobody took (P0.2, §7.4).
    for (const flag of ALL_FLAGS) {
      const html = renderToStaticMarkup(<SubmissionFlags flags={[flag]} />);
      for (const forbidden of [
        "text-rise",
        "text-fall",
        "bg-rise",
        "bg-fall",
        "sev-critical",
        "sev-high",
        "sev-moderate",
      ]) {
        expect(html, `${flag} / ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("draws every flag identically, so none reads as a rating", () => {
    const rendered = ALL_FLAGS.map((flag) =>
      renderToStaticMarkup(<SubmissionFlags flags={[flag]} />),
    );
    const classLists = rendered.map((html) => /class="([^"]*)"/.exec(html)?.[1] ?? "");

    expect(new Set(classLists.slice(1)).size).toBe(1);
    expect(classLists[0]).toBe(classLists[1]);
  });

  it("prints an unrecognised value rather than 'undefined'", () => {
    // 0009's CHECK constrains the column to four names, so this is unreachable today — but a
    // fifth flag added by a later migration should surface as itself, not as a broken chip.
    const html = renderToStaticMarkup(
      <SubmissionFlags flags={["seasonal_anomaly" as SubmissionFlag]} />,
    );

    expect(html).toContain("seasonal_anomaly");
    expect(html).not.toContain("undefined");
  });
});
