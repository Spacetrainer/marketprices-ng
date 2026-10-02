import { describe, expect, it } from "vitest";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "../validation/ingest";
import { POST_CEILING, delayBeforeNext, postPlan, toPayload } from "./poster";
import type { PlannedPost } from "./planner";

/**
 * The posting loop, with NO NETWORK and NO REAL WAITING.
 *
 * `fetchImpl`, `now` and `wait` are all injected, so these tests drive the clock instead of
 * living through it — the pacing test below covers a rolling hour in under a millisecond. That
 * is the whole reason those three are options on `PosterOptions` rather than module imports: a
 * test that needed a real hour would never be written, and the pacing rule would ship untested.
 *
 * What matters here is what the loop does when things go wrong, because the failure modes are
 * asymmetric. A row that fails must not stop the column, and a row whose outcome is UNKNOWN must
 * not be retried — a retry after an ambiguous failure is exactly how one price becomes two, and
 * a duplicate price is far worse than a missing one because nothing downstream can tell.
 */

const post = (overrides: Partial<PlannedPost> = {}): PlannedPost => ({
  sheet: "Fixture Tab",
  rowNumber: 12,
  column: "K",
  slug: "fixture-root",
  commodity: "Fixture Root",
  variety: "Fixture Variety",
  tier: "retail",
  unit: "Fixture Bundle",
  unitRole: "primary",
  price: 2500,
  market: "Fixture Market A",
  collectedOn: "2026-09-26",
  isoYear: 2026,
  isoWeek: 39,
  collectorName: "Fixture Collector",
  collectorPhone: "08000000001",
  ...overrides,
});

/** A fetch that records what it was called with and answers from a script of responses. */
function stubFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;

  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: `status ${next.status}`,
      json: async () => next.body,
    };
  }) as unknown as typeof fetch;

  return { impl, calls };
}

const ok = (id: string) => ({ status: 201, body: { submission_id: id } });

describe("toPayload", () => {
  it("sends the collector's phone, which is what the route identifies a collector by", () => {
    const payload = toPayload(post());
    expect(payload.collector_phone).toBe("08000000001");
    expect(payload.collector_name).toBe("Fixture Collector");
  });

  it("sends the commodity and unit by NAME, for the route to resolve", () => {
    const payload = toPayload(post());
    expect(payload.commodity).toBe("Fixture Root");
    expect(payload.unit).toBe("Fixture Bundle");
    expect(payload.collection_site).toBe("Fixture Market A");
    expect(payload.tier).toBe("retail");
    expect(payload.unit_role).toBe("primary");
  });

  it("names the cell it came from in the notes, so a reviewer can go and look", () => {
    expect(toPayload(post())).toMatchObject({
      notes: "tracker import — Fixture Tab, row 12, column K",
    });
  });

  it("never sends an ISO week — the route derives it from collected_on", () => {
    const payload = toPayload(post());
    expect(payload.collected_on).toBe("2026-09-26");
    expect(Object.keys(payload)).not.toContain("iso_week");
    expect(Object.keys(payload)).not.toContain("iso_year");
    // Not in the prose either: a second copy of the week could drift from the one the series is
    // keyed on, and the prose is the copy nothing would validate.
    expect(String(payload.notes)).not.toMatch(/W39|39/);
  });
});

describe("delayBeforeNext", () => {
  it("does not wait while there is room in the window", () => {
    expect(delayBeforeNext([], 1_000)).toBe(0);
    expect(delayBeforeNext(Array.from({ length: POST_CEILING - 1 }, () => 1_000), 2_000)).toBe(0);
  });

  it("aims below the server's limit, so the two windows cannot disagree at the edge", () => {
    expect(POST_CEILING).toBeLessThan(RATE_LIMIT_MAX);
  });

  it("waits for the oldest send to fall out of the hour once the ceiling is reached", () => {
    const sentAt = Array.from({ length: POST_CEILING }, (_value, index) => 1_000 + index);
    const now = 5_000;
    expect(delayBeforeNext(sentAt, now)).toBe(1_000 + RATE_LIMIT_WINDOW_MS - now + 1);
  });

  it("ignores sends that have already aged out of the window", () => {
    const stale = Array.from({ length: POST_CEILING }, () => 0);
    expect(delayBeforeNext(stale, RATE_LIMIT_WINDOW_MS + 1)).toBe(0);
  });
});

