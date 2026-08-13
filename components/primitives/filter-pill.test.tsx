import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterPill } from "./filter-pill";

describe("FilterPill", () => {
  it("renders the inactive treatment by default", () => {
    const html = renderToStaticMarkup(<FilterPill>All</FilterPill>);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("border-line-200");
  });

  it("renders the active treatment in amber", () => {
    const html = renderToStaticMarkup(<FilterPill active>Staples</FilterPill>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-amber-action");
  });
});
