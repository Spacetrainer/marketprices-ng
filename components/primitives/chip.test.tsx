import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chip } from "./chip";

describe("Chip", () => {
  it("applies the section's pastel palette", () => {
    const html = renderToStaticMarkup(<Chip section="prices">Prices</Chip>);
    expect(html).toContain("bg-chip-prices-bg");
    expect(html).toContain("text-chip-prices-fg");
  });

  it("switches to the translucent surface fill on photography", () => {
    const html = renderToStaticMarkup(
      <Chip section="interviews" onPhoto>
        Interviews
      </Chip>
    );
    expect(html).toContain("bg-surface-0/92");
    expect(html).toContain("text-chip-interviews-fg");
  });
});
