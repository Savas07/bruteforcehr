import { z } from "zod";
import { IdSchema, Sha256Schema } from "./common";
import { CvDensitySchema, CvPaperSizeSchema, CvThemeSchema } from "./cv";

/* ------------------------------------------------------------------------------------------------
 * Contract of the server-side PDF render callable `cvRenderPdf` (Cloud Functions, europe-west1):
 * the server renders a stored CV revision with @bfhr/cv-render, prints it with headless Chromium
 * and stores the bytes as a `renderedFiles` entry (iOS/email attachments). See
 * docs/adr/0009-cv-rendering.md.
 * ---------------------------------------------------------------------------------------------- */

/** Download name of a rendered PDF: one path segment, no control characters or quotes, `.pdf`. */
export const RenderedPdfFileNameSchema = z
  .string()
  .max(255)
  .regex(/^[^/\\"\p{Cc}]+\.pdf$/u, "Expected a file name ending in .pdf");

export const CvRenderPdfRequestSchema = z.object({
  cvId: IdSchema,
  /** Revision to print; defaults to the CV's `currentRevisionId`. */
  revisionId: IdSchema.optional(),
  /** Template id from @bfhr/cv-render; defaults to the revision's `meta.template`. */
  templateId: z.string().min(1).max(60).optional(),
  /** Overrides of the revision's `meta.theme`; each omitted field keeps the stored value. */
  theme: z
    .object({
      accentColor: CvThemeSchema.shape.accentColor.optional(),
      fontPair: CvThemeSchema.shape.fontPair.optional(),
      density: CvDensitySchema.optional(),
    })
    .optional(),
  /** Defaults to the revision's `meta.theme.paperSize`. */
  paper: CvPaperSizeSchema.optional(),
  /** Defaults to `exportFileName()`: `First-Last-CV.pdf`. */
  fileName: RenderedPdfFileNameSchema.optional(),
});
export type CvRenderPdfRequest = z.infer<typeof CvRenderPdfRequestSchema>;

export const CvRenderPdfResponseSchema = z.object({
  /** `users/{uid}/rendered/{fileId}`; the `renderedFiles/{fileId}` document has the same id. */
  storagePath: z.string().regex(/^users\/[^/]+\/rendered\/[^/]+$/, "Expected users/{uid}/rendered/{fileId}"),
  sha256: Sha256Schema,
  pages: z.int().positive(),
});
export type CvRenderPdfResponse = z.infer<typeof CvRenderPdfResponseSchema>;

/** `details.reason` of the `HttpsError`s `cvRenderPdf` throws, for client copy. */
export const CV_RENDER_ERROR_REASONS = [
  /** `permission-denied`: the account's email is not verified. */
  "email_unverified",
  /** `not-found`: no CV with `cvId`. */
  "cv_not_found",
  /** `not-found`: no revision with `revisionId` (or the CV's current revision) under that CV. */
  "revision_not_found",
  /** `invalid-argument`: `templateId` is not a cv-render template. */
  "unknown_template",
  /** `failed-precondition`: the opted-in photo is missing or not JPEG/PNG. */
  "photo_unavailable",
  /** `internal`: the print engine failed; try again. */
  "render_failed",
  /**
   * `resource-exhausted`: today's PDF limit is used up (the user's own or the service-wide one,
   * docs/runbooks/limits.md); it resets at midnight UTC.
   */
  "daily_limit",
] as const;
export type CvRenderErrorReason = (typeof CV_RENDER_ERROR_REASONS)[number];
