import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

// Active fill/label follow the same amber-action + navy-label convention used everywhere
// else amber marks the active/action state (§2.1) — the spec gives only the accent token
// ("active colour --amber-action"), not an explicit label colour.
export function FilterPill({ active = false, className, children, ...props }: FilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-[34px] items-center rounded-r-pill px-sp-4 text-fs-body font-medium uppercase transition-colors",
        active
          ? "bg-amber-action text-on-action"
          : "bg-surface-0 text-ink-500 border border-line-200",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
