import { z } from "zod";
import { IdSchema, TimestampSchema } from "../common";
import { MailAddressSchema } from "./schemas";

/**
 * Email apply (BRIEF §4.4, decisions.md D11/F6, flows.md §2): `mailSend` schedules the message at
 * server acknowledgement + `MAIL_SEND_UNDO_SECONDS`; `mailSendCancel` stops it inside that window
 * and `mailSendNow` skips the rest of it. Progress and result live on `applications/{id}.emailSend`.
 */
export const MAIL_SEND_UNDO_SECONDS = 10;
/** Provider limits leave room for MIME/base64 overhead (Gmail 25 MB, Graph 150 MB via upload sessions). */
export const MAIL_SEND_MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;
export const MAIL_SEND_MAX_ATTACHMENTS = 5;
/** Storage prefix for files the user attaches from their device (`users/{uid}/mail-attachments/{fileId}`). */
export const MAIL_ATTACHMENT_STORAGE_DIR = "mail-attachments";
export const MAIL_ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/plain",
  "image/png",
  "image/jpeg",
] as const;

export const EmailSendStateSchema = z.enum(["scheduled", "sending", "sent", "cancelled", "failed"]);
export type EmailSendState = z.infer<typeof EmailSendStateSchema>;

/** `applications/{id}.emailSend` — server-written; clients create it as null and never change it. */
export const EmailSendSchema = z.object({
  state: EmailSendStateSchema,
  sendId: IdSchema,
  accountId: IdSchema,
  to: z.array(MailAddressSchema).min(1).max(10),
  subject: z.string().max(998),
  /** Dispatch time (server acknowledgement + 10 s); clients count down to it. */
  sendAt: TimestampSchema,
  sentAt: TimestampSchema.nullable(),
  providerMessageId: z.string().min(1).max(500).nullable(),
  threadId: z.string().min(1).max(500).nullable(),
  rfc822MessageId: z.string().min(1).max(998).nullable(),
  error: z.object({ code: z.string().min(1).max(100), message: z.string().max(1_000) }).nullable(),
});
export type EmailSend = z.infer<typeof EmailSendSchema>;

export const MailSendAttachmentSchema = z.discriminatedUnion("kind", [
  /** A rendered CV / cover letter (`users/{uid}/renderedFiles/{id}`). */
  z.object({ kind: z.literal("rendered"), renderedFileId: IdSchema }),
  /** A file the client uploaded to `users/{uid}/mail-attachments/{fileId}`. */
  z.object({
    kind: z.literal("upload"),
    storagePath: z
      .string()
      .regex(/^users\/[^/]+\/mail-attachments\/[^/]+$/, "Expected a mail-attachments path"),
    fileName: z.string().min(1).max(255),
    contentType: z.enum(MAIL_ATTACHMENT_CONTENT_TYPES),
  }),
]);
export type MailSendAttachment = z.infer<typeof MailSendAttachmentSchema>;

/** Documents pinned on the application when the message is sent (§4.4.4). */
export const MailSendPinsSchema = z.object({
  cvId: IdSchema.nullable(),
  cvRevisionId: IdSchema.nullable(),
  /** Must be one of the `rendered` attachments. */
  cvFileId: IdSchema.nullable(),
  coverLetterId: IdSchema.nullable(),
  /** Must be one of the `rendered` attachments. */
  coverLetterFileId: IdSchema.nullable(),
});
export type MailSendPins = z.infer<typeof MailSendPinsSchema>;

export const MailSendRequestSchema = z.object({
  accountId: IdSchema,
  /** Existing application; null creates one (status `preparing`, channel `email`) from `jobId`. */
  applicationId: IdSchema.nullable(),
  jobId: IdSchema.nullable(),
  to: z.array(MailAddressSchema).min(1).max(10),
  cc: z.array(MailAddressSchema).max(10).default([]),
  subject: z.string().trim().min(1).max(998),
  bodyText: z.string().min(1).max(100_000),
  attachments: z.array(MailSendAttachmentSchema).max(MAIL_SEND_MAX_ATTACHMENTS).default([]),
  pins: MailSendPinsSchema,
  /** Reply in the thread of this stored message (follow-ups). */
  replyToMailMessageId: IdSchema.nullable().default(null),
});
export type MailSendRequest = z.input<typeof MailSendRequestSchema>;
export type MailSendRequestParsed = z.output<typeof MailSendRequestSchema>;

export const MailSendResponseSchema = z.object({
  applicationId: IdSchema,
  /** ISO 8601. */
  sendAt: z.iso.datetime(),
  state: z.literal("scheduled"),
});
export type MailSendResponse = z.infer<typeof MailSendResponseSchema>;

export const MailSendControlRequestSchema = z.object({ applicationId: IdSchema });
export type MailSendControlRequest = z.infer<typeof MailSendControlRequestSchema>;

export const MailSendCancelResponseSchema = z.object({ state: z.literal("cancelled") });
export type MailSendCancelResponse = z.infer<typeof MailSendCancelResponseSchema>;

export const MailSendNowResponseSchema = z.object({ state: z.enum(["sent", "failed"]) });
export type MailSendNowResponse = z.infer<typeof MailSendNowResponseSchema>;

/** `details.reason` of mail send errors (client copy keys). */
export const MAIL_SEND_ERROR_REASONS = [
  "email_unverified",
  "account_not_found",
  "cannot_send",
  "needs_reauth",
  "daily_send_cap",
  "attachment_not_found",
  "attachments_too_large",
  "send_in_progress",
  "already_sent",
  "application_not_found",
  "job_not_found",
] as const;
export type MailSendErrorReason = (typeof MAIL_SEND_ERROR_REASONS)[number];
