import { formatCollectedAt, formatNaira } from "../../lib/format";
import { weekLabel } from "../../lib/weeks";
import type { RecordedWeek } from "../../lib/queries/price-review";

export interface RecordedWeeksProps {
  weeks: readonly RecordedWeek[];
  /**
   * The submission's own ISO year. An entry from a DIFFERENT year prints its year, so a week
   * 52 sitting behind a week 1 cannot be misread as this year's week 52 (P2.7).
   */
  isoYear: number;
}

/**
 * The last three RECORDED weeks for a series, drawn beside the price awaiting approval
 * (build plan 3.5: "so approval is a one-second judgement").
 *
 * "RECORDED", NOT "LAST THREE WEEKS", and the difference is the whole point of the panel.
 * Three entries labelled 37, 36, 35 mean a series collected every week. Three labelled 37, 33,
 * 28 mean the same three published figures with eight silent holes between them, and a
 * reviewer who reads the second as the first will approve a price against a baseline that is
 * two months stale. So every entry carries its own ABSOLUTE ISO week (P2.7), and the holes
 * between them are DRAWN (P2.8) rather than closed up.
 *
 * NO DELTA IS COMPUTED HERE, deliberately. A week-on-week change across a gap is a two-week
 * change and has to be labelled as one; that rule, the trailing means, the z-score and the
 * seasonal baseline all live in `lib/anomalies.ts`, which is Stage 4 and is not built.
 * Hand-rolling a percentage in a component would be a second, wrong implementation of the
 * arithmetic this product sells (P2.3, P2.8) — and it would silently be a WoW across a gap the
 * first time a week was missing. The three prices sit side by side and the reviewer does the
 * comparison, which is what the spec asks for.
 */
export function RecordedWeeks({ weeks, isoYear }: RecordedWeeksProps) {
  if (weeks.length === 0) {
    // The honest empty state, and today it is every row: `price_observations` is empty, so no
    // series has any published history. It must not render as three dashes in a row, which
    // reads as "three weeks were checked and found missing" rather than "nothing is published".
    return (
      <span className="text-fs-meta text-ink-500" data-recorded-weeks="0">
        No published weeks yet
      </span>
    );
  }

  return (
    <ol className="flex flex-col gap-sp-2" data-recorded-weeks={weeks.length}>
      {weeks.map((week, index) => {
        const missing = gapBefore(weeks, index);

        return (
          <li key={`${week.isoYear}-${week.isoWeek}`} className="flex flex-col">
            {missing > 0 ? <GapMarker missing={missing} /> : null}

            <span className="flex items-baseline gap-sp-2">
              <span className="text-fs-meta font-medium text-ink-500">
                {weekLabel(week.isoWeek)}
                {/* The ISO YEAR prints whenever it is not the submission's own, which is how a
                    week 52 sitting behind a week 1 stops being ambiguous (P2.7). */}
                {week.isoYear === isoYear ? "" : ` · ${week.isoYear}`}
              </span>
              <span className="price text-fs-table font-bold text-ink-900">
                {formatNaira(week.price)}
              </span>
            </span>

            {/* Provenance rides with every price, at every breakpoint (P1.6). */}
            <span className="text-fs-chip text-ink-500">
              {formatCollectedAt(week.collectedOn, week.siteName)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * How many ISO weeks with no published price sit immediately before the entry at `index`.
 *
 * Measured from the submission's week for the first entry and from the previous entry
 * afterwards, using the `weeksBefore` distance the query layer already computed with
 * `lib/weeks.ts`. No week arithmetic happens in this file — that is `lib/weeks.ts` or nothing
 * (CLAUDE.md), and a component subtracting week numbers is exactly how a year boundary
 * produces a gap of −51.
 */
export function gapBefore(weeks: readonly RecordedWeek[], index: number): number {
  const distance = weeks[index].weeksBefore;
  const previous = index === 0 ? 0 : weeks[index - 1].weeksBefore;
  return distance - previous - 1;
}

function GapMarker({ missing }: { missing: number }) {
  const label = missing === 1 ? "1 week with no published price" : `${missing} weeks with no published price`;

  return (
    <span
      className="flex items-center gap-sp-2 py-sp-1 text-fs-chip text-ink-400"
      data-gap={missing}
    >
      {/* A dashed rule, which is what a gap looks like everywhere else in this product: the
          heatmap hatches a missing cell and the sparkline BREAKS at one. Never a zero, never a
          straight line drawn through (P2.8). */}
      <span aria-hidden="true" className="h-0 w-sp-5 border-t border-dashed border-line-300" />
      {label}
    </span>
  );
}
