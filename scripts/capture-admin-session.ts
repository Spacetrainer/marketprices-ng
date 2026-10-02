/**
 * Captures a signed-in staff session as a Playwright storageState file.
 *
 * Why this exists: the six control-room surfaces are all behind Supabase Auth, with mandatory
 * TOTP for Admin and Editor (§7.1, P9.4), so no automated test can reach them without a real
 * session. This drives the REAL login screen — the same forms and Server Actions a person
 * uses — and writes the resulting cookies to a gitignored file that Playwright can load.
 *
 * TWO CALLERS, ONE IMPLEMENTATION. `captureSession()` is the whole browser flow and is
 * exported, because `tests/e2e/auth.setup.ts` needs exactly this and a second copy of a login
 * sequence is a second thing to keep correct. This module's own `main()` is the interactive
 * wrapper: it resolves credentials from the environment FIRST and prompts only for what is
 * missing, so the same code serves a person at a terminal and an unattended CI runner.
 *
 *   pnpm capture:session
 *
 * The browser is headless and nothing is echoed, logged or written except the session cookies
 * Playwright captures and the small sidecar described at SessionMeta. A TOTP code, when one
 * is needed at all, is asked for LAST, immediately before it is used, because it expires in
 * about thirty seconds — and when there is no terminal to ask at, this fails fast and says so
 * rather than hanging on a prompt nobody can answer.
 *
 * The dev server must already be running (`pnpm dev`). Re-run this whenever the saved
 * session expires.
 */
import { chromium } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ADMIN_LOGIN_PATH, ADMIN_ROOT_PATH } from "../lib/constants";
import { requiresTwoFactor, type UserRole } from "../lib/auth/roles";
import { readSupabaseEnv } from "../lib/supabase/env";
import { Constants, type Database } from "../types/database";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
/** Long enough for a person to find their authenticator app and type the code. */
const PROMPT_TIMEOUT_MS = 120_000;

/** The Playwright storageState file. `test.use({ storageState })` reads this one directly. */
export const SESSION_STATE_PATH = "auth.json";

/**
 * The sidecar, written beside the storageState and gitignored with it.
 *
 * It exists because the ROLE IS NOT IN THE TOKEN. `lib/supabase/middleware.ts` resolves the
 * role with a per-request `profiles` read rather than a custom access-token claim, so nothing
 * in `auth.json` says whether it holds an Admin or a Contributor. The capture is the one
 * moment that fact is known for certain — it has just signed in — so it records it here
 * instead of leaving every later reader to infer it from a proxy.
 *
 * That is what lets `tests/e2e/dashboard-authenticated.spec.ts` assert the sidebar against
 * `visibleSurfaces(role)` rather than against a hardcoded six, and it is why the spec no
 * longer needs an assurance-level guard of its own: the gate below already ran, with the role
 * in hand, before this file was written.
 */
export const SESSION_META_PATH = "auth.meta.json";

const sessionMetaSchema = z.object({
  role: z.enum(Constants.public.Enums.user_role),
  /** What the saved cookie actually carries. Recorded, not re-derived, so it cannot drift. */
  aal: z.string().min(1),
  capturedAt: z.string().min(1),
});

export type SessionMeta = z.infer<typeof sessionMetaSchema>;

/**
 * The sidecar if it is present and well-formed, `null` otherwise — never a throw.
 *
 * Validated at the boundary like any other external input (CLAUDE.md): a truncated or
 * hand-edited file must make the reader skip with a legible reason, not fail inside an
 * assertion that looks like the Dashboard is broken.
 */
export function readSessionMeta(path: string = SESSION_META_PATH): SessionMeta | null {
  try {
    const parsed = sessionMetaSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads one line from the TTY. With `echo: false` the characters are consumed but never
 * written back, so a password does not end up in the scrollback or in shell history.
 *
 * Reached only for a value the environment did not already supply — see `main()`.
 */
function ask(prompt: string, echo: boolean): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return Promise.reject(
      new Error(
        "Missing credentials and no interactive terminal to ask at.\n" +
          "Set CAPTURE_EMAIL and CAPTURE_PASSWORD to run this unattended, or run it in a shell.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";

    const finish = (done: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      done();
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish(() => resolve(value.trim()));
        if (char === "") return finish(() => reject(new Error("Cancelled.")));
        if (char === "" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (echo) stdout.write("\b \b");
          }
          continue;
        }
        value += char;
        if (echo) stdout.write(char);
      }
    };

    stdin.on("data", onData);
  });
}

