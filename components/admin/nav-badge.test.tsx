import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavBadge } from "./nav-badge";
import type { BadgeKey } from "../../lib/auth/surfaces";

const NON_RADAR: BadgeKey[] = ["signals", "studio", "queue"];

describe("NavBadge", () => {
  it("fills the Price radar badge with --fall, the one fill §7.5 names", () => {
    const html = renderToStaticMarkup(
      <NavBadge badge="radar" measure={{ state: "known", value: 3 }} />,
    );
    expect(html).toContain("bg-badge-urgent-bg");
    expect(html).not.toContain("bg-badge-count-bg");
  });

  it("fills the three unspecified badges with --navy-brand", () => {
    for (const badge of NON_RADAR) {
      const html = renderToStaticMarkup(
        <NavBadge badge={badge} measure={{ state: "known", value: 3 }} />,
      );
      expect(html, badge).toContain("bg-badge-count-bg");
      expect(html, badge).not.toContain("bg-badge-urgent-bg");
    }
  });

  it("renders a measured zero rather than disappearing", () => {
    const html = renderToStaticMarkup(
      <NavBadge badge="studio" measure={{ state: "known", value: 0 }} />,
    );
    expect(html).toContain(">0<");
  });

  it("renders an unreadable count as a dash with its reason, never as 0", () => {
    const html = renderToStaticMarkup(
      <NavBadge
        badge="studio"
        measure={{
          state: "unavailable",
          label: "Unavailable",
          note: "The count could not be read.",
        }}
      />,
    );
    expect(html).toContain("The count could not be read.");
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("bg-badge-count-bg");
  });
});
