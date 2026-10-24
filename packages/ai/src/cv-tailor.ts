import {
  type CvContent,
  isTailorTarget,
  type Job,
  reorderLabels,
  type TailorEdit,
  type TailorIntensity,
  type UiLanguage,
  valueAtPointer,
} from "@bfhr/core";
import { cvText, cvTextPointers, entityPolicyFor, jobOnlyTerms, mentionedTerms } from "./apply-grounding";
import { type UsageLedger, generateWithinBudget } from "./budget";
import { GroundingSource, findUngrounded, fold } from "./grounding/grounding";
import type { ModelId, TokenUsage } from "./models";
import {
  CV_TAILOR_MAX_EDITS,
  CV_TAILOR_PROMPT_VERSION,
  CV_TAILOR_SYSTEM,
  CvTailorOutputSchema,
  cvTailorUserPrompt,
} from "./prompts/cv-tailor";
import type { AiProvider, Effort } from "./provider";

/** Model settings for tailoring (docs/adr/0010-ai.md; chosen by the eval in eval/apply/report.md). */
export const CV_TAILOR_MODEL: ModelId = "claude-sonnet-5-5";
export const CV_TAILOR_EFFORT: Effort = "low";
export const CV_TAILOR_MAX_OUTPUT_TOKENS = 6_000;
/** Posting text sent to the model. */
export const APPLY_JOB_DESCRIPTION_CHARS = 12_000;

/** Why a proposal was dropped (counts are logged; terms are for evals and tests only). */
export type TailorDropReason =
  /** Not an editable path for the intensity, or not in the CV. */
  | "path"
  /** Malformed: empty text, bad order, placeholder, duplicate or no change. */
  | "invalid"
  /** Adds a number, date or entity the CV (the entry it edits) doesn't state. */
  | "ungrounded"
  /** Uses a skill or name from the job that the CV doesn't support. */
  | "job_term";

export interface CvTailorInput {
  content: CvContent;
  /** `Cv.language` (BCP 47). */
  cvLanguage: string;
  job: Pick<Job, "title" | "company" | "skills" | "description">;
  locale: UiLanguage;
  intensity: TailorIntensity;
}

export interface CvTailorResult {
  edits: TailorEdit[];
  dropped: number;
  dropReasons: Record<TailorDropReason, number>;
  /** Offending terms of dropped proposals (evals and tests; callables must not log them). */
  droppedTerms: string[];
  model: ModelId;
  promptVersion: string;
  usage: TokenUsage;
  costMicroUsd: number;
  attempts: number;
}

export interface CvTailorDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
  model?: ModelId;
  effort?: Effort;
}

/** The CV as `pointer = value` lines (arrays announce their length), plus `meta.sectionOrder`. */
export function tailorCvLines(content: CvContent): string[] {
  const lines: string[] = [];
  const announced = new Set<string>();
  for (const pointer of cvTextPointers(content)) {
    // Announce each array on its first item: `/work/0/highlights (3 items)`.
    const segments = pointer.split("/");
    for (let end = 2; end < segments.length; end++) {
      if (!/^\d+$/u.test(segments[end] ?? "")) continue;
      const array = segments.slice(0, end).join("/");
      const items = valueAtPointer(content, array);
      if (!announced.has(array) && Array.isArray(items)) {
        announced.add(array);
        lines.push(`${array} (${items.length} items)`);
      }
    }
    lines.push(`${pointer} = ${JSON.stringify(valueAtPointer(content, pointer))}`);
  }
  lines.push(`/meta/sectionOrder (${content.meta.sectionOrder.length} items)`);
  content.meta.sectionOrder.forEach((key, index) =>
    lines.push(`/meta/sectionOrder/${index} = ${JSON.stringify(key)}`),
  );
  return lines;
}

/** The entry an edit belongs to (`/work/2`), whose own text bounds its numbers, dates and entities. */
function entryOf(path: string): string | null {
  return /^\/(?:work|volunteer|projects)\/\d+/u.exec(path)?.[0] ?? null;
}

/**
 * "Tailor for this job": one model call proposes edits; every proposal is checked against the
 * editable paths for the intensity and the CV (`before` comes from the CV, never the model), and
 * its new text must pass the grounding check against the entry it edits plus the skills section
 * (or the whole CV for headline, summary and skills) and must not use a job term the CV lacks.
 * Failing proposals are dropped, never repaired.
 */
