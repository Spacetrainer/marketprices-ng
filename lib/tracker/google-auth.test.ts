import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ASSERTION_LIFETIME_SECONDS,
  GoogleAuthError,
  SHEETS_READONLY_SCOPE,
  buildAssertion,
  getAccessToken,
  normalisePrivateKey,
  readServiceAccount,
  type ServiceAccount,
} from "./google-auth";

/**
 * THE KEY IS GENERATED HERE, EVERY RUN. No credential is checked into this repo, not even a
 * throwaway one — a PEM in a test file is a PEM somebody copies. 2048 bits costs a few hundred
 * milliseconds once at module load.
 *
 * WHAT THESE TESTS ARE FOR. Hand-written JWT signing is only safe because the surface is tiny,
 * so the tests pin the whole surface: the signature really verifies, the claims are the ones
 * Google requires, the key survives every mangling a `.env` file inflicts on it, and no error
 * message ever contains key material.
 */
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ACCOUNT: ServiceAccount = {
  email: "fixture-reader@fixture-project.iam.gserviceaccount.com",
  privateKey,
};

/** A fixed instant, so the claims are exact rather than approximately right. */
const NOW = Date.UTC(2026, 9, 2, 9, 30, 0);

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("normalisePrivateKey", () => {
  it("turns the escaped newlines an unquoted .env value keeps into real ones", () => {
    // This is the measured behaviour of `node --env-file`: a single-quoted or bare value arrives
    // with literal backslash-n, so this replacement is load-bearing and not a belt.
    const escaped = privateKey.trimEnd().replace(/\n/g, "\\n");
    expect(normalisePrivateKey(escaped)).toBe(privateKey);
  });

  it("leaves a value that already has real newlines alone", () => {
    expect(normalisePrivateKey(privateKey)).toBe(privateKey);
  });

  it("strips a pasted-in pair of surrounding quotes, of either kind", () => {
    expect(normalisePrivateKey(`"${privateKey.trimEnd()}"`)).toBe(privateKey);
    expect(normalisePrivateKey(`'${privateKey.trimEnd()}'`)).toBe(privateKey);
  });

  it("ends the key with a newline, which some OpenSSL builds require", () => {
    expect(normalisePrivateKey(privateKey.trimEnd()).endsWith("\n")).toBe(true);
  });

  it("refuses something that is not a PEM, without quoting it", () => {
    const secret = "sb_secret_this_must_never_be_echoed";
    expect(() => normalisePrivateKey(secret)).toThrow(GoogleAuthError);
    try {
      normalisePrivateKey(secret);
      expect.unreachable("should have refused");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toMatch(/-----BEGIN PRIVATE KEY-----/);
    }
  });
});

describe("readServiceAccount", () => {
  it("names every missing variable at once rather than one per run", () => {
    expect(() => readServiceAccount({})).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY/,
    );
  });

  it("names only the one that is missing when the other is set", () => {
    expect(() => readServiceAccount({ GOOGLE_SERVICE_ACCOUNT_EMAIL: ACCOUNT.email })).toThrow(
      /missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY$/,
    );
  });

  it("reads and normalises both", () => {
    const account = readServiceAccount({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: `  ${ACCOUNT.email}  `,
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, "\\n"),
    });
    expect(account.email).toBe(ACCOUNT.email);
    expect(account.privateKey).toBe(privateKey);
  });
});

