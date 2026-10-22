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
import { companyVM, sourceVM, STATUS_LABELS, statusVM } from "./vocabulary";

/** Mail categories as shown in the UI; `rejection` reads "Decision" (D18). */
export const MAIL_CATEGORY_LABELS: Readonly<Record<MailCategory, string>> = {
  application_received: "Application received",
  rejection: "Decision",
  interview_invite: "Interview invite",
  assessment: "Assessment",
  offer: "Offer",
  recruiter_outreach: "Recruiter",
  info_request: "Info request",
  job_alert: "Job alert",
  other_job: "Other",
  not_job: "Not job mail",
};

export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = {
  email: "Email",
  external_link: "Company site",
  referral: "Referral",
  recruiter: "Recruiter",
  other: "Other",
};

const DATE_KIND_LABELS: Readonly<Record<Exclude<ExtractedDateKind, "other">, string>> = {
  interview: "Interview",
  assessment_deadline: "Assessment due",
  reply_deadline: "Reply by",
  start_date: "Start date",
};

/** "Acme · Frontend Engineer": how an application is named in sentences and pickers. */
export function applicationLabel(application: Pick<Application, "company" | "role">): string {
  return `${application.company} · ${application.role}`;
}

/** One line per category, hedged below the auto-apply threshold (mail-review.md copy notes). */
function mailHeadline(category: MailCategory, company: string, hedged: boolean): string {
  const lines: Record<MailCategory, readonly [hedged: string, factual: string]> = {
    application_received: [
      `Looks like ${company} received your application`,
      `${company} received your application`,
    ],
    rejection: [`Looks like a decision from ${company}`, `${company} has decided not to move forward`],
    interview_invite: [`Looks like an interview invite from ${company}`, `Interview invite from ${company}`],
    assessment: [`Looks like an assessment from ${company}`, `Assessment from ${company}`],
    offer: [`Looks like an offer from ${company}`, `Offer from ${company}`],
    recruiter_outreach: [
      `Looks like a recruiter message about ${company}`,
      `Recruiter message about ${company}`,
    ],
    info_request: [`Looks like ${company} needs more information`, `${company} needs more information`],
    job_alert: ["Looks like a job alert", "Job alert"],
    other_job: [`Looks like job mail from ${company}`, `Job mail from ${company}`],
    not_job: ["Doesn't look like job mail", "Not job mail"],
  };
  return lines[category][hedged ? 0 : 1];
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
        ? `Same email thread as your application of ${shortDate(application.appliedAt, ctx)}`
        : "Same email thread as your application";
    case "ats_company_role":
      return `Sent from ${domain} and mentions this role`;
    case "company_domain":
      return `Sent from ${domain}, the company's own domain`;
    case "llm":
      return "Matched by AI from the company and role named in the email";
    case "none":
      return "We couldn't match this email to an application";
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
          from: application ? statusVM(application.status) : null,
          to: statusVM(message.suggestedStatus),
        };
  return {
    messageId: message.id,
    company: companyVM(company, application?.companyDomain ?? null),
    subject: message.subject,
    from: message.from.name ? `${message.from.name} <${message.from.address}>` : message.from.address,
    account: data.mailAccounts.find((account) => account.id === message.accountId)?.address ?? "",
    receivedAt: relativeTime(message.receivedAt, ctx),
    category: { key: message.category, label: MAIL_CATEGORY_LABELS[message.category] },
    headline: mailHeadline(message.category, company, hedged),
    hedged,
    move,
    reason: linkReason(message.linkStrength, message.from.address, application, ctx),
    evidence: message.snippet || null,
    dates: message.extracted.dates.map((date) => ({
      label: date.kind === "other" ? date.label : DATE_KIND_LABELS[date.kind],
      at: dayAndTime(date.at, ctx),
    })),
    source: sourceVM("mail"),
    pendingSync: ctx.pendingWrites.has(message.id),
  };
}

