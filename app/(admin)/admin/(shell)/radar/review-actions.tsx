"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "../../../../../components/primitives/button";
import { cn } from "../../../../../lib/cn";
import { formatNaira } from "../../../../../lib/format";
import { availableUnitRole, type LivePriceThisWeek } from "../../../../../lib/queries/price-review";
import { approveSubmissionAction, rejectSubmissionAction } from "./actions";
import { emptyReviewState, type ReviewFormState } from "./review-state";

export interface ReviewActionsProps {
  submissionId: string;
  /** Shown beside the corrected-price field so the reviewer can see what they are changing. */
  submittedPrice: number;
  commodityName: string;
  /** The unit this price was collected in. Part of the figure's meaning, and of its series. */
  unitName: string;
  /**
   * What is already live for this commodity, tier and ISO week, in either unit (P1.7, 0041).
   *
   * Drives which decision this panel offers, because the three cases are genuinely different
   * acts: publishing a week's figure, adding a second measure beside it, or nothing.
   */
  liveThisWeek: readonly LivePriceThisWeek[];
}

/**
 * Approve · Edit & approve · Reject with reason (§8.12 region 0, build plan 3.5).
 *
 * THE ONLY CLIENT COMPONENT ON THIS SCREEN. Everything else is a Server Component, and this
 * one is a client component for exactly the reason CLAUDE.md permits: it holds state (which
 * panel is open) and event handlers. It holds NO DATA — every figure it displays arrives as a
 * prop from the query layer, and the decision itself is a server action.
 *
 * WHY THE TWO EDITING PANELS ARE CLOSED BY DEFAULT. Approve is one click because approving an
 * ordinary price should be one click. Editing a collector's figure and rejecting their work
 * are not ordinary, and both require typing a reason before the button that completes them
 * appears. That friction is the feature (§8.13's phrase, applied here): a reason nobody had to
 * think about is a reason nobody can use later.
 *
 * THERE IS NO CONFIRMATION DIALOG on plain Approve, and that is deliberate rather than an
 * omission. Sixteen ordinary prices are sixteen clicks; a confirm step on each would be
 * dismissed without reading by the third one, which trains exactly the reflex that makes the
 * seventeenth dangerous. The irreversibility is real — an approval publishes, and correcting
 * it afterwards is a supersede plus a fresh submission (P1.3) — so it is stated in the
 * panel's own copy where it is read once, rather than in a dialog that is read never.
 *
 * THE SECOND-PRICE PATH IS ITS OWN ACT, NOT A CHECKBOX ON APPROVE (P1.7, migration 0041). A
 * commodity can carry two prices for one week in different units, and `approve_price_submission()`
 * REFUSES an approval that does not say which this is whenever the week already holds a live
 * figure — a role is never inferred from which price arrived first (P0.2). So this panel reads
 * what is published and offers the decision that actually exists:
 *
 *   nothing live   -> Approve, one click. The function resolves `primary`, which is a
 *                     description of a lone price rather than a guess about a pair.
 *   one live       -> the plain button is gone. What is published is shown, with its unit, and
 *                     the reviewer confirms this is the week's OTHER measure. That names a
 *                     figure they cannot re-rank afterwards: a published role is frozen (0025),
 *                     so promoting the second price later is a supersede plus a fresh
 *                     submission (P1.3).
 *   two live       -> no approve control at all, and the reason said in place of it. The week is
 *                     full; the function would refuse whatever is sent.
 */
type OpenPanel = "none" | "edit" | "reject" | "second";

