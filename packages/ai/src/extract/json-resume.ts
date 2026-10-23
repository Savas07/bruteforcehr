import { type JsonResume, JsonResumeSchema } from "@bfhr/core";
import { uniformConfidence } from "../resume-pointers";
import { UnreadableFileError } from "./text";

/** Version of the JSON Resume import (reported as `promptVersion`). */
export const JSON_RESUME_MAPPER_VERSION = "json-resume@1";

/** Removes the value at `path` (array items are spliced out so indexes stay dense). */
function removeAt(root: unknown, path: readonly PropertyKey[]): void {
  let parent: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (parent === null || typeof parent !== "object") return;
    parent = (parent as Record<PropertyKey, unknown>)[key];
  }
  const last = path.at(-1);
  if (parent === null || typeof parent !== "object" || last === undefined) return;
  if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
  else Reflect.deleteProperty(parent, last);
}

/**
 * Validates a JSON Resume document against the schema the app stores, removing (never repairing)
 * each invalid value: a bad date, an over-long string, a wrong type. Unknown fields and the JSON
 * Resume `meta` block are dropped. Returns the JSON pointers of removed values.
 */
export function sanitizeResume(input: unknown): { resume: JsonResume; removed: string[] } {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return { resume: {}, removed: [""] };
  const draft: unknown = structuredClone(input);
  const removed: string[] = [];
  // Each round removes every reported value; nested failures surface in later rounds.
  for (let round = 0; round < 20; round++) {
    const result = JsonResumeSchema.safeParse(draft);
    if (result.success) return { resume: result.data, removed };
    const paths = result.error.issues
      .map((issue) => issue.path)
      // Deepest and highest index first, so earlier removals don't shift later paths.
      .sort(
        (a, b) =>
          b.length - a.length || String(b.at(-1)).localeCompare(String(a.at(-1)), "en", { numeric: true }),
      );
    for (const path of paths) {
      removeAt(draft, path);
      removed.push(`/${path.map(String).join("/")}`);
    }
  }
  return { resume: {}, removed: [""] };
}

export interface JsonResumeImport {
  resume: JsonResume;
  confidence: Record<string, number>;
  warnings: string[];
}

/** A JSON Resume file: validated directly, no model involved. */
export function importJsonResume(bytes: Uint8Array): JsonResumeImport {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""));
  } catch {
    throw new UnreadableFileError("unreadable_file", "not a JSON file");
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new UnreadableFileError("unreadable_file", "not a JSON Resume document");
  }
  const { resume, removed } = sanitizeResume(json);
  return {
    resume,
    confidence: uniformConfidence(resume, 1),
    warnings: removed.map((pointer) => `dropped_invalid:${pointer}`),
  };
}
