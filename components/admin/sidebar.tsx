import { visibleSurfaces } from "../../lib/auth/surfaces";
import type { UserRole } from "../../lib/auth/roles";
import type { NavBadges, SyncStatus } from "../../lib/queries/dashboard";
import { SidebarNav } from "./sidebar-nav";
import { SyncBlock } from "./sync-block";

export interface SidebarProps {
  role: UserRole;
  badges: NavBadges;
  syncStatus: SyncStatus;
}

/**
 * The control room's chrome (§7.3, §7.5): 240px, `--navy-deep`, full height.
 *
 * The item list is computed HERE, on the server, from `visibleSurfaces(role)` — the same
 * function `resolveAdminAccess` blocks on. Hiding a nav item and closing its route are one
 * decision, so an Analyst gets one item and a typed `/admin/radar` gets a redirect, and
 * neither can drift from the other.
 */
export function Sidebar({ role, badges, syncStatus }: SidebarProps) {
  return (
    <aside className="flex w-[var(--admin-side)] shrink-0 flex-col bg-navy-deep">
      <div className="px-sp-4 py-sp-6">
        <span className="font-display text-fs-h4 text-on-dark">MarketPrices</span>
      </div>

      <SidebarNav surfaces={visibleSurfaces(role)} badges={badges} />

      <SyncBlock status={syncStatus} />
    </aside>
  );
}
