import { describe, expect, it } from "vitest";
import { credentialsSchema, enrolmentVerificationSchema, totpCodeSchema } from "./credentials";

describe("credentialsSchema", () => {
  it("accepts a well-formed pair", () => {
    const result = credentialsSchema.safeParse({ email: "a@b.co", password: "x" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace on the email", () => {
    const result = credentialsSchema.safeParse({ email: "  a@b.co  ", password: "x" });
    expect(result.success && result.data.email).toBe("a@b.co");
  });

  it("rejects a malformed email", () => {
    const result = credentialsSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email or password", () => {
    expect(credentialsSchema.safeParse({ email: "", password: "x" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(credentialsSchema.safeParse({ email: null, password: 1 }).success).toBe(false);
    expect(credentialsSchema.safeParse({}).success).toBe(false);
  });

  it("does not impose its own password composition rules", () => {
    // A single character passes here on purpose — the identity provider owns that rule.
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "a" }).success).toBe(true);
  });
});

describe("totpCodeSchema", () => {
  it("accepts six digits", () => {
    const result = totpCodeSchema.safeParse({ code: "123456" });
    expect(result.success && result.data.code).toBe("123456");
  });

  it("strips the space authenticator apps display", () => {
    const result = totpCodeSchema.safeParse({ code: "123 456" });
    expect(result.success && result.data.code).toBe("123456");
  });

  it("rejects the wrong number of digits", () => {
    expect(totpCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "1234567" }).success).toBe(false);
  });

  it("rejects non-digits", () => {
    expect(totpCodeSchema.safeParse({ code: "12345a" }).success).toBe(false);
    expect(totpCodeSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("enrolmentVerificationSchema", () => {
  it("requires a factor id alongside the code", () => {
    expect(
      enrolmentVerificationSchema.safeParse({ code: "123456", factorId: "f1" }).success,
    ).toBe(true);
    expect(enrolmentVerificationSchema.safeParse({ code: "123456" }).success).toBe(false);
    expect(
      enrolmentVerificationSchema.safeParse({ code: "123456", factorId: "" }).success,
    ).toBe(false);
  });
});
