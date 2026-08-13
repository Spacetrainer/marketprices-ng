import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutlineChip } from "./outline-chip";

describe("OutlineChip", () => {
  it("renders the neutral outline treatment", () => {
    const html = renderToStaticMarkup(<OutlineChip>Nigeria</OutlineChip>);
    expect(html).toContain("border-line-300");
    expect(html).toContain("text-ink-500");
    expect(html).toContain("bg-transparent");
  });
});
