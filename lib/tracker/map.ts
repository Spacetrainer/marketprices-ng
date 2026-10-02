/**
 * map.ts — data/tracker-map.json, validated at the boundary and reduced to three questions.
 *
 * The map is the reviewed record of what the project owner decided about the tracker: which
 * (Product, Variety) is which commodity, which portion string is which unit, and which unit is
 * primary for each commodity and tier. Migrations 0044 and 0045 were generated from it. The
 * importer reads the same file so that the catalogue and the import cannot disagree about what
 * a row means.
 *
 * IT IS AN EXTERNAL INPUT, so it is parsed with Zod before anything touches it (CLAUDE.md). A
 * hand-edited map with a typo in a slug must fail here, naming the field, rather than post a
 * price against a commodity that does not exist.
 *
 * THE SCHEMA IS DELIBERATELY NARROW. The file carries far more than this — counts, a bunch
 * ruling, a per-key reason for every decision, the whole audit trail. Zod objects are
 * non-strict, so all of that is read past and dropped. Only the fields the planner acts on are
 * described here, which means a future addition to the map cannot break the importer, and a
 * change to a field the importer DOES use cannot slip through unvalidated.
 *
 * THREE QUESTIONS, AND WHAT "NO ANSWER" MEANS. Each lookup below can return null, and null is
 * never a default:
 *   - no commodity for this (sheet, product, variety) → the row is refused, not guessed at;
 *   - a commodity whose slug is null (status PENDING) → refused, which is the whole point of
 *     PENDING (P0.2). Ayoo is the one such row;
 *   - no unit for this portion string, or a unit held pending a ruling → refused.
 * The planner turns each of those into a named refusal. Nothing here decides to skip.
 */

import { z } from "zod";
import { TIERS } from "../validation/ingest";

/** A commodity's placement per commodity, for the portion strings that need one. */
const unitByCommoditySchema = z.object({
  default: z.string().min(1).nullable(),
  overrides: z.record(z.string().min(1), z.string().min(1)),
});

const mapCommoditySchema = z.object({
  n: z.number().int(),
  sheet: z.string().min(1),
  product: z.string().min(1),
  variety: z.string().min(1),
  portions: z.array(z.string().min(1)),
  slug: z.string().min(1).nullable(),
  name: z.string().min(1).nullable(),
  status: z.string().min(1),
});

const mapUnitSchema = z.object({
  unit: z.string().min(1).nullable(),
  status: z.string().min(1),
  unit_by_commodity: unitByCommoditySchema.optional(),
});

const primaryUnitRowSchema = z.object({
  slug: z.string().min(1),
  tier: z.enum(TIERS),
  primary_unit: z.string().min(1).nullable(),
  rule: z.string().min(1),
});

export const trackerMapSchema = z.object({
  commodities: z.array(mapCommoditySchema).min(1, "the map lists no commodities"),
  units: z.record(z.string().min(1), mapUnitSchema),
  primary_units: z.object({ rows: z.array(primaryUnitRowSchema) }),
});

export type TrackerMap = z.infer<typeof trackerMapSchema>;
export type MapCommodity = z.infer<typeof mapCommoditySchema>;

export class MapError extends Error {}

/** Parse a already-JSON-decoded map, naming the field when it is wrong. */
export function parseTrackerMap(value: unknown): TrackerMap {
  const result = trackerMapSchema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new MapError(`data/tracker-map.json is not usable: ${detail}`);
  }
  return result.data;
}

/**
 * An index built once, because the planner asks these questions per row and the map holds 244
 * commodities and 61 portion strings.
 */
export interface MapIndex {
  map: TrackerMap;
  commodityByKey: Map<string, MapCommodity>;
  primaryByKey: Map<string, string | null>;
}

/**
 * The key a tracker row is identified by: its sheet, product and variety together.
 *
 * Joined on U+0000 because no spreadsheet cell can contain one, so two different triples can
 * never collide into a single key — which a space or a slash could, given portion strings like
 * "Per bunch (large)". Written as the ESCAPE rather than as the byte itself: a literal NUL makes
 * the whole file binary to grep, and `grep -I` is what check-vocab.sh uses to audit lib/, so the
 * byte form quietly exempted this entire module from the vocabulary check (P12.3).
 */
export function commodityKey(sheet: string, product: string, variety: string): string {
  return `${sheet}\u0000${product}\u0000${variety}`;
}

