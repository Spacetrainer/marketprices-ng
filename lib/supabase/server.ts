import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../../types/database";
import { readSupabaseEnv } from "./env";

/**
 * Server client for Server Components and Server Actions. Cookie writes throw in a Server
 * Component (Next.js forbids them outside actions and route handlers); the middleware
 * refreshes the session on every request, so swallowing that is correct rather than lossy.
 */
export async function createClient() {
  const { url, publishableKey } = readSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component. See the note above.
        }
      },
    },
  });
}
