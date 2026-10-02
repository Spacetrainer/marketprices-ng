import type { Database } from "../../types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

/**
 * Roles for which TOTP two-factor is mandatory (P9.4, §7.1).
 *
 * Admin and Editor only. Contributor and Analyst may enrol voluntarily — and once they
 * have, `resolveAdminAccess` still makes them clear the challenge — but they are never
 * forced into enrolment.
 */
const TWO_FACTOR_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["admin", "editor"]);

export function requiresTwoFactor(role: UserRole): boolean {
  return TWO_FACTOR_ROLES.has(role);
}

/**
 * Who may decide a price submission — approve it, edit-and-approve it, or reject it (P1.1).
 *
 * Admin and Editor, which is the same set `is_admin_or_editor()` gates on in the database.
 * THE DATABASE IS THE AUTHORITY, NOT THIS FUNCTION: `approve_price_submission()` and
 * `reject_price_submission()` read `auth.uid()` and check the caller themselves, and after
 * migration 0038 no signed-in role holds UPDATE on `price_submissions` at all. This decides
 * only what to RENDER, so a Contributor is not shown three buttons that would refuse them.
 *
 * A CONTRIBUTOR STILL SEES THE WHOLE QUEUE, and that is deliberate rather than an oversight
 * (§7.2, confirmed 2026-09-17): `price_submissions_select_staff` is `is_staff()`, so seeing
 * what is waiting is a right every staff member has. Seeing it is not the same right as
 * publishing it.
 */
const PRICE_DECIDING_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["admin", "editor"]);

export function canDecidePriceSubmissions(role: UserRole): boolean {
  return PRICE_DECIDING_ROLES.has(role);
}