export function ReviewActions({
  submissionId,
  submittedPrice,
  commodityName,
  unitName,
  liveThisWeek,
}: ReviewActionsProps) {
  const [approveState, approveAction, approving] = useActionState<ReviewFormState, FormData>(
    approveSubmissionAction,
    emptyReviewState,
  );
  const [rejectState, rejectAction, rejecting] = useActionState<ReviewFormState, FormData>(
    rejectSubmissionAction,
    emptyReviewState,
  );
  const [open, setOpen] = useState<OpenPanel>("none");
  const ids = useId();

  const busy = approving || rejecting;

  // A decided row disappears from the queue on revalidation, so this normally shows for the
  // instant before it does. It still has to exist: revalidation can lag, and on a slow
  // connection the sentence is the only evidence the click did anything.
  const done = approveState.done ?? rejectState.done;
  if (done) {
    return (
      <p role="status" className="text-fs-meta text-ink-900" data-decision="done">
        {done}
      </p>
    );
  }

  // Which role this submission could take, worked out in the query layer beside the other pure
  // decisions about this data. Null means the week is full and there is no approval to offer.
  const available = availableUnitRole(liveThisWeek);
  // A role is only sent when the reviewer is being asked; on the empty-week path the field is
  // absent and the function resolves it. `""` posts as "no answer", which the schema reads as null.
  const roleField = liveThisWeek.length === 0 ? "" : (available ?? "");

  return (
    <div className="flex flex-col gap-sp-3" data-decision="open">
      <div className="flex flex-wrap gap-sp-2">
        {/* Plain approve: its own form, so it posts no corrected price at all rather than an
            empty one. The action reads a missing field as "no correction" either way, but a
            form that cannot carry a stray value is better than one that is trusted not to.

            Rendered ONLY for a week that holds nothing. One click is right for a lone price and
            wrong for a week's second figure, where the reviewer is choosing something they
            cannot change later. */}
        {liveThisWeek.length === 0 ? (
          <form action={approveAction}>
            <input type="hidden" name="submissionId" value={submissionId} />
            <Button type="submit" disabled={busy} data-action="approve">
              {approving ? "Approving…" : "Approve"}
            </Button>
          </form>
        ) : available ? (
          <Button
            type="button"
            disabled={busy}
            aria-expanded={open === "second"}
            aria-controls={`${ids}-second`}
            onClick={() => setOpen(open === "second" ? "none" : "second")}
            data-action="approve-second"
          >
            Approve as this week&rsquo;s second price
          </Button>
        ) : null}

        {/* Also absent when the week is full: editing a figure does not create room for it. */}
        {available ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            aria-expanded={open === "edit"}
            aria-controls={`${ids}-edit`}
            onClick={() => setOpen(open === "edit" ? "none" : "edit")}
            data-action="edit"
          >
            Edit &amp; approve
          </Button>
        ) : null}

        {/* `destructive` is the outlined --fall variant, which is the one place a reject
            control may carry that colour: it marks a destructive ACTION, not a falling price.
            The button is never solid red — buttons are amber with a navy label (CLAUDE.md). */}
        <Button
          type="button"
          variant="destructive"
          disabled={busy}
          aria-expanded={open === "reject"}
          aria-controls={`${ids}-reject`}
          onClick={() => setOpen(open === "reject" ? "none" : "reject")}
          data-action="reject"
        >
          Reject
        </Button>
      </div>

      <FormError message={approveState.error ?? rejectState.error} />

      {/* What is already published for this week, stated wherever it exists — beside the
          second-price control, and in place of the approve controls when the week is full.
          Every figure carries its unit, because a paint bucket and a plate are not the same
          number and `base_multiplier` is null on every unit (0036), so nothing converts them. */}
      {liveThisWeek.length > 0 ? (
        <div className="flex flex-col gap-sp-1" data-live-this-week={liveThisWeek.length}>
          <p className="text-fs-chip uppercase tracking-[0.04em] text-ink-400">
            Already published for this week
          </p>
          <ul className="flex flex-col gap-sp-1">
            {liveThisWeek.map((entry) => (
              <li key={`${entry.unitRole}-${entry.unitName}`} className="text-fs-meta text-ink-900">
                <span className="price font-bold">{formatNaira(entry.price)}</span>{" "}
                <span className="text-ink-500">
                  per {entry.unitName} · {entry.unitRole === "primary" ? "this week’s headline" : "second price"}
                </span>
              </li>
            ))}
          </ul>
          {available === null ? (
            <p className="text-fs-meta text-ink-500" data-decision="week-full">
              This week already carries both of its prices, so this submission cannot be
              published as it stands. A commodity holds at most two prices per week per tier, in
              different units. To replace one of the figures above, retire it and re-collect —
              approving over it is not possible, and a published price is never edited.
            </p>
          ) : null}
        </div>
      ) : null}

      {open === "second" && available ? (
        <form
          id={`${ids}-second`}
          action={approveAction}
          className="flex flex-col gap-sp-2 rounded-r-card border border-line-200 bg-surface-50 p-sp-3"
          noValidate
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="unitRole" value={available} />

          <p className="text-fs-meta text-ink-500">
            Publishing a {available === "secondary" ? "second" : "headline"} price for{" "}
            {commodityName} in this week, measured per {unitName}. The two figures are never
            averaged or compared — no conversion between their units exists — and{" "}
            {available === "secondary"
              ? "the figure above stays this week’s headline figure."
              : "this one becomes this week’s headline figure."}{" "}
            Which of the two is the headline cannot be changed afterwards: a published price is
            never edited, so it would mean retiring this row and re-collecting.
          </p>

          <div className="flex gap-sp-2">
            <Button type="submit" disabled={busy} data-action="approve-second-confirm">
              {approving ? "Approving…" : `Publish as the ${available} price`}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen("none")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {open === "edit" ? (
        <form
          id={`${ids}-edit`}
          action={approveAction}
          className="flex flex-col gap-sp-2 rounded-r-card border border-line-200 bg-surface-50 p-sp-3"
          noValidate
        >
          <input type="hidden" name="submissionId" value={submissionId} />
          {/* Carries the role the same way the second-price form does, so editing a figure and
              choosing the headline figure stay one decision rather than two forms that can
              disagree. Empty on an empty week, which the schema reads as "no answer". */}
          <input type="hidden" name="unitRole" value={roleField} />

          <p className="text-fs-meta text-ink-500">
            Publishing a different price from the one {commodityName}&rsquo;s collector
            reported, per {unitName}. The submitted figure is kept on the record beside yours —
            it is never overwritten.
            {roleField === "secondary"
              ? " It publishes as this week's second price; the figure above stays the headline figure."
              : ""}
          </p>

          <Field
            id={`${ids}-price`}
            label={`Corrected price · submitted ${formatNaira(submittedPrice)}`}
            name="correctedPrice"
            inputMode="decimal"
            autoComplete="off"
            error={approveState.fieldErrors.correctedPrice}
          />

          <TextArea
            id={`${ids}-reason`}
            label="Why it was not published as submitted"
            name="correctionReason"
            error={approveState.fieldErrors.correctionReason}
          />

          <div className="flex gap-sp-2">
            <Button type="submit" disabled={busy}>
              {approving ? "Approving…" : "Approve with this price"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen("none")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {open === "reject" ? (
        <form
          id={`${ids}-reject`}
          action={rejectAction}
          className="flex flex-col gap-sp-2 rounded-r-card border border-line-200 bg-surface-50 p-sp-3"
          noValidate
        >
          <input type="hidden" name="submissionId" value={submissionId} />

          <p className="text-fs-meta text-ink-500">
            Nothing is published and nothing is deleted. The submission is kept with your
            reason on it, and the price is only re-collected as a new submission.
          </p>

          <TextArea
            id={`${ids}-reject-reason`}
            label="Reason"
            name="reason"
            error={rejectState.fieldErrors.reason}
          />

          <div className="flex gap-sp-2">
            <Button type="submit" variant="destructive" disabled={busy}>
              {rejecting ? "Rejecting…" : "Reject this submission"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen("none")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The two field shapes this panel needs.
 *
 * Colocated rather than promoted to `components/primitives/`, for the reason the login
 * route's `Field` records: the build plan names the primitive set, and a second route wanting
 * an input is not yet evidence of a shared one. Colour comes from --field-border /
 * --field-border-focus / --field-error only — no new values.
 */
function Field({
  id,
  label,
  name,
  error,
  ...rest
}: { id: string; label: string; name: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-sp-1">
      <label htmlFor={id} className="text-fs-meta font-medium text-ink-400">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "rounded-r-btn border bg-surface-0 px-sp-3 py-sp-2 text-fs-body text-ink-900",
          "focus:outline-2 focus:outline-offset-0",
          error
            ? "border-field-error focus:outline-field-error"
            : "border-field-border focus:border-field-border-focus focus:outline-field-border-focus",
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-fs-meta text-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextArea({
  id,
  label,
  name,
  error,
}: {
  id: string;
  label: string;
  name: string;
  error?: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-sp-1">
      <label htmlFor={id} className="text-fs-meta font-medium text-ink-400">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={2}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "rounded-r-btn border bg-surface-0 px-sp-3 py-sp-2 text-fs-body text-ink-900",
          "focus:outline-2 focus:outline-offset-0",
          error
            ? "border-field-error focus:outline-field-error"
            : "border-field-border focus:border-field-border-focus focus:outline-field-border-focus",
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-fs-meta text-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-fs-meta text-field-error" data-decision-error>
      {message}
    </p>
  );
}
