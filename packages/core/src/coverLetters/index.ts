import { z } from "zod";
import { CvAssistLanguageSchema, type CvAssistLanguage } from "../ai";
import { IdSchema } from "../common";

/* ------------------------------------------------------------------------------------------------
 * Cover letters (BRIEF §4.4.2, docs/adr/0010-ai.md "Cover letters", ADR 0002 "Cover letter
 * templates"): merge fields, the starter templates, and the `coverLetterDraft` callable contract.
 * The user's own templates are `users/{uid}/coverLetters/{id}` documents with `isTemplate: true`.
 * ---------------------------------------------------------------------------------------------- */

export const CoverLetterToneSchema = z.enum(["formal", "warm", "concise"]);
export type CoverLetterTone = z.infer<typeof CoverLetterToneSchema>;

/**
 * Merge fields a template or letter may contain, written `{company}`. Values come from the job
 * (`role`, `company`, `job_source`), the CV or profile (`name`, `email`, `phone`) and the user
 * (`hiring_manager`, `date`, filled in the editor).
 */
export const COVER_LETTER_MERGE_FIELDS = [
  "name",
  "email",
  "phone",
  "role",
  "company",
  "hiring_manager",
  "job_source",
  "date",
] as const;
export const MergeFieldSchema = z.enum(COVER_LETTER_MERGE_FIELDS);
export type MergeField = z.infer<typeof MergeFieldSchema>;
export type MergeValues = Partial<Readonly<Record<MergeField, string | null>>>;

/** A merge-field token: `{` + field + `}` (no spaces). */
export const MERGE_FIELD_PATTERN = new RegExp(`\\{(${COVER_LETTER_MERGE_FIELDS.join("|")})\\}`, "g");

/** The fields used in `text`, each once, in order of first appearance. */
export function mergeFieldsIn(text: string): MergeField[] {
  return [...new Set([...text.matchAll(MERGE_FIELD_PATTERN)].map((match) => match[1] as MergeField))];
}

/**
 * Replaces every token whose value is known (a non-blank string) and keeps the others as `{field}`
 * tokens, which the editors show as unresolved and which block sending (`unresolved`).
 */
export function fillMergeFields(
  text: string,
  values: MergeValues,
): { text: string; unresolved: MergeField[] } {
  const unresolved = new Set<MergeField>();
  const filled = text.replace(MERGE_FIELD_PATTERN, (token, field: MergeField) => {
    const value = values[field]?.trim();
    if (value === undefined || value === "") {
      unresolved.add(field);
      return token;
    }
    return value;
  });
  return { text: filled, unresolved: [...unresolved] };
}

/** A built-in template ("Starter templates" in the template picker), one per language. */
export interface StarterCoverLetterTemplate {
  readonly id: string;
  readonly language: CvAssistLanguage;
  readonly title: string;
  readonly body: string;
}

/**
 * Starter templates. Bracketed gaps are what the user (or the AI draft) writes; they stay within
 * the 40-character placeholder pattern, so an unfilled gap blocks sending.
 */
export const STARTER_COVER_LETTER_TEMPLATES: readonly StarterCoverLetterTemplate[] = [
  {
    id: "starter-en",
    language: "en",
    title: "Classic",
    body: "Dear Hiring Team,\n\nI'm applying for the {role} position at {company}. [Why this role and company appeal to you]\n\n[A relevant result and its impact]\n\nI'd welcome the chance to talk about how I can help.\n\nKind regards,\n{name}",
  },
  {
    id: "starter-tr",
    language: "tr",
    title: "Klasik",
    body: "Sayın Yetkili,\n\n{company} bünyesindeki {role} pozisyonu için başvuruyorum. [Bu pozisyon sizi neden ilgilendiriyor]\n\n[İlgili bir çalışmanız ve sonucu]\n\nNasıl katkı sağlayabileceğimi konuşmaktan memnuniyet duyarım.\n\nSaygılarımla,\n{name}",
  },
  {
    id: "starter-de",
    language: "de",
    title: "Klassisch",
    body: "Sehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich um die Stelle als {role} bei {company}. [Warum dich die Stelle reizt]\n\n[Ein passendes Projekt und sein Ergebnis]\n\nÜber die Gelegenheit zu einem persönlichen Gespräch freue ich mich.\n\nMit freundlichen Grüßen\n{name}",
  },
];

export const CoverLetterDraftRequestSchema = z.object({
  cvId: IdSchema,
  /** The CV revision the letter's claims about the candidate come from. */
  revisionId: IdSchema,
  jobId: IdSchema,
  tone: CoverLetterToneSchema,
  /** Language of the letter (usually the posting's). */
  language: CvAssistLanguageSchema,
  /**
   * A starter template id (`STARTER_COVER_LETTER_TEMPLATES`) or a `coverLetters` document with
   * `isTemplate: true`; the draft keeps its structure and fixed sentences. Absent: free draft.
   */
  templateId: IdSchema.optional(),
});
export type CoverLetterDraftRequest = z.infer<typeof CoverLetterDraftRequestSchema>;

export const CoverLetterDraftResponseSchema = z.object({
  /** Email subject line for the application (null when the model offered none). */
  subject: z.string().max(200).nullable(),
  /** The letter; known merge fields are filled, unknown ones stay as `{field}` tokens. */
  body: z.string().min(1).max(20_000),
  /** `[X]`, `[X%]`, `[date]` and template gaps (`[…]`) left for the user, in order. */
  placeholders: z.array(z.string().max(60)).max(50),
  /** Merge fields still in `body` (no value known, e.g. `hiring_manager`). */
  unresolvedFields: z.array(MergeFieldSchema).max(COVER_LETTER_MERGE_FIELDS.length),
  /** Sentences removed by the grounding check (claims the CV or the job don't support). */
  droppedSentences: z.int().min(0),
  model: z.string().min(1).max(80),
  promptVersion: z.string().min(1).max(80),
});
export type CoverLetterDraftResponse = z.infer<typeof CoverLetterDraftResponseSchema>;
