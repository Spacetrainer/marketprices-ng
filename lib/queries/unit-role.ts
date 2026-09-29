import type { UnitRole } from "../validation/ingest";

/**
 * The role decision (P1.7, 0041), in a module the browser can hold.
 *
 * WHY THIS IS ITS OWN FILE, AND THE RULE IT ENCODES FOR ANYONE ADDING TO IT. The review panel
 * at `app/(admin)/admin/(shell)/radar/review-actions.tsx` is the one Client Component on the
 * Price radar — it owns the approve/reject form state, so it must be. It needs this decision
 * at render time. `lib/queries/price-review.ts` cannot give it to it: that module's first line
 * imports `../supabase/server`, which imports `next/headers`, and importing a VALUE out of it
 * pulls that whole graph into the client bundle. Next refuses to compile it, and rightly —
 * `cookies()` has no meaning in a browser.
 *
 * A type import would have been harmless, because types are erased. `availableUnitRole` is a
 * value, and that is the whole difference.
 *
 * So: NOTHING IN THIS FILE MAY IMPORT SUPABASE, `next/headers`, OR ANY MODULE THAT DOES.
 * `lib/validation/ingest.ts` is safe (zod, `lib/weeks.ts`, `lib/constants.ts`) and the import
 * below is type-only regardless. Data access still lives in `lib/queries/price-review.ts`
 * (CLAUDE.md); what lives here is the pure rule the data is read against, which both sides of
 * the boundary need and neither side should own alone.
 *
 * `price-review.ts` re-exports both of these, so every server-side caller reads unchanged.
 */

/**
 * A price already live for the submission's OWN commodity, tier and week — in either unit.
 *
 * THIS IS WHAT MAKES THE ROLE DECISION POSSIBLE IN THE UI. `approve_price_submission()` refuses
 * an omitted role when the week already holds something (P0.2 — a role is never inferred from
 * arrival order), so the reviewer has to be told what is there before they can answer. An empty
 * list means one click; a list of one means the choice is real; a list of two means the cap is
 * full and this submission cannot be approved at all.
 */
export interface LivePriceThisWeek {
  unitName: string;
  unitRole: UnitRole;
  price: number;
  currency: string;
}

/**
 * Which role a submission could still take for its week, or null when the week is full.
 *
 * PURE, AND EXPORTED RATHER THAN DECIDED IN THE PANEL, for the reason `takeRecentWeeks` and
 * `partitionByWeek` are: it is a rule about the data (P1.7), the three outcomes it
 * distinguishes are three different acts in the UI, and it is testable without a browser. The
 * panel renders the answer; it does not work it out.
 *
 * DERIVED FROM WHAT IS PUBLISHED, NEVER FROM ARRIVAL ORDER. An empty week returns 'primary'
 * because a lone price is the figure every surface shows — which is a description, not a guess.
 * A week holding a primary returns 'secondary'. A full week returns null, and the panel offers
 * no approval at all, because `approve_price_submission()` would refuse whatever it sent.
 */
export function availableUnitRole(live: readonly LivePriceThisWeek[]): UnitRole | null {
  const taken = new Set(live.map((entry) => entry.unitRole));
  if (!taken.has("primary")) return "primary";
  if (!taken.has("secondary")) return "secondary";
  return null;
}
