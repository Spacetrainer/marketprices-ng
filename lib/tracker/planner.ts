/**
 * planner.ts — every decision the importer makes, as one pure function.
 *
 * In goes what the reader found, the reviewed map, the collector list and the set of series
 * already recorded. Out comes three lists: what would be posted, what was skipped and why, and
 * what was refused and why. No network, no database, no clock, no filesystem — which is why
 * every rule below has a test that states it in one grid of cells.
 *
 * SKIPPED AND REFUSED ARE NOT THE SAME THING, and keeping them apart is the point of the
 * report. A SKIP is the tracker working as designed: a row the owner chose not to publish, a
 * week with no price in it, a series already in the database. A REFUSAL is something a human
 * has to look at: a row the map cannot explain, a column missing its provenance, a third price
 * for a slot that holds two. A run with 200 skips is normal. A run with one refusal is not.
 *
 * NOTHING IS EVER ASSUMED (P0.2). There is no fallback anywhere in this file. An unknown
 * product is not posted under a guess; a portion whose unit is still pending is not posted
 * under a likely one; a column with no collection date is not posted under today's. Each
 * becomes a refusal naming the cell, because the alternative is a fabricated figure in a
 * published series and nothing downstream could tell.
 *
 * THE TWO-PRICE CAP IS COUNTED ACROSS THE WHOLE WORKBOOK. P1.7, as amended by 0041, allows at
 * most two prices per commodity, per ISO week, per tier, and they must be in DIFFERENT units.
 * A commodity can appear on more than one tab, so counting per sheet would let a third price
 * through the gap between two tabs. Rows already in the database count against the cap too —
 * the cap is about what ends up stored, not about what this run happens to send.
 */

import { isoWeekOfCivilDate } from "../weeks";
import { TIERS, type Tier, type UnitRole } from "../validation/ingest";
import {
  knowsPortion,
  lookupCommodity,
  lookupPrimaryUnit,
  lookupUnit,
  type MapIndex,
} from "./map";
import type { TrackerReading, TrackerRow } from "./reader";

/** Why a row is not being posted, though nothing is wrong. */
export const SKIP_CODES = ["not_published", "no_price", "already_recorded"] as const;
export type SkipCode = (typeof SKIP_CODES)[number];

