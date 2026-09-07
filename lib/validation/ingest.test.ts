import { describe, expect, it } from "vitest";
import {
  checkCollectionDate,
  commodityCandidates,
  computeFlags,
  createRateLimiter,
  formOptionsSchema,
  magnitudeRatioSchema,
  ingestPayloadSchema,
  normaliseName,
  normalisePhone,
  resolveCollector,
  resolveName,
  resolveSubmissionNames,
  siteCandidates,
  todayInLagos,
  trigramSimilarity,
  unitCandidates,
  type CollectorRecord,
  type FormOptions,
  type SeriesBaseline,
} from "./ingest";

/**
 * FIXTURES, NOT LIVE DATA — and that is a limitation, not a preference.
 *
 * collection_sites is genuinely empty in the database (seed.sql: "it waits for real names"),
 * and there is not one collectors row, so there is no end-to-end path to test against. These
 * fixtures use invented UUIDs and site names that exist nowhere but this file, which is the
 * honest way to exercise the logic without inventing rows in the database to test against
 * (P0.1 — no demo data, not even "temporarily to show the layout").
 *
 * What this file therefore proves is that the pipeline's DECISIONS are right given inputs.
 * It proves nothing about whether the real form's option names, the real collectors' stored
 * phone formats, or the real Apps Script payload shape match what it assumes. That is stated
 * in the handover and stays true until a real site and a real collector exist.
 */

const OPTIONS: FormOptions = {
  generated_at: "2026-09-07T00:00:00.000Z",
  commodities: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Soko (Nigerian Spinach)",
      aliases: ["Soko", "Nigerian Spinach"],
    },
    { id: "22222222-2222-4222-8222-222222222222", name: "White Yam", aliases: [] },
    { id: "33333333-3333-4333-8333-333333333333", name: "Water Yam", aliases: [] },
  ],
  collection_sites: [
    { id: "44444444-4444-4444-8444-444444444444", name: "Fixture Market A" },
    { id: "55555555-5555-4555-8555-555555555555", name: "Fixture Abattoir B" },
  ],
  units: [
    { id: "66666666-6666-4666-8666-666666666666", name: "Small bundle", abbreviation: "sm bundle" },
    { id: "77777777-7777-4777-8777-777777777777", name: "Paint bucket", abbreviation: "bucket" },
  ],
};

const VALID_PAYLOAD = {
  collector_name: "Fixture Collector",
  collector_phone: "08031234567",
  collection_site: "Fixture Market A",
  commodity: "Soko (Nigerian Spinach)",
  tier: "retail",
  unit: "Small bundle",
  price: 1500,
  collected_on: "2026-09-02",
};

const COLLECTORS: CollectorRecord[] = [
  {
    id: "88888888-8888-4888-8888-888888888888",
    name: "Fixture Collector",
    phone: "+234 803 123 4567",
    isActive: true,
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    name: "Retired Fixture",
    phone: "08059876543",
    isActive: false,
  },
];

// ---------------------------------------------------------------------------

