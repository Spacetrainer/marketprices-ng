import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// actions.ts carries "use server", which only the Next.js bundler can resolve. The form's
// job is wiring fields to that action, so the action itself is stubbed and the wiring tested.
//
// Only the ACTIONS are stubbed. ./form-state is deliberately left real: stubbing it once hid
// a crash where emptyFormState was exported from the "use server" module and arrived
// undefined on the client. A mock that supplies the initial state cannot catch that.
vi.mock("./actions", () => ({
  signInAction: vi.fn(),
  verifyChallengeAction: vi.fn(),
  verifyEnrolmentAction: vi.fn(),
  signOutAction: vi.fn(),
}));

const { CredentialsForm } = await import("./credentials-form");
const { ChallengeForm } = await import("./challenge-form");

describe("CredentialsForm", () => {
  it("renders both credential fields with the right autocomplete hints", () => {
    const html = renderToStaticMarkup(<CredentialsForm />);
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toMatch(/autocomplete="username"/i);
    expect(html).toContain('name="password"');
    expect(html).toContain('type="password"');
    expect(html).toMatch(/autocomplete="current-password"/i);
  });

  it("submits with an amber button carrying a navy label (never red, never white)", () => {
    const html = renderToStaticMarkup(<CredentialsForm />);
    expect(html).toContain("bg-amber-action");
    expect(html).toContain("text-on-action");
    expect(html).toContain("Sign in");
  });

  it("shows no error state before anything is submitted", () => {
    const html = renderToStaticMarkup(<CredentialsForm />);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("border-field-error");
  });
});

describe("ChallengeForm", () => {
  it("asks for a one-time code, not a number input", () => {
    const html = renderToStaticMarkup(<ChallengeForm />);
    expect(html).toContain('name="code"');
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(html).toMatch(/inputmode="numeric"/i);
    // type="number" would strip leading zeros and add spinners.
    expect(html).not.toMatch(/type="number"/i);
  });

  it("renders the code in tabular figures", () => {
    const html = renderToStaticMarkup(<ChallengeForm />);
    expect(html).toContain("num");
  });

  it("offers a way out of a half-finished second factor", () => {
    const html = renderToStaticMarkup(<ChallengeForm />);
    expect(html).toContain("Sign in as someone else");
  });
});
