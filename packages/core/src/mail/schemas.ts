import { z } from "zod";
import {
  ConfidenceSchema,
  EmailSchema,
  IdSchema,
  LanguageTagSchema,
  TimeZoneSchema,
  TimestampSchema,
  UrlSchema,
} from "../common";
import { ApplicationStatusSchema, MailCategorySchema, MailProviderSchema, ReviewStateSchema } from "../enums";

export const MailAccountStatusSchema = z.enum([
  "connected",
  "syncing",
  "needs_reauth",
  "error",
  "disconnected",
]);
export type MailAccountStatus = z.infer<typeof MailAccountStatusSchema>;

/** Connection security of an IMAP or SMTP endpoint: implicit TLS or STARTTLS (plaintext is refused). */
export const MailSecuritySchema = z.enum(["tls", "starttls"]);
export type MailSecurity = z.infer<typeof MailSecuritySchema>;

export const MailEndpointSchema = z.object({
  host: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[A-Za-z0-9.-]+$/, "Expected a host name"),
  port: z.int().min(1).max(65_535),
  security: MailSecuritySchema,
});
export type MailEndpoint = z.infer<typeof MailEndpointSchema>;

/**
 * IMAP/SMTP server settings of an `imap` account (no secret). Shown under "Server details" and
 * used to prefill Reconnect. `smtp` is null when sending was never set up or failed its test.
 */
export const MailServerSettingsSchema = z.object({
  /** Preset the user picked (`IMAP_PRESET_IDS`), or `other`. */
  preset: z.string().min(1).max(40),
  username: z.string().min(1).max(320),
  imap: MailEndpointSchema,
  smtp: MailEndpointSchema.nullable(),
});
export type MailServerSettings = z.infer<typeof MailServerSettingsSchema>;

export const MailBackfillStateSchema = z.enum(["queued", "running", "done", "failed"]);
export type MailBackfillState = z.infer<typeof MailBackfillStateSchema>;

/** Stage checklist of the scanning screen (connect-email.md, Screen D). */
export const MailBackfillStageSchema = z.enum(["scanning", "classifying", "matching", "preparing"]);
export type MailBackfillStage = z.infer<typeof MailBackfillStageSchema>;

const CountSchema = z.int().min(0);

/** Progress and result of the lookback scan after connecting (server-written). */
export const MailBackfillSchema = z.object({
  state: MailBackfillStateSchema,
  stage: MailBackfillStageSchema,
  lookbackDays: z.int().min(1).max(365),
  since: TimestampSchema,
  /** Messages checked so far / in total (null until the provider reports a total). */
  scanned: CountSchema,
  total: CountSchema.nullable(),
  /** Job-related messages stored. */
  jobMessages: CountSchema,
  /** Distinct applications proposed or updated (Screen E headline). */
  applications: CountSchema,
  interviewInvites: CountSchema,
  jobAlerts: CountSchema,
  /** Messages waiting in Mail › Review. */
  pendingReview: CountSchema,
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
  error: z.object({ code: z.string().min(1).max(100), message: z.string().max(1_000) }).nullable(),
});
export type MailBackfill = z.infer<typeof MailBackfillSchema>;

/**
 * `users/{uid}/mailAccounts/{id}` — server-written, client read-only. Never holds secrets:
 * `secretRef` names the encrypted token document under `serverOnly/**`
 * (`mail/users/{uid}/tokens/{accountId}`).
 */
export const MailAccountSchema = z.object({
  id: IdSchema,
  provider: MailProviderSchema,
  address: EmailSchema,
  displayName: z.string().max(200).nullable(),
  status: MailAccountStatusSchema,
  /** Gmail historyId / Graph delta links / IMAP per-folder UIDVALIDITY, UIDNEXT and MODSEQ (JSON). */
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
  /** IMAP/SMTP settings (`imap` accounts only). Added in M5: older documents read it as null. */
  server: MailServerSettingsSchema.nullable(),
  /** Lookback scan; null before the first one. Added in M5: older documents read it as null. */
  backfill: MailBackfillSchema.nullable(),
  connectedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type MailAccount = z.infer<typeof MailAccountSchema>;

/** Values for `MailAccount` fields added after the first documents were written. */
export const MAIL_ACCOUNT_READ_DEFAULTS = {
  server: null,
  backfill: null,
} as const satisfies Partial<MailAccount>;

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