describe("postPlan", () => {
  it("posts each row once, to /api/ingest/price, with the bearer token", async () => {
    const { impl, calls } = stubFetch([ok("a"), ok("b")]);

    const outcomes = await postPlan([post(), post({ rowNumber: 13 })], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://example.invalid/api/ingest/price");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
      "Bearer fixture-secret",
    );
    expect(outcomes.map((outcome) => outcome.detail)).toEqual(["a", "b"]);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
  });

  it("posts nothing at all for an empty plan", async () => {
    const { impl, calls } = stubFetch([ok("a")]);
    const outcomes = await postPlan([], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
    });
    expect(calls).toHaveLength(0);
    expect(outcomes).toEqual([]);
  });

  it("keeps going after a row the route refuses, and reports its code", async () => {
    const { impl } = stubFetch([
      { status: 422, body: { code: "unknown_collector", message: "no such collector" } },
      ok("b"),
    ]);

    const outcomes = await postPlan([post(), post({ rowNumber: 13 })], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
    });

    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].status).toBe(422);
    expect(outcomes[0].detail).toBe("unknown_collector: no such collector");
    // The second row still went. One unmapped row does not hold back a column of good prices.
    expect(outcomes[1].ok).toBe(true);
  });

  it("reports a transport failure without retrying it", async () => {
    const calls: string[] = [];
    const impl = (async () => {
      calls.push("attempt");
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;

    const outcomes = await postPlan([post()], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
    });

    // Exactly one attempt. This row may or may not have been stored, and sending it again is the
    // one way to turn that uncertainty into a duplicate price.
    expect(calls).toHaveLength(1);
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].status).toBe(0);
    expect(outcomes[0].detail).toMatch(/socket hang up/);
  });

  it("survives a response whose body is not JSON", async () => {
    const impl = (async () => ({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("not json");
      },
    })) as unknown as typeof fetch;

    const outcomes = await postPlan([post()], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
    });

    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].detail).toBe("unknown: Bad Gateway");
  });

  it("never lets a rolling hour hold more than the ceiling, over more than two windows", async () => {
    // Two and a bit windows' worth of rows, which is more than the tracker will ever hold but is
    // the case where an off-by-one in the window arithmetic shows up.
    const total = POST_CEILING * 2 + 5;

    // A clock the test advances itself, so two rolling hours cost no real time. It ticks on every
    // reading as well as through the waits, because sends sharing one timestamp would hide exactly
    // the boundary error this is looking for.
    let clock = 1_000;
    const sentAt: number[] = [];
    let waits = 0;

    // The stub records WHEN each send happened, which is what the invariant below is about.
    const impl = (async () => {
      sentAt.push(clock);
      return {
        ok: true,
        status: 201,
        statusText: "Created",
        json: async () => ({ submission_id: "stored" }),
      };
    }) as unknown as typeof fetch;

    const outcomes = await postPlan(
      Array.from({ length: total }, (_value, index) => post({ rowNumber: index + 6 })),
      {
        baseUrl: "https://example.invalid",
        secret: "fixture-secret",
        fetchImpl: impl,
        now: () => {
          const reading = clock;
          clock += 1;
          return reading;
        },
        wait: async (ms) => {
          waits += 1;
          clock += ms;
        },
      },
    );

    // Every row was sent, exactly once, and none was dropped to stay inside the limit.
    expect(sentAt).toHaveLength(total);
    expect(outcomes).toHaveLength(total);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);

    // It did have to pace itself, rather than the arithmetic quietly never triggering.
    expect(waits).toBeGreaterThan(0);

    // THE INVARIANT: at no instant does the preceding rolling hour contain more sends than the
    // ceiling. This is the property the server's limiter measures, so it is the one to assert —
    // counting waits only describes one particular clock.
    for (const [index, stamp] of sentAt.entries()) {
      const inWindow = sentAt.slice(0, index + 1).filter((other) => other > stamp - RATE_LIMIT_WINDOW_MS);
      expect(inWindow.length).toBeLessThanOrEqual(POST_CEILING);
    }
    // And the ceiling really is below the server's, so the two windows cannot disagree.
    expect(POST_CEILING).toBeLessThan(RATE_LIMIT_MAX);
  });

  it("reports progress as it goes, so a long column is not a silent one", async () => {
    const { impl } = stubFetch([ok("a"), ok("b")]);
    const seen: string[] = [];

    await postPlan([post(), post({ rowNumber: 13 })], {
      baseUrl: "https://example.invalid",
      secret: "fixture-secret",
      fetchImpl: impl,
      onOutcome: (outcome, index, total) => seen.push(`${index + 1}/${total} ${outcome.detail}`),
    });

    expect(seen).toEqual(["1/2 a", "2/2 b"]);
  });
});
