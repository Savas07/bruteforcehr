/**
 * The `cvImport` callable's request and response (europe-west1). Built from the `@bfhr/core` CV
 * pieces until core ships `CvImportRequestSchema` / `CvImportResponseSchema` / `JsonResumeSchema`
 * (src/ai.ts); then this file re-exports those instead and nothing else changes.
 */
import {
  ConfidenceSchema,
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
} from "@bfhr/core";
import { z } from "zod";

/** `CvContent` without `meta`: the JSON Resume sections the importer extracts. */
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

/** What the server is asked to read (the wire names differ from `CvImportKind`). */
export const CvImportRequestKindSchema = z.enum(["pdf", "docx", "json", "linkedin-zip"]);
export type CvImportRequestKind = z.infer<typeof CvImportRequestKindSchema>;

export const CvImportRequestSchema = z.object({
  storagePath: z.string().min(1),
  kind: CvImportRequestKindSchema,
});
export type CvImportRequest = z.infer<typeof CvImportRequestSchema>;

export const CvImportResponseSchema = z.object({
  resume: JsonResumeSchema,
  /** Per-field confidence in [0, 1], keyed by JSON Pointer into `resume` (`/work/0/startDate`). */
  confidence: z.record(z.string(), ConfidenceSchema),
  /** Plain-language notes about the file ("Page 3 was an image, so it was skipped."). */
  warnings: z.array(z.string().max(1_000)).max(50),
  /** Model id, or `none` for JSON Resume and LinkedIn exports (no AI involved). */
  model: z.string(),
  promptVersion: z.union([z.string(), z.number()]),
});
export type CvImportResponse = z.infer<typeof CvImportResponseSchema>;
