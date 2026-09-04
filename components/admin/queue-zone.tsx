import {
  shouldCollapseQueueZone,
  type QueueCard as QueueCardData,
} from "../../lib/queries/dashboard";
import { QueueCard } from "./queue-card";

export interface QueueZoneProps {
  cards: readonly QueueCardData[];
}

/**
 * Zone 1 — what needs a human right now (§8.10, P4.4).
 *
 * Six cards in one row, or one line when every count is a MEASURED zero. The collapse is a
 * factual claim about all six queues, so `shouldCollapseQueueZone` refuses it while any card
 * is unmeasured — five genuine zeroes plus one unknown is not "nothing needs you", it is
 * "five queues are empty and one is unreadable", and the expanded zone says exactly that.
 *
 * Today Dispatch failures is always unmeasured, so the collapsed line is unreachable in
 * production. It is still built, and its condition is unit-tested, because the alternative
 * is a collapse rule written later against a screen nobody can see failing.
 */
export function QueueZone({ cards }: QueueZoneProps) {
  const collapsed = shouldCollapseQueueZone(cards);

  return (
    <section aria-labelledby="queue-zone-heading" data-collapsed={collapsed}>
      <h2 id="queue-zone-heading" className="sr-only">
        What needs you
      </h2>

      {collapsed ? (
        <p className="rounded-r-card border border-line-200 bg-surface-0 px-sp-4 py-sp-6 text-fs-card font-medium text-ink-900 shadow-rest">
          Nothing needs you right now.
        </p>
      ) : (
        // Six across is a 1440 design (§8.10 "six count cards in one row"). Below that the
        // row wraps rather than squeezing: at 1200px six columns leave each card ~139px, and
        // the unavailable card's label plus explanation cannot fit a fixed 96px box that
        // narrow — it overflowed by 74px, silently clipped. The threshold is measured, not
        // picked; tests/e2e/dashboard-queue-card.spec.ts holds it there.
        <ul className="grid grid-cols-1 gap-sp-4 min-[768px]:grid-cols-3 min-[1440px]:grid-cols-6">
          {cards.map((card) => (
            <li key={card.id} className="contents">
              <QueueCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
