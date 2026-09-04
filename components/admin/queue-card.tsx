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
        "group flex h-[96px] items-center justify-between gap-sp-2 rounded-r-card border border-line-200 bg-surface-0 px-sp-4 shadow-rest",
        // Drawn on every card so an amber one does not sit 3px narrower than its neighbours.
        "border-l-[3px]",
        bordered ? "border-l-amber-action" : "border-l-line-200",
      ].join(" ")}
    >
      <span className="flex min-w-0 flex-col gap-sp-1">
        {measure.state === "known" ? (
          <span className="queue-count text-fs-queue font-bold leading-none text-navy-deep">
            {measure.value}
          </span>
        ) : (
          <span className="text-fs-card font-bold leading-tight text-ink-500">
            {measure.label}
          </span>
        )}

        <span className="text-fs-body font-medium text-ink-900">{card.label}</span>

        {measure.state === "unavailable" ? (
          <span className="text-fs-meta text-ink-500">{measure.note}</span>
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
      className="shrink-0 text-ink-500"
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
