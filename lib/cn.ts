type ClassValue = string | false | null | undefined;

/** Joins truthy class names with a space. No conflict resolution — nothing here needs it. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
