import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "destructive";
// Spec (§4.7, §7.3) defines exactly one size. Typed as a single literal rather than
// inventing a scale the spec doesn't support — extend when a size is actually specced.
export type ButtonSize = "default";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the single child element instead of a <button>, merging these props onto it. */
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-amber-action text-on-action hover:bg-amber-hover",
  secondary: "bg-surface-0 text-ink-900 border border-line-300 hover:bg-surface-50",
  destructive: "bg-surface-0 text-fall border border-fall hover:bg-fall-bg",
};

// Vertical padding (10px) has no matching --sp-* token (scale jumps 8px → 12px); the
// horizontal 24px matches --sp-6 exactly. Flagged in docs/exceptions.md.
const sizeClasses: Record<ButtonSize, string> = {
  default: "px-sp-6 py-[10px] text-fs-table rounded-r-btn",
};

const baseClasses = "inline-flex items-center justify-center font-bold whitespace-nowrap transition-colors";

export function Button({
  variant = "primary",
  size = "default",
  asChild = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(baseClasses, variantClasses[variant], sizeClasses[size], className);

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...rest,
      className: cn(classes, child.props.className),
    });
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
