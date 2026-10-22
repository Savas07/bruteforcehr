import { z } from "zod";
import { IdSchema, TimestampSchema } from "./common";
import { type EventActor, MailCategorySchema, ReviewStateSchema } from "./enums";

/**
 * Write-policy constants mirrored by `firebase/firestore.rules`. Changing any of them is a
 * rules change too (docs/adr/0002-data-model.md).
 */

/** Every stored document carries `schemaVersion` (int). Bumped by expand→contract migrations. */
export const CURRENT_SCHEMA_VERSION = 1;

/** `cvs.version` on create. */
export const CV_INITIAL_VERSION = 1;
/** Every `cvs` update must set `version = previous + CV_VERSION_INCREMENT`. */
export const CV_VERSION_INCREMENT = 1;

/** The only `mailMessages` fields a client may change (all four, on every update). */
export const MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS = [
  "reviewState",
  "applicationId",
  "category",
  "reviewedAt",
] as const;
export type MailMessageClientField = (typeof MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS)[number];

/** Review states a client may set from the review queue. */
export const MAIL_REVIEW_CLIENT_STATES = ["confirmed", "corrected", "dismissed"] as const;

export const MailReviewUpdateSchema = z.object({
  reviewState: ReviewStateSchema.extract(MAIL_REVIEW_CLIENT_STATES),
  applicationId: IdSchema.nullable(),
  category: MailCategorySchema,
  reviewedAt: TimestampSchema,
});
export type MailReviewUpdate = z.infer<typeof MailReviewUpdateSchema>;

/** The only `jobMatches` fields a client may change (save / dismiss). */
export const JOB_MATCH_CLIENT_UPDATABLE_FIELDS = ["state", "dismissReasons", "stateChangedAt"] as const;

/** Clients create only user events; `rule`/`ai` events are written by Cloud Functions. */
export const CLIENT_EVENT_ACTORS = ["user"] as const satisfies readonly EventActor[];

/** Server-only field on `users/{uid}/jobs/{jobId}` (Firestore vector); never written by clients. */
export const JOB_EMBEDDING_FIELD = "embedding";