type Page = import("@playwright/test").Page;

/**
 * Which step the login screen is showing, read from the card's own attribute. `null` when
 * there is no login card at all.
 *
 * Read in one shot rather than through a locator, for the same reason as `formError` below.
 * A successful sign-in leaves the login screen entirely, so the card is gone — and a
 * locator's `getAttribute` AUTO-WAITS for its element, meaning the obvious version blocks
 * for the full timeout on exactly the happy path this script exists to capture.
 */
async function currentStep(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector("[data-login-step]")?.getAttribute("data-login-step") ?? null,
  );
}

/**
 * Waits for the redirect chain to come to REST, and refuses to treat a URL as an outcome.
 *
 * This is the whole correctness of the script. After the credentials action, Next routes
 * optimistically to /admin and the middleware then bounces an aal1 session back to the
 * challenge — so `/admin` appears in the address bar for a moment while the session is
 * still one factor short. An earlier version waited on that URL, concluded it had finished,
 * never asked for a code, and saved an aal1 state that reported success and then failed
 * every test. Settle on RENDERED MARKERS instead: a login step that is no longer the one we
 * submitted, the Dashboard's own nav, or a form error.
 */
async function settle(page: Page, submittedStep: string): Promise<void> {
  await page.waitForFunction(
    (from) => {
      const step =
        document.querySelector("[data-login-step]")?.getAttribute("data-login-step") ?? null;
      const onDashboard =
        document.querySelector('nav[aria-label="Control room"]') !== null;
      // Scoped to the login card on purpose. Next's route announcer is a top-level element
      // with role="alert" that carries the new page title, so an unscoped query reports
      // "Dashboard" as a form error the moment the login succeeds.
      const failed = document.querySelector('[data-login-step] [role="alert"]') !== null;
      return onDashboard || failed || (step !== null && step !== from);
    },
    submittedStep,
    { timeout: 30_000 },
  );
}

/**
 * A form-level rejection, if the page is showing one. Never includes what was typed.
 *
 * Scoped to the login card: Next renders a route announcer at the top of the document with
 * role="alert" holding the new page's title, so an unscoped lookup turns a SUCCESSFUL login
 * into `Sign-in refused: Dashboard`.
 */
async function formError(page: Page): Promise<string | null> {
  // Read in one shot rather than through a locator. A locator's `textContent()` AUTO-WAITS,
  // so on a successful login — where the card is gone — it blocks for the full timeout and
  // only then resolves to null, turning the happy path into a 30s stall.
  const text = await page.evaluate(
    () =>
      document.querySelector('[data-login-step] [role="alert"]')?.textContent?.trim() ?? null,
  );
  return text ? text : null;
}

export interface StorageState {
  cookies: { value: string }[];
}

/** What the saved cookie actually asserts about the session. Decoded locally, never printed. */
export interface SessionClaims {
  aal: string;
  /** The `auth.users` id, which is also the `profiles` primary key. */
  sub: string | null;
  accessToken: string;
}

/**
 * The claims on the session cookie we are about to save.
 *
 * Scans for the FIRST cookie whose access token carries a string `aal` — the same selection
 * `assuranceLevelOf` has always made, kept deliberately rather than simplified, because a
 * context holds several cookies and only one of them is the session. Anything that does not
 * decode is not a session cookie and is skipped, not treated as a failure.
 */
export function sessionClaimsOf(state: StorageState): SessionClaims | null {
  for (const cookie of state.cookies) {
    let raw = cookie.value;
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
    }
    try {
      const session: unknown = JSON.parse(raw);
      if (typeof session !== "object" || session === null) continue;
      const token = (session as { access_token?: unknown }).access_token;
      if (typeof token !== "string") continue;
      const payload: unknown = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
      );
      if (typeof payload === "object" && payload !== null) {
        const aal = (payload as { aal?: unknown }).aal;
        const sub = (payload as { sub?: unknown }).sub;
        if (typeof aal === "string") {
          return { aal, sub: typeof sub === "string" ? sub : null, accessToken: token };
        }
      }
    } catch {
      // Not a session cookie. Try the next one.
    }
  }
  return null;
}

