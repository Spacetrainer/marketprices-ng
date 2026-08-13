import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type ScrimProps = HTMLAttributes<HTMLDivElement>;

// Wraps the .scrim gradient already defined in styles/tokens.css. Assumed usage is an
// absolutely-positioned overlay on a photography container — the spec describes the gradient
// itself, not its positioning, so this is an inferred (and easily overridden) default.
export function Scrim({ className, ...props }: ScrimProps) {
  return <div className={cn("scrim pointer-events-none absolute inset-0", className)} {...props} />;
}
