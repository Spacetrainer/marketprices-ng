import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../types/database";
import { readSupabaseEnv } from "./env";

/**
 * Browser client. Used only where the flow genuinely needs the user's own session in the
 * browser — TOTP enrolment reads `mfa.enroll()`'s QR payload, which must not round-trip
 * through a server action carrying the shared secret.
 */
export function createClient() {
  const { url, publishableKey } = readSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
