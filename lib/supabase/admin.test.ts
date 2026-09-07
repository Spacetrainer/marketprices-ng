import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three guards on the service-role client.
 *
 * This module's whole job is to hold the one credential that bypasses RLS, so each guard is
 * tested for the failure it exists to prevent rather than for its happy path. Two of the
 * three fail SILENTLY if removed — a browser bundle that merely happens not to reach this
 * code today, and a fallback key that turns every insert into a 3am RLS denial — which is
 * exactly why reading the source is not coverage.
 *
 * `createClient` is mocked so nothing here opens a connection, and so the test can read back
 * which key was actually handed to it. That last assertion is the point of the file: the
 * absence of a fallback is invisible unless something inspects the argument.
 */

// Typed with createClient's positional signature rather than as a bare vi.fn(): without it
// `mock.calls` infers as an empty tuple and the argument assertions below cannot be written
// at all — which is the whole point of mocking it.
const createSupabaseClient = vi.hoisted(() =>
  vi.fn<(url: string, key: string, options?: unknown) => { __brand: string }>(() => ({
    __brand: "supabase-client",
  })),
);

vi.mock("@supabase/supabase-js", () => ({ createClient: createSupabaseClient }));

const { createAdminClient } = await import("./admin");

const URL = "https://project.supabase.co";
const SECRET = "sb_secret_service_role_value";
const PUBLISHABLE = "sb_publishable_anon_value";

/** Only the vars this module reads; restored wholesale so tests cannot leak into each other. */
const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  createSupabaseClient.mockClear();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  // Whether or not a test set it — an escaped `window` would make every later test in the
  // run think it is in a browser.
  delete (globalThis as { window?: unknown }).window;
});

describe("guard 1: never constructed in a browser", () => {
  it("throws when a window exists, even with a complete environment", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = SECRET;
    (globalThis as { window?: unknown }).window = {};

    expect(() => createAdminClient()).toThrow(/browser/i);
  });

  it("checks the browser before the environment, so a bundled call cannot be masked", () => {
    // With no key set, an env-first order would throw "environment incomplete" in a browser
    // and read as a config problem. The dangerous fact is WHERE it was called from.
    (globalThis as { window?: unknown }).window = {};

    expect(() => createAdminClient()).toThrow(/browser/i);
  });

  it("does not construct a client when it refuses", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = SECRET;
    (globalThis as { window?: unknown }).window = {};

    expect(() => createAdminClient()).toThrow();
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("guard 2: fails loudly on a missing key", () => {
  it("throws naming SUPABASE_SECRET_KEY when only the url is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;

    expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("throws naming NEXT_PUBLIC_SUPABASE_URL when only the key is set", () => {
    process.env.SUPABASE_SECRET_KEY = SECRET;

    expect(() => createAdminClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("names both when both are missing", () => {
    expect(() => createAdminClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY/);
  });

  it("treats an empty string as missing rather than as a key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = "";

    // An empty key would otherwise reach the driver and fail later as an auth error, far
    // from the deployment mistake that caused it.
    expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});

describe("guard 3: never falls back to the publishable key", () => {
  it("still throws when the publishable key is present and the secret one is not", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;

    // The failure this pins: a `?? NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` added here would
    // construct an anon client that looks healthy and denies every insert under RLS.
    expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });

  it("passes the secret key, not the publishable one, when both are available", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;

    createAdminClient();

    expect(createSupabaseClient).toHaveBeenCalledTimes(1);
    const [url, key] = createSupabaseClient.mock.calls[0];
    expect(url).toBe(URL);
    expect(key).toBe(SECRET);
    expect(key).not.toBe(PUBLISHABLE);
  });
});

describe("the constructed client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
    process.env.SUPABASE_SECRET_KEY = SECRET;
  });

  it("never persists or refreshes a session", () => {
    createAdminClient();

    // Persisting would leave a service-role token in storage; refreshing or reading a URL
    // session would let this client pick up a user's identity and act as them.
    const [, , options] = createSupabaseClient.mock.calls[0];
    expect(options).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it("returns the constructed client to the caller", () => {
    expect(createAdminClient()).toBe(createSupabaseClient.mock.results[0].value);
  });
});
