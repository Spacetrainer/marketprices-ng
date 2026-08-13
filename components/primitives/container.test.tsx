import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Container } from "./container";

describe("Container", () => {
  it("applies the container max-width and gutter tokens", () => {
    const html = renderToStaticMarkup(<Container>content</Container>);
    expect(html).toContain("var(--container)");
    expect(html).toContain("var(--gutter)");
  });
});