describe("buildAssertion", () => {
  it("produces a signature the public key verifies", () => {
    const assertion = buildAssertion(ACCOUNT, { scope: SHEETS_READONLY_SCOPE, now: NOW });
    const [header, claims, signature] = assertion.split(".");

    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));

    expect(verified).toBe(true);
  });

  it("declares RS256, which is the only algorithm a service account key can use", () => {
    const assertion = buildAssertion(ACCOUNT, { scope: SHEETS_READONLY_SCOPE, now: NOW });
    expect(decodeSegment(assertion.split(".")[0])).toEqual({ alg: "RS256", typ: "JWT" });
  });

  it("claims the scope, the issuer and the token endpoint as the audience", () => {
    const assertion = buildAssertion(ACCOUNT, { scope: SHEETS_READONLY_SCOPE, now: NOW });
    expect(decodeSegment(assertion.split(".")[1])).toEqual({
      iss: ACCOUNT.email,
      scope: SHEETS_READONLY_SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: NOW / 1000,
      exp: NOW / 1000 + ASSERTION_LIFETIME_SECONDS,
    });
  });

  it("asks for read-only access and nothing wider", () => {
    // The sheet is an intake buffer; Supabase is the store of record. A write scope here would
    // be the first step towards the spreadsheet becoming the database.
    expect(SHEETS_READONLY_SCOPE).toMatch(/\.readonly$/);
  });

  it("refuses a key OpenSSL will not load, without quoting it", () => {
    const broken = "-----BEGIN PRIVATE KEY-----\nnot actually base64 der\n-----END PRIVATE KEY-----\n";
    try {
      buildAssertion({ email: ACCOUNT.email, privateKey: broken }, { scope: "s", now: NOW });
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleAuthError);
      expect((error as Error).message).not.toContain("not actually base64 der");
      expect((error as Error).message).toMatch(/re-copy|truncated/i);
    }
  });
});

describe("getAccessToken", () => {
  it("posts the assertion as a jwt-bearer grant and returns the token", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;

    const result = await getAccessToken({
      account: ACCOUNT,
      now: NOW,
      fetchImpl: async (url, init) => {
        seen = { url: String(url), body: new URLSearchParams(String(init?.body)) };
        return jsonResponse({ access_token: "fixture-token", token_type: "Bearer", expires_in: 3600 });
      },
    });

    expect(seen).not.toBeNull();
    const request = seen as unknown as { url: string; body: URLSearchParams };
    expect(request.url).toBe("https://oauth2.googleapis.com/token");
    expect(request.body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(request.body.get("assertion")).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    expect(result.token).toBe("fixture-token");
    expect(result.expiresAt).toBe(NOW + 3600 * 1000);
  });

  it("defaults to the read-only Sheets scope", async () => {
    let assertion = "";
    await getAccessToken({
      account: ACCOUNT,
      now: NOW,
      fetchImpl: async (_url, init) => {
        assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
        return jsonResponse({ access_token: "t", token_type: "Bearer", expires_in: 3600 });
      },
    });

    const claims = decodeSegment(assertion.split(".")[1]) as { scope: string };
    expect(claims.scope).toBe(SHEETS_READONLY_SCOPE);
  });

  it("explains invalid_grant as the four things it actually means", async () => {
    const failing = getAccessToken({
      account: ACCOUNT,
      now: NOW,
      fetchImpl: async () =>
        jsonResponse({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400),
    });

    await expect(failing).rejects.toThrow(/clock is more than a few minutes out/);
    await expect(failing).rejects.toThrow(/does not match GOOGLE_SERVICE_ACCOUNT_EMAIL/);
  });

  it("never echoes the assertion or the key when the exchange fails", async () => {
    try {
      await getAccessToken({
        account: ACCOUNT,
        now: NOW,
        fetchImpl: async () => new Response("upstream connect error", { status: 502 }),
      });
      expect.unreachable("should have refused");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("502");
      // A 502 body is a proxy's, not a credential problem, and the request it answers carried a
      // bearer credential — so neither the body nor the assertion is quoted.
      expect(message).not.toContain("upstream connect error");
      expect(message).not.toContain("PRIVATE KEY");
    }
  });

  it("refuses a 200 that is missing the token rather than returning undefined", async () => {
    await expect(
      getAccessToken({
        account: ACCOUNT,
        now: NOW,
        fetchImpl: async () => jsonResponse({ token_type: "Bearer", expires_in: 3600 }),
      }),
    ).rejects.toThrow(/unusable token response — access_token/);
  });

  it("refuses a 200 whose body is not JSON", async () => {
    await expect(
      getAccessToken({
        account: ACCOUNT,
        now: NOW,
        fetchImpl: async () => new Response("<html>a captive portal</html>", { status: 200 }),
      }),
    ).rejects.toThrow(/body that is not JSON/);
  });

  it("says nothing was read when the endpoint is unreachable", async () => {
    await expect(
      getAccessToken({
        account: ACCOUNT,
        now: NOW,
        fetchImpl: async () => {
          throw new Error("getaddrinfo ENOTFOUND");
        },
      }),
    ).rejects.toThrow(/Nothing was read and nothing was posted/);
  });
});
