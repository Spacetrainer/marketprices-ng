export interface PriceTickerItem {
  id: string;
  commodity: string;
  /** Pre-formatted (via lib/format.ts once it exists) — this component never formats a number. */
  price: string;
  /** Pre-formatted signed change including the arrow glyph, e.g. "▲ 2.4%" (P6.4). */
  changeLabel: string;
  direction: "rise" | "fall" | "flat";
}

export interface PriceTickerProps {
  items: PriceTickerItem[];
}

const directionClasses: Record<PriceTickerItem["direction"], string> = {
  rise: "text-rise",
  fall: "text-fall",
  flat: "text-flat",
};

// §4.1: 44px, full-bleed --navy-deep, current ISO week only, marquee ~40s pausing on hover,
// static + horizontally scrollable under prefers-reduced-motion, renders nothing when empty
// (the band collapses to zero height rather than sitting empty and navy). There's no price
// data source yet at this stage, so in practice this always renders null in the shipped app —
// built and reduced-motion-correct, verified with temporary mock items, not committed.
export function PriceTicker({ items }: PriceTickerProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="h-[var(--ticker-h)] overflow-hidden bg-navy-deep motion-reduce:overflow-x-auto">
      <div
        className="num flex h-full w-max items-center animate-[marquee_40s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:animate-none"
      >
        {[...items, ...items].map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center gap-sp-2 whitespace-nowrap px-sp-6 text-fs-body font-medium text-on-dark"
          >
            <span>{item.commodity}</span>
            <span>{item.price}</span>
            <span className={directionClasses[item.direction]}>{item.changeLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
