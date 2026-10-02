/**
 * google-auth.ts — one service-account access token, signed here, with no dependency.
 *
 * WHY NOT google-auth-library. Three reasons, in order of weight.
 *
 *   1. THE DIRECTION OF THE CRYPTO. This module only ever MINTS a token it signs itself. It
 *      never verifies one. Verification is where hand-written JWT goes wrong — algorithm
 *      confusion, `alg: none`, signature stripping — and all of those are attacks on a
 *      verifier. There is no branch below that an attacker can influence: the header is a
 *      constant, the claims are built from two environment variables, and the signature is
 *      `node:crypto` doing RSASSA-PKCS1-v1_5 over SHA-256.
 *   2. SIZE AND PRECEDENT. The library brings gaxios, gtoken, jws, ecdsa-sig-formatter and
 *      their dependencies into a repo whose entire production dependency list is six packages,
 *      and which already declined a spreadsheet library in favour of the zip reader in
 *      `xlsx.ts`. Taking a transitive tree that size to POST one form-encoded request would be
 *      the inconsistent choice.
 *   3. THE WIRE FORMAT IS FROZEN. RFC 7523 plus Google's `jwt-bearer` grant. It does not drift,
 *      so there is no maintenance to outsource.
 *
 * WHAT WE GIVE UP, SAID PLAINLY. No retry or backoff if the token endpoint is briefly
 * unavailable — the run fails and a human runs it again, which is the right behaviour for a
 * weekly command and would need revisiting for anything unattended. No token cache across
 * processes: each run mints its own, which is free. No metadata-server or Workload Identity
 * fallback, so this authenticates one way only.
 *
 * NOTHING HERE EVER PRINTS KEY MATERIAL (P9.6). Every error below names what is wrong and where
 * to look without quoting the value — including the failures where quoting it would be the
 * fastest way to debug. The signed assertion is not logged either: it is a bearer credential
 * for the next hour.
 */

import { createSign } from "node:crypto";
import { z } from "zod";

/** Read-only is the whole access this needs. The importer never writes to the sheet. */
export const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/** An hour is the maximum Google accepts for an assertion, and the token it returns matches. */
export const ASSERTION_LIFETIME_SECONDS = 3600;

export class GoogleAuthError extends Error {}

/**
 * Just enough of an environment to read two names out of.
 *
 * Not `NodeJS.ProcessEnv`: Next.js augments that type with a required NODE_ENV, which would make
 * every test construct a fake environment it does not care about in order to say what it does.
 * `process.env` satisfies this, which is the only thing that matters.
 */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export interface ServiceAccount {
  /** The `client_email` from the downloaded JSON key. */
  email: string;
  /** The `private_key` from it, as a PKCS#8 PEM with real newlines. */
  privateKey: string;
}

/**
 * The private key as `createSign` needs it, whatever the environment did to it on the way in.
 *
 * THIS IS THE SINGLE MOST LIKELY THING TO GO WRONG in the whole feature, so it is handled
 * rather than documented. A service-account key is a multi-line PEM, and a `.env` file has no
 * natural way to hold one. Measured against `node --env-file` on this Node version:
 *
 *   KEY="-----BEGIN…\n…"     double-quoted, escaped  → arrives with REAL newlines
 *   KEY="-----BEGIN…         double-quoted, wrapped  → arrives with REAL newlines
 *   KEY='-----BEGIN…\n…'     SINGLE-quoted           → arrives with LITERAL backslash-n
 *   KEY=-----BEGIN…\n…       unquoted                → arrives with LITERAL backslash-n
 *
 * The last two are the ones a person actually types, which is why the replacement below is
 * load-bearing and not a belt. It is also a no-op on the first two, and on Vercel's own
 * environment UI, which stores real newlines.
 *
 * A pasted-in pair of surrounding quotes is stripped for the same reason: it is a paste error
 * with a completely opaque failure mode — the PEM parser just says "no start line".
 */
