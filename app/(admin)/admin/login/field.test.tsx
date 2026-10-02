import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field, FormError } from "./field";

describe("Field", () => {
  it("ties the label to the input", () => {
    const html = renderToStaticMarkup(<Field label="Email" name="email" />);
    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
    expect(html).toContain('name="email"');
  });

  it("uses the resting border token when there is no error", () => {
    const html = renderToStaticMarkup(<Field label="Email" name="email" />);
    expect(html).toContain("border-field-border");
    expect(html).toContain("focus:border-field-border-focus");
    expect(html).not.toContain("border-field-error");
  });

  it("carries a focus outline, not colour alone", () => {
    const html = renderToStaticMarkup(<Field label="Email" name="email" />);
    expect(html).toContain("focus:outline-2");
    expect(html).toContain("focus:outline-field-border-focus");
  });

  it("switches to the error token and announces the message", () => {
    const html = renderToStaticMarkup(
      <Field label="Email" name="email" error="Enter a valid email address" />,
    );
    expect(html).toContain("border-field-error");
    expect(html).toContain("text-field-error");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid email address");
  });

  it("wires aria-invalid and aria-describedby only when in error", () => {
    const clean = renderToStaticMarkup(<Field label="Email" name="email" />);
    expect(clean).not.toContain("aria-invalid");
    expect(clean).not.toContain("aria-describedby");

    const errored = renderToStaticMarkup(<Field label="Email" name="email" error="Required" />);
    expect(errored).toContain('aria-invalid="true"');
    expect(errored).toContain('aria-describedby="email-error"');
    expect(errored).toContain('id="email-error"');
  });

  it("never reaches for the price-direction red", () => {
    const html = renderToStaticMarkup(<Field label="Email" name="email" error="Required" />);
    // --fall means a falling price and nothing else.
    expect(html).not.toContain("fall");
  });
});

describe("FormError", () => {
  it("renders nothing when there is no message", () => {
    expect(renderToStaticMarkup(<FormError message={null} />)).toBe("");
  });

  it("announces the message when there is one", () => {
    const html = renderToStaticMarkup(<FormError message="Those details did not match." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("text-field-error");
    expect(html).toContain("Those details did not match.");
  });
});
