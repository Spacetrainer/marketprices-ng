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

/** Which step the login screen is showing, read from the card's own attribute. */
async function currentStep(page: import("@playwright/test").Page): Promise<string | null> {
  return page.locator("[data-login-step]").getAttribute("data-login-step");
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

    // Either the password was wrong (the form re-renders with an alert), or we advance.
    await page.waitForFunction(
      () =>
        window.location.pathname !== "/admin/login" ||
        document.querySelector('[role="alert"]') !== null ||
        document.querySelector("[data-login-step]")?.getAttribute("data-login-step") !==
          "credentials",
      null,
      { timeout: 30_000 },
    );

    const alert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    if (alert?.trim()) throw new Error(`Sign-in refused: ${alert.trim()}`);

    const afterPassword = await currentStep(page);

    if (afterPassword === "enrol") {
      throw new Error(
        "This account has no verified TOTP factor yet, so it cannot complete a session.\n" +
          "Finish enrolment in a browser first, then re-run this script.",
      );
    }

    if (afterPassword === "challenge") {
      // Asked for now, not earlier: a TOTP code is only valid for about thirty seconds.
      const code = await Promise.race([
        ask("Six-digit code from your authenticator: ", true),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out waiting for the code.")), PROMPT_TIMEOUT_MS),
        ),
      ]);
      if (!/^\d{6}$/.test(code)) throw new Error("That is not a six-digit code.");

      await page.fill("#code", code);
      await page.getByRole("button", { name: "Verify" }).click();

      const codeAlert = await page
        .locator('[role="alert"]')
        .first()
        .textContent({ timeout: 5_000 })
        .catch(() => null);
      if (codeAlert?.trim()) throw new Error(`Code refused: ${codeAlert.trim()}`);
    }

    // The guard only lets a fully authenticated session onto the Dashboard, so arriving
    // here IS the proof that the session is aal2 and the profile is active.
    await page.waitForURL(`${BASE_URL}${ADMIN_ROOT_PATH}`, { timeout: 30_000 });

    const state = await context.storageState();
    writeFileSync(OUTPUT, JSON.stringify(state, null, 2), { mode: 0o600 });

    const cookieCount = state.cookies.length;
    console.log(`\nSaved ${cookieCount} cookies to ${OUTPUT} (mode 600).`);
    console.log("It is gitignored. Re-run this script when it expires.");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  // Deliberately prints only the message. Nothing here should ever carry a credential, and
  // a stack trace on a login script is noise rather than help.
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
