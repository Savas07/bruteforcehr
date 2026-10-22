/**
 * Builders for the shared view-model blocks (`./blocks.ts`) from `@bfhr/core` entities. Screen
 * builders call these so Today, Mail, Tracker and Job detail word the same facts the same way.
 */
import {
  type Application,
  type ApplicationEvent,
  type ApplicationStatus,
  canRevert,
  type Channel,
  type ExtractedDateKind,
  followUpDue,
  type LinkStrength,
  type MailCategory,
  type MailMessage,
  suggestGhosted,
} from "@bfhr/core";
import { defineMessages, type MessageDescriptor } from "react-intl";
import type {
  ApplicationSummaryVM,
  AutoChangeVM,
  NudgeVM,
  ReviewProposalVM,
  StatusMoveVM,
  TimelineEventKind,
  TimelineEventVM,
  UndoVM,
} from "./blocks";
import { calendarDaysFromNow, dayAndTime, relativeTime, shortDate } from "./format";
import type { ModelContext, UserData } from "./types";
import { companyVM, sourceVM, STATUS_MESSAGES, statusVM } from "./vocabulary";

/** Mail categories as shown in the UI; `rejection` reads "Decision" (D18). */
export const MAIL_CATEGORY_MESSAGES: Readonly<Record<MailCategory, MessageDescriptor>> = defineMessages({
  application_received: {
    id: "shared.blocks.category.applicationReceived",
    defaultMessage: "Application received",
  },
  rejection: {
    id: "shared.blocks.category.rejection",
    defaultMessage: "Decision",
    description: "Mail category for an employer's decision (usually not moving forward); never 'Rejection'",
  },
  interview_invite: { id: "shared.blocks.category.interviewInvite", defaultMessage: "Interview invite" },
  assessment: { id: "shared.blocks.category.assessment", defaultMessage: "Assessment" },
  offer: { id: "shared.blocks.category.offer", defaultMessage: "Offer" },
  recruiter_outreach: {
    id: "shared.blocks.category.recruiterOutreach",
    defaultMessage: "Recruiter",
    description: "Mail category: a recruiter reached out",
  },
  info_request: {
    id: "shared.blocks.category.infoRequest",
    defaultMessage: "Info request",
    description: "Mail category: the employer asks for more information",
  },
  job_alert: { id: "shared.blocks.category.jobAlert", defaultMessage: "Job alert" },
  other_job: {
    id: "shared.blocks.category.otherJob",
    defaultMessage: "Other",
    description: "Mail category: job-related mail that fits no other category",
  },
  not_job: { id: "shared.blocks.category.notJob", defaultMessage: "Not job mail" },
});

/** How the application was sent. */
export const CHANNEL_MESSAGES: Readonly<Record<Channel, MessageDescriptor>> = defineMessages({
  email: { id: "shared.blocks.channel.email", defaultMessage: "Email" },
  external_link: { id: "shared.blocks.channel.externalLink", defaultMessage: "Company site" },
  referral: { id: "shared.blocks.channel.referral", defaultMessage: "Referral" },
  recruiter: { id: "shared.blocks.channel.recruiter", defaultMessage: "Recruiter" },
  other: { id: "shared.blocks.channel.other", defaultMessage: "Other" },
});

const DATE_KIND_MESSAGES: Readonly<Record<Exclude<ExtractedDateKind, "other">, MessageDescriptor>> =
  defineMessages({
    interview: { id: "shared.blocks.dateKind.interview", defaultMessage: "Interview" },
    assessment_deadline: {
      id: "shared.blocks.dateKind.assessmentDeadline",
      defaultMessage: "Assessment due",
    },
    reply_deadline: {
      id: "shared.blocks.dateKind.replyDeadline",
      defaultMessage: "Reply by",
      description: "Label before a date by which the user should reply",
    },
    start_date: { id: "shared.blocks.dateKind.startDate", defaultMessage: "Start date" },
  });

