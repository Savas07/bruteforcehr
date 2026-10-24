import { z } from "zod";
import { IdSchema } from "../common";
import type { CvContent } from "../cv";
import { UiLanguageSchema } from "../enums";

/* ------------------------------------------------------------------------------------------------
 * "Tailor for this job" (BRIEF §4.4.1, docs/adr/0010-ai.md "Tailoring"): the `cvTailor` callable
 * proposes edits to one CV revision; the client shows each as a diff card, applies the accepted
 * ones with `applyTailorEdits` and writes a new revision (`source: "ai_tailor"`, `jobId` = the job
 * it was tailored for, `basedOnRevisionId` = the revision the edits were proposed against).
 * ---------------------------------------------------------------------------------------------- */

/** Light: wording and order of bullets and keywords. Thorough: also summary, headline, adding or removing bullets and keywords, and the order of skills, projects and sections. */
export const TailorIntensitySchema = z.enum(["light", "thorough"]);
export type TailorIntensity = z.infer<typeof TailorIntensitySchema>;

export const TailorEditOpSchema = z.enum(["replace", "insert", "remove", "reorder"]);
export type TailorEditOp = z.infer<typeof TailorEditOpSchema>;

/**
 * RFC 6901 JSON pointer into `CvContent`, e.g. `/work/0/highlights/2`. CV keys never contain `~`
 * or `/`, so no escaping is needed (and none is accepted).
 */
export const CvPointerSchema = z
  .string()
  .max(200)
  .regex(/^(?:\/[A-Za-z0-9_]+)+$/, "Expected a JSON pointer such as /work/0/highlights/1");

/** Most items an array may get from tailoring before the CV schema's own limits apply. */
const MAX_ORDER = 200;

/**
 * One proposed edit. Paths always address the revision the edits were proposed against (indices
 * of the original arrays), so edits stay independent of each other and of the order they are
 * accepted in.
 *
 * - `replace`: `path` is a text value; `before` is its current text, `after` the new text.
 * - `insert`: `path` is an array position (`…/highlights/3`, up to the array's length); `after` is
 *   the new text, inserted before the original item at that index; `before` is null.
 * - `remove`: `path` is an array item; `before` is its text; `after` is null.
 * - `reorder`: `path` is an array; `order[i]` is the original index of the item now at position
 *   `i`. `before`/`after` are the item labels joined with " · " for the diff card.
 */
export const TailorEditSchema = z
  .object({
    /** Unique within one response (`e1`, `e2`, …). */
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    path: CvPointerSchema,
    op: TailorEditOpSchema,
    before: z.string().max(20_000).nullable(),
    after: z.string().max(20_000).nullable(),
    /** `reorder` only: a permutation of the original indices. */
    order: z
      .array(
        z
          .int()
          .min(0)
          .max(MAX_ORDER - 1),
      )
      .max(MAX_ORDER)
      .nullable(),
    /** Why this helps for the job, in the request's `locale` (shown as the card's "Why" line). */
    reason: z.string().min(1).max(500),
    /** Pointers to the CV values the edit's facts come from (always includes the edited value). */
    groundedIn: z.array(CvPointerSchema).max(20),
  })
  .superRefine((edit, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    const text = edit.op === "replace" || edit.op === "insert";
    if (text && edit.after === null) issue(`${edit.op} needs after`, "after");
    if ((edit.op === "replace" || edit.op === "remove") && edit.before === null)
      issue(`${edit.op} needs before`, "before");
    if (edit.op === "insert" && edit.before !== null) issue("insert has no before", "before");
    if (edit.op === "remove" && edit.after !== null) issue("remove has no after", "after");
    if ((edit.op === "reorder") !== (edit.order !== null)) issue("order is for reorder only", "order");
    if (edit.order !== null && !isPermutation(edit.order)) issue("order must be a permutation", "order");
  });
export type TailorEdit = z.infer<typeof TailorEditSchema>;

export const CvTailorRequestSchema = z.object({
  cvId: IdSchema,
  /** The revision to tailor (usually the CV's current one); edit paths address it. */
  revisionId: IdSchema,
  /** `users/{uid}/jobs/{jobId}`: the posting the CV is tailored for. */
  jobId: IdSchema,
  /** Language of each edit's `reason` (the UI language). Edits keep the CV's own language. */
  locale: UiLanguageSchema,
  intensity: TailorIntensitySchema,
});
export type CvTailorRequest = z.infer<typeof CvTailorRequestSchema>;

export const CvTailorResponseSchema = z.object({
  /** 0–40 edits, in CV order. Empty when the CV already fits or every proposal failed the checks. */
  edits: z.array(TailorEditSchema).max(40),
  /** Proposals removed by the grounding and path checks (they would have added facts). */
  dropped: z.int().min(0),
  model: z.string().min(1).max(80),
  promptVersion: z.string().min(1).max(80),
});
export type CvTailorResponse = z.infer<typeof CvTailorResponseSchema>;

