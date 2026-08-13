import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Optional 13/400 descriptor line beneath the title (§4.9). */
  descriptor?: ReactNode;
  /** True on navy bands — swaps title/rule/descriptor to the on-dark palette. */
  onDark?: boolean;
  className?: string;
}

export function SectionHeader({ title, descriptor, onDark = false, className }: SectionHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-sp-2", className)}>
      <div className={cn("border-b pb-sp-3", onDark ? "border-on-dark-muted" : "border-line-200")}>
        <h2
          className={cn(
            "text-fs-h2 font-bold uppercase tracking-wide",
            onDark ? "text-on-dark" : "text-ink-900"
          )}
        >
          {title}
        </h2>
      </div>
      {descriptor ? (
        <p className={cn("text-fs-body font-normal", onDark ? "text-on-dark-muted" : "text-ink-500")}>
          {descriptor}
        </p>
      ) : null}
    </header>
  );
}
