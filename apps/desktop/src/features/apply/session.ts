/**
 * Email-apply drafts kept in memory for the app session (research/apply.md: `Esc` closes the
 * composer, the draft stays). One per signed-in user and job (`${uid}:${jobId}`); nothing is
 * written until the user sends or marks the application as sent.
 */
import type { ApplyDraft, ApplyPins } from "./model";
import type { AttachmentPdfs } from "./pdf";

export type ApplyStep = "compose" | "review";

export interface ApplySession {
  readonly draft: ApplyDraft;
  readonly step: ApplyStep;
  /** The PDFs made for Review, for exactly this draft's CV revision and letter (`key`). */
  readonly pdfs: { readonly key: string; readonly files: AttachmentPdfs } | null;
  /** Uploaded `renderedFiles` of `pdfs` (a retry doesn't upload them again). */
  readonly pins: { readonly key: string; readonly value: ApplyPins } | null;
  /** The application of a send in progress or done (watched through `emailSend`). */
  readonly sendApplicationId: string | null;
  /** The server's dispatch time until the application's `emailSend` arrives. */
  readonly sendAt: Date | null;
  /** "I sent it" recorded this application. */
  readonly recordedApplicationId: string | null;
  /** The kit's PDFs saved to `Downloads/BruteForceHR`, for exactly the PDF set `key`. */
  readonly kitPaths?: { readonly key: string; readonly cv: string | null; readonly letter: string | null };
}

export const applySessions = new Map<string, ApplySession>();