export function normalisePrivateKey(raw: string): string {
  let key = raw.trim();

  if (key.length >= 2 && key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  else if (key.length >= 2 && key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);

  key = key.replace(/\\n/g, "\n");

  // Checked here rather than at the first signature, because "no start line" from OpenSSL is
  // not a sentence anyone can act on. The check never quotes the value it rejects.
  if (!key.includes("-----BEGIN") || !key.includes("PRIVATE KEY-----")) {
    throw new GoogleAuthError(
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not hold a PEM private key — it should start " +
        '"-----BEGIN PRIVATE KEY-----". Copy the `private_key` field out of the service ' +
        "account's JSON key file, and wrap it in DOUBLE quotes in .env.local.",
    );
  }

  return key.endsWith("\n") ? key : `${key}\n`;
}

export function readServiceAccount(env: EnvLike = process.env): ServiceAccount {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    const missing = [
      !email && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      !privateKey && "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new GoogleAuthError(`Google service account incomplete — missing ${missing}`);
  }

  return { email, privateKey: normalisePrivateKey(privateKey) };
}

// ---------------------------------------------------------------------------
// The assertion
// ---------------------------------------------------------------------------

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

function base64urlText(value: string): string {
  return base64url(Buffer.from(value, "utf8"));
}

/**
 * The signed JWT Google exchanges for an access token.
 *
 * `now` is a parameter rather than a call to the clock so the test can assert the claims
 * exactly. It is the only clock this module reads, and a wrong one is worth recognising: if the
 * machine's time is more than a few minutes out, Google rejects the assertion as
 * `invalid_grant`, which is also what a wrong key produces. The error below says both.
 */
export function buildAssertion(
  account: ServiceAccount,
  options: { scope: string; now: number },
): string {
  const issuedAt = Math.floor(options.now / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.email,
    scope: options.scope,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + ASSERTION_LIFETIME_SECONDS,
  };

  const signingInput = `${base64urlText(JSON.stringify(header))}.${base64urlText(JSON.stringify(claims))}`;

  let signature: Buffer;
  try {
    signature = createSign("RSA-SHA256").update(signingInput).sign(account.privateKey);
  } catch (error) {
    // The cause is attached but never interpolated: OpenSSL error text can include fragments of
    // the input it choked on, and the input here is the private key.
    throw new GoogleAuthError(
      "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY could not be used to sign — it looks like a PEM but " +
        "OpenSSL would not load it. Re-copy the `private_key` field from the JSON key file; a " +
        "truncated or re-wrapped key fails exactly like this.",
      { cause: error },
    );
  }

  return `${signingInput}.${base64url(signature)}`;
}

// ---------------------------------------------------------------------------
// The exchange
// ---------------------------------------------------------------------------

/** Google's token response, validated at the boundary like every other external input. */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive(),
});

const tokenErrorSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().min(1).optional(),
});

export interface AccessToken {
  token: string;
  /** Epoch milliseconds. Carried for a caller that wants to reuse it; nothing caches yet. */
  expiresAt: number;
}

export interface TokenOptions {
  account: ServiceAccount;
  scope?: string;
  now?: number;
  /** Injected so every test in this directory runs without a network. */
  fetchImpl?: typeof fetch;
}

export async function getAccessToken(options: TokenOptions): Promise<AccessToken> {
  const now = options.now ?? Date.now();
  const scope = options.scope ?? SHEETS_READONLY_SCOPE;
  const fetchImpl = options.fetchImpl ?? fetch;

  const assertion = buildAssertion(options.account, { scope, now });

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion }).toString(),
    });
  } catch (error) {
    throw new GoogleAuthError(
      `Could not reach ${TOKEN_ENDPOINT} to exchange the service account assertion. Nothing was ` +
        "read and nothing was posted.",
      { cause: error },
    );
  }

  const body = await response.text();

  if (!response.ok) {
    throw new GoogleAuthError(describeTokenFailure(response.status, body));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new GoogleAuthError(
      `${TOKEN_ENDPOINT} returned ${response.status} with a body that is not JSON.`,
    );
  }

  const result = tokenResponseSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new GoogleAuthError(`${TOKEN_ENDPOINT} returned an unusable token response — ${detail}`);
  }

  return {
    token: result.data.access_token,
    expiresAt: now + result.data.expires_in * 1000,
  };
}

/**
 * A token-endpoint refusal as a sentence someone can act on.
 *
 * `invalid_grant` is the one worth spelling out. It is returned for a wrong key, a wrong
 * `client_email`, a deleted service account AND a machine clock several minutes out of true,
 * and a person who only knows "invalid grant" will check the first of those four and stop.
 */
function describeTokenFailure(status: number, body: string): string {
  let code: string | null = null;
  let description: string | null = null;

  try {
    const parsed = tokenErrorSchema.safeParse(JSON.parse(body));
    if (parsed.success) {
      code = parsed.data.error;
      description = parsed.data.error_description ?? null;
    }
  } catch {
    // A non-JSON body from the token endpoint is a proxy or an outage, not a credential
    // problem. The status alone carries that, and the body is not quoted — it is a response to
    // a request whose payload was a bearer credential.
  }

  const prefix = `Google refused the service account assertion (HTTP ${status}`;
  const suffix = code ? `, ${code}` : "";
  const detail = description ? ` — ${description}` : "";

  if (code === "invalid_grant") {
    return (
      `${prefix}${suffix})${detail}. This means one of four things, in the order worth ` +
      "checking: the private key does not match GOOGLE_SERVICE_ACCOUNT_EMAIL; the email is " +
      "not the service account's `client_email`; the key or the account has been deleted in " +
      "Google Cloud; or this machine's clock is more than a few minutes out."
    );
  }

  if (code === "invalid_client") {
    return (
      `${prefix}${suffix})${detail}. GOOGLE_SERVICE_ACCOUNT_EMAIL is not a service account ` +
      "Google recognises — it should end in .iam.gserviceaccount.com."
    );
  }

  return `${prefix}${suffix})${detail}.`;
}
