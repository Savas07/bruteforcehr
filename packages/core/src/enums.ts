import { z } from "zod";

/**
 * Closed enums. Adding a value is a *contract* change for older clients (their
 * schemas reject it), so new values ship behind `appConfig.minSupportedVersion`
 * (see docs/adr/0002-data-model.md). Open-ended vocabularies (job sources,
 * template ids) are plain strings instead.
 */

/** §4.6 tracker statuses. Rank order and transitions live in `status.ts`. */
export const ApplicationStatusSchema = z.enum([
  "saved",
  "preparing",
  "applied",
  "acknowledged",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export const ApplicationStatus = ApplicationStatusSchema.enum;

/** How the application was (or will be) submitted; feeds Insights "response rate by channel". */
export const ChannelSchema = z.enum(["email", "external_link", "referral", "recruiter", "other"]);
export type Channel = z.infer<typeof ChannelSchema>;
export const Channel = ChannelSchema.enum;

/** §4.7 mail classification labels. */
export const MailCategorySchema = z.enum([
  "application_received",
  "rejection",
  "interview_invite",
  "assessment",
  "offer",
  "recruiter_outreach",
  "info_request",
  "job_alert",
  "other_job",
  "not_job",
]);
export type MailCategory = z.infer<typeof MailCategorySchema>;
export const MailCategory = MailCategorySchema.enum;

/**
 * Review queue state of a stored mail message.
 * - `not_required`: nothing to confirm (job alerts, unlinked other_job mail).
 * - `pending`: waiting in the Mail review queue.
 * - `auto_applied`: confidence ≥ threshold and strong link; transition applied with Undo.
 * - `confirmed` / `corrected` / `dismissed`: set by the user from the review queue.
 */
export const ReviewStateSchema = z.enum([
  "not_required",
  "pending",
  "auto_applied",
  "confirmed",
  "corrected",
  "dismissed",
]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export const ReviewState = ReviewStateSchema.enum;

/** Who caused an application event. */
export const EventActorSchema = z.enum(["user", "rule", "ai"]);
export type EventActor = z.infer<typeof EventActorSchema>;
export const EventActor = EventActorSchema.enum;

export const RemoteTypeSchema = z.enum(["onsite", "hybrid", "remote"]);
export type RemoteType = z.infer<typeof RemoteTypeSchema>;
export const RemoteType = RemoteTypeSchema.enum;

/** iCloud, Yahoo and custom domains connect through `imap` (IMAP/SMTP). */
export const MailProviderSchema = z.enum(["gmail", "microsoft", "imap"]);
export type MailProvider = z.infer<typeof MailProviderSchema>;
export const MailProvider = MailProviderSchema.enum;

/** Client platforms (devices, `appConfig/{platform}`). */
export const PlatformSchema = z.enum(["ios", "macos", "windows"]);
export type Platform = z.infer<typeof PlatformSchema>;
export const Platform = PlatformSchema.enum;

/** UI languages (§0). CV and mail content may use any BCP 47 tag. */
export const UiLanguageSchema = z.enum(["en", "tr", "de"]);
export type UiLanguage = z.infer<typeof UiLanguageSchema>;
export const UiLanguage = UiLanguageSchema.enum;

export const SenioritySchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
]);
export type Seniority = z.infer<typeof SenioritySchema>;
export const Seniority = SenioritySchema.enum;
