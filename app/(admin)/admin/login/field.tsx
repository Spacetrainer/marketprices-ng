import type { InputHTMLAttributes } from "react";
import { cn } from "../../../../lib/cn";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  /** Validation message for this field. Its presence is what puts the field in error. */
  error?: string;
}

/**
 * A labelled text input. Colocated with the login route rather than promoted to
 * `components/primitives/` — the build plan names the primitive set, and one route needing
 * a field is not yet evidence of a shared one. Promote it when a second surface wants it.
 *
 * Colour comes from --field-border / --field-border-focus / --field-error only.
 */
export function Field({ label, name, error, className, ...rest }: FieldProps) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col gap-sp-1">
      <label htmlFor={name} className="text-fs-meta font-medium text-ink-400">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "rounded-r-btn border bg-surface-0 px-sp-3 py-sp-2 text-fs-body text-ink-900",
          "focus:outline-2 focus:outline-offset-0",
          error
            ? "border-field-error focus:outline-field-error"
            : "border-field-border focus:border-field-border-focus focus:outline-field-border-focus",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-fs-meta text-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level failure — a rejected credential pair or code, as opposed to a bad field shape. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-fs-body text-field-error">
      {message}
    </p>
  );
}
