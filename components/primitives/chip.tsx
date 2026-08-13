import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ChipSection =
  | "prices"
  | "production"
  | "tech"
  | "markets"
  | "govt"
  | "interviews"
  | "africa";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  section: ChipSection;
  /** True when the chip sits over photography — switches to a translucent white fill (§2.3). */
  onPhoto?: boolean;
  children: ReactNode;
}

const sectionClasses: Record<ChipSection, string> = {
  prices: "bg-chip-prices-bg text-chip-prices-fg",
  production: "bg-chip-production-bg text-chip-production-fg",
  tech: "bg-chip-tech-bg text-chip-tech-fg",
  markets: "bg-chip-markets-bg text-chip-markets-fg",
  govt: "bg-chip-govt-bg text-chip-govt-fg",
  interviews: "bg-chip-interviews-bg text-chip-interviews-fg",
  africa: "bg-chip-africa-bg text-chip-africa-fg",
};

// On photography the fill switches to a translucent surface-0 (white); the label keeps its
// section colour. Uses our own surface-0 token with an opacity modifier rather than Tailwind's
// unaffiliated default "white" swatch, so it still traces back to tokens.css.
const onPhotoClasses: Record<ChipSection, string> = {
  prices: "bg-surface-0/92 text-chip-prices-fg",
  production: "bg-surface-0/92 text-chip-production-fg",
  tech: "bg-surface-0/92 text-chip-tech-fg",
  markets: "bg-surface-0/92 text-chip-markets-fg",
  govt: "bg-surface-0/92 text-chip-govt-fg",
  interviews: "bg-surface-0/92 text-chip-interviews-fg",
  africa: "bg-surface-0/92 text-chip-africa-fg",
};

export function Chip({ section, onPhoto = false, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-r-chip px-sp-2 py-sp-1 text-fs-chip font-bold uppercase tracking-[0.04em]",
        onPhoto ? onPhotoClasses[section] : sectionClasses[section],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
