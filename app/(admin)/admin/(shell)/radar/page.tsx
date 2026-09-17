import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  QueueCollapsed,
  SubmissionQueue,
} from "../../../../../components/admin/submission-queue";
import { canDecidePriceSubmissions } from "../../../../../lib/auth/roles";
import { readAdminSession } from "../../../../../lib/auth/session";
import { canViewSurface } from "../../../../../lib/auth/surfaces";
import { ADMIN_LOGIN_PATH, ADMIN_ROOT_PATH } from "../../../../../lib/constants";
import { getReviewQueue } from "../../../../../lib/queries/price-review";
import { weekLabel } from "../../../../../lib/weeks";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = {
  title: "Price radar",
  robots: { index: false, follow: false },
};

/**
 * Surface 3 — the Price radar (§8.12), region 0 only: this week's submission queue.
 *
 * WHAT IS DELIBERATELY NOT HERE. §8.12 draws four regions; the other three — the basket index
 * panel, the heatmap and the anomaly table — all read from `lib/basket.ts` and
 * `lib/anomalies.ts`, which are Stage 4 and are not built. There is no data to draw them
 * with: `price_anomalies` and `basket_snapshots` are empty and nothing writes to them. They
 * are therefore ABSENT rather than stubbed. An empty heatmap is not a heatmap waiting for
 * data, it is a grid of blank cells that a reader will interpret — and P2.8's rule about
 * missing weeks exists precisely because blank cells get read as zeroes. The build plan says
 * this queue is the "first slice of the Price radar" and that "the full radar arrives at stage
 * 7 and grows around it"; this is that slice.
 *
 * THERE IS NO STANDALONE PRICES SCREEN (P12.1). The submission queue lives here permanently.
 */
export const dynamic = "force-dynamic";

export default async function PriceRadarPage() {
  // The shell layout has already established that there is a complete staff session, and the
  // middleware has already made the authorisation call. Both are repeated here for the reason
  // the shell gives about itself: a page that trusts the middleware to have run is one
  // misconfigured matcher away from serving to someone who should not see it. This page needs
  // the ROLE anyway, to decide whether to render decision controls at all.
  const session = await readAdminSession();
  if (session.type !== "staff" || !session.account.isActive) {
    redirect(ADMIN_LOGIN_PATH);
  }
  if (!canViewSurface(session.account.role, "/admin/radar")) {
    redirect(ADMIN_ROOT_PATH);
  }

  const mayDecide = canDecidePriceSubmissions(session.account.role);
  const { currentWeek, current, earlier, unavailable } = await getReviewQueue();

  /**
   * One row's controls, or the reason there are none.
   *
   * A CONTRIBUTOR SEES THE WHOLE QUEUE AND DECIDES NOTHING IN IT, which is intended rather
   * than a gap (§7.2, confirmed 2026-09-17). `price_submissions_select_staff` gates on
   * `is_staff()`, so every role can read the queue — seeing what is waiting is part of doing
   * the work. Publishing it is a separate right. The sentence is rendered in place of the
   * buttons rather than showing three disabled ones, because a disabled control invites the
   * reader to hunt for the permission that would enable it, and there isn't one to find.
   */
  const renderDecision = mayDecide
    ? (submission: (typeof current)[number]) => (
        <ReviewActions
          submissionId={submission.id}
          submittedPrice={submission.price}
          commodityName={submission.commodityName}
        />
      )
    : () => (
        <p className="text-fs-meta text-ink-500" data-decision="read-only">
          An admin or editor approves prices.
        </p>
      );

  return (
    <div className="flex flex-col gap-sp-6">
      <header className="flex flex-col gap-sp-1">
        <h1 className="text-fs-h4 font-bold text-navy-deep">Price radar</h1>
        <p className="text-fs-meta text-ink-500">
          {weekLabel(currentWeek.isoWeek)} · {currentWeek.isoYear}
        </p>
      </header>

      {unavailable ? (
        /**
         * An unread queue is NOT an empty queue, and the two must never render alike (P0.2).
         * "Nothing is waiting" is a factual claim about every pending row, and it cannot be
         * made while the read that would establish it has failed — the same distinction the
         * Dashboard's `Measure` type draws between a measured zero and an absent count.
         */
        <p role="alert" className="rounded-r-card border border-line-200 bg-surface-0 px-sp-4 py-sp-6 text-fs-card text-ink-900 shadow-rest" data-queue-unavailable="true">
          {unavailable} This is not the same as an empty queue — do not read it as one.
        </p>
      ) : (
        <>
          <section aria-labelledby="current-week-heading" className="flex flex-col gap-sp-3">
            <h2 id="current-week-heading" className="text-fs-card font-bold text-navy-deep">
              This week&rsquo;s submissions
            </h2>

            {current.length === 0 ? (
              <QueueCollapsed isoYear={currentWeek.isoYear} isoWeek={currentWeek.isoWeek} />
            ) : (
              <div data-queue-group="current" data-count={current.length}>
                <SubmissionQueue
                  submissions={current}
                  caption={`Price submissions awaiting review for week ${currentWeek.isoWeek} of ${currentWeek.isoYear}`}
                  renderDecision={renderDecision}
                />
              </div>
            )}
          </section>

          {/**
           * THE STRAGGLERS, GROUPED AND NEVER HIDDEN (confirmed 2026-09-17).
           *
           * §8.12 scopes region 0 to "the current ISO week", and read literally that would
           * make an unreviewed submission disappear the moment Monday arrived. That is the
           * wrong failure: an unreviewed price is a HOLE IN THE SERIES, the heatmap will draw
           * it as a gap forever (P2.8), and the week it belongs to cannot be re-collected
           * after the fact because a collector cannot go back and stand in last month's
           * market. So they get their own group, below the current week where they do not
           * compete with today's work, with the count stated so the size of the backlog is
           * legible at a glance.
           *
           * The section is absent when nothing is outstanding, which is the common case and
           * the one worth keeping quiet.
           */}
          {earlier.length > 0 ? (
            <section aria-labelledby="earlier-weeks-heading" className="flex flex-col gap-sp-3">
              <h2 id="earlier-weeks-heading" className="text-fs-card font-bold text-navy-deep">
                Earlier weeks still pending
              </h2>
              <p className="text-fs-meta text-ink-500">
                {earlier.length === 1
                  ? "1 submission from a previous week has not been decided."
                  : `${earlier.length} submissions from previous weeks have not been decided.`}{" "}
                Every week left undecided stays a gap in the published series.
              </p>

              <div data-queue-group="earlier" data-count={earlier.length}>
                <SubmissionQueue
                  submissions={earlier}
                  caption="Price submissions awaiting review from earlier ISO weeks"
                  renderDecision={renderDecision}
                />
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
