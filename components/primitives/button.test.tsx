import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders the primary variant by default", () => {
    const html = renderToStaticMarkup(<Button>Submit</Button>);
    expect(html).toContain("bg-amber-action");
    expect(html).toContain("Submit");
  });

  it("renders the secondary variant", () => {
    const html = renderToStaticMarkup(<Button variant="secondary">Cancel</Button>);
    expect(html).toContain("border-line-300");
  });

  it("renders the destructive variant", () => {
    const html = renderToStaticMarkup(<Button variant="destructive">Delete</Button>);
    expect(html).toContain("border-fall");
  });

  it("renders the child element instead of a button when asChild is set", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/prices">Prices</a>
      </Button>
    );
    expect(html).toContain("<a ");
    expect(html).not.toContain("<button");
  });
});
