import { describe, expect, it } from "vitest";
import {
  ADMIN_SURFACES,
  canViewSurface,
  canViewSurfaceId,
  surfaceForPath,
  visibleSurfaces,
  type SurfaceId,
} from "./surfaces";
import { ADMIN_ROUTES } from "../constants";
import type { UserRole } from "./roles";

const ROLES: UserRole[] = ["admin", "editor", "contributor", "analyst"];

describe("ADMIN_SURFACES", () => {
  it("is exactly six, in spec order (P12.1, §7.5)", () => {
    expect(ADMIN_SURFACES.map((s) => s.label)).toEqual([
      "Dashboard",
      "Signal feed",
      "Price radar",
      "Draft studio",
      "Publish queue",
      "Settings",
    ]);
  });

  it("badges exactly the four surfaces §7.5 names, and no others", () => {
    const badged = ADMIN_SURFACES.filter((s) => s.badge !== null).map((s) => s.id);
    expect(badged).toEqual(["signals", "radar", "studio", "queue"]);
  });

  it("points every item at an allowlisted admin route", () => {
    // Settings' href carries a concrete group; the allowlist holds the dynamic segment.
    const allowed = new Set<string>(ADMIN_ROUTES);
    for (const surface of ADMIN_SURFACES) {
      const route =
        surface.id === "settings" ? "/admin/settings/[group]" : surface.href;
      expect(allowed.has(route), `${surface.label} → ${route}`).toBe(true);
    }
  });
});

describe("visibleSurfaces", () => {
  it("gives Admin all six", () => {
    expect(visibleSurfaces("admin")).toHaveLength(6);
  });

  it("gives Editor all six — Settings groups 2–5 and 7–11 are theirs (§7.2)", () => {
    expect(visibleSurfaces("editor")).toHaveLength(6);
  });

  it("gives Contributor five: everything but Settings", () => {
    expect(visibleSurfaces("contributor").map((s) => s.id)).toEqual([
      "dashboard",
      "signals",
      "radar",
      "studio",
      "queue",
    ]);
  });

  it("gives Analyst exactly one item, the Dashboard (§7.1)", () => {
    expect(visibleSurfaces("analyst").map((s) => s.id)).toEqual(["dashboard"]);
  });

  it("never returns an empty sidebar for any role", () => {
    for (const role of ROLES) expect(visibleSurfaces(role).length).toBeGreaterThan(0);
  });

  it("preserves spec order for every role", () => {
    const order = ADMIN_SURFACES.map((s) => s.id);
    for (const role of ROLES) {
      const visible = visibleSurfaces(role).map((s) => s.id);
      expect(visible).toEqual(order.filter((id) => visible.includes(id)));
    }
  });
});

describe("surfaceForPath", () => {
  const cases: [string, SurfaceId | null][] = [
    ["/admin", "dashboard"],
    ["/admin/signals", "signals"],
    ["/admin/radar", "radar"],
    ["/admin/studio", "studio"],
    ["/admin/queue", "queue"],
    ["/admin/settings/sources", "settings"],
    ["/admin/settings/publishing", "settings"],
    ["/admin/settings", "settings"],
    ["/admin/login", null],
    ["/admin/editor/abc", null],
    ["/admin/nonsense", null],
  ];

  for (const [pathname, expected] of cases) {
    it(`maps ${pathname} → ${expected ?? "null"}`, () => {
      expect(surfaceForPath(pathname)).toBe(expected);
    });
  }

  it("does not mistake a longer path for the Dashboard", () => {
    // Dashboard is an EXACT match. Prefix-matching "/admin" would swallow every admin path.
    expect(surfaceForPath("/admin/radar")).not.toBe("dashboard");
  });
});

describe("canViewSurface", () => {
  it("lets every role open the Dashboard", () => {
    for (const role of ROLES) expect(canViewSurface(role, "/admin")).toBe(true);
  });

  it("refuses an Analyst every surface except the Dashboard", () => {
    for (const path of [
      "/admin/signals",
      "/admin/radar",
      "/admin/studio",
      "/admin/queue",
      "/admin/settings/sources",
    ]) {
      expect(canViewSurface("analyst", path), path).toBe(false);
    }
  });

  it("refuses an Analyst the editor as well — §7.2 gives the role no edit rights", () => {
    expect(canViewSurface("analyst", "/admin/editor/abc")).toBe(false);
  });

  it("lets Contributor open the editor and the four working surfaces", () => {
    for (const path of [
      "/admin/signals",
      "/admin/radar",
      "/admin/studio",
      "/admin/queue",
      "/admin/editor/abc",
    ]) {
      expect(canViewSurface("contributor", path), path).toBe(true);
    }
  });

  it("refuses Contributor Settings, at any group", () => {
    expect(canViewSurface("contributor", "/admin/settings/sources")).toBe(false);
    expect(canViewSurface("contributor", "/admin/settings/publishing")).toBe(false);
  });

  it("lets Admin and Editor open Settings", () => {
    expect(canViewSurface("admin", "/admin/settings/sources")).toBe(true);
    expect(canViewSurface("editor", "/admin/settings/sources")).toBe(true);
  });

  it("allows unmatched admin paths through to Next's 404 rather than guessing", () => {
    for (const role of ROLES) expect(canViewSurface(role, "/admin/nonsense")).toBe(true);
  });

  it("agrees with visibleSurfaces for every role and every surface", () => {
    // The property that makes one source of truth true: what the sidebar shows is exactly
    // what the guard admits. A drift between these two is the bug this module exists for.
    for (const role of ROLES) {
      const shown = new Set(visibleSurfaces(role).map((s) => s.id));
      for (const surface of ADMIN_SURFACES) {
        expect(canViewSurfaceId(role, surface.id), `${role} / ${surface.id}`).toBe(
          shown.has(surface.id),
        );
      }
    }
  });
});
