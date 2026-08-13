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