export function indexTrackerMap(map: TrackerMap): MapIndex {
  const commodityByKey = new Map<string, MapCommodity>();

  for (const entry of map.commodities) {
    const key = commodityKey(entry.sheet, entry.product, entry.variety);
    if (commodityByKey.has(key)) {
      // Two map rows claiming one tracker key would make the lookup order-dependent, and the
      // whole file exists to remove that kind of ambiguity. Refuse to build the index.
      throw new MapError(
        `The map has two entries for ${entry.sheet} / ${entry.product} / ${entry.variety} (keys ` +
          `${commodityByKey.get(key)?.n} and ${entry.n}), so a row naming it could resolve to either.`,
      );
    }
    commodityByKey.set(key, entry);
  }

  const primaryByKey = new Map<string, string | null>();
  for (const row of map.primary_units.rows) {
    primaryByKey.set(`${row.slug}\u0000${row.tier}`, row.primary_unit);
  }

  return { map, commodityByKey, primaryByKey };
}

/** The map's entry for a tracker row, or null when the map does not know it. */
export function lookupCommodity(
  index: MapIndex,
  sheet: string,
  product: string,
  variety: string,
): MapCommodity | null {
  return index.commodityByKey.get(commodityKey(sheet, product, variety)) ?? null;
}

/**
 * The database unit for a portion string, for this commodity.
 *
 * Most portion strings mean one unit everywhere. Three do not, and the map records that as
 * `unit_by_commodity`: "Per bunch (large)" is a Big bundle for a leaf and a Bunch (large) for a
 * hand of plantain, and "Per bag" is a Bag (50 kg) for sweet potato while the bagged leaf rows
 * were relabelled entirely. Reading the override by slug is what keeps a plantain out of the
 * ugwu unit, and P1.7 makes the unit half of the series key, so getting it wrong would file a
 * price into a series it does not belong to.
 */
export function lookupUnit(index: MapIndex, portion: string, slug: string): string | null {
  const entry = index.map.units[portion];
  if (!entry) return null;

  if (entry.unit_by_commodity) {
    return entry.unit_by_commodity.overrides[slug] ?? entry.unit_by_commodity.default;
  }

  return entry.unit;
}

/** Whether the map knows this portion string at all — distinct from knowing its unit. */
export function knowsPortion(index: MapIndex, portion: string): boolean {
  return Object.hasOwn(index.map.units, portion);
}

/** The approved primary unit for a commodity and tier, or null when the map has no row. */
export function lookupPrimaryUnit(index: MapIndex, slug: string, tier: string): string | null {
  return index.primaryByKey.get(`${slug}\u0000${tier}`) ?? null;
}

// ---------------------------------------------------------------------------
// The tab-title check
// ---------------------------------------------------------------------------

/**
 * The tab titles the map expects to find, in the order it first mentions them.
 *
 * DERIVED, NEVER WRITTEN DOWN. The nine titles carry emoji and ampersands (🥩 Beef & Goat Meat),
 * and P0.2 forbids a commodity or site name appearing as a string literal in `lib/` — so the
 * only legitimate source for "which tabs should be there" is the reviewed map itself. A list
 * typed into this file would also be a second place to update when a tab is renamed, and the
 * two would disagree within a month.
 */
export function expectedSheetNames(map: TrackerMap): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of map.commodities) {
    if (seen.has(entry.sheet)) continue;
    seen.add(entry.sheet);
    names.push(entry.sheet);
  }

  return names;
}

export interface SheetNameCheck {
  /** Tabs the map resolves rows against that the spreadsheet did not offer as data tabs. */
  missing: string[];
  /** Data tabs the spreadsheet offered that the map has never heard of. */
  unexpected: string[];
}

/**
 * WHY THIS CHECK EXISTS: a renamed tab is the one failure that is otherwise silent.
 *
 * The map resolves every row by (sheet, product, variety). Rename "🍗 Poultry" to "🍗 Poultry "
 * on a phone — a trailing space is invisible — and the importer does not crash and does not
 * refuse: it reports a normal-looking plan with a whole tab's prices quietly absent, or two
 * hundred `unknown_product` refusals whose actual cause is one character in a tab title. Google
 * Sheets makes this likelier than the .xlsx ever did, because renaming a tab is now a thing
 * done with a thumb.
 *
 * `actualDataTabs` is deliberately the tabs the READER accepted, not every tab in the
 * spreadsheet. The tracker legitimately carries tabs the map knows nothing about — a guide, a
 * dashboard, a history log — and reporting those as unexpected every single run is how a check
 * gets ignored. A tab only counts here once it has claimed to hold prices by carrying the
 * "Publish as" header.
 *
 * It reports; it does not block. A tab mid-rewrite is not a reason to refuse the eight tabs that
 * are fine, which is the same stance the planner takes on refusals.
 */
export function checkSheetNames(
  expected: readonly string[],
  actualDataTabs: readonly string[],
): SheetNameCheck {
  const actual = new Set(actualDataTabs);
  const known = new Set(expected);

  return {
    missing: expected.filter((name) => !actual.has(name)),
    unexpected: actualDataTabs.filter((name) => !known.has(name)),
  };
}