/** Why a row is not being posted, and somebody needs to know. */
export const REFUSAL_CODES = [
  "column_incomplete",
  "unknown_tier",
  "unknown_product",
  "pending_commodity",
  "unknown_portion",
  "unit_pending",
  "unreadable_price",
  "unknown_collector",
  "inactive_collector",
  "duplicate_slot",
  "too_many_units",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface PlannerCollector {
  name: string;
  phone: string;
  isActive: boolean;
}

export interface PlannerInput {
  reading: TrackerReading;
  index: MapIndex;
  collectors: PlannerCollector[];
  /**
   * Series already submitted (pending or approved) or published, as keys from
   * `recordedKey`. A member here is skipped AND still occupies one of the week's two slots.
   */
  alreadyRecorded: ReadonlySet<string>;
}

/** One row that would become one POST to /api/ingest/price. */
export interface PlannedPost {
  sheet: string;
  rowNumber: number;
  /** The week column this price came from, carried as provenance, never as a week. */
  column: string;
  slug: string;
  commodity: string;
  variety: string;
  tier: Tier;
  unit: string;
  unitRole: UnitRole;
  price: number;
  market: string;
  collectedOn: string;
  isoYear: number;
  isoWeek: number;
  collectorName: string;
  collectorPhone: string;
}

export interface PlannerNote {
  sheet: string;
  /** Null when the note is about a whole column rather than one row. */
  rowNumber: number | null;
  /** What the note is about, in the tracker's own words. */
  subject: string;
  detail: string;
}

export interface Plan {
  column: string;
  posts: PlannedPost[];
  skipped: (PlannerNote & { code: SkipCode })[];
  refusals: (PlannerNote & { code: RefusalCode })[];
  ignoredSheets: { name: string; reason: string }[];
}

/** The series key P1.7 makes unique: commodity, tier, unit, ISO week. */
export function recordedKey(
  slug: string,
  tier: string,
  unit: string,
  isoYear: number,
  isoWeek: number,
): string {
  return `${slug}|${tier}|${unit}|${isoYear}|${isoWeek}`;
}

/**
 * A price cell as a number, or null.
 *
 * The same normalisation the ingest route applies, done here so a bad cell is a named refusal
 * against a row number rather than a 400 from the far end of an HTTP call. "₦95,000" is a
 * valid price a human typed; "n/a" is not a price at all.
 */
export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[₦\s,]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** One candidate that survived the skips and resolved against the map. */
interface Candidate {
  row: TrackerRow;
  slug: string;
  commodity: string;
  tier: Tier;
  unit: string;
  price: number;
  market: string;
  collectedOn: string;
  isoYear: number;
  isoWeek: number;
  collectorName: string;
  collectorPhone: string;
}

function subjectOf(row: TrackerRow): string {
  return `${row.product} / ${row.variety} / ${row.portion}`;
}

export function planImport(input: PlannerInput): Plan {
  const { reading, index, collectors, alreadyRecorded } = input;

  const posts: PlannedPost[] = [];
  const skipped: (PlannerNote & { code: SkipCode })[] = [];
  const refusals: (PlannerNote & { code: RefusalCode })[] = [];
  const candidates: Candidate[] = [];

  const skip = (row: TrackerRow, code: SkipCode, detail: string) =>
    skipped.push({ code, sheet: row.sheet, rowNumber: row.rowNumber, subject: subjectOf(row), detail });
  const refuse = (row: TrackerRow, code: RefusalCode, detail: string) =>
    refusals.push({ code, sheet: row.sheet, rowNumber: row.rowNumber, subject: subjectOf(row), detail });

  const collectorByName = new Map(
    collectors.map((collector) => [collector.name.trim().toLowerCase(), collector]),
  );

  // -- Stage 1: per sheet, the skips first and then the column's own provenance -------------
  for (const sheet of reading.sheets) {
    const context = sheet.context;
    // Carried as a narrowed pair rather than the row alone, so nothing below needs a non-null
    // assertion to read back the two fields the skips above have already proved are present.
    const priced: { row: TrackerRow; publishAs: string; price: string }[] = [];

    for (const row of sheet.rows) {
      if (row.publishAs === null) {
        skip(row, "not_published", "column A is blank — the row is kept in the sheet only");
        continue;
      }
      if (row.price === null) {
        skip(row, "no_price", `no price in column ${context.letter}`);
        continue;
      }
      priced.push({ row, publishAs: row.publishAs, price: row.price });
    }

    // A column with nothing priced in it needs no provenance, so this is checked only once
    // there is something that would otherwise be posted. Otherwise every empty future week
    // would report seventy refusals about a market nobody has visited yet.
    if (priced.length === 0) continue;

    const { market, collectedOn, collector: collectorCell } = context;

    const missing = [
      market === null && "MARKET VISITED",
      collectedOn === null && (context.dateProblem ?? "DATE COLLECTED"),
      collectorCell === null && "COLLECTED BY",
    ].filter((value): value is string => typeof value === "string");

    if (market === null || collectedOn === null || collectorCell === null) {
      for (const { row } of priced) {
        refuse(
          row,
          "column_incomplete",
          `column ${context.letter} is missing ${missing.join(", ")} — a price without its market, date and collector has no provenance (P1)`,
        );
      }
      continue;
    }

    const { isoYear, isoWeek } = isoWeekOfCivilDate(collectedOn);

    // -- Stage 2: resolve each priced row against the map ---------------------------------
    for (const { row, publishAs, price: rawPrice } of priced) {
      const tier = publishAs.trim().toLowerCase();
      if (!(TIERS as readonly string[]).includes(tier)) {
        refuse(row, "unknown_tier", `column A reads "${publishAs}" — expected Retail or Wholesale`);
        continue;
      }

      const entry = lookupCommodity(index, row.sheet, row.product, row.variety);
      if (!entry) {
        refuse(
          row,
          "unknown_product",
          `the map has no entry for ${row.sheet} / ${row.product} / ${row.variety}`,
        );
        continue;
      }

      if (entry.status === "PENDING" || entry.slug === null || entry.name === null) {
        refuse(
          row,
          "pending_commodity",
          `map key ${entry.n} is PENDING and has no slug — it is not a commodity yet, so the row is refused rather than guessed at`,
        );
        continue;
      }

      if (!knowsPortion(index, row.portion)) {
        refuse(row, "unknown_portion", `the map has no unit for the portion "${row.portion}"`);
        continue;
      }

      const unit = lookupUnit(index, row.portion, entry.slug);
      if (unit === null) {
        refuse(
          row,
          "unit_pending",
          `the portion "${row.portion}" has no unit for ${entry.slug} — it is still held pending a ruling`,
        );
        continue;
      }

      const price = parsePrice(rawPrice);
      if (price === null) {
        refuse(row, "unreadable_price", `"${rawPrice}" is not a price`);
        continue;
      }

      const collector = collectorByName.get(collectorCell.trim().toLowerCase());
      if (!collector) {
        refuse(
          row,
          "unknown_collector",
          `COLLECTED BY reads "${collectorCell}", which is not a registered collector — a collector is never auto-created (P1.2)`,
        );
        continue;
      }
      if (!collector.isActive) {
        refuse(row, "inactive_collector", `collector "${collector.name}" is not active`);
        continue;
      }

      candidates.push({
        row,
        slug: entry.slug,
        commodity: entry.name,
        tier: tier as Tier,
        unit,
        price,
        market,
        collectedOn,
        isoYear,
        isoWeek,
        collectorName: collector.name,
        collectorPhone: collector.phone,
      });
    }
  }

  // -- Stage 3a: one row per unit slot, across the whole workbook ---------------------------
  // Two rows claiming the same commodity, tier, unit and week are not a correction and cannot
  // be ordered by anything the sheet says, so BOTH are refused. Choosing one would be inventing
  // a rule the owner never gave, and P1.3 makes a second price for one key a correction — a
  // deliberate act, not something an importer does on its own.
  const bySlot = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = recordedKey(candidate.slug, candidate.tier, candidate.unit, candidate.isoYear, candidate.isoWeek);
    const bucket = bySlot.get(key);
    if (bucket) bucket.push(candidate);
    else bySlot.set(key, [candidate]);
  }

  const singles: Candidate[] = [];
  for (const [key, bucket] of bySlot) {
    if (bucket.length === 1) {
      singles.push(bucket[0]);
      continue;
    }
    const where = bucket.map((entry) => `${entry.row.sheet} row ${entry.row.rowNumber}`).join(", ");
    for (const entry of bucket) {
      refuse(
        entry.row,
        "duplicate_slot",
        `${bucket.length} rows price ${key} — ${where}. All are refused: choosing between them is a human decision (P1.3)`,
      );
    }
  }

  // -- Stage 3b: at most two units per commodity, tier and week -----------------------------
  const byWeek = new Map<string, Candidate[]>();
  for (const candidate of singles) {
    const key = `${candidate.slug}|${candidate.tier}|${candidate.isoYear}|${candidate.isoWeek}`;
    const bucket = byWeek.get(key);
    if (bucket) bucket.push(candidate);
    else byWeek.set(key, [candidate]);
  }

  for (const bucket of byWeek.values()) {
    const first = bucket[0];
    const primaryUnit = lookupPrimaryUnit(index, first.slug, first.tier);

    // The approved primary unit goes first, so that when only two of three priced units can be
    // kept, the one the surfaces headline is never the one dropped. Everything else keeps the
    // order it appears in the workbook, which is the order a human reading the sheet would
    // expect (and the earliest-row tie-break the owner confirmed).
    const ordered = [...bucket].sort((left, right) => {
      const leftPrimary = left.unit === primaryUnit ? 0 : 1;
      const rightPrimary = right.unit === primaryUnit ? 0 : 1;
      return leftPrimary - rightPrimary;
    });

    let occupied = 0;

    for (const candidate of ordered) {
      const key = recordedKey(candidate.slug, candidate.tier, candidate.unit, candidate.isoYear, candidate.isoWeek);

      if (alreadyRecorded.has(key)) {
        occupied += 1;
        skip(
          candidate.row,
          "already_recorded",
          `${candidate.commodity} ${candidate.tier} in ${candidate.unit} for ${candidate.isoYear}-W${candidate.isoWeek} is already submitted or published`,
        );
        continue;
      }

      if (occupied >= 2) {
        refuse(
          candidate.row,
          "too_many_units",
          `${candidate.commodity} ${candidate.tier} already has two prices for ${candidate.isoYear}-W${candidate.isoWeek} in other units, and P1.7 allows two — this third, in ${candidate.unit}, is refused`,
        );
        continue;
      }

      occupied += 1;
      posts.push({
        sheet: candidate.row.sheet,
        rowNumber: candidate.row.rowNumber,
        column: reading.column,
        slug: candidate.slug,
        commodity: candidate.commodity,
        variety: candidate.row.variety,
        tier: candidate.tier,
        unit: candidate.unit,
        // A PROPOSAL, per 0041: primary only when it matches the unit the reviewed map approved
        // for this commodity and tier, secondary otherwise. Never inferred from arrival order —
        // `approve_price_submission()` resolves the final role when a human publishes.
        unitRole: candidate.unit === primaryUnit ? "primary" : "secondary",
        price: candidate.price,
        market: candidate.market,
        collectedOn: candidate.collectedOn,
        isoYear: candidate.isoYear,
        isoWeek: candidate.isoWeek,
        collectorName: candidate.collectorName,
        collectorPhone: candidate.collectorPhone,
      });
    }
  }

  // Report in the order a human reads the workbook, not in the order the stages ran.
  const inSheetOrder = (
    left: { sheet: string; rowNumber: number | null },
    right: { sheet: string; rowNumber: number | null },
  ) => left.sheet.localeCompare(right.sheet) || (left.rowNumber ?? 0) - (right.rowNumber ?? 0);

  posts.sort(inSheetOrder);
  skipped.sort(inSheetOrder);
  refusals.sort(inSheetOrder);

  return { column: reading.column, posts, skipped, refusals, ignoredSheets: reading.ignoredSheets };
}
