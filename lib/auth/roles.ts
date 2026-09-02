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