function undoVM(
  application: Application,
  event: ApplicationEvent,
  events: readonly ApplicationEvent[],
): UndoVM {
  const check = canRevert({ application, event, events });
  if (check.allowed) return { available: true };
  return {
    available: false,
    reason:
      check.reason === "already_reverted" ? "Already undone." : "Can't undo — the status changed since.",
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
    from: statusVM(event.fromStatus),
    to: statusVM(event.toStatus),
    occurredAt: relativeTime(event.occurredAt, ctx),
    source: sourceVM("rule", mail ? `From an email by ${application.company}` : "Automatic"),
    reason: event.evidence?.reason ?? "",
    mailMessageId: mail?.id ?? null,
    undo: undoVM(application, event, data.applicationEvents),
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
          message: `No reply in ${ghosted.silentDays} days. Mark as no response?`,
          primaryLabel: "Mark as no response",
          secondaryLabel: "Keep waiting",
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
          message: `Applied ${new Intl.RelativeTimeFormat(ctx.locale, { numeric: "auto" }).format(calendarDaysFromNow(followUp.since, ctx), "day")} · no reply yet`,
          primaryLabel: "Draft follow-up",
          secondaryLabel: "Not needed",
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

function timelineTitle(event: ApplicationEvent): string {
  switch (event.type) {
    case "created":
      return event.toStatus ? `Added as ${STATUS_LABELS[event.toStatus]}` : "Added to Tracker";
    case "status_changed":
      if (!event.toStatus) return "Status changed";
      return event.revertsEventId === null
        ? `Moved to ${STATUS_LABELS[event.toStatus]}`
        : `Undid a move · back to ${STATUS_LABELS[event.toStatus]}`;
    case "note":
      return "Note";
    case "mail_received":
      return "Email received";
    case "mail_sent":
      return "Email sent";
    case "interview_scheduled":
      return "Interview scheduled";
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
          ? { from: statusVM(event.fromStatus), to: statusVM(event.toStatus) }
          : null;
      return {
        id: event.id,
        kind: TIMELINE_KINDS[event.type],
        title: timelineTitle(event),
        detail: event.text,
        at: relativeTime(event.occurredAt, ctx),
        source: automatic
          ? sourceVM("rule", event.evidence?.mailMessageId ? "Automatic · Mail" : "Automatic")
          : sourceVM("you"),
        mailMessageId: event.evidence?.mailMessageId ?? null,
        move,
        reason: automatic ? (event.evidence?.reason ?? null) : null,
        undo: automatic && move ? undoVM(application, event, events) : null,
        reverted: reverted.has(event.id),
        pendingSync: ctx.pendingWrites.has(event.id),
      };
    });
}

/** "What usually happens next" per status; closed outcomes have none. */
const NEXT_STEPS: Partial<Readonly<Record<ApplicationStatus, string>>> = {
  saved: "Apply when you're ready.",
  preparing: "Finish your CV and cover letter, then apply.",
  applied: "Companies often reply within one to two weeks.",
  acknowledged: "They have your application. A first reply often takes one to two weeks.",
  screening: "Next is usually a call with a recruiter or the hiring manager.",
  interviewing: "Next is usually another round or a decision.",
  offer: "Take the time you need to review the offer before you reply.",
};

export function applicationSummaryVM(
  application: Application,
  data: Pick<UserData, "cvs" | "coverLetters">,
  ctx: ModelContext,
): ApplicationSummaryVM {
  const cv = data.cvs.find((candidate) => candidate.id === application.cvId);
  const letter = data.coverLetters.find((candidate) => candidate.id === application.coverLetterId);
  return {
    applicationId: application.id,
    status: statusVM(application.status),
    channel: application.channel ? CHANNEL_LABELS[application.channel] : null,
    appliedAt: application.appliedAt ? relativeTime(application.appliedAt, ctx) : null,
    cv: cv ? { id: cv.id, label: cv.title } : null,
    coverLetter: letter ? { id: letter.id, label: letter.title } : null,
    nextStep: NEXT_STEPS[application.status] ?? null,
  };
}
