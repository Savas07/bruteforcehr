import { z } from "zod";
import {
  ConfidenceSchema,
  EmailSchema,
  IdSchema,
  LinkSchema,
  TimeZoneSchema,
  TimestampSchema,
  UrlSchema,
} from "./common";
import { ApplicationStatusSchema, ChannelSchema, EventActorSchema, MailProviderSchema } from "./enums";
import { JobSourceIdSchema } from "./job";
import { EmailSendSchema } from "./mail/send";

export const ApplicationPrioritySchema = z.enum(["low", "normal", "high"]);
export type ApplicationPriority = z.infer<typeof ApplicationPrioritySchema>;

/** Provider thread an application lives in; used for reply tracking (§4.4, §4.7 link step 1). */
export const ThreadRefSchema = z.object({
  accountId: IdSchema,
  provider: MailProviderSchema,
  threadId: z.string().min(1).max(500),
  /** RFC 822 Message-ID of the message we sent, when we sent it. */
  rfc822MessageId: z.string().min(1).max(998).nullable(),
});
export type ThreadRef = z.infer<typeof ThreadRefSchema>;

/**
 * `users/{uid}/applications/{id}`.
 * The pins (`cvRevisionId`, `cvFileId`, `coverLetterId`, `coverLetterFileId`) record the exact
 * documents used and are write-once after `appliedAt` (§4.4.4).
 */