/** Mail headlines below the auto-apply threshold (mail-review.md copy notes). */
const HEDGED_HEADLINE_MESSAGES: Readonly<Record<MailCategory, MessageDescriptor>> = defineMessages({
  application_received: {
    id: "shared.blocks.headline.hedged.applicationReceived",
    defaultMessage: "Looks like {company} received your application",
  },
  rejection: {
    id: "shared.blocks.headline.hedged.rejection",
    defaultMessage: "Looks like a decision from {company}",
  },
  interview_invite: {
    id: "shared.blocks.headline.hedged.interviewInvite",
    defaultMessage: "Looks like an interview invite from {company}",
  },
  assessment: {
    id: "shared.blocks.headline.hedged.assessment",
    defaultMessage: "Looks like an assessment from {company}",
  },
  offer: { id: "shared.blocks.headline.hedged.offer", defaultMessage: "Looks like an offer from {company}" },
  recruiter_outreach: {
    id: "shared.blocks.headline.hedged.recruiterOutreach",
    defaultMessage: "Looks like a recruiter message about {company}",
  },
  info_request: {
    id: "shared.blocks.headline.hedged.infoRequest",
    defaultMessage: "Looks like {company} needs more information",
  },
  job_alert: { id: "shared.blocks.headline.hedged.jobAlert", defaultMessage: "Looks like a job alert" },
  other_job: {
    id: "shared.blocks.headline.hedged.otherJob",
    defaultMessage: "Looks like job mail from {company}",
  },
  not_job: { id: "shared.blocks.headline.hedged.notJob", defaultMessage: "Doesn't look like job mail" },
});

/** Mail headlines at or above the auto-apply threshold. */
const FACTUAL_HEADLINE_MESSAGES: Readonly<Record<MailCategory, MessageDescriptor>> = defineMessages({
  application_received: {
    id: "shared.blocks.headline.factual.applicationReceived",
    defaultMessage: "{company} received your application",
  },
  rejection: {
    id: "shared.blocks.headline.factual.rejection",
    defaultMessage: "{company} has decided not to move forward",
  },
  interview_invite: {
    id: "shared.blocks.headline.factual.interviewInvite",
    defaultMessage: "Interview invite from {company}",
  },
  assessment: {
    id: "shared.blocks.headline.factual.assessment",
    defaultMessage: "Assessment from {company}",
  },
  offer: { id: "shared.blocks.headline.factual.offer", defaultMessage: "Offer from {company}" },
  recruiter_outreach: {
    id: "shared.blocks.headline.factual.recruiterOutreach",
    defaultMessage: "Recruiter message about {company}",
  },
  info_request: {
    id: "shared.blocks.headline.factual.infoRequest",
    defaultMessage: "{company} needs more information",
  },
  job_alert: { id: "shared.blocks.headline.factual.jobAlert", defaultMessage: "Job alert" },
  other_job: { id: "shared.blocks.headline.factual.otherJob", defaultMessage: "Job mail from {company}" },
  not_job: { id: "shared.blocks.headline.factual.notJob", defaultMessage: "Not job mail" },
});

/** "What usually happens next" per status; closed outcomes have none. */
const NEXT_STEP_MESSAGES: Partial<Readonly<Record<ApplicationStatus, MessageDescriptor>>> = defineMessages({
  saved: { id: "shared.blocks.nextStep.saved", defaultMessage: "Apply when you're ready." },
  preparing: {
    id: "shared.blocks.nextStep.preparing",
    defaultMessage: "Finish your CV and cover letter, then apply.",
  },
  applied: {
    id: "shared.blocks.nextStep.applied",
    defaultMessage: "Companies often reply within one to two weeks.",
  },
  acknowledged: {
    id: "shared.blocks.nextStep.acknowledged",
    defaultMessage: "They have your application. A first reply often takes one to two weeks.",
  },
  screening: {
    id: "shared.blocks.nextStep.screening",
    defaultMessage: "Next is usually a call with a recruiter or the hiring manager.",
  },
  interviewing: {
    id: "shared.blocks.nextStep.interviewing",
    defaultMessage: "Next is usually another round or a decision.",
  },
  offer: {
    id: "shared.blocks.nextStep.offer",
    defaultMessage: "Take the time you need to review the offer before you reply.",
  },
});

