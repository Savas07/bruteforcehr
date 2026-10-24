import { z } from "zod";
import {
  type CvImportKind,
  ResumeAwardSchema,
  ResumeBasicsSchema,
  ResumeCertificateSchema,
  ResumeEducationSchema,
  ResumeInterestSchema,
  ResumeLanguageSchema,
  ResumeProjectSchema,
  ResumePublicationSchema,
  ResumeReferenceSchema,
  ResumeSkillSchema,
  ResumeVolunteerSchema,
  ResumeWorkSchema,
} from "./cv";

/* ------------------------------------------------------------------------------------------------
 * Contracts of the AI callables (`cvImport`, `cvAssist`; Cloud Functions, europe-west1). The server
 * validates requests and responses with these schemas; clients may validate responses with them too.
 * See docs/adr/0010-ai.md.
 * ---------------------------------------------------------------------------------------------- */

/** A JSON Resume document without the BruteForceHR `meta` extension: what an import produces. */
export const JsonResumeSchema = z.object({
  basics: ResumeBasicsSchema.optional(),
  work: z.array(ResumeWorkSchema).max(100).optional(),
  volunteer: z.array(ResumeVolunteerSchema).max(100).optional(),
  education: z.array(ResumeEducationSchema).max(50).optional(),
  awards: z.array(ResumeAwardSchema).max(100).optional(),
  certificates: z.array(ResumeCertificateSchema).max(100).optional(),
  publications: z.array(ResumePublicationSchema).max(100).optional(),
  skills: z.array(ResumeSkillSchema).max(100).optional(),
  languages: z.array(ResumeLanguageSchema).max(30).optional(),
  interests: z.array(ResumeInterestSchema).max(50).optional(),
  references: z.array(ResumeReferenceSchema).max(30).optional(),
  projects: z.array(ResumeProjectSchema).max(100).optional(),
});
export type JsonResume = z.infer<typeof JsonResumeSchema>;

/** Source kinds accepted by `cvImport` (the file is uploaded first to `users/{uid}/cv-imports/{fileId}`). */
export const CvImportSourceKindSchema = z.enum(["pdf", "docx", "json", "linkedin-zip"]);
export type CvImportSourceKind = z.infer<typeof CvImportSourceKindSchema>;

const IMPORT_KIND_BY_SOURCE: Readonly<Record<CvImportSourceKind, CvImportKind>> = {
  pdf: "pdf",
  docx: "docx",
  json: "json_resume",
  "linkedin-zip": "linkedin_zip",
};

/** `Cv.importedFrom.kind` for a `cvImport` source kind. */
export function cvImportKindOf(kind: CvImportSourceKind): CvImportKind {
  return IMPORT_KIND_BY_SOURCE[kind];
}

/** Storage path of an uploaded import source; the uid segment must be the caller's. */
export const CvImportStoragePathSchema = z
  .string()
  .regex(
    /^users\/[A-Za-z0-9]{1,128}\/cv-imports\/[A-Za-z0-9_-]{1,128}$/,
    "Expected users/{uid}/cv-imports/{fileId}",
  );

export const CvImportRequestSchema = z.object({
  storagePath: CvImportStoragePathSchema,
  kind: CvImportSourceKindSchema,
});
export type CvImportRequest = z.infer<typeof CvImportRequestSchema>;

/**
 * Warning codes of `cvImport`. A warning is `<code>` or `<code>:<detail>`: a JSON pointer into the
 * resume (for dropped values, where the value would have gone), a section heading for
 * `unmapped_section`, a file name for `linkedin_missing`. Clients localize them.
 */
export const CV_IMPORT_WARNING_CODES = [
  /** A value the model returned was not found in the source and was removed (never invented). */
  "dropped_ungrounded",
  /** A date's month was not in the source; only the year was kept. */
  "date_month_dropped",
  /** A date was not a valid YYYY, YYYY-MM or YYYY-MM-DD value and was removed. */
  "dropped_invalid_date",
  /** The source was longer than the import limit; the tail was not read. */
  "source_truncated",
  /** Content the importer could not place in a JSON Resume section (detail: the section heading). */
  "unmapped_section",
  /** LinkedIn export: an expected CSV was missing (e.g. `linkedin_missing:Positions.csv`). */
  "linkedin_missing",
  /** A value that does not fit the stored CV schema (wrong type, too long, too many items) was removed. */
  "dropped_invalid",
] as const;
export type CvImportWarningCode = (typeof CV_IMPORT_WARNING_CODES)[number];

