import { ADMIN_LOGIN_PATH, ADMIN_ROOT_PATH } from "../constants";
import { requiresTwoFactor, type UserRole } from "./roles";
import { canViewSurface } from "./surfaces";

/** Supabase's authenticator assurance level. `null` when there is no session to read one from. */
export type AssuranceLevel = "aal1" | "aal2" | null;

/**
 * What `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` reports, plus the profile facts
 * the decision needs. `nextLevel` is "aal2" when the user has at least one VERIFIED factor,
 * so `nextLevel !== "aal2"` is how we detect "has never enrolled".
 */
export interface AdminAccount {
  role: UserRole;
  isActive: boolean;
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}

/**
 * Who is knocking. THREE states, not two — the third is the one that matters:
 *
 *   signed-out    no valid session at all.
 *   unprovisioned a valid session whose `profiles` row does not exist. Supabase authenticated
 *                 the credentials; this project has never granted the user staff access.
 *   staff         a session with a profile row behind it.
 *
 * Collapsing `unprovisioned` into `signed-out` is what produced the bootstrap trap: correct
 * credentials landed back on the credentials form with no message, looking like a rejected
 * password rather than an unfinished account.
 */
export type AdminSession =
  | { type: "signed-out" }
  | { type: "unprovisioned" }
  | { type: "staff"; account: AdminAccount };

export const SIGNED_OUT: AdminSession = { type: "signed-out" };
export const UNPROVISIONED: AdminSession = { type: "unprovisioned" };

export type AdminAccessDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string; reason: AdminRedirectReason };

export type AdminRedirectReason =
  | "signed-out"
  | "unprovisioned"
  | "deactivated"
  | "enrolment-required"
  | "challenge-required"
  | "already-authenticated"
  | "forbidden";

/** The step the login screen should render. Derived server-side on every load, never held
 *  in client state, so a mid-enrolment refresh resumes where it left off. */
export type LoginStep =
  "credentials" | "unprovisioned" | "enrol" | "challenge" | "complete";

function isAdminPath(pathname: string): boolean {
  return (
    pathname === ADMIN_ROOT_PATH || pathname.startsWith(`${ADMIN_ROOT_PATH}/`)
  );
}

/**
 * Two-factor is unfinished when either:
 *   - the role mandates it and no verified factor exists yet (enrolment), or
 *   - a verified factor exists but this session is still aal1 (challenge).
 *
 * The challenge arm is role-independent on purpose: a Contributor who chose to enrol expects
 * the second factor to be asked for. Supabase documents this as the "enforce only for users
 * that have opted-in" case.
 */
export function resolveLoginStep(session: AdminSession): LoginStep {
  if (session.type === "signed-out") return "credentials";
  if (session.type === "unprovisioned") return "unprovisioned";

  const { account } = session;
  if (account.currentLevel === "aal2") return "complete";
  if (account.nextLevel === "aal2") return "challenge";
  return requiresTwoFactor(account.role) ? "enrol" : "complete";
}

/**
 * The whole /admin guard as one pure function, so it can be exhaustively tested with no
 * database and no user. The middleware supplies the facts; this decides.
 */
export function resolveAdminAccess(
  pathname: string,
  session: AdminSession,
): AdminAccessDecision {
  if (!isAdminPath(pathname)) return { type: "allow" };

  const onLoginScreen = pathname === ADMIN_LOGIN_PATH;

  if (session.type === "signed-out") {
    return onLoginScreen
      ? { type: "allow" }
      : { type: "redirect", to: ADMIN_LOGIN_PATH, reason: "signed-out" };
  }

  // A session with no profile row reaches no admin surface, but it is NOT signed out on the
  // way past: the login screen needs the session alive to tell the user why they are stuck.
  if (session.type === "unprovisioned") {
    return onLoginScreen
      ? { type: "allow" }
      : { type: "redirect", to: ADMIN_LOGIN_PATH, reason: "unprovisioned" };
  }

  const { account } = session;

  // A deactivated profile is not a session that may continue (§7.1: users are deactivated
  // via is_active, never deleted). The caller signs the session out on this reason.
  if (!account.isActive) {
    return { type: "redirect", to: ADMIN_LOGIN_PATH, reason: "deactivated" };
  }

  const step = resolveLoginStep(session);

  if (step === "enrol" || step === "challenge") {
    // Stranded at aal1: the login screen is the ONLY admin path reachable. Not the
    // Dashboard, not Settings, nothing.
    return onLoginScreen
      ? { type: "allow" }
      : {
          type: "redirect",
          to: ADMIN_LOGIN_PATH,
          reason:
            step === "enrol" ? "enrolment-required" : "challenge-required",
        };
  }

  if (onLoginScreen) {
    return { type: "redirect", to: ADMIN_ROOT_PATH, reason: "already-authenticated" };
  }

  // Authorisation, after authentication. The sidebar hides what a role may not open, but a
  // hidden link is not a closed door — the URL is still typeable. Both halves read the SAME
  // `canViewSurface`, so a role that loses a nav item loses the route in the same commit.
  //
  // The Dashboard is the fallback because every role can see it (§7.2), which also means
  // this branch cannot loop: `canViewSurface(role, ADMIN_ROOT_PATH)` is true for all four.
  if (!canViewSurface(account.role, pathname)) {
    return { type: "redirect", to: ADMIN_ROOT_PATH, reason: "forbidden" };
  }

  return { type: "allow" };
}
