import { describe, expect, it } from "vitest";
import { requiresTwoFactor, type UserRole } from "./roles";

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
