import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders the title and, when given, the descriptor", () => {
    const html = renderToStaticMarkup(
      <SectionHeader title="Food prices" descriptor="Weekly retail and wholesale prices" />
    );
    expect(html).toContain("Food prices");
    expect(html).toContain("Weekly retail and wholesale prices");
    expect(html).toContain("text-ink-900");
  });

  it("switches to on-dark colours", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Interviews" onDark />);
    expect(html).toContain("text-on-dark");
    expect(html).toContain("border-on-dark-muted");
  });

  it("omits the descriptor paragraph when none is given", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Markets" />);
    expect(html).not.toContain("<p");
  });
});
