import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

// --container and --gutter are deliberately not mapped into @theme yet (see globals.css),
// so this reaches them the documented way: arbitrary values referencing the raw CSS variable.
export function Container({ className, children, ...props }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[var(--container)] px-[var(--gutter)]", className)} {...props}>
      {children}
    </div>
  );
}
