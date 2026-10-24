import { type CvContent, valueAtPointer } from "@bfhr/core";
import { type EntityPolicy, GroundingSource, fold } from "./grounding/grounding";
import { leafPointers } from "./resume-pointers";

/**
 * Grounding helpers shared by tailoring and cover letters (docs/adr/0010-ai.md "Tailoring",
 * "Cover letters"): the CV as source text, the entity policy per language, and the job's own
 * terms the CV doesn't support.
 */

/** Pointers of the CV's text values: everything except `meta` and the photo path. */
export function cvTextPointers(content: CvContent): string[] {
  return leafPointers({ ...content, meta: undefined }).filter((pointer) => pointer !== "/basics/image");
}

/** The CV's text values under `prefixes` (all of them when omitted), one per line. */
export function cvText(content: CvContent, prefixes?: readonly string[]): string {
  return cvTextPointers(content)
    .filter(
      (pointer) =>
        prefixes === undefined ||
        prefixes.some((prefix) => pointer === prefix || pointer.startsWith(`${prefix}/`)),
    )
    .map((pointer) => String(valueAtPointer(content, pointer)))
    .join("\n");
}

/** Base language (`de-AT` → `de`). */
export function baseLanguage(tag: string): string {
  return tag.toLowerCase().split(/[-_]/u)[0] ?? tag;
}

/**
 * German capitalizes every noun, so capitalized words count as entities only in English and
 * Turkish text (as for the assists).
 */
export function entityPolicyFor(language: string): EntityPolicy {
  const base = baseLanguage(language);
  return base === "en" || base === "tr" ? "hard+capitalized" : "hard";
}

const TERM = /[\p{L}\p{N}][\p{L}\p{N}+#./]*(?:-[\p{L}\p{N}][\p{L}\p{N}+#./]*)*/gu;

/** Entity-like terms of a text: acronyms, CamelCase, tech tokens, and (with `capitalized`) capitalized words mid-sentence. */
function entityTerms(text: string, capitalized: boolean): string[] {
  const terms: string[] = [];
  for (const match of text.matchAll(TERM)) {
    const token = match[0].replace(/[./]+$/u, "");
    if (token.length < 2 || !/\p{L}/u.test(token)) continue;
    const hard =
      /\p{N}/u.test(token) || /^.+\p{Lu}/u.test(token) || /[+#]|[\p{L}\p{N}][./][\p{L}\p{N}]/u.test(token);
    const before = text.slice(0, match.index).trimEnd();
    const sentenceStart =
      before === "" || /[.!?:;•\n-]$/u.test(before) || /\n\s*$/u.test(text.slice(0, match.index));
    if (hard || (capitalized && !sentenceStart && /^\p{Lu}\p{Ll}/u.test(token))) terms.push(token);
  }
  return terms;
}

/**
 * Skills and named things in the job that `cv` doesn't support: the job's skill list plus
 * entity-like terms of the description (the title is Title Case, so its words aren't names).
 * Edits and candidate claims mentioning one of these would claim something the candidate never
 * stated.
 */
export function jobOnlyTerms(
  job: { skills: readonly string[]; description: string },
  cv: GroundingSource,
  policy: EntityPolicy,
): string[] {
  const candidates = [...job.skills, ...entityTerms(job.description, policy === "hard+capitalized")];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of candidates) {
    const key = fold(term).trim();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    if (!cv.hasEntity(term) && !cv.hasPhrase(term)) terms.push(term);
  }
  return terms;
}

/** The terms of `terms` that occur in `text` as whole words or phrases (case and accent folded). */
export function mentionedTerms(text: string, terms: readonly string[]): string[] {
  const source = new GroundingSource(text);
  return terms.filter((term) => source.hasPhrase(term));
}
