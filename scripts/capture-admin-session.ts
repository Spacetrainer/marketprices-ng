/**
 * Captures a signed-in admin session as a Playwright storageState file.
 *
 * Why this exists: the six control-room surfaces are all behind Supabase Auth with mandatory
 * TOTP for Admin and Editor (§7.1, P9.4), so no automated test can reach them without a real
 * session. This drives the REAL login screen — the same forms and Server Actions a person
 * uses — and writes the resulting cookies to a gitignored file that Playwright can load.
 *
 * The browser is headless and YOU supply the secrets at the prompt. Nothing is echoed to the
 * terminal, nothing is written to the file except the session cookies Playwright captures,
 * and nothing is logged. The TOTP code is asked for LAST, immediately before it is used,
 * because it expires in about thirty seconds.
 *
 *   pnpm capture:session
 *
 * The dev server must already be running (`pnpm dev`). Re-run this whenever the saved
 * session expires — it is a local convenience, not a CI credential.
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { ADMIN_LOGIN_PATH, ADMIN_ROOT_PATH } from "../lib/constants";

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const OUTPUT = process.env.CAPTURE_OUTPUT ?? "auth.json";
/** Long enough for a person to find their authenticator app and type the code. */
const PROMPT_TIMEOUT_MS = 120_000;

/**
 * Reads one line from the TTY. With `echo: false` the characters are consumed but never
 * written back, so a password does not end up in the scrollback or in shell history.
 */
function ask(prompt: string, echo: boolean): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return Promise.reject(
      new Error(
        "This script needs an interactive terminal — it asks for your password and a TOTP code.\n" +
          "Run it directly in a shell rather than through a non-interactive runner.",
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

/** Which step the login screen is showing, read from the card's own attribute. */
async function currentStep(page: Page): Promise<string | null> {
  return page.locator("[data-login-step]").getAttribute("data-login-step");
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
      const failed = document.querySelector('[role="alert"]') !== null;
      return onDashboard || failed || (step !== null && step !== from);
    },
    submittedStep,
    { timeout: 30_000 },
  );
}

/** A form-level rejection, if the page is showing one. Never includes what was typed. */
async function formError(page: Page): Promise<string | null> {
  const alert = await page
    .locator('[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);
  const text = alert?.trim();
  return text ? text : null;
}

/**
 * The assurance level actually recorded in the cookie we are about to save.
 *
 * Decoded locally and never printed. This is the gate the first version lacked: reaching the
 * Dashboard is strong evidence, but reading `aal` off the token is proof, and it is what
 * turns "the script said success" into something worth trusting.
 */
export function assuranceLevelOf(state: { cookies: { value: string }[] }): string | null {
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
        if (typeof aal === "string") return aal;
      }
    } catch {
      // Not a session cookie. Try the next one.
    }
  }
  return null;
}

async function main(): Promise<void> {
  const email = process.env.CAPTURE_EMAIL ?? (await ask("Email: ", true));
  const password = await ask("Password (not shown): ", false);

  if (!email || !password) throw new Error("Email and password are both required.");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}${ADMIN_LOGIN_PATH}`, { waitUntil: "load" });

    const step = await currentStep(page);
    if (step === null) {
      throw new Error(
        `No login card at ${BASE_URL}${ADMIN_LOGIN_PATH}. Is the dev server running?`,
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
      console.log("Password accepted. Your second factor is required.");
      // Asked for now, not earlier: a TOTP code is only valid for about thirty seconds.
      const code = await Promise.race([
        ask("Six-digit code from your authenticator: ", true),
        new Promise<string>((_, reject) =>
          setTimeout(
            () => reject(new Error("Timed out waiting for the code.")),
            PROMPT_TIMEOUT_MS,
          ),
        ),
      ]);
      if (!/^\d{6}$/.test(code)) throw new Error("That is not a six-digit code.");

      await page.fill("#code", code);
      await page.getByRole("button", { name: "Verify" }).click();
      await settle(page, "challenge");

      const codeError = await formError(page);
      if (codeError) throw new Error(`Code refused: ${codeError}`);
    }

    // Ask for the Dashboard outright and require the shell to actually render. A URL can be
    // transient; the sidebar only exists if the middleware admitted this session.
    await page.goto(`${BASE_URL}${ADMIN_ROOT_PATH}`, { waitUntil: "load" });
    await page.waitForSelector('nav[aria-label="Control room"]', { timeout: 15_000 });

    if (page.url() !== `${BASE_URL}${ADMIN_ROOT_PATH}`) {
      throw new Error(`Ended at ${page.url()} rather than the Dashboard. Nothing saved.`);
    }

    const state = await context.storageState();

    // The gate. Admin and Editor require a second factor (§7.1, P9.4), so an aal1 cookie is
    // not a usable session and must never be written — saving one is how this script
    // previously reported success while producing a file that failed every test.
    const aal = assuranceLevelOf(state);
    if (aal !== "aal2") {
      throw new Error(
        `The captured session is ${aal ?? "of unknown assurance"}, not aal2. Nothing saved.\n` +
          "The second factor did not complete. Re-run and enter the code when prompted.",
      );
    }

    writeFileSync(OUTPUT, JSON.stringify(state, null, 2), { mode: 0o600 });

    console.log(`\nSaved ${state.cookies.length} cookie(s) to ${OUTPUT} (mode 600), aal2.`);
    console.log("It is gitignored. Re-run this script when it expires.");
  } finally {
    await browser.close();
  }
}

/** Only run when invoked as a script, so the aal gate above can be unit-tested. */
const invokedDirectly = (process.argv[1] ?? "").includes("capture-admin-session");

if (invokedDirectly) main().catch((error: unknown) => {
  // Deliberately prints only the message. Nothing here should ever carry a credential, and
  // a stack trace on a login script is noise rather than help.
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
