import { describe, expect, it } from "vitest";
import { assuranceLevelOf } from "./capture-admin-session";

/**
 * The gate that stops a half-authenticated session being saved.
 *
 * It exists because the first version of the capture script had none: it waited on a URL
 * that Next shows transiently mid-redirect, never asked for the TOTP code, and wrote an
 * aal1 cookie while printing "success". The file then failed every authenticated test with
 * an error that pointed at the tests rather than at the capture.
 *
 * The tokens below are unsigned fabrications with nothing but the claim under test — no
 * real session, no real secret.
 */
function cookieFor(payload: Record<string, unknown>): { value: string } {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const session = JSON.stringify({ access_token: `header.${body}.signature` });
  return { value: `base64-${Buffer.from(session).toString("base64url")}` };
}

describe("assuranceLevelOf", () => {
  it("reads aal2 from a fully authenticated session", () => {
    expect(assuranceLevelOf({ cookies: [cookieFor({ aal: "aal2" })] })).toBe("aal2");
  });

  it("reads aal1 from a password-only session — the state that must be refused", () => {
    expect(assuranceLevelOf({ cookies: [cookieFor({ aal: "aal1" })] })).toBe("aal1");
  });

  it("reads a session cookie that is not base64-prefixed", () => {
    const raw = JSON.stringify({
      access_token: `header.${Buffer.from(JSON.stringify({ aal: "aal2" })).toString("base64url")}.sig`,
    });
    expect(assuranceLevelOf({ cookies: [{ value: raw }] })).toBe("aal2");
  });

  it("returns null rather than guessing when no cookie carries a session", () => {
    expect(assuranceLevelOf({ cookies: [] })).toBeNull();
    expect(assuranceLevelOf({ cookies: [{ value: "not-a-session" }] })).toBeNull();
    expect(assuranceLevelOf({ cookies: [cookieFor({ no_aal_here: true })] })).toBeNull();
  });

  it("skips unrelated cookies and finds the session among them", () => {
    expect(
      assuranceLevelOf({
        cookies: [{ value: "junk" }, { value: "{}" }, cookieFor({ aal: "aal2" })],
      }),
    ).toBe("aal2");
  });
});
