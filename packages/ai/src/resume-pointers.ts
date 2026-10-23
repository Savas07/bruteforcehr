/** JSON pointer (RFC 6901) of every string/number leaf in a JSON value, e.g. `/work/0/highlights/1`. */
export function leafPointers(value: unknown, prefix = ""): string[] {
  if (typeof value === "string" || typeof value === "number") return [prefix];
  if (Array.isArray(value)) return value.flatMap((item, index) => leafPointers(item, `${prefix}/${index}`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      leafPointers(item, `${prefix}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`),
    );
  }
  return [];
}

/** Confidence map giving every leaf of `resume` the same confidence (deterministic imports). */
export function uniformConfidence(resume: object, confidence: number): Record<string, number> {
  return Object.fromEntries(leafPointers(resume).map((pointer) => [pointer, confidence]));
}