describe("ingestPayloadSchema", () => {
  it("accepts a well-formed form row and defaults the currency to NGN", () => {
    const result = ingestPayloadSchema.safeParse(VALID_PAYLOAD);
    expect(result.success).toBe(true);
    expect(result.success && result.data.currency).toBe("NGN");
  });

  it("accepts a price written the way a spreadsheet cell renders it", () => {
    for (const price of ["₦95,000", "95,000", " 95000 ", 95000]) {
      const result = ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, price });
      expect(result.success && result.data.price).toBe(95000);
    }
  });

  it("keeps a zero price and rejects a negative one", () => {
    expect(ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, price: 0 }).success).toBe(true);
    expect(ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, price: -1 }).success).toBe(false);
  });

  it("names the offending field rather than failing generically", () => {
    const result = ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, price: "abo" });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain("not a number");
  });

  it("rejects a tier outside retail/wholesale", () => {
    expect(ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, tier: "farmgate" }).success).toBe(
      false,
    );
  });

  it("rejects a date that has the right shape but does not exist", () => {
    // Zod's date coercion would normalise this to 2 March and file the price a week away.
    expect(
      ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, collected_on: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, collected_on: "02/09/2026" }).success,
    ).toBe(false);
  });

  it("rejects an empty required field rather than storing a blank", () => {
    expect(ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, commodity: "   " }).success).toBe(
      false,
    );
    expect(
      ingestPayloadSchema.safeParse({ ...VALID_PAYLOAD, collector_phone: "" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("formOptionsSchema", () => {
  it("accepts the fixture shape", () => {
    expect(formOptionsSchema.safeParse(OPTIONS).success).toBe(true);
  });

  it("refuses option lists with no collection sites", () => {
    // This is today's real state, and it must fail loudly rather than resolve to nothing.
    const result = formOptionsSchema.safeParse({ ...OPTIONS, collection_sites: [] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("normaliseName and trigramSimilarity", () => {
  it("collapses case, punctuation and spacing", () => {
    expect(normaliseName("Soko (Nigerian Spinach)")).toBe("soko nigerian spinach");
    expect(normaliseName("  WHITE-YAM  ")).toBe("white yam");
  });

  it("scores an identical string at 1 and an unrelated one near 0", () => {
    expect(trigramSimilarity("white yam", "white yam")).toBe(1);
    expect(trigramSimilarity("white yam", "kerosene")).toBeLessThan(0.1);
  });

  it("scores a near-miss above pg_trgm's default threshold", () => {
    expect(trigramSimilarity("white yam", "white yamm")).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------------------

describe("resolveName", () => {
  const candidates = commodityCandidates(OPTIONS);

  it("resolves an exact dropdown value", () => {
    const result = resolveName("Soko (Nigerian Spinach)", candidates);
    expect(result.status).toBe("exact");
    expect(result.status !== "unresolved" && result.id).toBe(OPTIONS.commodities[0].id);
  });

  it("resolves regardless of case and punctuation", () => {
    expect(resolveName("soko  nigerian spinach", candidates).status).toBe("exact");
  });

  it("resolves through the alias list", () => {
    const result = resolveName("Nigerian Spinach", candidates);
    expect(result.status).toBe("alias");
    expect(result.status !== "unresolved" && result.id).toBe(OPTIONS.commodities[0].id);
  });

  it("falls back to a fuzzy match on a typo", () => {
    const result = resolveName("White Yamm", candidates);
    expect(result.status).toBe("fuzzy");
    expect(result.status === "fuzzy" && result.name).toBe("White Yam");
  });

  it("refuses to guess between two equally close options", () => {
    // "Yam" is exactly as close to White Yam as to Water Yam. Picking one would corrupt a
    // series with a price that looked perfectly reasonable.
    const result = resolveName("Yam", candidates);
    expect(result.status).toBe("unresolved");
    expect(result.status === "unresolved" && result.ambiguous).toEqual(["White Yam", "Water Yam"]);
  });

  it("reports the closest option when nothing clears the threshold", () => {
    const result = resolveName("Kerosene", candidates);
    expect(result.status).toBe("unresolved");
  });

  it("resolves a unit by its abbreviation as well as its name", () => {
    const units = unitCandidates(OPTIONS);
    expect(resolveName("bucket", units).status).toBe("alias");
    expect(resolveName("Paint bucket", units).status).toBe("exact");
  });
});

// ---------------------------------------------------------------------------

describe("resolveSubmissionNames", () => {
  it("resolves all three names to ids", () => {
    const result = resolveSubmissionNames(VALID_PAYLOAD, OPTIONS);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      commodityId: OPTIONS.commodities[0].id,
      collectionSiteId: OPTIONS.collection_sites[0].id,
      unitId: OPTIONS.units[0].id,
      fuzzyMatches: [],
    });
  });

  it("records that a name needed a fuzzy match rather than hiding it", () => {
    const result = resolveSubmissionNames({ ...VALID_PAYLOAD, commodity: "White Yamm" }, OPTIONS);
    expect(result.ok && result.value.fuzzyMatches).toHaveLength(1);
    expect(result.ok && result.value.fuzzyMatches[0]).toContain("White Yam");
  });

  it("fails with the specific code for the name that did not resolve", () => {
    const commodity = resolveSubmissionNames({ ...VALID_PAYLOAD, commodity: "Kerosene" }, OPTIONS);
    expect(commodity.ok === false && commodity.failure.code).toBe("unknown_commodity");

    const site = resolveSubmissionNames(
      { ...VALID_PAYLOAD, collection_site: "Mile 12" },
      OPTIONS,
    );
    expect(site.ok === false && site.failure.code).toBe("unknown_site");

    const unit = resolveSubmissionNames({ ...VALID_PAYLOAD, unit: "Wheelbarrow" }, OPTIONS);
    expect(unit.ok === false && unit.failure.code).toBe("unknown_unit");
  });

  it("puts the submitted value and a next step in the message, never a bare 400", () => {
    const result = resolveSubmissionNames({ ...VALID_PAYLOAD, commodity: "Kerosene" }, OPTIONS);
    expect(result.ok === false && result.failure.message).toContain("Kerosene");
    expect(result.ok === false && result.failure.detail).toBeTruthy();
  });

  it("names both candidates when a name is ambiguous", () => {
    const result = resolveSubmissionNames({ ...VALID_PAYLOAD, commodity: "Yam" }, OPTIONS);
    expect(result.ok === false && result.failure.detail).toContain("White Yam");
    expect(result.ok === false && result.failure.detail).toContain("Water Yam");
  });

  it("resolves the site through the same path as the others", () => {
    const sites = siteCandidates(OPTIONS);
    expect(resolveName("fixture market a", sites).status).toBe("exact");
  });
});

// ---------------------------------------------------------------------------

describe("normalisePhone", () => {
  it("treats every Nigerian format of one number as the same collector", () => {
    const expected = "8031234567";
    for (const written of [
      "08031234567",
      "+2348031234567",
      "234 803 123 4567",
      "0803-123-4567",
      "8031234567",
    ]) {
      expect(normalisePhone(written)).toBe(expected);
    }
  });

  it("keeps two different numbers different", () => {
    expect(normalisePhone("08031234567")).not.toBe(normalisePhone("08059876543"));
  });

  it("leaves an unrecognised format as its bare digits rather than rewriting it", () => {
    expect(normalisePhone("+1 415 555 0123")).toBe("14155550123");
  });
});

describe("resolveCollector", () => {
  it("matches a registered collector however the phone was typed", () => {
    const result = resolveCollector(
      { collector_name: "Fixture Collector", collector_phone: "0803 123 4567" },
      COLLECTORS,
    );
    expect(result.ok && result.value.id).toBe(COLLECTORS[0].id);
  });

  it("matches on phone even when the submitted name differs", () => {
    const result = resolveCollector(
      { collector_name: "F. Collector", collector_phone: "08031234567" },
      COLLECTORS,
    );
    expect(result.ok && result.value.id).toBe(COLLECTORS[0].id);
  });

  it("rejects an unknown collector and does not invent one", () => {
    const result = resolveCollector(
      { collector_name: "Someone New", collector_phone: "08000000000" },
      COLLECTORS,
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("unknown_collector");
    expect(result.ok === false && result.failure.message).toContain("08000000000");
    expect(result.ok === false && result.failure.detail).toContain("Settings");
  });

  it("rejects an unknown collector against an empty collectors table", () => {
    // Today's real state. It must be a specific 422, not a crash or a silent create.
    const result = resolveCollector(
      { collector_name: "Fixture Collector", collector_phone: "08031234567" },
      [],
    );
    expect(result.ok === false && result.failure.code).toBe("unknown_collector");
  });

  it("rejects a deactivated collector with its own code", () => {
    const result = resolveCollector(
      { collector_name: "Retired Fixture", collector_phone: "08059876543" },
      COLLECTORS,
    );
    expect(result.ok === false && result.failure.code).toBe("inactive_collector");
  });
});

// ---------------------------------------------------------------------------

describe("checkCollectionDate", () => {
  // 14:00 UTC on Wednesday 2 September 2026 — 15:00 in Lagos, same civil day.
  const midWeek = new Date("2026-09-02T14:00:00Z");

  it("accepts today and derives its ISO week through lib/weeks.ts", () => {
    const result = checkCollectionDate("2026-09-02", midWeek);
    expect(result.ok && result.value).toEqual({ isoYear: 2026, isoWeek: 36 });
  });

  it("accepts a past date", () => {
    expect(checkCollectionDate("2026-08-26", midWeek).ok).toBe(true);
  });

  it("rejects tomorrow with a message naming both dates", () => {
    const result = checkCollectionDate("2026-09-03", midWeek);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("future_collection_date");
    expect(result.ok === false && result.failure.message).toContain("2026-09-03");
    expect(result.ok === false && result.failure.message).toContain("2026-09-02");
  });

  it("rejects a mistyped year rather than filing a price into a week that has not happened", () => {
    const result = checkCollectionDate("2062-09-02", midWeek);
    expect(result.ok === false && result.failure.code).toBe("future_collection_date");
  });

  it("uses the Lagos civil day, not UTC", () => {
    // 23:30 UTC on 1 September is already 00:30 on 2 September in Lagos. A price collected
    // on the 2nd is today there and must not be rejected as tomorrow.
    const lagosPastMidnight = new Date("2026-09-01T23:30:00Z");
    expect(todayInLagos(lagosPastMidnight)).toBe("2026-09-02");
    expect(checkCollectionDate("2026-09-02", lagosPastMidnight).ok).toBe(true);
  });

  it("derives the week across a year boundary the way ISO 8601 does", () => {
    // 29 December 2025 is week 1 of 2026, not week 53 of 2025.
    const result = checkCollectionDate("2025-12-29", new Date("2026-01-05T12:00:00Z"));
    expect(result.ok && result.value).toEqual({ isoYear: 2026, isoWeek: 1 });
  });
});

// ---------------------------------------------------------------------------

describe("createRateLimiter", () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 8, 2, 0, minutes));

  it("allows submissions up to the limit and refuses the next one", () => {
    const limiter = createRateLimiter(3, 60 * 60 * 1000);
    expect(limiter.check("collector-a", at(0)).ok).toBe(true);
    expect(limiter.check("collector-a", at(1)).ok).toBe(true);
    expect(limiter.check("collector-a", at(2)).ok).toBe(true);

    const refused = limiter.check("collector-a", at(3));
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.failure.code).toBe("rate_limited");
    expect(refused.ok === false && refused.failure.detail).toContain("Retry");
  });

  it("limits each collector separately", () => {
    const limiter = createRateLimiter(1, 60 * 60 * 1000);
    expect(limiter.check("collector-a", at(0)).ok).toBe(true);
    expect(limiter.check("collector-a", at(1)).ok).toBe(false);
    expect(limiter.check("collector-b", at(1)).ok).toBe(true);
  });

  it("lets the window slide rather than resetting on a fixed boundary", () => {
    const limiter = createRateLimiter(2, 60 * 60 * 1000);
    limiter.check("collector-a", at(0));
    limiter.check("collector-a", at(30));
    expect(limiter.check("collector-a", at(45)).ok).toBe(false);
    // 61 minutes on, the first hit has aged out and one slot is free again.
    expect(limiter.check("collector-a", at(61)).ok).toBe(true);
    expect(limiter.check("collector-a", at(62)).ok).toBe(false);
  });

  it("reports how many submissions remain in the window", () => {
    const limiter = createRateLimiter(3, 60 * 60 * 1000);
    expect(limiter.check("collector-a", at(0)).ok && limiter.check("collector-a", at(1))).toBeTruthy();
    const third = limiter.check("collector-a", at(2));
    expect(third.ok && third.value.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("magnitudeRatioSchema", () => {
  it("accepts the seeded value", () => {
    // editorial_rules ingest/magnitude_ratio holds 4 (seed.sql, confirmed 2026-09-07).
    expect(magnitudeRatioSchema.safeParse(4).success).toBe(true);
  });

  it("refuses a ratio at or below 1, which would flag an unchanged price", () => {
    expect(magnitudeRatioSchema.safeParse(1).success).toBe(false);
    expect(magnitudeRatioSchema.safeParse(0.5).success).toBe(false);
  });

  it("refuses a missing or non-numeric rule value rather than coercing it", () => {
    for (const value of [undefined, null, "4", {}, Infinity, NaN]) {
      expect(magnitudeRatioSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("computeFlags", () => {
  /** The value seeded into editorial_rules. Passed explicitly: computeFlags has no default. */
  const RATIO = 4;
  const unit = { unitId: OPTIONS.units[0].id };
  const otherUnit = OPTIONS.units[1].id;

  const withHistory = (price: number, unitId = unit.unitId): SeriesBaseline => ({
    latest: { price, unitId, isoYear: 2026, isoWeek: 35 },
    hasEntryForWeek: false,
  });

  it("flags the first price in a series as new_series, never as an outlier", () => {
    const flags = computeFlags({ price: 1500 }, unit, { latest: null, hasEntryForWeek: false }, RATIO);
    expect(flags).toEqual(["new_series"]);
  });

  it("leaves an ordinary week-on-week move unflagged", () => {
    expect(computeFlags({ price: 1650 }, unit, withHistory(1500), RATIO)).toEqual([]);
    expect(computeFlags({ price: 1200 }, unit, withHistory(1500), RATIO)).toEqual([]);
  });

  it("flags the order-of-magnitude typo from the plan", () => {
    // ₦950,000 typed for a ₦95,000 commodity.
    expect(computeFlags({ price: 950_000 }, unit, withHistory(95_000), RATIO)).toEqual(["outlier"]);
  });

  it("flags a magnitude drop as well as a rise", () => {
    expect(computeFlags({ price: 9_500 }, unit, withHistory(95_000), RATIO)).toEqual(["outlier"]);
  });

  it("flags exactly at the seeded 4x threshold and not just below it", () => {
    const previous = 1000;
    expect(computeFlags({ price: previous * RATIO }, unit, withHistory(previous), RATIO)).toEqual([
      "outlier",
    ]);
    expect(
      computeFlags({ price: previous * RATIO - 1 }, unit, withHistory(previous), RATIO),
    ).toEqual([]);
  });

  it("honours an injected threshold rather than only the default", () => {
    expect(computeFlags({ price: 3000 }, unit, withHistory(1000), 2)).toEqual(["outlier"]);
    expect(computeFlags({ price: 3000 }, unit, withHistory(1000), 10)).toEqual([]);
  });

  it("flags a move onto or off a zero price, which has no finite ratio", () => {
    expect(computeFlags({ price: 1500 }, unit, withHistory(0), RATIO)).toEqual(["outlier"]);
    expect(computeFlags({ price: 0 }, unit, withHistory(1500), RATIO)).toEqual(["outlier"]);
    expect(computeFlags({ price: 0 }, unit, withHistory(0), RATIO)).toEqual([]);
  });

  it("does not claim an outlier check it could not perform across a unit change", () => {
    // A sack against a plate is not a ratio, and every seeded unit's base_multiplier is null,
    // so no conversion exists. No flag is raised because no comparison happened.
    expect(computeFlags({ price: 950_000 }, unit, withHistory(95_000, otherUnit), RATIO)).toEqual([]);
  });

  it("flags a duplicate for the same commodity, week and tier", () => {
    expect(
      computeFlags({ price: 1500 }, unit, { ...withHistory(1500), hasEntryForWeek: true }, RATIO),
    ).toEqual(["duplicate"]);
  });

  it("carries both flags when a submission is a duplicate and an outlier", () => {
    expect(
      computeFlags({ price: 950_000 }, unit, { ...withHistory(95_000), hasEntryForWeek: true }, RATIO),
    ).toEqual(["outlier", "duplicate"]);
  });

  it("only ever emits values the price_submissions CHECK constraint permits", () => {
    const permitted = new Set(["outlier", "new_series", "duplicate", "site_switch"]);
    const cases: SeriesBaseline[] = [
      { latest: null, hasEntryForWeek: false },
      { latest: null, hasEntryForWeek: true },
      withHistory(95_000),
      { ...withHistory(95_000), hasEntryForWeek: true },
    ];
    for (const baseline of cases) {
      for (const flag of computeFlags({ price: 950_000 }, unit, baseline, RATIO)) {
        expect(permitted.has(flag)).toBe(true);
      }
    }
  });
});