export const CvImportResponseSchema = z.object({
  resume: JsonResumeSchema,
  /** JSON pointer (e.g. `/work/0/position`) → confidence 0..1 for every imported leaf value. */
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  warnings: z.array(z.string().max(300)).max(500),
  /** Model id, or `none` when no model ran (JSON Resume, LinkedIn export). */
  model: z.string().min(1).max(80),
  /** Prompt version (e.g. `cv-import@1`) or deterministic mapper version (e.g. `linkedin-zip@1`). */
  promptVersion: z.string().min(1).max(80),
});
export type CvImportResponse = z.infer<typeof CvImportResponseSchema>;

export const CvAssistActionSchema = z.enum(["rewrite", "shorten", "strongerVerb", "translate"]);
export type CvAssistAction = z.infer<typeof CvAssistActionSchema>;

/** CV languages the assists write (UI and CV languages, kickoff §0). */
export const CvAssistLanguageSchema = z.enum(["en", "tr", "de"]);
export type CvAssistLanguage = z.infer<typeof CvAssistLanguageSchema>;

export const CvAssistRequestSchema = z
  .object({
    /** The CV text to improve: a bullet, a summary or a short paragraph. */
    text: z.string().trim().min(1).max(4_000),
    action: CvAssistActionSchema,
    /** Required for `translate`; ignored otherwise (the reply keeps the input's language). */
    targetLanguage: CvAssistLanguageSchema.optional(),
    context: z.object({
      /** CV section the text belongs to (`work`, `summary`, `projects`, …). */
      section: z.string().min(1).max(60),
      /** Role the text describes (e.g. the work entry's position). Counts as source text. */
      role: z.string().max(200).optional(),
      /** Company the text describes. Counts as source text. */
      company: z.string().max(200).optional(),
    }),
  })
  .superRefine((request, ctx) => {
    if (request.action === "translate" && request.targetLanguage === undefined) {
      ctx.addIssue({ code: "custom", message: "translate needs targetLanguage", path: ["targetLanguage"] });
    }
  });
export type CvAssistRequest = z.infer<typeof CvAssistRequestSchema>;

/**
 * A placeholder the user must fill before using the text, e.g. `[X%]`, `[X]`, `[date]`. The assist
 * writes one wherever a metric, number or date would help but is not in the source (BRIEF §2.4).
 */
export const CV_PLACEHOLDER_PATTERN = /\[(?:X%|X|date)\]/g;

export const CvAssistSuggestionSchema = z.object({
  text: z.string().min(1).max(8_000),
  /** Placeholders in `text`, in order of appearance (duplicates kept). */
  placeholders: z.array(z.string().max(20)).max(50),
});
export type CvAssistSuggestion = z.infer<typeof CvAssistSuggestionSchema>;

export const CvAssistResponseSchema = z.object({
  /** 0–3 suggestions; empty when every candidate failed the grounding check. */
  suggestions: z.array(CvAssistSuggestionSchema).max(3),
  model: z.string().min(1).max(80),
  promptVersion: z.string().min(1).max(80),
});
export type CvAssistResponse = z.infer<typeof CvAssistResponseSchema>;

/** `details.reason` of the `HttpsError`s the AI callables throw, for client copy. */
export const AI_ERROR_REASONS = [
  /** `permission-denied`: the account's email is not verified. */
  "email_unverified",
  /** `failed-precondition`: `profile.aiEnabled === false`. */
  "ai_disabled",
  /** `resource-exhausted`: the per-user daily AI cost cap is reached (resets at 00:00 UTC). */
  "daily_cap",
  /** `not-found`: no uploaded file at `storagePath`. */
  "file_not_found",
  /** `failed-precondition`: the file is not a readable file of the declared kind. */
  "unreadable_file",
  /** `failed-precondition`: the PDF has no text layer (a scan); OCR is not supported. */
  "no_text",
  /** `invalid-argument`: the file is larger than the import limit. */
  "file_too_large",
  /** `unavailable`: the AI provider failed after retries; try again later. */
  "ai_unavailable",
  /** `internal`: the model's reply could not be used (refusal or invalid output). */
  "ai_invalid_output",
  /** `not-found`: the CV, CV revision or job of a `cvTailor` / `coverLetterDraft` request doesn't exist. */
  "cv_not_found",
  "job_not_found",
  /** `not-found`: `coverLetterDraft`'s `templateId` is neither a starter template nor one of the user's. */
  "template_not_found",
] as const;
export type AiErrorReason = (typeof AI_ERROR_REASONS)[number];
