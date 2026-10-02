import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

/**
 * The service-role client — the ONE client that bypasses RLS.
 *
 * lib/supabase/env.ts declined to read the secret key on the grounds that "an unused
 * service-role client is a liability, not a convenience". A caller now genuinely needs one:
 * POST /api/ingest/price is authenticated by a shared bearer token held by a Google Apps
 * Script, not by a Supabase session, so there is no `auth.uid()` for any policy to test.
 * 0009's insert policy is deliberately staff-only and this path is not staff — the migration
 * says so itself: "the public Google Form pipeline ... lands rows through /api/ingest/price
 * under service-role credentials, which bypasses RLS entirely and isn't a grant made here".
 *
 * BYPASSING RLS IS NOT BYPASSING THE PROTOCOL. This client can write price_submissions and
 * nothing about that makes it a second door into the published series (P1.1): submissions
 * land as `pending`, and price_observations is reachable only through a human approving one.
 * 0025 and 0030 hold that lock against service-role too.
 *
 * Three guards, in order of how badly each failure would end:
 *   - never constructed in a browser, so the key cannot be reached from a client component;
 *   - never persists or refreshes a session, so it cannot pick up a user's cookie and act
 *     as them, and cannot leave a service-role token in storage;
 *   - fails loudly on a missing key rather than falling back to the publishable one, which
 *     would silently turn every insert into an RLS denial at 3am.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() was called in the browser — the secret key is server-only");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !secretKey && "SUPABASE_SECRET_KEY"]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Supabase service-role environment incomplete — missing ${missing}`);
  }

  return createSupabaseClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
