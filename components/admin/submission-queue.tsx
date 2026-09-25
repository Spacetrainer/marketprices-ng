import type { ReactNode } from "react";
import { formatCollectedAt, formatNaira, formatWeek } from "../../lib/format";
import { weekLabel } from "../../lib/weeks";
import type { PendingSubmission } from "../../lib/queries/price-review";
import { RecordedWeeks } from "./recorded-weeks";
import { SubmissionFlags } from "./submission-flags";

export interface SubmissionQueueProps {
  /** The group's rows. Never rendered when empty — the page decides what an empty group means. */
  submissions: readonly PendingSubmission[];
  /** Accessible name for this group's table, e.g. "This week's submissions". */
  caption: string;
  /**
   * The decision controls for one row, supplied by the page.
   *
   * A RENDER SLOT RATHER THAN AN IMPORT, because the controls are a client component that
   * lives in the route folder and this file is a reusable Server Component in
   * `components/admin/`. Importing upward would invert the layering; taking a function keeps
   * the dependency pointing the one way it should. It is also what lets the page hand a
   * Contributor a sentence where an Editor gets three buttons, without this component knowing
   * anything about roles.
   */
  renderDecision: (submission: PendingSubmission) => ReactNode;
}

/**
 * The review table (build plan 3.5, §8.12 region 0).
 *
 * A REAL `<table>`, not a grid of divs. The data is genuinely tabular — one row per price,
 * the same six facts each time — so the table earns its markup: `<th scope="col">` gives every
 * cell a header a screen reader can announce, a `<caption>` names the group, and `tokens.css`
 * puts `font-variant-numeric: tabular-nums` on `table` unconditionally, so every figure in
 * here lines up by construction rather than by remembering a class.
 *
 * EVERY PRICE CARRIES ITS ISO WEEK AND ITS COLLECTION DATE (CLAUDE.md: "a price without
 * provenance does not ship"). That applies to the submitted figure and to each of the three
 * published weeks beside it, which is why the provenance line is repeated rather than hoisted
 * into a shared header — the rows do not share a site, and a header would quietly claim they
 * did.
 */
export function SubmissionQueue({ submissions, caption, renderDecision }: SubmissionQueueProps) {
  return (
    <div className="overflow-x-auto rounded-r-card border border-line-200 bg-surface-0 shadow-rest">
      <table className="w-full min-w-[1000px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>

        <thead>
          <tr className="border-b border-line-200">
            <HeaderCell>Commodity</HeaderCell>
            <HeaderCell>Submitted price</HeaderCell>
            <HeaderCell>Last 3 recorded weeks</HeaderCell>
            <HeaderCell>Flags</HeaderCell>
            <HeaderCell>Collector</HeaderCell>
            <HeaderCell>Decision</HeaderCell>
          </tr>
        </thead>

        <tbody>
          {submissions.map((submission) => (
            <tr
              key={submission.id}
              data-submission={submission.id}
              data-iso-week={`${submission.isoYear}-W${submission.isoWeek}`}
              className="border-b border-line-200 align-top last:border-b-0"
            >
              <BodyCell>
                <span className="block text-fs-table font-bold text-ink-900">
                  {submission.commodityName}
                </span>
                {submission.variety ? (
                  <span className="block text-fs-meta text-ink-500">{submission.variety}</span>
                ) : null}
                {/* The unit is part of the figure's meaning, not decoration: a price per sack
                    and a price per plate are not the same number. `units.base_multiplier` is
                    null across the board, so no conversion between them exists (0036) — which
                    makes stating the unit the only thing that keeps the two apart. */}
                <span className="block text-fs-meta text-ink-500">
                  per {submission.unitName}
                </span>
                <span className="mt-sp-1 block text-fs-chip uppercase tracking-[0.04em] text-ink-400">
                  {submission.tier}
                </span>
              </BodyCell>

              <BodyCell>
                <span className="price block text-fs-price-lg font-bold text-ink-900">
                  {formatNaira(submission.price)}
                </span>
                <span className="block text-fs-meta text-ink-500">
                  {formatWeek(submission.isoYear, submission.isoWeek)}
                </span>
                <span className="block text-fs-chip text-ink-500">
                  {formatCollectedAt(submission.collectedOn, submission.siteName)}
                </span>
              </BodyCell>

              <BodyCell>
                <RecordedWeeks weeks={submission.recentWeeks} isoYear={submission.isoYear} />
              </BodyCell>

              <BodyCell>
                <SubmissionFlags flags={submission.flags} />
              </BodyCell>

              <BodyCell>
                {/* P1.2: every submission traces to a named person. The name is the point —
                    an approval is a judgement about whose figure this is. */}
                <span className="block text-fs-body text-ink-900">
                  {submission.collectorName}
                </span>
                <span className="block text-fs-chip text-ink-500">
                  {submission.source === "manual" ? "Entered in the control room" : "Field form"}
                </span>
                {submission.notes ? (
                  <span className="mt-sp-1 block text-fs-chip text-ink-500">
                    {submission.notes}
                  </span>
                ) : null}
              </BodyCell>

              <BodyCell className="w-[300px]">{renderDecision(submission)}</BodyCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="px-sp-4 py-sp-3 text-fs-chip font-bold uppercase tracking-[0.04em] text-ink-500"
    >
      {children}
    </th>
  );
}

function BodyCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-sp-4 py-sp-4 ${className ?? ""}`}>{children}</td>;
}

/**
 * The one-line collapse §8.12 asks for: "shown only while `pending` rows exist for the current
 * ISO week and collapsed to a single line otherwise".
 *
 * It states the week it is making the claim ABOUT, which the spec's version does not. "Nothing
 * is waiting" is only meaningful attached to a period — an empty queue in week 38 says nothing
 * about week 37, and a reviewer arriving on Monday needs to know which week they are being
 * reassured about (P2.7).
 */
export function QueueCollapsed({ isoYear, isoWeek }: { isoYear: number; isoWeek: number }) {
  return (
    <p
      className="rounded-r-card border border-line-200 bg-surface-0 px-sp-4 py-sp-6 text-fs-card font-medium text-ink-900 shadow-rest"
      data-queue-collapsed="true"
    >
      Nothing is waiting for {weekLabel(isoWeek)} of {isoYear}.
    </p>
  );
}
