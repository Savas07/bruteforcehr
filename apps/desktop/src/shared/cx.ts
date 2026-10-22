/** Joins class names, skipping falsy entries: `cx("a", isOpen && "b")`. */
export function cx(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