const messages = defineMessages({
  reasonThreadSince: {
    id: "shared.blocks.reason.threadSince",
    defaultMessage: "Same email thread as your application of {date}",
    description: "Why an email was linked; {date} is a short date like '3 Oct'",
  },
  reasonThread: {
    id: "shared.blocks.reason.thread",
    defaultMessage: "Same email thread as your application",
  },
  reasonAtsCompanyRole: {
    id: "shared.blocks.reason.atsCompanyRole",
    defaultMessage: "Sent from {domain} and mentions this role",
    description: "{domain} is the sender's mail domain, e.g. greenhouse.io",
  },
  reasonCompanyDomain: {
    id: "shared.blocks.reason.companyDomain",
    defaultMessage: "Sent from {domain}, the company's own domain",
  },
  reasonLlm: {
    id: "shared.blocks.reason.llm",
    defaultMessage: "Matched by AI from the company and role named in the email",
  },
  reasonNone: {
    id: "shared.blocks.reason.none",
    defaultMessage: "We couldn't match this email to an application",
  },
  undoAlreadyReverted: { id: "shared.blocks.undo.alreadyReverted", defaultMessage: "Already undone." },
  undoSuperseded: {
    id: "shared.blocks.undo.superseded",
    defaultMessage: "Can't undo — the status changed since.",
  },
  sourceFromEmail: {
    id: "shared.blocks.source.fromEmail",
    defaultMessage: "From an email by {company}",
    description: "Source tag of an automatic status change",
  },
  sourceAutomatic: {
    id: "shared.blocks.source.automatic",
    defaultMessage: "Automatic",
    description: "Source tag of an automatic change without an email behind it",
  },
  noResponseMessage: {
    id: "shared.blocks.nudge.noResponse.message",
    defaultMessage: "No reply in {days, plural, one {# day} other {# days}}. Mark as no response?",
  },
  noResponsePrimary: { id: "shared.blocks.nudge.noResponse.primary", defaultMessage: "Mark as no response" },
  noResponseSecondary: { id: "shared.blocks.nudge.noResponse.secondary", defaultMessage: "Keep waiting" },
  followUpMessage: {
    id: "shared.blocks.nudge.followUp.message",
    defaultMessage:
      "{days, plural, =0 {Applied today · no reply yet} =1 {Applied yesterday · no reply yet} other {Applied # days ago · no reply yet}}",
    description: "Follow-up suggestion; {days} is whole calendar days since applying (days, never weeks)",
  },
  followUpPrimary: { id: "shared.blocks.nudge.followUp.primary", defaultMessage: "Draft follow-up" },
  followUpSecondary: { id: "shared.blocks.nudge.followUp.secondary", defaultMessage: "Not needed" },
  timelineAddedAs: {
    id: "shared.blocks.timeline.addedAs",
    defaultMessage: "Added as {status}",
    description: "{status} is a status name, e.g. 'Applied'",
  },
  timelineAdded: { id: "shared.blocks.timeline.added", defaultMessage: "Added to Tracker" },
  timelineStatusChanged: { id: "shared.blocks.timeline.statusChanged", defaultMessage: "Status changed" },
  timelineMovedTo: {
    id: "shared.blocks.timeline.movedTo",
    defaultMessage: "Moved to {status}",
    description: "{status} is a status name, e.g. 'Interviewing'",
  },
  timelineUndidMove: {
    id: "shared.blocks.timeline.undidMove",
    defaultMessage: "Undid a move · back to {status}",
    description: "{status} is the status the application returned to",
  },
  timelineNote: { id: "shared.blocks.timeline.note", defaultMessage: "Note" },
  timelineMailReceived: { id: "shared.blocks.timeline.mailReceived", defaultMessage: "Email received" },
  timelineMailSent: { id: "shared.blocks.timeline.mailSent", defaultMessage: "Email sent" },
  timelineInterviewScheduled: {
    id: "shared.blocks.timeline.interviewScheduled",
    defaultMessage: "Interview scheduled",
  },
});

