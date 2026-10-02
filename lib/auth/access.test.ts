import { describe, expect, it } from "vitest";
import {
  resolveAdminAccess,
  resolveLoginStep,
  SIGNED_OUT,
  UNPROVISIONED,
  type AdminSession,
  type AssuranceLevel,
} from "./access";
import type { UserRole } from "./roles";
import { ADMIN_LOGIN_PATH, ADMIN_ROOT_PATH } from "../constants";

function account(
  role: UserRole,
  currentLevel: AssuranceLevel,
  nextLevel: AssuranceLevel,
  isActive = true,
): AdminSession {
  return {
    type: "staff",
    account: { role, isActive, currentLevel, nextLevel },
  };
}

/** No verified factor: a freshly signed-in user who has never enrolled. */
const freshAdmin = account("admin", "aal1", "aal1");
/** Verified factor exists, this session has not cleared it yet. */
const challengedAdmin = account("admin", "aal1", "aal2");
const fullAdmin = account("admin", "aal2", "aal2");
const analyst = account("analyst", "aal1", "aal1");

describe("resolveLoginStep", () => {
  it("asks for credentials when there is no session", () => {
    expect(resolveLoginStep(SIGNED_OUT)).toBe("credentials");
  });

  it("names the signed-in-but-unprovisioned session instead of asking for credentials again", () => {
    expect(resolveLoginStep(UNPROVISIONED)).toBe("unprovisioned");
  });

  it("sends a first-time Admin or Editor to enrolment", () => {
    expect(resolveLoginStep(freshAdmin)).toBe("enrol");
    expect(resolveLoginStep(account("editor", "aal1", "aal1"))).toBe("enrol");
  });

  it("sends a returning Admin to the challenge", () => {
    expect(resolveLoginStep(challengedAdmin)).toBe("challenge");
  });

  it("is complete once the session reaches aal2", () => {
    expect(resolveLoginStep(fullAdmin)).toBe("complete");
  });

  it("never forces enrolment on Contributor or Analyst", () => {
    expect(resolveLoginStep(analyst)).toBe("complete");
    expect(resolveLoginStep(account("contributor", "aal1", "aal1"))).toBe(
      "complete",
    );
  });

  it("still challenges a Contributor who enrolled voluntarily", () => {
    expect(resolveLoginStep(account("contributor", "aal1", "aal2"))).toBe(
      "challenge",
    );
  });
});

describe("resolveAdminAccess", () => {
  it("ignores paths outside /admin", () => {
    expect(resolveAdminAccess("/", SIGNED_OUT)).toEqual({ type: "allow" });
    expect(resolveAdminAccess("/prices", SIGNED_OUT)).toEqual({
      type: "allow",
    });
  });

  it("does not treat a prefix collision as an admin path", () => {
    expect(resolveAdminAccess("/administration", SIGNED_OUT)).toEqual({
      type: "allow",
    });
  });

  it("redirects a signed-out visitor from every admin surface (P12.5)", () => {
    for (const path of [
      "/admin",
      "/admin/radar",
      "/admin/signals",
      "/admin/studio",
      "/admin/queue",
      "/admin/settings/publishing",
      "/admin/editor/abc",
    ]) {
      expect(resolveAdminAccess(path, SIGNED_OUT)).toEqual({
        type: "redirect",
        to: "/admin/login",
        reason: "signed-out",
      });
    }
  });

  it("lets a signed-out visitor reach the login screen", () => {
    expect(resolveAdminAccess("/admin/login", SIGNED_OUT)).toEqual({
      type: "allow",
    });
  });

  it("keeps an unprovisioned session off every admin surface", () => {
    for (const path of [
      "/admin",
      "/admin/radar",
      "/admin/settings/publishing",
      "/admin/editor/abc",
    ]) {
      expect(resolveAdminAccess(path, UNPROVISIONED)).toEqual({
        type: "redirect",
        to: "/admin/login",
        reason: "unprovisioned",
      });
    }
  });

  it("lets an unprovisioned session reach the login screen, so it can be told why", () => {
    expect(resolveAdminAccess("/admin/login", UNPROVISIONED)).toEqual({
      type: "allow",
    });
  });

  it("distinguishes unprovisioned from signed-out — the bootstrap trap", () => {
    expect(resolveAdminAccess("/admin", UNPROVISIONED)).not.toEqual(
      resolveAdminAccess("/admin", SIGNED_OUT),
    );
  });

  it("turns away a deactivated profile even at full assurance", () => {
    expect(
      resolveAdminAccess("/admin", account("admin", "aal2", "aal2", false)),
    ).toEqual({
      type: "redirect",
      to: "/admin/login",
      reason: "deactivated",
    });
  });

  it("strands an unenrolled Admin on the login screen, including the Dashboard", () => {
    expect(resolveAdminAccess("/admin", freshAdmin)).toEqual({
      type: "redirect",
      to: "/admin/login",
      reason: "enrolment-required",
    });
    expect(resolveAdminAccess("/admin/radar", freshAdmin)).toEqual({
      type: "redirect",
      to: "/admin/login",
      reason: "enrolment-required",
    });
    expect(resolveAdminAccess("/admin/login", freshAdmin)).toEqual({
      type: "allow",
    });
  });

  it("strands an Admin who has not cleared the challenge", () => {
    expect(resolveAdminAccess("/admin", challengedAdmin)).toEqual({
      type: "redirect",
      to: "/admin/login",
      reason: "challenge-required",
    });
  });

  it("admits a fully authenticated Admin", () => {
    expect(resolveAdminAccess("/admin", fullAdmin)).toEqual({ type: "allow" });
    expect(resolveAdminAccess("/admin/queue", fullAdmin)).toEqual({
      type: "allow",
    });
  });

  it("admits an Analyst at aal1 — 2FA is not mandatory for that role", () => {
    expect(resolveAdminAccess("/admin", analyst)).toEqual({ type: "allow" });
  });

  it("bounces an authenticated user off the login screen", () => {
    expect(resolveAdminAccess("/admin/login", fullAdmin)).toEqual({
      type: "redirect",
      to: "/admin",
      reason: "already-authenticated",
    });
    expect(resolveAdminAccess("/admin/login", analyst)).toEqual({
      type: "redirect",
      to: "/admin",
      reason: "already-authenticated",
    });
  });
});

