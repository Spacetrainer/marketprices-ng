import type { Readout } from "../../lib/queries/dashboard";

export interface HealthReadoutProps {
  readout: Readout;
}

/**
 * One Zone 2 readout (§8.10). Label, figure, and a second line that is either provenance or
 * the qualifier that keeps the figure honest.
 *
 * A readout with no value prints its reason, not a dash and not a zero. Two of the six are
 * in that state by construction rather than by accident:
 *
 *   - Verification pass rate has no recorded first-pass signal to compute from, so it reads
 *     "awaiting definition" — the slot is real, the definition is not.
 *   - This week's mix counts for real but carries no target comparison, because the weekly
 *     target lives in `editorial_rules` and no row has been set. The count is a measurement;
 *     the over/under would be a comparison against a number nobody chose.
 *
 * The amber attention dot follows `attention`, which is only ever set from a real threshold
 * crossing. A dot derived from an absent target would be decoration (P0.2).
 */
export function HealthReadout({ readout }: HealthReadoutProps) {
  return (
    <div data-readout={readout.id} className="flex min-w-0 flex-col gap-sp-1">
      <p className="flex items-center gap-sp-2 text-fs-meta font-medium text-ink-500">
        {readout.label}
        {readout.attention ? (
          <>
            <span
              aria-hidden="true"
              className="h-sp-2 w-sp-2 shrink-0 rounded-r-pill bg-amber-action"
            />
            <span className="sr-only">Needs attention</span>
          </>
        ) : null}
      </p>

      {readout.value ? (
        <p className="kpi text-fs-kpi font-bold leading-none text-navy-deep">
          {readout.value}
        </p>
      ) : null}

      {readout.detail ? (
        <p className="text-fs-meta text-ink-400">{readout.detail}</p>
      ) : null}

      {readout.note ? (
        <p className="text-fs-meta text-ink-500">{readout.note}</p>
      ) : null}
    </div>
  );
}
