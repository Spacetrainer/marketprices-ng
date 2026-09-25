import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavBadges, SyncStatus } from "../../lib/queries/dashboard";
import type { UserRole } from "../../lib/auth/roles";

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { Sidebar } = await import("./sidebar");

const badges: NavBadges = {
  signals: { state: "known", value: 0 },
  radar: { state: "known", value: 0 },
  studio: { state: "known", value: 0 },
  queue: { state: "known", value: 0 },
};

const syncStatus: SyncStatus = { lastSync: "No sync yet", nextPriceSync: null };

function render(role: UserRole, path = "/admin") {
  pathname = path;
  return renderToStaticMarkup(
    <Sidebar role={role} badges={badges} syncStatus={syncStatus} />,
  );
}

beforeEach(() => {
  pathname = "/admin";
});

describe("Sidebar", () => {
  it("renders exactly the six surfaces for an Admin, and no seventh (P12.1)", () => {
    const html = render("admin");
    for (const label of [
      "Dashboard",
      "Signal feed",
      "Price radar",
      "Draft studio",
      "Publish queue",
      "Settings",
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html.match(/<li>/g)).toHaveLength(6);
  });

  it("gives an Analyst one nav item — the same rule that closes the routes (§7.2)", () => {
    const html = render("analyst");
    expect(html.match(/<li>/g)).toHaveLength(1);
    expect(html).toContain("Dashboard");
    expect(html).not.toContain("Price radar");
    expect(html).not.toContain("Settings");
  });

  it("hides Settings from a Contributor and keeps the other five", () => {
    const html = render("contributor");
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).not.toContain("Settings");
  });

  it("marks the active item with the amber border, lighter navy and a white label", () => {
    const html = render("admin", "/admin/radar");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("border-l-amber-action");
    expect(html).toContain("bg-sidebar-active-bg");
    expect(html).toContain("text-on-dark");
    // Exactly one item is active.
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("keeps Settings active across its groups, not only its landing group", () => {
    const html = render("admin", "/admin/settings/publishing");
    const active = html.match(/<a[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(active).toContain("Settings");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("labels inactive items #8A9AB6 and never renders a public nav (P12.5)", () => {
    const html = render("admin");
    expect(html).toContain("text-sidebar-inactive");
    expect(html).not.toContain("Sections");
  });

  it("prints the sync line and omits the next price sync while none is scheduled", () => {
    const html = render("admin");
    expect(html).toContain("No sync yet");
    expect(html).not.toContain("Next price sync");
  });
});
