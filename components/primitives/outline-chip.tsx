import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface OutlineChipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

// Secondary chip for country/commodity (§2.3): neutral outline, transparent fill, --ink-500
// label. Shares Chip's base type treatment (11/700 uppercase, +0.04em, 4px radius) since §2.3
// introduces it as a variant within the same chip family, not a separately-specced shape.
export function OutlineChip({ className, children, ...props }: OutlineChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-r-chip border border-line-300 bg-transparent px-sp-2 py-sp-1 text-fs-chip font-bold uppercase tracking-[0.04em] text-ink-500",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