/**
 * Authorisation, added with the sidebar (§7.2). These assert the guard and the nav agree —
 * lib/auth/surfaces.test.ts holds the exhaustive role/surface matrix; these check that
 * `resolveAdminAccess` actually consults it.
 */
describe("resolveAdminAccess — role authorisation", () => {
  const fullAnalyst = account("analyst", "aal2", "aal2");
  const fullEditor = account("editor", "aal2", "aal2");
  const fullContributor = account("contributor", "aal2", "aal2");

  it("lets a fully authenticated Analyst onto the Dashboard", () => {
    expect(resolveAdminAccess(ADMIN_ROOT_PATH, fullAnalyst)).toEqual({ type: "allow" });
  });

  it("turns an Analyst away from every other surface, back to the Dashboard", () => {
    for (const path of [
      "/admin/signals",
      "/admin/radar",
      "/admin/studio",
      "/admin/queue",
      "/admin/settings/sources",
      "/admin/editor/abc",
    ]) {
      expect(resolveAdminAccess(path, fullAnalyst), path).toEqual({
        type: "redirect",
        to: ADMIN_ROOT_PATH,
        reason: "forbidden",
      });
    }
  });

  it("turns a Contributor away from Settings but not from the working surfaces", () => {
    expect(resolveAdminAccess("/admin/settings/sources", fullContributor)).toEqual({
      type: "redirect",
      to: ADMIN_ROOT_PATH,
      reason: "forbidden",
    });
    expect(resolveAdminAccess("/admin/studio", fullContributor)).toEqual({ type: "allow" });
  });

  it("lets an Editor onto all six", () => {
    for (const path of [
      ADMIN_ROOT_PATH,
      "/admin/signals",
      "/admin/radar",
      "/admin/studio",
      "/admin/queue",
      "/admin/settings/sources",
    ]) {
      expect(resolveAdminAccess(path, fullEditor), path).toEqual({ type: "allow" });
    }
  });

  it("refuses the forbidden path BEFORE the role check when 2FA is unfinished", () => {
    // An Analyst stranded at aal1 goes to login, not to the Dashboard: authentication is
    // still the earlier question, and "forbidden" must not leak past an unfinished factor.
    const challengedAnalyst = account("analyst", "aal1", "aal2");
    expect(resolveAdminAccess("/admin/radar", challengedAnalyst)).toEqual({
      type: "redirect",
      to: ADMIN_LOGIN_PATH,
      reason: "challenge-required",
    });
  });

  it("cannot loop: the redirect target is allowed for every role", () => {
    for (const role of ["admin", "editor", "contributor", "analyst"] as const) {
      expect(resolveAdminAccess(ADMIN_ROOT_PATH, account(role, "aal2", "aal2"))).toEqual({
        type: "allow",
      });
    }
  });
});
