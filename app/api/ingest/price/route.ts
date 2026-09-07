import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import {
  checkCollectionDate,
  computeFlags,
  createRateLimiter,
  describePayloadIssues,
  formOptionsSchema,
  ingestPayloadSchema,
  magnitudeRatioSchema,
  resolveCollector,
  resolveSubmissionNames,
  type CollectorRecord,
  type FormOptions,
  type IngestFailure,
  type SeriesBaseline,
} from "../../../../lib/validation/ingest";

/**
 * POST /api/ingest/price — the weekly price intake endpoint (§3.4, §6.1).
 *
 * A Google Apps Script `onFormSubmit` trigger posts one form row here with a bearer token,
 * retries twice, and writes the response back into a column in the sheet so a failed row is
 * visible rather than silent. This handler is the other half of that contract: it either
 * stores a `pending` submission and says so, or refuses with a code and a sentence that
 * explains itself to someone reading it down a phone line from a market.
 *
 * The pipeline, in this exact order — each stage's failure is its own status and code:
 *
 *   1. bearer check                    401 unauthorized
 *   2. shape validation (Zod)          400 invalid_payload
 *   3. future collection date          422 future_collection_date
 *   4. name → id against form options  422 unknown_commodity | unknown_site | unknown_unit
 *   5. collector by phone              422 unknown_collector | inactive_collector
 *   6. ISO week from collected_on      (derived at 3; used here)
 *   7. per-collector rate limit        429 rate_limited
 *   8. new-series / magnitude flags    (advisory) | 503 threshold_unavailable
 *   9. duplicate check                 (advisory, never a rejection)
 *  10. insert as `pending`             201, or 500 storage_failure
 *
 * Stages 8 and 9 never reject. A flagged row still enters the queue as `pending`, because a
 * genuine price shock and a typo are indistinguishable to this endpoint and only look
 * different to someone who knows the market (P1.1 — the human decides).
 *
 * IT IS NOT THE ROUTE THAT DECIDES ANYTHING. Every judgement lives in lib/validation/ingest
 * .ts as a pure function over plain data; this file fetches, calls them in order, and maps
 * the answer onto HTTP.
 */

// node:crypto and the filesystem read below both need the Node runtime, not the Edge one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where scripts/generate-form-options.ts writes the lists the Google Form is built from. */
const FORM_OPTIONS_PATH = path.join(process.cwd(), "data", "form-options.json");

/**
 * One limiter per warm instance, held in module scope so it survives between requests.
 * Per-instance is a stated weakness, not an oversight — see the note in lib/validation/ingest.ts.
 */
const rateLimiter = createRateLimiter();

/** Parsed form options, cached for the life of the instance. */
let cachedOptions: FormOptions | null = null;

function respond(failure: IngestFailure, status: number) {
  return NextResponse.json({ ok: false, ...failure }, { status });
}

/**
 * Constant-time bearer comparison. A `===` here leaks the shared secret one character at a
 * time to anyone able to measure the response, and this token is the only thing standing
 * between the internet and the review queue.
 */
function bearerMatches(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;

  const presented = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);

  // timingSafeEqual throws on a length mismatch, which would itself be a timing signal.
  // Compare the presented value against itself so the work done is the same either way.
  if (presented.length !== expected.length) {
    timingSafeEqual(presented, presented);
    return false;
  }

  return timingSafeEqual(presented, expected);
}

async function loadFormOptions(): Promise<FormOptions | IngestFailure> {
  if (cachedOptions) return cachedOptions;

  let raw: string;
  try {
    raw = await readFile(FORM_OPTIONS_PATH, "utf8");
  } catch {
    return {
      code: "options_unavailable",
      message: "The form's option lists are not available, so no submitted name can be resolved",
      detail: `${FORM_OPTIONS_PATH} is missing — run scripts/generate-form-options.ts`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      code: "options_unavailable",
      message: "The form's option lists could not be read",
      detail: `${FORM_OPTIONS_PATH} is not valid JSON`,
    };
  }

  const result = formOptionsSchema.safeParse(parsed);
  if (!result.success) {
    return {
      code: "options_unavailable",
      message: "The form's option lists are incomplete, so a submitted name could be resolved wrongly",
      detail: describePayloadIssues(result.error),
    };
  }

  cachedOptions = result.data;
  return cachedOptions;
}

