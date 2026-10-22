import { z } from "zod";
import {
  ConfidenceSchema,
  EmailSchema,
  IdSchema,
  LanguageTagSchema,
  TimeZoneSchema,
  TimestampSchema,
  UrlSchema,
} from "./common";
import { ApplicationStatusSchema, MailCategorySchema, MailProviderSchema, ReviewStateSchema } from "./enums";

export const MailAccountStatusSchema = z.enum([
  "connected",
  "syncing",
  "needs_reauth",
  "error",
  "disconnected",
]);
export type MailAccountStatus = z.infer<typeof MailAccountStatusSchema>;

/**
 * `users/{uid}/mailAccounts/{id}` — server-written, client read-only. Never holds secrets:
 * `secretRef` names the encrypted token document under `serverOnly/**`.
 */
export const MailAccountSchema = z.object({
  id: IdSchema,
  provider: MailProviderSchema,
  address: EmailSchema,
  displayName: z.string().max(200).nullable(),
  status: MailAccountStatusSchema,
  /** Gmail historyId / Graph delta link / IMAP UIDVALIDITY:MODSEQ. */
  syncCursor: z.string().max(4_000).nullable(),
  secretRef: z.string().min(1).max(200),
  scopes: z.array(z.string().min(1).max(300)).max(30),
  canSend: z.boolean(),
  lastSyncedAt: TimestampSchema.nullable(),
  lastError: z
    .object({
      code: z.string().min(1).max(100),
      message: z.string().max(1_000),
      at: TimestampSchema,
    })
    .nullable(),
  connectedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type MailAccount = z.infer<typeof MailAccountSchema>;

export const MailAddressSchema = z.object({
  name: z.string().max(300).nullable(),
  address: EmailSchema,
});
export type MailAddress = z.infer<typeof MailAddressSchema>;

export const ExtractedDateKindSchema = z.enum([
  "interview",
  "assessment_deadline",
  "reply_deadline",
  "start_date",
  "other",
]);
export type ExtractedDateKind = z.infer<typeof ExtractedDateKindSchema>;

export const MailExtractionSchema = z.object({
  company: z.string().max(200).nullable(),
  role: z.string().max(200).nullable(),
  contactName: z.string().max(200).nullable(),
  contactEmail: EmailSchema.nullable(),
  dates: z
    .array(
      z.object({
        kind: ExtractedDateKindSchema,
        at: TimestampSchema,
        /** Zone stated in the mail; null when the mail gave none. */
        timezone: TimeZoneSchema.nullable(),
        label: z.string().max(200),
      }),
    )
    .max(20),
  meetingUrls: z.array(UrlSchema).max(10),
});
export type MailExtraction = z.infer<typeof MailExtractionSchema>;

/** Strength of the evidence linking a message to an application (§4.7 step 5, strongest first). */
export const LinkStrengthSchema = z.enum(["thread", "ats_company_role", "company_domain", "llm", "none"]);
export type LinkStrength = z.infer<typeof LinkStrengthSchema>;

export const MailFolderSchema = z.enum(["inbox", "spam", "other"]);
export type MailFolder = z.infer<typeof MailFolderSchema>;

/**
 * `users/{uid}/mailMessages/{id}` — job-related mail only (§8: non-job mail is never stored).
 * Server-written; clients may update only `MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS`.
 * `bodyText` is purged at `bodyPurgeAt` (application closed + retention days).
 */
export const MailMessageSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  providerMessageId: z.string().min(1).max(500),
  providerThreadId: z.string().min(1).max(500).nullable(),
  rfc822MessageId: z.string().min(1).max(998).nullable(),
  inReplyTo: z.string().min(1).max(998).nullable(),
  folder: MailFolderSchema,
  from: MailAddressSchema,
  subject: z.string().max(1_000),
  snippet: z.string().max(500),
  language: LanguageTagSchema.nullable(),
  receivedAt: TimestampSchema,
  category: MailCategorySchema,
  confidence: ConfidenceSchema,
  extracted: MailExtractionSchema,
  applicationId: IdSchema.nullable(),
  linkStrength: LinkStrengthSchema,
  /** Transition the classifier proposes for the linked application. */
  suggestedStatus: ApplicationStatusSchema.nullable(),
  /** Event created when the transition was applied automatically (target of Undo). */
  appliedEventId: IdSchema.nullable(),
  reviewState: ReviewStateSchema,
  reviewedAt: TimestampSchema.nullable(),
  bodyText: z.string().max(200_000).nullable(),
  bodyPurgeAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type MailMessage = z.infer<typeof MailMessageSchema>;