/** "Acme · Frontend Engineer": how an application is named in sentences and pickers. */
export function applicationLabel(application: Pick<Application, "company" | "role">): string {
  return `${application.company} · ${application.role}`;
}

/** One line per category, hedged below the auto-apply threshold (mail-review.md copy notes). */
function mailHeadline(category: MailCategory, company: string, hedged: boolean, ctx: ModelContext): string {
  const descriptor = (hedged ? HEDGED_HEADLINE_MESSAGES : FACTUAL_HEADLINE_MESSAGES)[category];
  return ctx.intl.formatMessage(descriptor, { company });
}

/** `ReasonLine`: the link evidence as one sentence (mail-review.md "Reason"). */
function linkReason(
  strength: LinkStrength,
  senderAddress: string,
  application: Application | undefined,
  ctx: ModelContext,
): string {
  const domain = senderAddress.split("@")[1] ?? senderAddress;
  switch (strength) {
    case "thread":
      return application?.appliedAt
        ? ctx.intl.formatMessage(messages.reasonThreadSince, { date: shortDate(application.appliedAt, ctx) })
        : ctx.intl.formatMessage(messages.reasonThread);
    case "ats_company_role":
      return ctx.intl.formatMessage(messages.reasonAtsCompanyRole, { domain });
    case "company_domain":
      return ctx.intl.formatMessage(messages.reasonCompanyDomain, { domain });
    case "llm":
      return ctx.intl.formatMessage(messages.reasonLlm);
    case "none":
      return ctx.intl.formatMessage(messages.reasonNone);
  }
}

export function reviewProposalVM(
  message: MailMessage,
  data: Pick<UserData, "applications" | "mailAccounts" | "profile">,
  ctx: ModelContext,
): ReviewProposalVM {
  const application = data.applications.find((candidate) => candidate.id === message.applicationId);
  const company =
    application?.company ?? message.extracted.company ?? message.from.name ?? message.from.address;
  const hedged = message.confidence < data.profile.settings.autoApplyConfidence;
  const move: StatusMoveVM | null =
    message.suggestedStatus === null
      ? null
      : {
          applicationId: application?.id ?? null,
          applicationLabel: application
            ? applicationLabel(application)
            : [message.extracted.company, message.extracted.role].filter(Boolean).join(" · ") || company,
          from: application ? statusVM(application.status, ctx.intl) : null,
          to: statusVM(message.suggestedStatus, ctx.intl),
        };
  return {
    messageId: message.id,
    company: companyVM(company, application?.companyDomain ?? null),
    subject: message.subject,
    from: message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address,
    account: data.mailAccounts.find((account) => account.id === message.accountId)?.address ?? "",
    receivedAt: relativeTime(message.receivedAt, ctx),
    category: {
      key: message.category,
      label: ctx.intl.formatMessage(MAIL_CATEGORY_MESSAGES[message.category]),
    },
    headline: mailHeadline(message.category, company, hedged, ctx),
    hedged,
    move,
    reason: linkReason(message.linkStrength, message.from.address, application, ctx),
    evidence: message.snippet || null,
    dates: message.extracted.dates.map((date) => ({
      label: date.kind === "other" ? date.label : ctx.intl.formatMessage(DATE_KIND_MESSAGES[date.kind]),
      at: dayAndTime(date.at, ctx),
    })),
    source: sourceVM("mail", ctx.intl),
    pendingSync: ctx.pendingWrites.has(message.id),
  };
}

