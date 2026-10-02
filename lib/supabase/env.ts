/**
 * The publishable key is public by design and ships in the client bundle by intent (P9.3).
 * The secret key (`sb_secret_...`) is NOT read here and has no module in `lib/supabase/`
 * yet: nothing in the auth flow needs to bypass RLS, and an unused service-role client is a
 * liability, not a convenience. Add one when a caller genuinely needs it.
 */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` only at literal member-access sites, so these
 * two reads cannot be made dynamic.
 */
export function readSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Fail loudly at the boundary. A missing key otherwise surfaces as an opaque auth error
  // on the login screen, which is a bad place to learn about a deployment mistake.
  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Supabase environment incomplete — missing ${missing}`);
  }

  return { url, publishableKey };
}
