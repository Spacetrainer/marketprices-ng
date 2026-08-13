import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceTicker } from "./price-ticker";

describe("PriceTicker", () => {
  it("renders nothing when there are no items", () => {
    const html = renderToStaticMarkup(<PriceTicker items={[]} />);
    expect(html).toBe("");
  });

  it("renders the track and direction colour when items are given", () => {
    const html = renderToStaticMarkup(
      <PriceTicker
        items={[{ id: "1", commodity: "Rice", price: "₦95,000", changeLabel: "▲ 2.4%", direction: "rise" }]}
      />
    );
    expect(html).toContain("Rice");
    expect(html).toContain("▲ 2.4%");
    expect(html).toContain("text-rise");
    expect(html).toContain("animate-[marquee_40s_linear_infinite]");
  });
});
