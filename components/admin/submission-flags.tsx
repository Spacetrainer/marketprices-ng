import { OutlineChip } from "../primitives/outline-chip";
import type { SubmissionFlag } from "../../lib/validation/ingest";

export interface SubmissionFlagsProps {
  flags: readonly SubmissionFlag[];
}

/**
 * The advisory flags intake attached to a submission (§8.12 region 0).
 *
 * WHAT THEY ARE: a note from `computeFlags` in `lib/validation/ingest.ts` saying why this row
 * might be worth a second look. A flagged row is still stored as `pending` for a human to
 * judge, never rejected — a genuine price shock and a typed extra zero look identical until
 * someone who knows the market looks at them.
 *
 * WHY THEY ARE ALL THE SAME COLOUR, which is the decision worth defending here. A flag is not
 * a DIRECTION, so `--rise`/`--fall` are forbidden: those two tokens mean a rising and a
 * falling price and nothing else (CLAUDE.md). A flag is not a SEVERITY either, so the navy
 * weight ramp is wrong as well — severity is a rating `lib/anomalies.ts` computes from a
 * z-score against a seasonal baseline (Stage 4), and `outlier` here is a crude ratio test at
 * intake, not that rating. Dressing a ratio test in the severity ramp would claim a
 * measurement nobody took (P0.2). So every flag wears the neutral outline chip and the
 * DESCRIPTION carries the meaning. When Stage 4 lands and a real severity exists, it gets the
 * ramp — and it will be a different component, because it is a different fact.
 */
interface FlagCopy {
  label: string;
  /** What the flag actually means, stated in terms of the check that raised it. */
  description: string;
}

/**
 * Wording tied to what `computeFlags` really tests, not to what the name suggests.
 *
 * `outlier` in particular: the threshold is `editorial_rules` (scope `ingest`, key
 * `magnitude_ratio`), read per request, so the copy names the rule rather than a number. A
 * figure here would be a hardcoded threshold wearing a disguise, and would go stale the moment
 * someone edited the rule (P16.2, P0.2).
 */
const FLAG_COPY: Record<SubmissionFlag, FlagCopy> = {
  outlier: {
    label: "Outlier",
    description:
      "This price and the last published one for this commodity and tier differ by more than the ingest threshold in Settings.",
  },
  new_series: {
    label: "First price",
    description:
      "Nothing has been published for this commodity and tier yet, so there was nothing to compare this price against.",
  },
  duplicate: {
    label: "Duplicate",
    description:
      "An entry for this commodity, ISO week and tier already exists — pending, approved, or already published.",
  },
  site_switch: {
    label: "Site switch",
    description: "Collected at a different site from the previous week's price.",
  },
};

export function SubmissionFlags({ flags }: SubmissionFlagsProps) {
  if (flags.length === 0) {
    // NOT an empty cell. A submission with no flags was checked and found ordinary, and that
    // is a result the reviewer should be able to read — an empty cell is indistinguishable
    // from a cell that failed to render.
    return (
      <span className="text-fs-meta text-ink-500" data-flags="none">
        Checked, nothing flagged
      </span>
    );
  }

  return (
    <ul className="flex flex-wrap gap-sp-1" data-flags={flags.join(" ")}>
      {flags.map((flag) => {
        const copy = FLAG_COPY[flag];

        // An unrecognised value cannot reach here through intake — 0009's CHECK constrains the
        // column to the four names — but a future migration could add a fifth, and a chip
        // reading "undefined" is a worse way to discover that than the raw value.
        if (!copy) {
          return (
            <li key={flag}>
              <OutlineChip>{flag}</OutlineChip>
            </li>
          );
        }

        return (
          <li key={flag}>
            <OutlineChip title={copy.description}>{copy.label}</OutlineChip>
            <span className="sr-only">{copy.description}</span>
          </li>
        );
      })}
    </ul>
  );
}