function undoVM(
  application: Application,
  event: ApplicationEvent,
  events: readonly ApplicationEvent[],
  ctx: ModelContext,
): UndoVM {
  const check = canRevert({ application, event, events });
  if (check.allowed) return { available: true };
  return {
    available: false,
    reason: ctx.intl.formatMessage(
      check.reason === "already_reverted" ? messages.undoAlreadyReverted : messages.undoSuperseded,
    ),
  };
}

/** The automatic status change behind `event`, or null if it isn't one (user moves, notes). */
export function autoChangeVM(
  event: ApplicationEvent,
  data: Pick<UserData, "applications" | "applicationEvents" | "mailMessages">,
  ctx: ModelContext,
): AutoChangeVM | null {
  const application = data.applications.find((candidate) => candidate.id === event.applicationId);
  if (
    !application ||
    event.type !== "status_changed" ||
    event.actor === "user" ||
    event.fromStatus === null ||
    event.toStatus === null
  )
    return null;
  const mail = data.mailMessages.find((message) => message.id === event.evidence?.mailMessageId);
  return {
    eventId: event.id,
    applicationId: application.id,
    company: companyVM(application.company, application.companyDomain),
    role: application.role,
    from: statusVM(event.fromStatus, ctx.intl),
    to: statusVM(event.toStatus, ctx.intl),
    occurredAt: relativeTime(event.occurredAt, ctx),
    source: sourceVM(
      "rule",
      ctx.intl,
      ctx.intl.formatMessage(mail ? messages.sourceFromEmail : messages.sourceAutomatic, {
        company: application.company,
      }),
    ),
    reason: event.evidence?.reason ?? "",
    mailMessageId: mail?.id ?? null,
    undo: undoVM(application, event, data.applicationEvents, ctx),
    pendingSync: ctx.pendingWrites.has(event.id),
  };
}

/** Follow-up and no-response suggestions for active applications, oldest first (D15). */
export function nudgeVMs(
  data: Pick<UserData, "applications" | "applicationEvents" | "profile">,
  ctx: ModelContext,
): NudgeVM[] {
  const { followUpAfterDays, ghostedAfterDays } = data.profile.settings;
  const nudges: { at: Date; nudge: NudgeVM }[] = [];
  for (const application of data.applications) {
    const base = {
      applicationId: application.id,
      company: companyVM(application.company, application.companyDomain),
      role: application.role,
      pendingSync: ctx.pendingWrites.has(application.id),
    };
    const ghosted = suggestGhosted(application, data.applicationEvents, ctx.now, ghostedAfterDays);
    if (ghosted) {
      nudges.push({
        at: ghosted.silentSince,
        nudge: {
          ...base,
          kind: "noResponse",
          message: ctx.intl.formatMessage(messages.noResponseMessage, { days: ghosted.silentDays }),
          primaryLabel: ctx.intl.formatMessage(messages.noResponsePrimary),
          secondaryLabel: ctx.intl.formatMessage(messages.noResponseSecondary),
          since: relativeTime(ghosted.silentSince, ctx),
        },
      });
      continue;
    }
    const followUp = followUpDue(application, data.applicationEvents, ctx.now, followUpAfterDays);
    if (followUp) {
      const since = relativeTime(followUp.since, ctx);
      nudges.push({
        at: followUp.since,
        nudge: {
          ...base,
          kind: "followUp",
          // Days, not weeks: "Applied 8 days ago" (today-home.md copy notes).
          message: ctx.intl.formatMessage(messages.followUpMessage, {
            days: -calendarDaysFromNow(followUp.since, ctx),
          }),
          primaryLabel: ctx.intl.formatMessage(messages.followUpPrimary),
          secondaryLabel: ctx.intl.formatMessage(messages.followUpSecondary),
          since,
        },
      });
    }
  }
  return nudges.sort((a, b) => a.at.getTime() - b.at.getTime()).map(({ nudge }) => nudge);
}

