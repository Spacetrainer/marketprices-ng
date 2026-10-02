"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  surfaceForPath,
  type AdminSurface,
  type SurfaceId,
} from "../../lib/auth/surfaces";
import type { NavBadges } from "../../lib/queries/dashboard";
import { NavBadge } from "./nav-badge";

export interface SidebarNavProps {
  /** Already filtered by role — see the note in the Sidebar. Never empty. */
  surfaces: readonly AdminSurface[];
  badges: NavBadges;
}

/**
 * The sidebar's six items (§7.5, P12.1). Client-side only because the active item needs the
 * current path; the LIST it renders is decided on the server by `visibleSurfaces(role)`, so
 * nothing a role may not open is ever serialised into the page.
 *
 * Active state comes from `surfaceForPath`, the same mapper the access guard uses, so
 * `/admin/settings/publishing` highlights Settings rather than nothing.
 */
export function SidebarNav({ surfaces, badges }: SidebarNavProps) {
  const pathname = usePathname();
  const active = surfaceForPath(pathname);

  // §7.5 and the build plan both separate Settings to the bottom, above the status block.
  const main = surfaces.filter((surface) => surface.id !== "settings");
  const settings = surfaces.filter((surface) => surface.id === "settings");

  return (
    <nav aria-label="Control room" className="flex flex-1 flex-col justify-between">
      <ul className="flex flex-col">
        {main.map((surface) => (
          <NavItem key={surface.id} surface={surface} active={active} badges={badges} />
        ))}
      </ul>
      {settings.length > 0 ? (
        <ul className="flex flex-col border-t border-t-navy-brand pt-sp-2">
          {settings.map((surface) => (
            <NavItem key={surface.id} surface={surface} active={active} badges={badges} />
          ))}
        </ul>
      ) : null}
    </nav>
  );
}

function NavItem({
  surface,
  active,
  badges,
}: {
  surface: AdminSurface;
  active: SurfaceId | null;
  badges: NavBadges;
}) {
  const isActive = surface.id === active;

  return (
    <li>
      <Link
        href={surface.href}
        aria-current={isActive ? "page" : undefined}
        className={[
          // The 3px amber left border is drawn on every item so the active one does not
          // shift its label 3px sideways; the inactive ones draw it transparent.
          "flex items-center justify-between gap-sp-2 border-l-[3px] px-sp-4 py-sp-3 text-fs-nav",
          isActive
            ? "border-l-amber-action bg-sidebar-active-bg font-bold text-on-dark"
            : "border-l-transparent font-medium text-sidebar-inactive",
        ].join(" ")}
      >
        <span>{surface.label}</span>
        {surface.badge ? (
          <NavBadge badge={surface.badge} measure={badges[surface.badge]} />
        ) : null}
      </Link>
    </li>
  );
}
