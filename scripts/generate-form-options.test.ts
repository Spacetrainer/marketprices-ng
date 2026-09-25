import { describe, expect, it } from "vitest";
import {
  GenerationError,
  assertDistinct,
  assertNonEmpty,
  canonical,
  describeDrift,
  type FormOptionsContent,
  type GeneratedFormOptions,
} from "./generate-form-options";
import { TIERS } from "../lib/validation/ingest";

/**
 * The refusals and the drift report in scripts/generate-form-options.ts.
 *
 * FIXTURES, NOT LIVE DATA, for the same reason lib/validation/ingest.test.ts uses them: the
 * names and UUIDs below exist nowhere but this file. Asserting against the real 17
 * commodities would turn a legitimate editorial change — tracking one more commodity — into
 * a failing unit test, and the check that actually compares this file to the database is
 * `pnpm check:form-options`, which runs against the real thing in CI.
 *
 * What these prove is that the generator refuses the two states that would poison intake (a
 * list that cannot resolve a name unambiguously, and a list with nothing in it), and that
 * the drift report says something true and specific about every way the committed file can
 * fall out of step with the database.
 */

const content = (overrides: Partial<FormOptionsContent> = {}): FormOptionsContent => ({
  commodities: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Root", aliases: [] },
    { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Grain", aliases: ["Grain"] },
  ],
  collection_sites: [{ id: "44444444-4444-4444-8444-444444444444", name: "Fixture Market A" }],
  units: [
    { id: "66666666-6666-4666-8666-666666666666", name: "Fixture Bundle", abbreviation: "fx bundle" },
    { id: "77777777-7777-4777-8777-777777777777", name: "Fixture Bucket", abbreviation: "fx bucket" },
  ],
  tiers: TIERS,
  ...overrides,
});

describe("assertDistinct", () => {
  it("accepts a list whose names are all distinct", () => {
    expect(() => assertDistinct("commodity", content().commodities)).not.toThrow();
  });

  it("refuses two entries with the same name", () => {
    const entries = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Root" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Root" },
    ];
    expect(() => assertDistinct("commodity", entries)).toThrow(GenerationError);
  });

  /**
   * The case that matters. resolveName() compares NORMALISED names — case, punctuation and
   * spacing collapsed — and its exact-match loop returns on the first hit. Two rows that look
   * different in the database but normalise alike would silently send every submission naming
   * them to whichever sorts first, with no ambiguity warning to show it happened.
   */
  it("refuses two entries whose names differ only by case, punctuation or spacing", () => {
    const entries = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Market A" },
      { id: "22222222-2222-4222-8222-222222222222", name: "fixture-market  a" },
    ];
    expect(() => assertDistinct("collection site", entries)).toThrow(/normalised name/);
  });

  it("names both offending entries and the list they are in", () => {
    const entries = [
      { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Root" },
      { id: "22222222-2222-4222-8222-222222222222", name: "FIXTURE ROOT" },
    ];
    expect(() => assertDistinct("commodity", entries)).toThrow(
      /commodity.*"Fixture Root".*"FIXTURE ROOT"/s,
    );
  });

  it("allows the same name in two different lists", () => {
    // A unit and a commodity may legitimately share a name; only within-list collisions are
    // ambiguous, because each list is resolved against separately.
    expect(() => assertDistinct("unit", [{ id: "a", name: "Fixture Root" }])).not.toThrow();
    expect(() => assertDistinct("commodity", [{ id: "b", name: "Fixture Root" }])).not.toThrow();
  });
});

describe("assertNonEmpty", () => {
  it("accepts content with every list populated", () => {
    expect(() => assertNonEmpty(content())).not.toThrow();
  });

  it("refuses an empty commodity list, naming the filter that emptied it", () => {
    expect(() => assertNonEmpty(content({ commodities: [] }))).toThrow(
      /no commodity is both is_tracked and is_active/,
    );
  });

  it("refuses an empty collection site list", () => {
    expect(() => assertNonEmpty(content({ collection_sites: [] }))).toThrow(
      /no collection site is is_active/,
    );
  });

  it("refuses an empty unit list", () => {
    expect(() => assertNonEmpty(content({ units: [] }))).toThrow(/the units table is empty/);
  });

  it("reports every empty list at once rather than only the first", () => {
    const error = (() => {
      try {
        assertNonEmpty(content({ commodities: [], collection_sites: [], units: [] }));
      } catch (thrown) {
        return thrown as Error;
      }
      return null;
    })();

    expect(error).toBeInstanceOf(GenerationError);
    expect(error?.message).toMatch(/no commodity/);
    expect(error?.message).toMatch(/no collection site/);
    expect(error?.message).toMatch(/units table is empty/);
  });

  it("says no file was written, because none was", () => {
    expect(() => assertNonEmpty(content({ units: [] }))).toThrow(/No file was written/);
  });
});

