import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  resolveAdminAccess,
  SIGNED_OUT,
  UNPROVISIONED,
  type AdminSession,
  type AssuranceLevel,
} from "../auth/access";
import type { Database } from "../../types/database";
import { readSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookies and applies the /admin guard (P12.5).
 *
 * Cookie handling is fiddly and order-dependent: every branch that returns a DIFFERENT
 * response than `supabaseResponse` must copy the refreshed cookies across, or the rotated
 * refresh token is dropped and the user is silently signed out on the next request.
 */
export async function updateAdminSession(
  request: NextRequest,
): Promise<NextResponse> {
  const { url, publishableKey } = readSupabaseEnv();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the token against the auth server. getSession() does not, so it is
  // never the basis for an authorisation decision here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const session = user ? await readSession(supabase, user.id) : SIGNED_OUT;

  const decision = resolveAdminAccess(request.nextUrl.pathname, session);

  if (decision.type === "allow") {
    return supabaseResponse;
  }

  // A deactivated profile must not merely be redirected — it must be ended, or it keeps
  // arriving with a valid token forever. An UNPROVISIONED session is deliberately NOT signed
  // out here: the login screen needs it to explain that the account is not set up yet.
  if (decision.reason === "deactivated") {
    await supabase.auth.signOut();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = decision.to;
  redirectUrl.search = "";

  const redirectResponse = NextResponse.redirect(redirectUrl);
  for (const cookie of supabaseResponse.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

type AdminSupabaseClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Reads role and active state from `profiles`, and the assurance level from the session.
 *
 * The role comes from a direct database read on every guarded request rather than from a
 * custom access-token claim — a deliberate choice for now, revisitable if it becomes a cost.
 * `profiles_select_own` covers this read, so no service-role client is involved.
 */
async function readSession(
  supabase: AdminSupabaseClient,
  userId: string,
): Promise<AdminSession> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  // An auth.users row with no profiles row is not an authorised staff member. This is the
  // state the very first bootstrapped admin is in before its profile row is inserted, so it
  // is an expected condition with its own message, not a defensive branch and not a
  // sign-out. See docs/exceptions.md, [Auth] bootstrapping the first Admin account.
  if (!profile) return UNPROVISIONED;

  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    type: "staff",
    account: {
      role: profile.role,
      isActive: profile.is_active,
      currentLevel: (aal?.currentLevel ?? null) as AssuranceLevel,
      nextLevel: (aal?.nextLevel ?? null) as AssuranceLevel,
    },
  };
}
