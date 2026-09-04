import { ADMIN_ROOT_PATH } from "../constants";
import type { UserRole } from "./roles";

/**
 * The six control-room surfaces (P12.1, §7.5), in sidebar order, and who may see each one.
 *
 * This module is the SINGLE source of truth for that question. The sidebar renders
 * `visibleSurfaces(role)`; `resolveAdminAccess` blocks on `canViewSurface(role, pathname)`.
 * Two separate answers would mean a hidden nav item whose route still serves — which is not
 * access control, it is decoration, and the Analyst role (§7.1: "this is the only screen an
 * Analyst sees, and that is the point of the role") is precisely the case that would break.
 *
 * A seventh entry here is a P12.1 violation. `ADMIN_ROUTES` in lib/constants.ts and
 * scripts/check-routes.ts are the other two halves of that guarantee.
 */

export type SurfaceId =
  | "dashboard"
  | "signals"
  | "radar"
  | "studio"
  | "queue"
  | "settings";

/** Which nav count fills a sidebar badge. Dashboard and Settings carry none (§7.5). */
export type BadgeKey = "signals" | "radar" | "studio" | "queue";

export interface AdminSurface {
  id: SurfaceId;
  label: string;
  href: string;
  badge: BadgeKey | null;
}

/**
 * Settings is `/admin/settings/[group]`, so the nav item needs a landing group. Group 2
 * (Sources) is the lowest-numbered group an Editor may open — groups 1, 6 and 12 are
 * Admin-only (§8.16) — so it is the one destination correct for every role that can reach
 * Settings at all. The group slugs themselves land with the Settings surface in stage 17.
 */
export const SETTINGS_LANDING_GROUP = "sources";

export const ADMIN_SURFACES: readonly AdminSurface[] = [
  { id: "dashboard", label: "Dashboard", href: ADMIN_ROOT_PATH, badge: null },
  { id: "signals", label: "Signal feed", href: "/admin/signals", badge: "signals" },
  { id: "radar", label: "Price radar", href: "/admin/radar", badge: "radar" },
  { id: "studio", label: "Draft studio", href: "/admin/studio", badge: "studio" },
  { id: "queue", label: "Publish queue", href: "/admin/queue", badge: "queue" },
  {
    id: "settings",
    label: "Settings",
    href: `/admin/settings/${SETTINGS_LANDING_GROUP}`,
    badge: null,
  },
] as const;

/**
 * The role matrix (§7.2), read as three facts rather than a 6 × 4 grid:
 *
 *   - Every role sees the Dashboard. Analyst sees NOTHING else.
 *   - Settings is Admin and Editor only (Contributor has no ✓ in either Settings row).
 *   - Everything else is open to Admin, Editor and Contributor.
 */
const DASHBOARD_ONLY: ReadonlySet<UserRole> = new Set<UserRole>(["analyst"]);
const SETTINGS_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["admin", "editor"]);

export function canViewSurfaceId(role: UserRole, id: SurfaceId): boolean {
  if (id === "dashboard") return true;
  if (DASHBOARD_ONLY.has(role)) return false;
  if (id === "settings") return SETTINGS_ROLES.has(role);
  return true;
}

/** The sidebar's items for this role, in spec order. Never empty — Dashboard is universal. */
export function visibleSurfaces(role: UserRole): readonly AdminSurface[] {
  return ADMIN_SURFACES.filter((surface) => canViewSurfaceId(role, surface.id));
}

/**
 * Which surface a path belongs to. `null` means "not one of the six" — the login screen, the
 * editor, or a path that does not exist. Callers decide what that means; this only maps.
 */
export function surfaceForPath(pathname: string): SurfaceId | null {
  if (pathname === ADMIN_ROOT_PATH) return "dashboard";

  for (const surface of ADMIN_SURFACES) {
    if (surface.id === "dashboard") continue;
    // Compare against the static prefix, not the landing href: Settings' href carries a
    // group slug, and `/admin/settings/publishing` is the same surface as `/admin/settings/sources`.
    const prefix = surface.id === "settings" ? "/admin/settings" : surface.href;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return surface.id;
  }
  return null;
}

/**
 * May this role open this path? The authorisation half of the guard.
 *
 * The editor at `/admin/editor/[id]` is not a surface but it IS authorised here: §7.2 gives
 * Analyst no edit rights at all, so an Analyst who guesses an editor URL is refused like any
 * other non-Dashboard path. Paths that match nothing are allowed through to Next's 404 —
 * refusing them would turn the guard into a second, drifting route inventory.
 */
export function canViewSurface(role: UserRole, pathname: string): boolean {
  const surface = surfaceForPath(pathname);
  if (surface) return canViewSurfaceId(role, surface);

  const isEditor =
    pathname === "/admin/editor" || pathname.startsWith("/admin/editor/");
  if (isEditor) return !DASHBOARD_ONLY.has(role);

  return true;
}