/* ------------------------------------------------------------------------------------------------
 * Editable paths. Tailoring may rephrase, reorder and emphasise; it never touches names, dates,
 * employers, titles, institutions, degrees or contact details. The server enforces these rules on
 * the model's proposals and `applyTailorEdits` enforces them again on the client.
 * ---------------------------------------------------------------------------------------------- */

interface TailorTarget {
  readonly pattern: RegExp;
  readonly ops: readonly TailorEditOp[];
  /** Lowest intensity that may propose this edit. */
  readonly intensity: TailorIntensity;
}

const N = String.raw`(?:0|[1-9]\d{0,2})`;
const target = (source: string, ops: readonly TailorEditOp[], intensity: TailorIntensity): TailorTarget => ({
  pattern: new RegExp(`^${source}$`),
  ops,
  intensity,
});

/** Every path tailoring may edit, with its operations and the intensity that unlocks it. */
export const TAILOR_TARGETS: readonly TailorTarget[] = [
  // Text of bullets, keywords and descriptions: reworded at any intensity.
  target(`/(?:work|volunteer)/${N}/summary`, ["replace"], "light"),
  target(`/projects/${N}/description`, ["replace"], "light"),
  target(`/(?:work|volunteer|projects)/${N}/highlights/${N}`, ["replace"], "light"),
  target(`/(?:skills|projects)/${N}/keywords/${N}`, ["replace"], "light"),
  target(`/(?:work|volunteer|projects)/${N}/highlights`, ["reorder"], "light"),
  target(`/(?:skills|projects)/${N}/keywords`, ["reorder"], "light"),
  // Thorough: headline, summary, skill group names, adding/removing items, section-level order.
  target(`/basics/(?:label|summary)`, ["replace"], "thorough"),
  target(`/skills/${N}/name`, ["replace"], "thorough"),
  target(`/(?:work|volunteer|projects)/${N}/highlights/${N}`, ["insert", "remove"], "thorough"),
  target(`/(?:skills|projects)/${N}/keywords/${N}`, ["insert", "remove"], "thorough"),
  target(`/(?:skills|projects)`, ["reorder"], "thorough"),
  target(`/meta/sectionOrder`, ["reorder"], "thorough"),
];

const INTENSITY_RANK: Readonly<Record<TailorIntensity, number>> = { light: 0, thorough: 1 };

/** Whether `op` at `path` is a tailoring edit; with `intensity`, whether that level may propose it. */
export function isTailorTarget(op: TailorEditOp, path: string, intensity?: TailorIntensity): boolean {
  return TAILOR_TARGETS.some(
    (entry) =>
      entry.ops.includes(op) &&
      entry.pattern.test(path) &&
      (intensity === undefined || INTENSITY_RANK[entry.intensity] <= INTENSITY_RANK[intensity]),
  );
}

/* ------------------------------------------------------------------------------------------------
 * JSON pointers
 * ---------------------------------------------------------------------------------------------- */

/** Pointer segments; all-digit segments are array indices. */
export function pointerSegments(pointer: string): (string | number)[] {
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

/** The value at `pointer`, or undefined when any step is missing. */
export function valueAtPointer(root: unknown, pointer: string): unknown {
  let node: unknown = root;
  for (const segment of pointerSegments(pointer)) {
    if (typeof segment === "number") {
      if (!Array.isArray(node)) return undefined;
      node = node[segment];
    } else {
      if (node === null || typeof node !== "object" || Array.isArray(node)) return undefined;
      node = Object.hasOwn(node, segment) ? (node as Record<string, unknown>)[segment] : undefined;
    }
  }
  return node;
}

function parentPointer(pointer: string): { parent: string; index: number | null } {
  const cut = pointer.lastIndexOf("/");
  const last = pointer.slice(cut + 1);
  return { parent: pointer.slice(0, cut), index: /^\d+$/.test(last) ? Number(last) : null };
}

function isPermutation(order: readonly number[]): boolean {
  const seen = new Set(order);
  return seen.size === order.length && order.every((index) => index >= 0 && index < order.length);
}

/* ------------------------------------------------------------------------------------------------
 * Reorder labels
 * ---------------------------------------------------------------------------------------------- */

/** Short label of an array item for a reorder card: its text, or its name/position. */
export function tailorItemLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (item !== null && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ["name", "position", "title", "language"])
      if (typeof record[key] === "string" && record[key] !== "") return record[key];
  }
  return "…";
}

