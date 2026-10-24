import { createHash } from "node:crypto";
import { firestorePaths, serverOnlyPaths, storagePaths } from "@bfhr/api";
import {
  type CvRenderErrorReason,
  type CvRenderPdfResponse,
  CvRenderPdfRequestSchema,
  CvRenderPdfResponseSchema,
} from "@bfhr/core";
import { renderCvHtml } from "@bfhr/cv-render";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ReasonedHttpsError, verifiedUid } from "../callable";
import { adminConverters as converters } from "../converters";
import { projectCounter, takeDaily, USER_DAILY_LIMITS, utcDayKey } from "../daily-usage";
import { type PdfRenderJob, pdfRenderJob, UnknownTemplateError } from "./input";
import { loadCvPhoto, PhotoUnavailableError } from "./photo";
import { pdfPageCount, printHtmlToPdf } from "./print";

class RenderError extends ReasonedHttpsError<CvRenderErrorReason> {}

/**
 * `cvRenderPdf({ cvId, revisionId?, templateId?, theme?, paper?, fileName? })`: prints one of the
 * caller's CV revisions with @bfhr/cv-render + headless Chromium, stores the bytes at
 * `users/{uid}/rendered/{fileId}` and records a create-only `renderedFiles/{fileId}` document with
 * their SHA-256 (ADR 0002), for iOS and email attachments (docs/adr/0009-cv-rendering.md).
 *
 * 2 GiB: Chromium is unpacked into /tmp, which is memory on Cloud Run. Four requests share an
 * instance's browser (one page each); see docs/runbooks/release.md for cost.
 */
export const cvRenderPdf = onCall(
  { memory: "2GiB", cpu: 1, concurrency: 4, timeoutSeconds: 120 },
  async (request): Promise<CvRenderPdfResponse> => {
    const started = Date.now();
    const uid = verifiedUid(request);
    const parsed = CvRenderPdfRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "Expected { cvId, revisionId?, templateId?, theme?, paper?, fileName? }.",
      );
    }
    const { cvId } = parsed.data;
    const db = getFirestore();

    const cvSnapshot = await db.doc(firestorePaths.cv(uid, cvId)).get();
    if (!cvSnapshot.exists) throw new RenderError("not-found", "cv_not_found", "This CV was not found.");
    const cv = converters.cv.fromSnapshot(cvSnapshot);
    const revisionId = parsed.data.revisionId ?? cv.currentRevisionId;
    const revisionSnapshot = await db.doc(firestorePaths.cvRevision(uid, cvId, revisionId)).get();
    if (!revisionSnapshot.exists) {
      throw new RenderError("not-found", "revision_not_found", "This version of the CV was not found.");
    }
    const revision = converters.cvRevision.fromSnapshot(revisionSnapshot);

    let job: PdfRenderJob;
    try {
      job = pdfRenderJob(cv, revision, parsed.data, await loadCvPhoto(uid, revision.content));
    } catch (error) {
      if (error instanceof UnknownTemplateError) {
        throw new RenderError("invalid-argument", "unknown_template", "This CV template doesn't exist.");
      }
      if (error instanceof PhotoUnavailableError) {
        logger.warn("cv_render_pdf_photo", { problem: error.message });
        throw new RenderError(
          "failed-precondition",
          "photo_unavailable",
          "The CV photo couldn't be loaded. Add it again (JPEG or PNG), or turn the photo off.",
        );
      }
      throw error;
    }

    // Each render runs Chromium and stores a file: per-user and project-wide daily limits.
    const day = utcDayKey(new Date());
    const refused = await takeDaily(
      [
        {
          name: "user" as const,
          path: serverOnlyPaths.renderDay(uid, day),
          field: "count",
          amount: 1,
          limit: USER_DAILY_LIMITS.renders,
        },
        projectCounter("project" as const, "renders", day),
      ],
      day,
    );
    if (refused !== null) {
      logger.warn("cv_render_pdf_limit", { scope: refused });
      throw new RenderError(
        "resource-exhausted",
        "daily_limit",
        refused === "user"
          ? "You've made a lot of PDFs today. You can make more after midnight UTC."
          : "PDF making has reached today's limit for everyone. It resets at midnight UTC.",
      );
    }

    const rendered = renderCvHtml(job.input);
    let bytes: Uint8Array;
    let pages: number;
    try {
      bytes = await printHtmlToPdf(rendered.html);
      pages = await pdfPageCount(bytes);
    } catch (error) {
      logger.error("cv_render_pdf_failed", { name: error instanceof Error ? error.name : typeof error });
      throw new RenderError("internal", "render_failed", "We couldn't make the PDF. Please try again.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const fileId = db.collection(firestorePaths.renderedFiles(uid)).doc().id;
    const storagePath = storagePaths.renderedFile(uid, fileId);
    const object = getStorage().bucket().file(storagePath);
    await object.save(bytes, {
      resumable: false,
      contentType: "application/pdf",
      metadata: {
        contentDisposition: `attachment; filename="${job.fileName}"`,
        metadata: { sha256, cvId, cvRevisionId: revision.id },
      },
    });
    try {
      await db.doc(firestorePaths.renderedFile(uid, fileId)).create(
        converters.renderedFile.toFirestore({
          id: fileId,
          kind: "pdf",
          cvId,
          cvRevisionId: revision.id,
          coverLetterId: null,
          storagePath,
          fileName: job.fileName,
          sizeBytes: bytes.byteLength,
          sha256,
          createdAt: new Date(),
        }),
      );
    } catch (error) {
      // No document, no bytes: a file without its record would never be shown or cleaned up.
      await object.delete({ ignoreNotFound: true });
      throw error;
    }

    // PII-free: no names, ids or CV text.
    logger.info("cv_render_pdf", {
      templateId: job.input.templateId,
      paper: job.input.paper,
      locale: job.input.locale,
      pages,
      sizeBytes: bytes.byteLength,
      latencyMs: Date.now() - started,
    });
    return CvRenderPdfResponseSchema.parse({ storagePath, sha256, pages });
  },
);