/**
 * The assurance level alone. Kept as its own export because it is the narrowest true statement
 * this module can make about a storageState file, and it is what the unit suite pins.
 */
export function assuranceLevelOf(state: StorageState): string | null {
  return sessionClaimsOf(state)?.aal ?? null;
}

/**
 * The role on the profile behind this session, read as the session itself.
 *
 * `profiles_select_own` (0003) covers this exactly, so no service-role key is involved and no
 * privilege is added anywhere to make the capture work — if this read fails, the account
 * genuinely cannot see its own profile and the session is not one a test should be holding.
 */
async function readRole(claims: SessionClaims): Promise<UserRole> {
  if (!claims.sub) {
    throw new Error("The captured token carries no subject, so its profile cannot be read.");
  }

  const { url, publishableKey } = readSupabaseEnv();
  const supabase = createSupabaseClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${claims.accessToken}` } },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) throw new Error(`Could not read this session's profile: ${error.message}`);
  if (!data) {
    // The unprovisioned state from lib/auth/access.ts, reached here rather than at the login
    // screen. It cannot normally get this far — the Dashboard would not have rendered.
    throw new Error("This session has no profiles row, so it is not a staff session.");
  }

  return data.role;
}

export interface CaptureOptions {
  baseUrl: string;
  email: string;
  password: string;
  /**
   * Supplies a TOTP code when the account turns out to have a verified factor. OMITTING IT
   * IS THE NON-INTERACTIVE MODE: there is then no way to answer a challenge, and reaching one
   * fails immediately with a message naming the cause rather than blocking on a prompt.
   */
  requestTotpCode?: () => Promise<string>;
  statePath?: string;
  metaPath?: string;
}

export interface CaptureResult extends SessionMeta {
  cookieCount: number;
  statePath: string;
  metaPath: string;
}

/**
 * Drives the real login screen and writes the storageState and its sidecar. The whole flow,
 * shared by `pnpm capture:session` and the Playwright setup project.
 */
