export interface Section {
  slug: string;
  label: string;
}

// The seven editorial sections (§1.1). Pre-database stand-in: the architecture doc models
// these as a `sections` table (id, slug, name, ..., nav_order, is_active) for admin ordering,
// but no data layer exists yet at this stage. Replace with a lib/queries/ read once it does —
// this is taxonomy, not editorial content, so it's safe to hardcode until then.
export const SECTIONS: Section[] = [
  { slug: "prices", label: "Prices" },
  { slug: "production", label: "Production" },
  { slug: "technology", label: "Technology" },
  { slug: "markets", label: "Markets" },
  { slug: "government", label: "Government" },
  { slug: "interviews", label: "Interviews" },
  { slug: "africa", label: "Africa" },
];

/**
 * The complete set of admin routes (P12.1, P12.5). Six surfaces, plus the login screen and
 * the one editor — which is opened from Draft studio and Publish queue and is NOT a sidebar
 * item. `scripts/check-routes.ts` asserts the filesystem under `app/(admin)/` contains
 * nothing outside this list, so adding a route means editing this constant, which means the
 * reviewer sees it. That is the entire point of the allowlist.
 *
 * Entries not yet built are still listed: the check fails on routes present on disk but
 * absent here, not the other way round.
 */
export const ADMIN_ROUTES = [
  "/admin", // 1. Dashboard
  "/admin/signals", // 2. Signal feed
  "/admin/radar", // 3. Price radar
  "/admin/studio", // 4. Draft studio
  "/admin/queue", // 5. Publish queue
  "/admin/settings/[group]", // 6. Settings
  "/admin/editor/[id]", // the one editor (P3.7)
  "/admin/login", // the only unauthenticated admin route
] as const;

/** The single public entry point into the control room (P12.5) — the footer legal-row link. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Where a fully authenticated session lands: the Dashboard. */
export const ADMIN_ROOT_PATH = "/admin";

/**
 * The product's one timezone. Settings group 9 fixes publishing to WAT (§8.16), and every
 * "today" and "this week" boundary in the control room is read on this clock — a Dashboard
 * that counts a UTC day tells a Lagos editor the wrong thing for the first hour of it.
 * Named as an IANA zone rather than as +01:00 so the maths never hardcodes an offset.
 */
export const WAT_TIME_ZONE = "Africa/Lagos";
