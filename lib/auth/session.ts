import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { createClient } from "../supabase/server";
import {
  SIGNED_OUT,
  UNPROVISIONED,
  type AdminSession,
  type AssuranceLevel,
} from "./access";

/**
 * Who is signed in, read from the request's cookies. ONE reader, so the login screen's step
 * and the shell's role never disagree — they are the same three facts (role, active, AAL)
 * assembled the same way.
 *
 * `getUser()` validates the token against the auth server; `getSession()` does not, so it is
 * never the basis for anything decided here. The middleware has already made the access
 * decision by the time a page calls this, and repeats the same read — a page must not depend
 * on the middleware having run.
 */
export async function readAdminSession(
  client?: SupabaseClient<Database>,
): Promise<AdminSession> {
  const supabase = client ?? (await createClient());

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return SIGNED_OUT;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // An auth.users row with no profiles row is not an authorised staff member. See
  // docs/exceptions.md, [Auth] bootstrapping the first Admin account.
  if (!profile) return UNPROVISIONED;

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

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
