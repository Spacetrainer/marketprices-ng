import type { BadgeKey } from "../../lib/auth/surfaces";
import type { Measure } from "../../lib/queries/dashboard";

export interface NavBadgeProps {
  badge: BadgeKey;
  measure: Measure;
}

/**
 * A sidebar count badge (§7.5).
 *
 * Price radar's fill is `--fall` because §7.5 names it: anomalies are urgent. The other
 * three are unspecified there, and resolve to `--navy-brand` — the one lighter navy in the
 * palette, and the same step the severity ramp already uses for HIGH (§7.4). No new colour.
 *
 * `--fall` here is NOT direction. §7.4's rule is that direction and severity may not share a
 * channel; this badge is neither, and the fill is a single fixed urgency mark on one nav
 * item rather than a scale a reader could mistake for a falling price.
 *
 * A measured zero renders as "0". An UNMEASURED badge renders an em dash, not a zero and not
 * nothing: a badge that silently disappears reads as "no work here", which is a claim we
 * cannot make when the count failed (P0.2).
 */
export function NavBadge({ badge, measure }: NavBadgeProps) {
  const urgent = badge === "radar";

  if (measure.state === "unavailable") {
    return (
      <span
        title={measure.note}
        className="queue-count inline-flex min-w-sp-5 items-center justify-center rounded-r-pill bg-sidebar-inactive px-sp-2 text-fs-chip font-bold text-navy-deep"
      >
        <span aria-hidden="true">&mdash;</span>
        <span className="sr-only">{measure.note}</span>
      </span>
    );
  }

  return (
    <span
      className={[
        "queue-count inline-flex min-w-sp-5 items-center justify-center rounded-r-pill px-sp-2 text-fs-chip font-bold text-on-dark",
        urgent ? "bg-badge-urgent-bg" : "bg-badge-count-bg",
      ].join(" ")}
    >
      {measure.value}
    </span>
  );
}