export async function tailorCv(input: CvTailorInput, deps: CvTailorDependencies): Promise<CvTailorResult> {
  const { content, intensity } = input;
  const model = deps.model ?? CV_TAILOR_MODEL;
  const policy = entityPolicyFor(input.cvLanguage);
  const wholeCv = new GroundingSource(cvText(content));
  const jobTerms = jobOnlyTerms(input.job, wholeCv, policy);
  const scoped = new Map<string, GroundingSource>();
  const sourceFor = (path: string): GroundingSource => {
    const entry = entryOf(path);
    if (entry === null) return wholeCv;
    let source = scoped.get(entry);
    if (source === undefined) {
      source = new GroundingSource(cvText(content, [entry, "/skills"]));
      scoped.set(entry, source);
    }
    return source;
  };

  const metered = await generateWithinBudget(deps.provider, deps.ledger, {
    model,
    effort: deps.effort ?? CV_TAILOR_EFFORT,
    system: CV_TAILOR_SYSTEM,
    user: cvTailorUserPrompt({
      intensity,
      locale: input.locale,
      cvLanguage: input.cvLanguage,
      cvLines: tailorCvLines(content),
      job: {
        title: input.job.title,
        company: input.job.company,
        skills: input.job.skills,
        description: input.job.description.slice(0, APPLY_JOB_DESCRIPTION_CHARS),
      },
    }),
    schema: CvTailorOutputSchema,
    maxOutputTokens: CV_TAILOR_MAX_OUTPUT_TOKENS,
  });

  const dropReasons: Record<TailorDropReason, number> = { path: 0, invalid: 0, ungrounded: 0, job_term: 0 };
  const droppedTerms: string[] = [];
  const edits: TailorEdit[] = [];
  const touched = new Set<string>();
  let dropped = 0;
  const drop = (reason: TailorDropReason, terms: readonly string[] = []) => {
    dropped++;
    dropReasons[reason]++;
    droppedTerms.push(...terms);
  };

  /** Why a new text can't be used: brackets, or a fact the CV (entry) doesn't state. */
  const problemWith = (text: string, path: string): { reason: TailorDropReason; terms: string[] } | null => {
    if (text === "" || /[[\]]/u.test(text)) return { reason: "invalid", terms: [] };
    const ungrounded = findUngrounded(text, sourceFor(path), { entities: policy });
    if (ungrounded.length > 0) return { reason: "ungrounded", terms: ungrounded.map((issue) => issue.text) };
    const borrowed = mentionedTerms(text, jobTerms);
    return borrowed.length > 0 ? { reason: "job_term", terms: borrowed } : null;
  };

  for (const proposal of metered.data.edits) {
    if (edits.length === CV_TAILOR_MAX_EDITS[intensity]) {
      drop("invalid");
      continue;
    }
    const { op } = proposal;
    const path = proposal.path.trim();
    if (!isTailorTarget(op, path, intensity)) {
      drop("path");
      continue;
    }
    const key = op === "insert" ? `insert:${path}` : path;
    if (touched.has(key)) {
      drop("invalid");
      continue;
    }
    const current = valueAtPointer(content, path);
    const text = proposal.text.trim();
    let edit: Omit<TailorEdit, "id" | "reason" | "groundedIn">;

    if (op === "replace" || op === "remove") {
      if (typeof current !== "string") {
        drop("path");
        continue;
      }
      if (op === "replace") {
        if (fold(text) === fold(current)) {
          drop("invalid");
          continue;
        }
        const problem = problemWith(text, path);
        if (problem !== null) {
          drop(problem.reason, problem.terms);
          continue;
        }
      }
      edit = { path, op, before: current, after: op === "replace" ? text : null, order: null };
    } else if (op === "insert") {
      const parent = path.slice(0, path.lastIndexOf("/"));
      const index = Number(path.slice(path.lastIndexOf("/") + 1));
      const items = valueAtPointer(content, parent);
      if (!Array.isArray(items) || index > items.length) {
        drop("path");
        continue;
      }
      if (items.some((item) => typeof item === "string" && fold(item) === fold(text))) {
        drop("invalid");
        continue;
      }
      const problem = problemWith(text, path);
      if (problem !== null) {
        drop(problem.reason, problem.terms);
        continue;
      }
      edit = { path, op, before: null, after: text, order: null };
    } else {
      const order = proposal.order;
      const valid =
        Array.isArray(current) &&
        order.length === current.length &&
        order.every((index) => Number.isInteger(index)) &&
        new Set(order).size === order.length &&
        order.every((index) => index >= 0 && index < order.length) &&
        order.some((index, position) => index !== position);
      if (!valid || !Array.isArray(current)) {
        drop(Array.isArray(current) ? "invalid" : "path");
        continue;
      }
      edit = { path, op, ...reorderLabels(current, order), order };
    }

    const own = op === "insert" ? [] : [path];
    const sources = proposal.sources
      .map((source) => source.trim())
      .filter(
        (source) => /^(?:\/[A-Za-z0-9_]+)+$/u.test(source) && valueAtPointer(content, source) !== undefined,
      );
    const groundedIn = [...new Set([...own, ...sources])].slice(0, 20);
    if (groundedIn.length === 0) {
      drop("ungrounded");
      continue;
    }
    touched.add(key);
    edits.push({
      id: `e${edits.length + 1}`,
      ...edit,
      reason: proposal.reason.trim().slice(0, 500) || "—",
      groundedIn,
    });
  }

  return {
    edits,
    dropped,
    dropReasons,
    droppedTerms,
    model,
    promptVersion: CV_TAILOR_PROMPT_VERSION,
    usage: metered.usage,
    costMicroUsd: metered.costMicroUsd,
    attempts: metered.attempts,
  };
}
