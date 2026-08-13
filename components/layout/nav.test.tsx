import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Nav } from "./nav";

describe("Nav", () => {
  it("renders all seven sections and the amber dot only on Prices", () => {
    const html = renderToStaticMarkup(<Nav />);
    expect(html).toContain("Prices");
    expect(html).toContain("Production");
    expect(html).toContain("Technology");
    expect(html).toContain("Markets");
    expect(html).toContain("Government");
    expect(html).toContain("Interviews");
    expect(html).toContain("Africa");
    expect(html).toContain("bg-amber-action");
    // exactly one dot: Prices' link only
    expect(html.match(/bg-amber-action/g)).toHaveLength(1);
  });

  it("renders the mobile menu closed by default", () => {
    const html = renderToStaticMarkup(<Nav />);
    expect(html).toContain('aria-expanded="false"');
  });
});
