import Link from "next/link";
import type { QueueCard as QueueCardData } from "../../lib/queries/dashboard";

export interface QueueCardProps {
  card: QueueCardData;
}

/**
 * One Zone 1 action card (§8.10): a number, a one-line label, and a click straight into the
 * filtered screen behind it. 96px tall, count 28/700 tabular, label 13/500, chevron right.
 *
 * The 3px amber left border needs the count to be non-zero AND time-sensitive — so an
 * UNMEASURED card never earns it. "This is urgent" is a claim about a number, and there is
 * no number here to make it about.
 *
 * When the measure is unavailable the figure slot says so in words instead of printing 0.
 * Dispatch failures is the live case: `social_content_queue` is not in this database, and a
 * zero on the one card that means "something you published did not go out" would be the
 * most costly false reassurance on the screen (P0.2).
 */
export function QueueCard({ card }: QueueCardProps) {
  const { measure } = card;
  const bordered =
    card.timeSensitive && measure.state === "known" && measure.value > 0;

  return (
    <Link
      href={card.href}
      data-card={card.id}
      data-measure={measure.state}
      className={[
        // Anchored, not centred. The figure sits against the top padding and the text block
        // against the bottom one, so all six cards share a figure line and a label line
        // whatever their content height. Centring made every card's baseline depend on
        // whether its own label happened to wrap, which is why the row looked ragged.
        "group relative flex h-[96px] flex-col justify-between overflow-hidden rounded-r-card border border-line-200 bg-surface-0 px-sp-4 py-sp-2 shadow-rest",
        // Drawn on every card so an amber one does not sit 3px narrower than its neighbours.
        "border-l-[3px]",
        bordered ? "border-l-amber-action" : "border-l-line-200",
      ].join(" ")}
    >
      {/* The figure line, and the only line that yields width to the chevron — an unavailable
          label is words rather than a digit, and would otherwise run underneath it. */}
      <span className="pr-sp-4">
        {measure.state === "known" ? (
          <span className="queue-count block text-fs-queue font-bold leading-none text-navy-deep">
            {measure.value}
          </span>
        ) : (
          <span className="block text-fs-meta font-bold leading-[1.4] text-ink-500">
            {measure.label}
          </span>
        )}
      </span>

      <span className="flex flex-col gap-sp-1">
        <span className="text-fs-body font-medium leading-[1.4] text-ink-900">
          {card.label}
        </span>

        {measure.state === "unavailable" ? (
          <span className="text-fs-chip leading-[1.4] text-ink-500">{measure.note}</span>
        ) : null}
      </span>

      <ChevronIcon />
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="absolute right-sp-4 top-sp-3 text-ink-500"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