export const ApplicationSchema = z.object({
  id: IdSchema,
  jobId: IdSchema.nullable(),
  company: z.string().min(1).max(200),
  companyDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .nullable(),
  role: z.string().min(1).max(200),
  location: z.string().max(200).nullable(),
  status: ApplicationStatusSchema,
  statusChangedAt: TimestampSchema,
  channel: ChannelSchema.nullable(),
  /** Job source the application came from (Insights "response rate by source"). */
  source: JobSourceIdSchema.nullable(),
  appliedAt: TimestampSchema.nullable(),
  cvId: IdSchema.nullable(),
  cvRevisionId: IdSchema.nullable(),
  cvFileId: IdSchema.nullable(),
  coverLetterId: IdSchema.nullable(),
  coverLetterFileId: IdSchema.nullable(),
  /** Mail account the application email was sent from (`email` channel). */
  fromAccountId: IdSchema.nullable(),
  threadRefs: z.array(ThreadRefSchema).max(20),
  nextAction: z.string().max(200).nullable(),
  nextActionAt: TimestampSchema.nullable(),
  priority: ApplicationPrioritySchema,
  notes: z.string().max(20_000),
  // Suggestion state (decisions.md F9), set by the user from the suggestion cards; read through
  // `visibleSuggestions`. Added after launch: documents without them read as null
  // (`APPLICATION_READ_DEFAULTS`).
  /** "Later" on the follow-up suggestion: hidden until then. */
  followUpSnoozedUntil: TimestampSchema.nullable(),
  /** "Not needed" on the follow-up suggestion: hidden until a newer follow-up is due. */
  followUpDismissedAt: TimestampSchema.nullable(),
  /** "Later" on the no-response suggestion. */
  ghostedSnoozedUntil: TimestampSchema.nullable(),
  /** "Keep waiting": asked again only after another `ghostedAfterDays` of silence. */
  ghostedDismissedAt: TimestampSchema.nullable(),
  /**
   * Email apply in flight or done (decisions.md F6): server-written, clients create it as null and
   * never change it. Added in M4: older documents read it as null.
   */
  emailSend: EmailSendSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Application = z.infer<typeof ApplicationSchema>;

/** Values for `Application` fields added after the first documents were written. */
export const APPLICATION_READ_DEFAULTS = {
  followUpSnoozedUntil: null,
  followUpDismissedAt: null,
  ghostedSnoozedUntil: null,
  ghostedDismissedAt: null,
  emailSend: null,
} as const satisfies Partial<Application>;

export const ApplicationEventTypeSchema = z.enum([
  /** Application created; `toStatus` is the initial status, `fromStatus` is null. */
  "created",
  /** Status transition (including reverts, which carry `revertsEventId`). */
  "status_changed",
  "note",
  "mail_received",
  "mail_sent",
  "interview_scheduled",
]);
export type ApplicationEventType = z.infer<typeof ApplicationEventTypeSchema>;

export const EventEvidenceSchema = z.object({
  mailMessageId: IdSchema.nullable(),
  reason: z.string().min(1).max(500),
});
export type EventEvidence = z.infer<typeof EventEvidenceSchema>;

/**
 * `users/{uid}/applicationEvents/{id}` — append-only (create only).
 * Undo never edits an event: it appends a `status_changed` event whose `revertsEventId` points
 * at the undone event (the brief's `reverted_by` is derived with `revertedBy()`).
 */
export const ApplicationEventSchema = z
  .object({
    id: IdSchema,
    applicationId: IdSchema,
    type: ApplicationEventTypeSchema,
    fromStatus: ApplicationStatusSchema.nullable(),
    toStatus: ApplicationStatusSchema.nullable(),
    actor: EventActorSchema,
    /** Required for `rule`/`ai`, null for `user`. */
    confidence: ConfidenceSchema.nullable(),
    /** Required for `rule`/`ai`; optional context for `user`. */
    evidence: EventEvidenceSchema.nullable(),
    /**
     * Note text (`note`), status-change comment, or the subject line of `mail_received`/`mail_sent`.
     * Never mail body text: events are append-only, so they must not hold data that is purged.
     */
    text: z.string().max(5_000).nullable(),
    revertsEventId: IdSchema.nullable(),
    occurredAt: TimestampSchema,
    createdAt: TimestampSchema,
  })
  .superRefine((event, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    const automated = event.actor !== "user";
    if (automated && event.confidence === null) issue("Automated events need a confidence", "confidence");
    if (automated && event.evidence === null) issue("Automated events need evidence", "evidence");
    if (!automated && event.confidence !== null) issue("User events carry no confidence", "confidence");
    switch (event.type) {
      case "created":
        if (event.fromStatus !== null) issue("created events have no fromStatus", "fromStatus");
        if (event.toStatus === null) issue("created events need the initial toStatus", "toStatus");
        break;
      case "status_changed":
        if (event.fromStatus === null || event.toStatus === null)
          issue("status_changed needs from and to", "toStatus");
        else if (event.fromStatus === event.toStatus)
          issue("status_changed must change the status", "toStatus");
        break;
      default:
        if (event.fromStatus !== null || event.toStatus !== null)
          issue(`${event.type} events carry no status`, "toStatus");
    }
    if (event.revertsEventId !== null && (event.type !== "status_changed" || event.actor !== "user")) {
      issue("Only user status_changed events can revert another event", "revertsEventId");
    }
  });
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

/** An event before it has a document id. */
export type ApplicationEventDraft = Omit<ApplicationEvent, "id">;

export const InterviewKindSchema = z.enum([
  "recruiter_call",
  "hiring_manager",
  "technical",
  "system_design",
  "take_home_review",
  "behavioral",
  "onsite",
  "final",
  "other",
]);
export type InterviewKind = z.infer<typeof InterviewKindSchema>;

export const InterviewPersonSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).nullable(),
  email: EmailSchema.nullable(),
  contactId: IdSchema.nullable(),
});
export type InterviewPerson = z.infer<typeof InterviewPersonSchema>;

/** `users/{uid}/interviews/{id}`. `startsAt` is an instant; `timezone` is the organizer's zone. */
export const InterviewSchema = z.object({
  id: IdSchema,
  applicationId: IdSchema,
  round: z.int().min(1).max(20),
  kind: InterviewKindSchema,
  title: z.string().min(1).max(200),
  startsAt: TimestampSchema,
  durationMinutes: z.int().min(5).max(600),
  timezone: TimeZoneSchema,
  location: z.string().max(300).nullable(),
  meetingUrl: UrlSchema.nullable(),
  people: z.array(InterviewPersonSchema).max(20),
  prepNotes: z.string().max(20_000),
  /** Invite the interview was extracted from. */
  sourceMailMessageId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Interview = z.infer<typeof InterviewSchema>;

/** `users/{uid}/contacts/{id}`. */
export const ContactSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  email: EmailSchema.nullable(),
  company: z.string().max(200).nullable(),
  role: z.string().max(200).nullable(),
  links: z.array(LinkSchema).max(20),
  /** Applications this person is involved in (`array-contains` lookups from the detail page). */
  applicationIds: z.array(IdSchema).max(100),
  notes: z.string().max(5_000),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Contact = z.infer<typeof ContactSchema>;