export async function captureSession(options: CaptureOptions): Promise<CaptureResult> {
  const { baseUrl, email, password, requestTotpCode } = options;
  const statePath = options.statePath ?? SESSION_STATE_PATH;
  const metaPath = options.metaPath ?? SESSION_META_PATH;

  if (!email || !password) throw new Error("Email and password are both required.");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}${ADMIN_LOGIN_PATH}`, { waitUntil: "load" });

    const step = await currentStep(page);
    if (step === null) {
      throw new Error(
        `No login card at ${baseUrl}${ADMIN_LOGIN_PATH}. Is the dev server running?`,
      );
    }
    if (step !== "credentials") {
      throw new Error(
        `Expected the credentials step, found "${step}". A stale session may already exist.`,
      );
    }

    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await settle(page, "credentials");

    const signInError = await formError(page);
    if (signInError) throw new Error(`Sign-in refused: ${signInError}`);

    const afterPassword = await currentStep(page);

    if (afterPassword === "enrol") {
      throw new Error(
        "This account has no verified TOTP factor yet, so it cannot complete a session.\n" +
          "Finish enrolment in a browser first, then re-run this script.",
      );
    }

    if (afterPassword === "challenge") {
      // THE FAIL-FAST. A second factor is wanted and there is nothing that can produce one:
      // no terminal to prompt at, and deliberately no secret stored anywhere that would let
      // this compute a code unattended. Say which account and what to do about it, because
      // the fix is a choice about the account, not about the runner.
      if (!requestTotpCode) {
        throw new Error(
          "This account has a verified second factor, and there is no terminal to ask for a code.\n" +
            "An unattended run needs an account whose role does not mandate 2FA (§7.1, P9.4)\n" +
            "and which has not voluntarily enrolled one. Nothing saved.",
        );
      }

      console.log("Password accepted. Your second factor is required.");
      // Asked for now, not earlier: a TOTP code is only valid for about thirty seconds.
      const code = await requestTotpCode();
      if (!/^\d{6}$/.test(code)) throw new Error("That is not a six-digit code.");

      await page.fill("#code", code);
      await page.getByRole("button", { name: "Verify" }).click();
      await settle(page, "challenge");

      const codeError = await formError(page);
      if (codeError) throw new Error(`Code refused: ${codeError}`);
    }

    // Ask for the Dashboard outright and require the shell to actually render. A URL can be
    // transient; the sidebar only exists if the middleware admitted this session.
    await page.goto(`${baseUrl}${ADMIN_ROOT_PATH}`, { waitUntil: "load" });
    await page.waitForSelector('nav[aria-label="Control room"]', { timeout: 15_000 });

    if (page.url() !== `${baseUrl}${ADMIN_ROOT_PATH}`) {
      throw new Error(`Ended at ${page.url()} rather than the Dashboard. Nothing saved.`);
    }

    const state = await context.storageState();

    const claims = sessionClaimsOf(state);
    if (!claims) {
      throw new Error("No session cookie could be decoded from the capture. Nothing saved.");
    }

    const role = await readRole(claims);

    // THE GATE, now asking the question it always meant to ask.
    //
    // It used to demand aal2 flatly, which is right for Admin and Editor and WRONG for the
    // other two: a Contributor never has a mandatory factor, so aal1 is a complete session
    // for that role and refusing it made unattended capture impossible. `requiresTwoFactor`
    // is the same predicate `resolveLoginStep` decides with, so there is still exactly one
    // statement of the rule in this codebase.
    //
    // Deliberately one-directional. A role that MANDATES a factor must be at aal2 or the
    // session is a step short — that is the original bug, and it stays closed. A role that
    // does not mandate one may legitimately be at EITHER level: a Contributor who chose to
    // enrol is challenged by `resolveAdminAccess` like anyone else and arrives here at aal2,
    // and rejecting that would punish the stronger session for being stronger.
    if (requiresTwoFactor(role) && claims.aal !== "aal2") {
      throw new Error(
        `A ${role} session must reach aal2 (§7.1, P9.4) and this one is ${claims.aal}. Nothing saved.\n` +
          "The second factor did not complete. Re-run and enter the code when prompted.",
      );
    }

    const meta: SessionMeta = {
      role,
      aal: claims.aal,
      capturedAt: new Date().toISOString(),
    };

    writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });

    return { ...meta, cookieCount: state.cookies.length, statePath, metaPath };
  } finally {
    await browser.close();
  }
}

/** The interactive TOTP prompt, bounded so a forgotten terminal does not hang a run. */
function promptForTotpCode(): Promise<string> {
  return Promise.race([
    ask("Six-digit code from your authenticator: ", true),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for the code.")), PROMPT_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Environment first, prompt second.
 *
 * `ask()` refuses outright without a TTY, so the order matters: a value already in the
 * environment is never asked for, which is the whole of what makes this runnable unattended.
 * Anything still missing when there is no terminal produces `ask()`'s error, and it names
 * both variables so the fix is obvious from the failure alone.
 */
async function main(): Promise<void> {
  const email = process.env.CAPTURE_EMAIL ?? (await ask("Email: ", true));
  const password = process.env.CAPTURE_PASSWORD ?? (await ask("Password (not shown): ", false));

  const result = await captureSession({
    baseUrl: BASE_URL,
    email,
    password,
    // Only offered when there is somewhere to ask. Without it, captureSession fails fast on a
    // challenge instead of waiting on a prompt that can never be answered.
    requestTotpCode: process.stdin.isTTY ? promptForTotpCode : undefined,
    statePath: process.env.CAPTURE_OUTPUT ?? SESSION_STATE_PATH,
    metaPath: process.env.CAPTURE_META_OUTPUT ?? SESSION_META_PATH,
  });

  console.log(
    `\nSaved ${result.cookieCount} cookie(s) to ${result.statePath} (mode 600), ${result.aal}.`,
  );
  console.log(`Recorded role "${result.role}" in ${result.metaPath}.`);
  console.log("Both are gitignored. Re-run this script when the session expires.");
}

/** Only run when invoked as a script, so the gate above can be unit-tested. */
const invokedDirectly = (process.argv[1] ?? "").includes("capture-admin-session");

if (invokedDirectly) main().catch((error: unknown) => {
  // Deliberately prints only the message. Nothing here should ever carry a credential, and
  // a stack trace on a login script is noise rather than help.
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