/** `before`/`after` of a reorder edit: the items' labels in the original and in the new order. */
export function reorderLabels(
  items: readonly unknown[],
  order: readonly number[],
): { before: string; after: string } {
  return {
    before: items.map(tailorItemLabel).join(" · "),
    after: order.map((index) => tailorItemLabel(items[index])).join(" · "),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Applying accepted edits (pure; ported to BFHRCore and proven by conformance/apply.json)
 * ---------------------------------------------------------------------------------------------- */

export const TAILOR_SKIP_REASONS = [
  /** Not a tailoring path or operation (`TAILOR_TARGETS`). */
  "invalid_path",
  /** The content no longer matches what the edit was proposed against. */
  "stale",
  /** Another accepted edit already changes the same value or array order. */
  "conflict",
] as const;
export type TailorSkipReason = (typeof TAILOR_SKIP_REASONS)[number];

export interface TailorApplyResult {
  content: CvContent;
  /** Ids of the edits applied, in the order given. */
  applied: string[];
  skipped: { id: string; reason: TailorSkipReason }[];
}

/**
 * Applies the accepted edits to `content` (the revision they were proposed against) and returns a
 * new content; `content` is not modified. Each edit is checked against the original: a `replace`
 * or `remove` whose `before` differs from the current text is skipped as `stale`, so a client
 * never overwrites text the user changed since. Replacements are applied first, then each array's
 * inserts, removals and reorder together (deepest arrays first), all addressed by original index.
 */
export function applyTailorEdits(
  content: CvContent,
  edits: readonly TailorEdit[],
  acceptedIds: Iterable<string>,
): TailorApplyResult {
  const accepted = new Set(acceptedIds);
  const applied: string[] = [];
  const skipped: TailorApplyResult["skipped"] = [];
  const replaced = new Set<string>();
  const removed = new Set<string>();
  const reordered = new Set<string>();
  const replacements: TailorEdit[] = [];
  /** Array pointer → its structural edits. */
  const arrays = new Map<string, TailorEdit[]>();

  for (const edit of edits) {
    if (!accepted.has(edit.id)) continue;
    const skip = (reason: TailorSkipReason) => skipped.push({ id: edit.id, reason });
    if (!isTailorTarget(edit.op, edit.path)) {
      skip("invalid_path");
      continue;
    }
    const current = valueAtPointer(content, edit.path);
    if (edit.op === "replace" || edit.op === "remove") {
      if (typeof current !== "string" || current !== edit.before) {
        skip("stale");
        continue;
      }
      const seen = edit.op === "replace" ? replaced : removed;
      if (seen.has(edit.path)) {
        skip("conflict");
        continue;
      }
      seen.add(edit.path);
    } else if (edit.op === "insert") {
      const { parent, index } = parentPointer(edit.path);
      const items = valueAtPointer(content, parent);
      if (!Array.isArray(items) || index === null || index > items.length) {
        skip("stale");
        continue;
      }
    } else {
      if (
        !Array.isArray(current) ||
        edit.order === null ||
        edit.order.length !== current.length ||
        !isPermutation(edit.order)
      ) {
        skip("stale");
        continue;
      }
      if (reordered.has(edit.path)) {
        skip("conflict");
        continue;
      }
      reordered.add(edit.path);
    }
    applied.push(edit.id);
    if (edit.op === "replace") {
      replacements.push(edit);
    } else {
      const array = edit.op === "reorder" ? edit.path : parentPointer(edit.path).parent;
      arrays.set(array, [...(arrays.get(array) ?? []), edit]);
    }
  }

  // CV content is plain JSON (no dates), so a JSON round trip is a deep copy.
  const next = JSON.parse(JSON.stringify(content)) as CvContent;
  for (const edit of replacements) {
    const { parent, index } = parentPointer(edit.path);
    const container = valueAtPointer(next, parent) as Record<string, unknown> | unknown[];
    const key = index ?? edit.path.slice(edit.path.lastIndexOf("/") + 1);
    (container as Record<string | number, unknown>)[key] = edit.after;
  }

  const byDepth = [...arrays].sort(([a], [b]) => b.split("/").length - a.split("/").length);
  for (const [pointer, group] of byDepth) {
    const items = valueAtPointer(next, pointer) as unknown[];
    const order = group.find((edit) => edit.op === "reorder")?.order ?? items.map((_, index) => index);
    const drop = new Set<number | null>();
    /** Original index → texts inserted before that item (`items.length`: at the end). */
    const inserts = new Map<number, string[]>();
    for (const edit of group) {
      const { index } = parentPointer(edit.path);
      if (edit.op === "remove") drop.add(index);
      if (edit.op === "insert" && index !== null && edit.after !== null)
        inserts.set(index, [...(inserts.get(index) ?? []), edit.after]);
    }
    const result: unknown[] = [];
    for (const index of order) {
      result.push(...(inserts.get(index) ?? []));
      if (!drop.has(index)) result.push(items[index]);
    }
    result.push(...(inserts.get(items.length) ?? []));
    items.splice(0, items.length, ...result);
  }

  return { content: next, applied, skipped };
}