const TIMELINE_KINDS: Readonly<Record<ApplicationEvent["type"], TimelineEventKind>> = {
  created: "created",
  status_changed: "status",
  note: "note",
  mail_received: "mailReceived",
  mail_sent: "mailSent",
  interview_scheduled: "interview",
};

function timelineTitle(event: ApplicationEvent, ctx: ModelContext): string {
  const { intl } = ctx;
  switch (event.type) {
    case "created":
      return event.toStatus
        ? intl.formatMessage(messages.timelineAddedAs, {
            status: intl.formatMessage(STATUS_MESSAGES[event.toStatus]),
          })
        : intl.formatMessage(messages.timelineAdded);
    case "status_changed": {
      if (!event.toStatus) return intl.formatMessage(messages.timelineStatusChanged);
      const status = intl.formatMessage(STATUS_MESSAGES[event.toStatus]);
      return intl.formatMessage(
        event.revertsEventId === null ? messages.timelineMovedTo : messages.timelineUndidMove,
        {
          status,
        },
      );
    }
    case "note":
      return intl.formatMessage(messages.timelineNote);
    case "mail_received":
      return intl.formatMessage(messages.timelineMailReceived);
    case "mail_sent":
      return intl.formatMessage(messages.timelineMailSent);
    case "interview_scheduled":
      return intl.formatMessage(messages.timelineInterviewScheduled);
  }
}

/** An application's history, newest first (`TimelineRow`). */
export function timelineVMs(
  application: Application,
  data: Pick<UserData, "applicationEvents">,
  ctx: ModelContext,
): TimelineEventVM[] {
  const events = data.applicationEvents.filter((event) => event.applicationId === application.id);
  const reverted = new Set(events.flatMap((event) => (event.revertsEventId ? [event.revertsEventId] : [])));
  return events
    .toSorted((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .map((event): TimelineEventVM => {
      const automatic = event.actor !== "user";
      const move =
        event.type === "status_changed" && event.fromStatus && event.toStatus
          ? { from: statusVM(event.fromStatus, ctx.intl), to: statusVM(event.toStatus, ctx.intl) }
          : null;
      return {
        id: event.id,
        kind: TIMELINE_KINDS[event.type],
        title: timelineTitle(event, ctx),
        detail: event.text,
        at: relativeTime(event.occurredAt, ctx),
        source: automatic
          ? event.evidence?.mailMessageId
            ? sourceVM("rule", ctx.intl)
            : sourceVM("rule", ctx.intl, ctx.intl.formatMessage(messages.sourceAutomatic))
          : sourceVM("you", ctx.intl),
        mailMessageId: event.evidence?.mailMessageId ?? null,
        move,
        reason: automatic ? (event.evidence?.reason ?? null) : null,
        undo: automatic && move ? undoVM(application, event, events, ctx) : null,
        reverted: reverted.has(event.id),
        pendingSync: ctx.pendingWrites.has(event.id),
      };
    });
}

/** Status, channel, date, documents and "what usually happens next" (`ApplicationSummaryBlock`). */
export function applicationSummaryVM(
  application: Application,
  data: Pick<UserData, "cvs" | "coverLetters">,
  ctx: ModelContext,
): ApplicationSummaryVM {
  const cv = data.cvs.find((candidate) => candidate.id === application.cvId);
  const letter = data.coverLetters.find((candidate) => candidate.id === application.coverLetterId);
  const nextStep = NEXT_STEP_MESSAGES[application.status];
  return {
    applicationId: application.id,
    status: statusVM(application.status, ctx.intl),
    channel: application.channel ? ctx.intl.formatMessage(CHANNEL_MESSAGES[application.channel]) : null,
    appliedAt: application.appliedAt ? relativeTime(application.appliedAt, ctx) : null,
    cv: cv ? { id: cv.id, label: cv.title } : null,
    coverLetter: letter ? { id: letter.id, label: letter.title } : null,
    nextStep: nextStep ? ctx.intl.formatMessage(nextStep) : null,
  };
}
