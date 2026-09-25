import { describe, expect, it } from "vitest";
import { canDecidePriceSubmissions, requiresTwoFactor, type UserRole } from "./roles";

describe("requiresTwoFactor", () => {
  it("mandates 2FA for Admin and Editor (P9.4)", () => {
    expect(requiresTwoFactor("admin")).toBe(true);
    expect(requiresTwoFactor("editor")).toBe(true);
  });

  it("does not mandate 2FA for Contributor or Analyst", () => {
    expect(requiresTwoFactor("contributor")).toBe(false);
    expect(requiresTwoFactor("analyst")).toBe(false);
  });

  it("covers every role in the enum", () => {
    const roles: UserRole[] = ["admin", "editor", "contributor", "analyst"];
    for (const role of roles) {
      expect(typeof requiresTwoFactor(role)).toBe("boolean");
    }
  });
});

describe("canDecidePriceSubmissions", () => {
  it("lets Admin and Editor decide, matching is_admin_or_editor() in the database", () => {
    expect(canDecidePriceSubmissions("admin")).toBe(true);
    expect(canDecidePriceSubmissions("editor")).toBe(true);
  });

  it("does NOT let a Contributor decide, though they see the whole queue", () => {
    // Confirmed intended (§7.2, 2026-09-17). `price_submissions_select_staff` gates on
    // is_staff(), so a Contributor reads every pending row — seeing what is waiting is part
    // of doing the work. Publishing it is a separate right, and this is the line between them.
    expect(canDecidePriceSubmissions("contributor")).toBe(false);
  });

  it("does not let an Analyst decide", () => {
    // An Analyst never reaches the radar at all (canViewSurfaceId), so this is the second of
    // two independent noes rather than the only one.
    expect(canDecidePriceSubmissions("analyst")).toBe(false);
  });

  it("agrees with requiresTwoFactor on exactly which roles are privileged", () => {
    // Not a coincidence worth asserting for its own sake — it is the same two roles for the
    // same reason, and if one set ever changes without the other, that is worth meeting here
    // rather than discovering when an unprivileged account can publish a price.
    const roles: UserRole[] = ["admin", "editor", "contributor", "analyst"];
    for (const role of roles) {
      expect(canDecidePriceSubmissions(role), role).toBe(requiresTwoFactor(role));
    }
  });
});
