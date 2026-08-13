import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Scrim } from "./scrim";

describe("Scrim", () => {
  it("applies the shared .scrim gradient class", () => {
    const html = renderToStaticMarkup(<Scrim />);
    expect(html).toContain("scrim");
  });
});