describe("canonical", () => {
  it("ignores key order", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
  });

  it("does not ignore array order", () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });

  it("sorts keys inside nested objects too", () => {
    expect(canonical({ outer: { z: 1, a: 2 } })).toBe(canonical({ outer: { a: 2, z: 1 } }));
  });
});

describe("describeDrift", () => {
  it("reports nothing when the file matches the database", () => {
    expect(describeDrift(content(), content())).toEqual([]);
  });

  /**
   * The check exists to be believed, so it must not cry wolf. `generated_at` changes on every
   * single run; if it counted as drift the step would fail permanently and everyone would
   * learn to ignore it. check() strips the field before comparing — this is that contract.
   */
  it("does not count generated_at as drift", () => {
    const committed: GeneratedFormOptions = {
      generated_at: "2020-01-01T00:00:00.000Z",
      ...content(),
    };
    const fresh: GeneratedFormOptions = {
      generated_at: "2026-09-14T11:28:20.679Z",
      ...content(),
    };

    const { generated_at: _committedAt, ...committedContent } = committed;
    const { generated_at: _freshAt, ...freshContent } = fresh;

    expect(describeDrift(committedContent, freshContent)).toEqual([]);
  });

  it("reports an entry the database has and the file does not", () => {
    const fresh = content({
      collection_sites: [
        ...content().collection_sites,
        { id: "55555555-5555-4555-8555-555555555555", name: "Fixture Abattoir B" },
      ],
    });
    const drift = describeDrift(content(), fresh);

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/\+ collection_sites: "Fixture Abattoir B"/);
    expect(drift[0]).toMatch(/in the database but not the file/);
  });

  it("reports an entry the file has and the database does not", () => {
    const drift = describeDrift(content(), content({ collection_sites: [] }));

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/- collection_sites: "Fixture Market A"/);
    expect(drift[0]).toMatch(/in the file but not the database/);
  });

  it("reports a renamed entry, quoting both sides", () => {
    const fresh = content({
      commodities: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Fixture Tuber", aliases: [] },
        content().commodities[1],
      ],
    });
    const drift = describeDrift(content(), fresh);

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/~ commodities: 11111111-1111-4111-8111-111111111111 changed/);
    expect(drift[0]).toMatch(/Fixture Root/);
    expect(drift[0]).toMatch(/Fixture Tuber/);
  });

  it("reports a changed alias list, since aliases are what the fuzzy match reads", () => {
    const fresh = content({
      commodities: [
        content().commodities[0],
        { id: "22222222-2222-4222-8222-222222222222", name: "Fixture Grain", aliases: ["Grain", "Cereal"] },
      ],
    });
    expect(describeDrift(content(), fresh)).toHaveLength(1);
  });

  /** The dropdown's order is part of what was committed and what the form was built from. */
  it("reports the same entries in a different order", () => {
    const fresh = content({ units: [...content().units].reverse() });
    const drift = describeDrift(content(), fresh);

    expect(drift).toEqual(["  ~ units: same entries, different order"]);
  });

  /**
   * Regression: the reorder check once tested the whole findings array rather than this
   * list's own slice of it, so a units reorder went unreported whenever commodities had
   * also changed — the drift report quietly understated what had moved.
   */
  it("reports a reorder in one list even when another list also changed", () => {
    const fresh = content({
      commodities: [content().commodities[0]],
      units: [...content().units].reverse(),
    });
    const drift = describeDrift(content(), fresh);

    expect(drift).toHaveLength(2);
    expect(drift.some((line) => /- commodities: "Fixture Grain"/.test(line))).toBe(true);
    expect(drift).toContain("  ~ units: same entries, different order");
  });

  it("reports every differing list, not just the first", () => {
    const drift = describeDrift(content(), content({ commodities: [], units: [] }));

    expect(drift.some((line) => line.includes("commodities"))).toBe(true);
    expect(drift.some((line) => line.includes("units"))).toBe(true);
  });

  it("reports a tiers mismatch, so a hand-edited file cannot disagree with TIERS", () => {
    const drift = describeDrift(content({ tiers: ["retail"] as const }), content());

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/~ tiers:/);
  });
});