export async function POST(request: Request) {
  // ---- 1. Bearer -----------------------------------------------------------
  const secret = process.env.PRICE_INGEST_SECRET;
  if (!secret) {
    // Refuse rather than accept unauthenticated writes. A missing secret in production is a
    // deployment mistake, and the safe reading of it is "nobody is authorised", not "everybody".
    return respond(
      {
        code: "unauthorized",
        message: "Price intake is not accepting submissions",
        detail: "PRICE_INGEST_SECRET is not configured on the server",
      },
      503,
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return respond(
      {
        code: "unauthorized",
        message: "Missing or incorrect bearer token",
        detail: "The Apps Script must send Authorization: Bearer <PRICE_INGEST_SECRET>",
      },
      401,
    );
  }

  // ---- 2. Shape ------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(
      {
        code: "invalid_payload",
        message: "The request body is not JSON",
        detail: "Apps Script must post contentType 'application/json'",
      },
      400,
    );
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      {
        code: "invalid_payload",
        message: "The submission is missing or malforming a required field",
        detail: describePayloadIssues(parsed.error),
      },
      400,
    );
  }
  const payload = parsed.data;

  // ---- 3. Future collection date (and the week it implies) -----------------
  // The ISO week is derived here rather than twice: the future check has to read the date
  // anyway, and lib/weeks.ts is the only module allowed to do the arithmetic either way.
  const dateCheck = checkCollectionDate(payload.collected_on, new Date());
  if (!dateCheck.ok) return respond(dateCheck.failure, 422);

  // ---- 4. Names → ids ------------------------------------------------------
  const options = await loadFormOptions();
  if ("code" in options) return respond(options, 503);

  const names = resolveSubmissionNames(payload, options);
  if (!names.ok) return respond(names.failure, 422);
  const resolved = names.value;

  // ---- 5. Collector by phone (never auto-created — P1.2) -------------------
  const supabase = createAdminClient();

  const collectorRows = await supabase.from("collectors").select("id, name, phone, is_active");
  if (collectorRows.error) {
    return respond(
      {
        code: "storage_failure",
        message: "The collector list could not be read, so this submission was not stored",
        detail: collectorRows.error.message,
      },
      500,
    );
  }

  const collectors: CollectorRecord[] = collectorRows.data.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    isActive: row.is_active,
  }));

  const collector = resolveCollector(payload, collectors);
  if (!collector.ok) return respond(collector.failure, 422);

  // ---- 6. ISO week ---------------------------------------------------------
  const { isoYear, isoWeek } = dateCheck.value;

  // ---- 7. Rate limit, per collector ---------------------------------------
  const limit = rateLimiter.check(collector.value.id, new Date());
  if (!limit.ok) return respond(limit.failure, 429);

  // ---- 8 & 9. Baseline, then flags ----------------------------------------
  const [magnitudeRule, latestObservation, liveForWeek, submissionForWeek] = await Promise.all([
    // The outlier threshold is a versioned, human-owned setting (P16.2), read fresh on every
    // request rather than baked into the deployment — changing it is a Settings edit, not a
    // release. There is no code-side fallback on purpose; see lib/validation/ingest.ts.
    supabase
      .from("editorial_rules")
      .select("value, version")
      .eq("scope", "ingest")
      .eq("key", "magnitude_ratio")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("price_observations")
      .select("price, unit_id, iso_year, iso_week")
      .eq("commodity_id", resolved.commodityId)
      .eq("tier", payload.tier)
      .is("superseded_at", null)
      .order("iso_year", { ascending: false })
      .order("iso_week", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("price_observations")
      .select("id")
      .eq("commodity_id", resolved.commodityId)
      .eq("tier", payload.tier)
      .eq("iso_year", isoYear)
      .eq("iso_week", isoWeek)
      .is("superseded_at", null)
      .limit(1),
    supabase
      .from("price_submissions")
      .select("id")
      .eq("commodity_id", resolved.commodityId)
      .eq("tier", payload.tier)
      .eq("iso_year", isoYear)
      .eq("iso_week", isoWeek)
      .in("status", ["pending", "approved"])
      .limit(1),
  ]);

  const readError =
    magnitudeRule.error ??
    latestObservation.error ??
    liveForWeek.error ??
    submissionForWeek.error;
  if (readError) {
    return respond(
      {
        code: "storage_failure",
        message: "The existing series could not be read, so this submission was not stored",
        detail: readError.message,
      },
      500,
    );
  }

  const baseline: SeriesBaseline = {
    latest: latestObservation.data
      ? {
          price: Number(latestObservation.data.price),
          unitId: latestObservation.data.unit_id,
          isoYear: latestObservation.data.iso_year,
          isoWeek: latestObservation.data.iso_week,
        }
      : null,
    // `?? []` rather than a non-null assertion: readError above has already returned on a
    // failed read, so both are populated here, but the driver's type does not know that.
    hasEntryForWeek:
      (liveForWeek.data ?? []).length > 0 || (submissionForWeek.data ?? []).length > 0,
  };

  // Refuse rather than store a row whose outlier check silently did not run. An unflagged
  // submission in the queue has to mean "checked and ordinary" — if it can also mean "never
  // checked", the flag carries no information and the reviewer is worse off than with none.
  const magnitudeRatio = magnitudeRatioSchema.safeParse(magnitudeRule.data?.value);
  if (!magnitudeRatio.success) {
    return respond(
      {
        code: "threshold_unavailable",
        message:
          "The outlier threshold is not configured, so this submission could not be checked and was not stored",
        detail: magnitudeRule.data
          ? `editorial_rules ingest/magnitude_ratio holds ${JSON.stringify(magnitudeRule.data.value)}, which is not a ratio above 1`
          : "No active editorial_rules row for scope 'ingest', key 'magnitude_ratio' — seed it before intake can accept prices",
      },
      503,
    );
  }

  const flags = computeFlags(payload, resolved, baseline, magnitudeRatio.data);

  // ---- 10. Store as `pending` ---------------------------------------------
  // Anything the resolver had to work out rather than read straight off the row is written
  // into notes, so the reviewer sees how this submission was interpreted rather than only
  // its conclusion. A name that disagrees with the registered collector's is recorded, not
  // acted on — the phone is what identified them (P1.2).
  const annotations = [...resolved.fuzzyMatches];
  if (payload.collector_name.trim().toLowerCase() !== collector.value.name.trim().toLowerCase()) {
    annotations.push(
      `submitted collector name "${payload.collector_name}" differs from the registered name "${collector.value.name}"; matched on phone`,
    );
  }

  const notes = [payload.notes, ...annotations].filter(Boolean).join(" — ") || null;

  const inserted = await supabase
    .from("price_submissions")
    .insert({
      commodity_id: resolved.commodityId,
      collection_site_id: resolved.collectionSiteId,
      unit_id: resolved.unitId,
      collector_id: collector.value.id,
      variety: payload.variety ?? null,
      tier: payload.tier,
      price: payload.price,
      currency: payload.currency,
      iso_year: isoYear,
      iso_week: isoWeek,
      collected_on: payload.collected_on,
      source: "form",
      photo_url: payload.photo_url ?? null,
      notes,
      status: "pending",
      flags,
    })
    .select("id, status, iso_year, iso_week, flags")
    .single();

  if (inserted.error) {
    return respond(
      {
        code: "storage_failure",
        message: "The submission was valid but could not be stored",
        detail: inserted.error.message,
      },
      500,
    );
  }

  return NextResponse.json(
    {
      ok: true,
      submission_id: inserted.data.id,
      status: inserted.data.status,
      iso_year: inserted.data.iso_year,
      iso_week: inserted.data.iso_week,
      flags: inserted.data.flags,
      collector: collector.value.name,
    },
    { status: 201 },
  );
}
