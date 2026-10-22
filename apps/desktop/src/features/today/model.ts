/**
 * Today (desktop): what needs attention, in a fixed section order (today-home.md "Decision —
 * Desktop"): Next up · To review · Follow-ups · Deadlines · New matches. Empty sections are left
 * out, never shown with "0". There is no greeting (decisions.md U8): the header is the title and
 * the date only. Pure: everything time- and locale-dependent comes from `ctx`.
 */
import { type Application, type Interview, isActiveStatus, revertedBy, type ReviewState } from "@bfhr/core";
import { defineMessages, type MessageDescriptor } from "react-intl";
import type { AutoChangeVM, NudgeVM, ReviewProposalVM } from "../../shared/model/blocks";
import {
  applicationSummaryVM,
  autoChangeVM,
  nudgeVMs,
  reviewProposalVM,
} from "../../shared/model/build-blocks";
import { calendarDaysFromNow, clockTime, dayAndTime, relativeTime } from "../../shared/model/format";
import type { CompanyVM, MatchVM, ModelContext, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, matchVM, STATUS_MESSAGES } from "../../shared/model/vocabulary";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Next up shows the next interview starting within this many hours (today-home.md OQ2). */
const NEXT_UP_WINDOW_HOURS = 48;
/** "Join" appears this many minutes before the start. */
const JOIN_LEAD_MINUTES = 10;
/**
 * Automatic changes stay on Today for this many days after they happened, unless undone.
 * There is no "acknowledged" state on the data yet, so the window stands in for it; older ones
 * live on in the application timeline and Mail › Updates (D11).
 */
const AUTO_UPDATE_WINDOW_DAYS = 7;
/** Deadlines due within this many days are listed (the agenda rail shows 7). */
const DEADLINE_WINDOW_DAYS = 14;
/** Calendar days the agenda rail covers, today included. */
const AGENDA_DAYS = 7;
/** New matches shows at most this many jobs. */
const MAX_MATCHES = 3;

/* ------------------------------------------------------------------------------------------------
 * View-model types
 * ---------------------------------------------------------------------------------------------- */

/** What every `AttentionRow` shows: company chip, a one-line title and a one-line context. */
interface AttentionItemBase {
  /** Stable across rebuilds (`<kind>:<document id>`): selection, J/K focus and `?item=`. */
  readonly id: string;
  readonly company: CompanyVM;
  readonly title: string;
  /** Second line ("Product Engineer (Frontend) · Round 2"). */
  readonly context: string | null;
  /** A local write on the item's document hasn't reached the server yet: show `SyncGlyph`. */
  readonly pendingSync: boolean;
}

/** One interviewer or panel member. */
export interface InterviewPersonVM {
  readonly name: string;
  readonly title: string | null;
}

/** Next up: the next interview within 48 h (`NextUpCard`). */
export interface InterviewItemVM extends AttentionItemBase {
  readonly kind: "interview";
  readonly interviewId: string;
  readonly applicationId: string;
  readonly role: string;
  /** "Round 2". */
  readonly round: string;
  /** "Today, 15:00", absolute in the tooltip. */
  readonly startsAt: TimeVM;
  /** "15:00–17:00" in the user's zone. */
  readonly timeRange: string;
  /**
   * The start in the interviewer's zone when its wall clock differs from the user's:
   * "10:00 New York time", "Friday, 01:00 Tokyo time". Null when both read the same.
   */
  readonly interviewerTime: string | null;
  /** Address for on-site rounds. */
  readonly location: string | null;
  /** Meeting link; `joinable` turns true `JOIN_LEAD_MINUTES` before the start until the end. */
  readonly join: { readonly url: string; readonly joinableAt: TimeVM; readonly joinable: boolean } | null;
  readonly people: readonly InterviewPersonVM[];
  /** The "Prep" disclosure: the CV sent, the job, the user's notes. */
  readonly prep: {
    readonly cv: { readonly id: string; readonly label: string } | null;
    readonly job: { readonly id: string; readonly label: string } | null;
    readonly notes: string | null;
  };
}

/** To review: an email waiting for confirmation (`ReviewDetailPane`). */
export interface ReviewItemVM extends AttentionItemBase {
  readonly kind: "review";
  readonly proposal: ReviewProposalVM;
}

/** To review: a change applied automatically, FYI with Undo (`AutoChangeRow`). */
export interface AutoUpdateItemVM extends AttentionItemBase {
  readonly kind: "autoUpdate";
  readonly change: AutoChangeVM;
}

/** Follow-ups: a follow-up or no-response suggestion (`NudgeCard`). */
export interface FollowUpItemVM extends AttentionItemBase {
  readonly kind: "followUp";
  readonly nudge: NudgeVM;
  /** The application's job: "Draft follow-up" opens its Apply panel (IA.md deep link `jobs/{id}/apply`). */
  readonly jobId: string | null;
}

export type DeadlineKind = "assessment" | "offerReply" | "jobClosing";

/** Deadlines: an assessment, an offer reply date or a saved job's closing date. */
export interface DeadlineItemVM extends AttentionItemBase {
  readonly kind: "deadline";
  readonly deadlineKind: DeadlineKind;
  /** Relative chip: "Today, 23:59", "Tomorrow, 17:00", "In 4 days", "29 Oct, 18:00". */
  readonly due: TimeVM;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  /** The email the date came from ("View source"). */
  readonly mailMessageId: string | null;
}

/** New matches: a top new job with why it matches (`MatchRow`). */
export interface MatchItemVM extends AttentionItemBase {
  readonly kind: "match";
  readonly jobId: string;
  readonly match: MatchVM;
  /** One line, from the rule-based match reasons ("Remote role you can take from Türkiye · …"). */
  readonly reason: string | null;
  /** Saved today from this row: it stays here with its Save toggle on until midnight. */
  readonly saved: boolean;
}

/** One row on Today. `kind` picks the row variant and its detail pane. */
export type AttentionItemVM =
  InterviewItemVM | ReviewItemVM | AutoUpdateItemVM | FollowUpItemVM | DeadlineItemVM | MatchItemVM;

export type TodaySectionId = "nextUp" | "toReview" | "followUps" | "deadlines" | "newMatches";

export interface TodaySectionVM {
  readonly id: TodaySectionId;
  /** "Next up", "To review", "Follow-ups", "Deadlines", "New matches". */
  readonly title: string;
  /**
   * Plain-text count for the header ("To review · 3"); null for Next up (one hero card) and when
   * nothing in the section is counted. To review counts only emails waiting for confirmation, the
   * same number as the Mail badge (D01); automatic changes are listed but not counted.
   */
  readonly countLabel: string | null;
  /** Footer link label ("See all in Jobs"); null when the section has none. */
  readonly seeAllLabel: string | null;
  readonly items: readonly AttentionItemVM[];
}

/** One handled item in the collapsed "Done today" group. */
export interface DoneItemVM {
  readonly id: string;
  readonly kind: "review" | "autoUpdate";
  readonly company: CompanyVM;
  readonly title: string;
  /** "Confirmed", "Changed", "Marked as not job mail", "Undone · back to Applied". */
  readonly outcome: string;
  readonly doneAt: TimeVM;
}

export interface DoneTodayVM {
  /** "Done today". */
  readonly title: string;
  readonly countLabel: string;
  readonly items: readonly DoneItemVM[];
}

export interface AgendaEntryVM {
  readonly id: string;
  readonly kind: "interview" | "deadline";
  /** The Today item this entry selects; null when it isn't on the list (interviews after 48 h). */
  readonly itemId: string | null;
  readonly applicationId: string | null;
  readonly company: CompanyVM;
  readonly title: string;
  /** "15:00". */
  readonly time: string;
  readonly at: TimeVM;
}

export interface AgendaDayVM {
  readonly id: string;
  /** "Today", "Tomorrow", "Tuesday 27 October". */
  readonly label: string;
  readonly entries: readonly AgendaEntryVM[];
}

/** The read-only rail at ≥ 1440 px: interviews and deadlines of the next 7 days, by day. */
export interface AgendaVM {
  /** "Next 7 days". */
  readonly title: string;
  /** Only days with entries, in order. */
  readonly days: readonly AgendaDayVM[];
  /** "No interviews this week" when `days` is empty, else null. */
  readonly emptyLabel: string | null;
}

/** First run: the dismissible setup card (`EmptyState` kind `firstUse`). */
export interface FirstUseVM {
  /** No mail account connected yet. */
  readonly connectMail: {
    /** "Connect your email to see interview invites and replies here." */
    readonly message: string;
    /** "About 2 minutes." */
    readonly estimate: string;
    /** "Connect email": opens the connect flow. */
    readonly actionLabel: string;
  } | null;
  /** No jobs and no applications yet: "Find jobs" goes to Jobs. */
  readonly findJobs: { readonly actionLabel: string } | null;
}

export interface TodayModel {
  /** "Today". */
  readonly title: string;
  /** "Thursday 22 October" in the user's locale and zone. No greeting (U8). */
  readonly dateLabel: string;
  /** Fixed order, empty sections left out. */
  readonly sections: readonly TodaySectionVM[];
  /** Every item in display order, for J/K and ↑/↓. */
  readonly items: readonly AttentionItemVM[];
  /** `params.item` when it names an item, else the first item; null when there are none. */
  readonly selectedId: string | null;
  /**
   * Items handled today (until local midnight), collapsed at the bottom; null when none.
   * Only reviewed emails and undone automatic changes: Done, Snooze and Not needed on computed
   * items (follow-ups, deadlines, interviews) aren't stored yet (today-home.md OQ1), so they
   * can't be listed here.
   */
  readonly doneToday: DoneTodayVM | null;
  readonly agenda: AgendaVM;
  /** Set-up card(s) for a new account; null once mail is connected. */
  readonly firstUse: FirstUseVM | null;
  /** Nothing open and nothing to set up (`EmptyState` kind `caughtUp`); null otherwise. */
  readonly caughtUp: { readonly message: string } | null;
  /**
   * "Pick a date…" in the snooze menu: the earliest day the date field allows (tomorrow, as
   * `YYYY-MM-DD` in the user's zone; "Later today" covers today) and the zone the chosen day is
   * read in (`snoozeDateInstant`).
   */
  readonly snoozeDate: { readonly min: string; readonly timeZone: string };
}

/* ------------------------------------------------------------------------------------------------
 * Messages (today-home.md "Copy notes", D18, D19, states.md)
 * ---------------------------------------------------------------------------------------------- */

const SECTION_TITLE_MESSAGES: Readonly<Record<TodaySectionId, MessageDescriptor>> = defineMessages({
  nextUp: {
    id: "today.section.nextUp",
    defaultMessage: "Next up",
    description: "Section title: the next interview",
  },
  toReview: {
    id: "today.section.toReview",
    defaultMessage: "To review",
    description:
      "Section title: emails waiting for confirmation and automatic changes. Same term as the Mail chip",
  },
  followUps: { id: "today.section.followUps", defaultMessage: "Follow-ups", description: "Section title" },
  deadlines: { id: "today.section.deadlines", defaultMessage: "Deadlines", description: "Section title" },
  newMatches: {
    id: "today.section.newMatches",
    defaultMessage: "New matches",
    description: "Section title: new top jobs",
  },
});

const DEADLINE_MESSAGES: Readonly<Record<DeadlineKind, MessageDescriptor>> = defineMessages({
  assessment: {
    id: "today.deadline.assessment",
    defaultMessage: "Assessment due",
    description: "Deadline row title, followed by a date chip: a take-home assessment",
  },
  offerReply: {
    id: "today.deadline.offerReply",
    defaultMessage: "Offer reply due",
    description: "Deadline row title, next to a date chip: the date to answer a job offer by",
  },
  jobClosing: {
    id: "today.deadline.jobClosing",
    defaultMessage: "Posting closes",
    description: "Deadline row title, followed by a date chip: a saved job's closing date",
  },
});

const REVIEW_OUTCOME_MESSAGES: Readonly<Partial<Record<ReviewState, MessageDescriptor>>> = defineMessages({
  confirmed: {
    id: "today.done.confirmed",
    defaultMessage: "Confirmed",
    description: "Done today: the user confirmed an email",
  },
  corrected: {
    id: "today.done.corrected",
    defaultMessage: "Changed",
    description: "Done today: the user changed what we found",
  },
  dismissed: {
    id: "today.done.dismissed",
    defaultMessage: "Marked as not job mail",
    description: "Done today",
  },
});

const messages = defineMessages({
  title: { id: "today.title", defaultMessage: "Today", description: "Screen title" },
  caughtUp: { id: "today.caughtUp", defaultMessage: "You're all caught up. New updates will show up here." },
  connectMail: {
    id: "today.firstUse.connectMail",
    defaultMessage: "Connect your email to see interview invites and replies here.",
  },
  connectEstimate: {
    id: "today.firstUse.connectEstimate",
    defaultMessage: "About 2 minutes.",
    description: "How long connecting an email account takes",
  },
  connectAction: {
    id: "today.firstUse.connectAction",
    defaultMessage: "Connect email",
    description: "Button",
  },
  findJobs: {
    id: "today.firstUse.findJobs",
    defaultMessage: "Find jobs",
    description: "Button: goes to Jobs",
  },
  seeAllMatches: {
    id: "today.matches.seeAll",
    defaultMessage: "See all in Jobs",
    description: "Link under New matches. 'Jobs' is the sidebar item",
  },
  doneToday: {
    id: "today.done.title",
    defaultMessage: "Done today",
    description: "Collapsed group of items handled today",
  },
  undone: {
    id: "today.done.undone",
    defaultMessage: "Undone · back to {status}",
    description: "Done today: the user undid an automatic change. {status} is a status name",
  },
  agendaTitle: {
    id: "today.agenda.title",
    defaultMessage: "{days, plural, one {Next # day} other {Next # days}}",
    description: "Title of the agenda rail",
  },
  agendaEmpty: { id: "today.agenda.empty", defaultMessage: "No interviews this week" },
  round: {
    id: "today.interview.round",
    defaultMessage: "Round {round}",
    description: "Interview round number",
  },
  interviewContext: {
    id: "today.interview.context",
    defaultMessage: "{role} · {round}",
    description: "Interview row context: job title and the round ('Round 2')",
  },
  interviewerTime: {
    id: "today.interview.interviewerTime",
    defaultMessage: "{time} {city} time",
    description:
      "The interview time in the interviewer's zone: '10:00 New York time'. {time} may be 'Tomorrow, 10:00'",
  },
  autoRejected: {
    id: "today.autoUpdate.rejected",
    defaultMessage: "{company} decided not to move forward. We updated the application.",
    description: "An automatic rejection from an email (D18): neutral, no 'unfortunately'",
  },
  autoFromEmail: {
    id: "today.autoUpdate.fromEmail",
    defaultMessage: "Moved to {status} — from an email by {company}",
    description: "An automatic status change. {status} is a status name, {company} the sender's company",
  },
  autoMoved: {
    id: "today.autoUpdate.automatic",
    defaultMessage: "Moved to {status} automatically",
    description: "An automatic status change without an email. {status} is a status name",
  },
});

/* ------------------------------------------------------------------------------------------------
 * Builders
 * ---------------------------------------------------------------------------------------------- */

/** "Thursday 22 October" (en-GB order; other locales follow `Intl`). */
function longDate(date: Date, ctx: ModelContext): string {
  return new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function interviewerTime(interview: Interview, ctx: ModelContext): string | null {
  const city = (interview.timezone.split("/").at(-1) ?? interview.timezone).replaceAll("_", " ");
  const theirs = { ...ctx, timeZone: interview.timezone };
  const sameDay =
    calendarDaysFromNow(interview.startsAt, theirs) === calendarDaysFromNow(interview.startsAt, ctx);
  const theirClock = clockTime(interview.startsAt, theirs);
  if (sameDay && theirClock === clockTime(interview.startsAt, ctx)) return null;
  const time = sameDay ? theirClock : dayAndTime(interview.startsAt, theirs).label;
  return ctx.intl.formatMessage(messages.interviewerTime, { time, city });
}

/** Interviews of open applications that haven't ended, soonest first. */
function upcomingInterviews(
  data: UserData,
  ctx: ModelContext,
): { interview: Interview; application: Application }[] {
  return data.interviews
    .flatMap((interview) => {
      const application = data.applications.find((candidate) => candidate.id === interview.applicationId);
      const endsAt = interview.startsAt.getTime() + interview.durationMinutes * 60_000;
      return application && isActiveStatus(application.status) && endsAt > ctx.now.getTime()
        ? [{ interview, application }]
        : [];
    })
    .sort((a, b) => a.interview.startsAt.getTime() - b.interview.startsAt.getTime());
}

function interviewItem(
  interview: Interview,
  application: Application,
  data: UserData,
  ctx: ModelContext,
): InterviewItemVM {
  const start = interview.startsAt.getTime();
  const end = new Date(start + interview.durationMinutes * 60_000);
  const joinableAt = new Date(start - JOIN_LEAD_MINUTES * 60_000);
  const job = data.jobs.find((candidate) => candidate.id === application.jobId);
  const round = ctx.intl.formatMessage(messages.round, { round: interview.round });
  return {
    kind: "interview",
    id: `interview:${interview.id}`,
    interviewId: interview.id,
    applicationId: application.id,
    company: companyVM(application.company, application.companyDomain),
    title: interview.title,
    context: ctx.intl.formatMessage(messages.interviewContext, { role: application.role, round }),
    role: application.role,
    round,
    startsAt: dayAndTime(interview.startsAt, ctx),
    timeRange: `${clockTime(interview.startsAt, ctx)}–${clockTime(end, ctx)}`,
    interviewerTime: interviewerTime(interview, ctx),
    location: interview.location,
    join: interview.meetingUrl
      ? {
          url: interview.meetingUrl,
          joinableAt: dayAndTime(joinableAt, ctx),
          joinable: ctx.now >= joinableAt && ctx.now < end,
        }
      : null,
    people: interview.people.map((person) => ({ name: person.name, title: person.title })),
    prep: {
      cv: applicationSummaryVM(application, data, ctx).cv,
      job: job ? { id: job.id, label: job.title } : null,
      notes: interview.prepNotes.trim() || null,
    },
    pendingSync: ctx.pendingWrites.has(interview.id),
  };
}

function reviewItems(data: UserData, ctx: ModelContext): ReviewItemVM[] {
  return data.mailMessages
    .filter((message) => message.reviewState === "pending")
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .map((message) => {
      const proposal = reviewProposalVM(message, data, ctx);
      return {
        kind: "review",
        id: `review:${message.id}`,
        company: proposal.company,
        title: proposal.headline,
        context: proposal.subject,
        proposal,
        pendingSync: proposal.pendingSync,
      };
    });
}

/** "Moved to Interviewing — from an email by Acme" / D18 wording for decisions. */
function autoUpdateTitle(change: AutoChangeVM, ctx: ModelContext): string {
  const company = change.company.name;
  if (change.to.key === "rejected") return ctx.intl.formatMessage(messages.autoRejected, { company });
  return change.mailMessageId
    ? ctx.intl.formatMessage(messages.autoFromEmail, { status: change.to.label, company })
    : ctx.intl.formatMessage(messages.autoMoved, { status: change.to.label });
}

/** Automatic status changes of the last `AUTO_UPDATE_WINDOW_DAYS` days that weren't undone, newest first. */
function autoUpdateItems(data: UserData, ctx: ModelContext): AutoUpdateItemVM[] {
  const since = ctx.now.getTime() - AUTO_UPDATE_WINDOW_DAYS * DAY_MS;
  return data.applicationEvents
    .filter(
      (event) =>
        event.occurredAt.getTime() >= since &&
        event.occurredAt <= ctx.now &&
        revertedBy(event.id, data.applicationEvents) === null,
    )
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .flatMap((event) => {
      const change = autoChangeVM(event, data, ctx);
      if (!change) return [];
      return [
        {
          kind: "autoUpdate",
          id: `autoUpdate:${event.id}`,
          company: change.company,
          title: autoUpdateTitle(change, ctx),
          context: change.role,
          change,
          pendingSync: change.pendingSync,
        } satisfies AutoUpdateItemVM,
      ];
    });
}

function followUpItems(data: UserData, ctx: ModelContext): FollowUpItemVM[] {
  return nudgeVMs(data, ctx).map((nudge) => ({
    kind: "followUp",
    id: `followUp:${nudge.applicationId}`,
    company: nudge.company,
    title: nudge.role,
    context: nudge.message,
    nudge,
    jobId: data.applications.find((application) => application.id === nudge.applicationId)?.jobId ?? null,
    pendingSync: nudge.pendingSync,
  }));
}

/** "Today, 23:59" / "Tomorrow, 17:00" close by, "In 4 days" within a week, then "29 Oct, 18:00". */
function deadlineChip(date: Date, ctx: ModelContext): TimeVM {
  const days = calendarDaysFromNow(date, ctx);
  if (days >= 2 && days < 7) {
    const relative = relativeTime(date, ctx);
    return {
      ...relative,
      label: relative.label.charAt(0).toLocaleUpperCase(ctx.locale) + relative.label.slice(1),
    };
  }
  return dayAndTime(date, ctx);
}

/**
 * Upcoming deadlines within `DEADLINE_WINDOW_DAYS`, soonest first:
 * - assessment deadlines and offer reply dates extracted from handled emails (pending ones show
 *   their dates inside the review proposal instead) of open applications;
 * - closing dates (`job.expiresAt`) of jobs that are saved and not applied to yet.
 */
function deadlineItems(data: UserData, ctx: ModelContext): DeadlineItemVM[] {
  const now = ctx.now.getTime();
  const until = now + DEADLINE_WINDOW_DAYS * DAY_MS;
  const inWindow = (date: Date) => date.getTime() >= now && date.getTime() <= until;
  const found: { at: Date; item: DeadlineItemVM }[] = [];
  const seen = new Set<string>();

  for (const message of data.mailMessages) {
    if (message.reviewState === "pending" || message.reviewState === "dismissed") continue;
    const application = data.applications.find((candidate) => candidate.id === message.applicationId);
    if (!application || !isActiveStatus(application.status)) continue;
    message.extracted.dates.forEach((date, index) => {
      const deadlineKind: DeadlineKind | null =
        date.kind === "assessment_deadline"
          ? "assessment"
          : date.kind === "reply_deadline" && message.category === "offer"
            ? "offerReply"
            : null;
      const key = `${application.id}|${deadlineKind}|${date.at.toISOString()}`;
      if (deadlineKind === null || !inWindow(date.at) || seen.has(key)) return;
      seen.add(key);
      found.push({
        at: date.at,
        item: {
          kind: "deadline",
          id: `deadline:${message.id}:${index}`,
          deadlineKind,
          company: companyVM(application.company, application.companyDomain),
          title: ctx.intl.formatMessage(DEADLINE_MESSAGES[deadlineKind]),
          context: application.role,
          due: deadlineChip(date.at, ctx),
          applicationId: application.id,
          jobId: application.jobId,
          mailMessageId: message.id,
          pendingSync: ctx.pendingWrites.has(message.id),
        },
      });
    });
  }

  for (const job of data.jobs) {
    if (!job.expiresAt || !inWindow(job.expiresAt)) continue;
    const application = data.applications.find((candidate) => candidate.jobId === job.id);
    const saved = application
      ? application.status === "saved" || application.status === "preparing"
      : data.jobMatches.some((match) => match.id === job.id && match.state === "saved");
    if (!saved) continue;
    found.push({
      at: job.expiresAt,
      item: {
        kind: "deadline",
        id: `deadline:job:${job.id}`,
        deadlineKind: "jobClosing",
        company: companyVM(job.company, job.companyDomain),
        title: ctx.intl.formatMessage(DEADLINE_MESSAGES.jobClosing),
        context: job.title,
        due: deadlineChip(job.expiresAt, ctx),
        applicationId: application?.id ?? null,
        jobId: job.id,
        mailMessageId: null,
        pendingSync: ctx.pendingWrites.has(application?.id ?? job.id),
      },
    });
  }

  return found.sort((a, b) => a.at.getTime() - b.at.getTime()).map(({ item }) => item);
}

/**
 * Up to `MAX_MATCHES` top matches that are new, or were saved from Today today (they keep their
 * row with Save on until midnight). Jobs already in Tracker and hidden companies are left out.
 */
function matchItems(data: UserData, ctx: ModelContext): MatchItemVM[] {
  const hidden = data.profile.hiddenCompanies.map((company) => company.name.toLocaleLowerCase("en"));
  return data.jobMatches
    .filter(
      (match) =>
        match.state === "new" ||
        (match.state === "saved" &&
          match.stateChangedAt !== null &&
          calendarDaysFromNow(match.stateChangedAt, ctx) === 0),
    )
    .flatMap((match) => {
      const job = data.jobs.find((candidate) => candidate.id === match.id);
      if (
        !job ||
        hidden.includes(job.company.toLocaleLowerCase("en")) ||
        data.applications.some((application) => application.jobId === job.id)
      )
        return [];
      return [{ match, job }];
    })
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, MAX_MATCHES)
    .map(({ match, job }) => {
      const reasons = match.reasons
        .filter((factor) => factor.status === "met" && factor.source === "rule")
        .sort((a, b) => (a.impact === b.impact ? 0 : a.impact === "most" ? -1 : 1))
        .slice(0, 2)
        .map((factor) => factor.label);
      const reason = reasons.length > 0 ? reasons.join(" · ") : null;
      return {
        kind: "match",
        id: `match:${match.id}`,
        jobId: job.id,
        company: companyVM(job.company, job.companyDomain),
        title: job.title,
        context: reason,
        match: matchVM(match.score, ctx.intl),
        reason,
        saved: match.state === "saved",
        pendingSync: ctx.pendingWrites.has(match.id),
      };
    });
}

function doneToday(data: UserData, ctx: ModelContext): DoneTodayVM | null {
  const today = (date: Date) => calendarDaysFromNow(date, ctx) === 0 && date <= ctx.now;
  const done: { at: Date; item: DoneItemVM }[] = [];
  for (const message of data.mailMessages) {
    const outcome = REVIEW_OUTCOME_MESSAGES[message.reviewState];
    if (!outcome || !message.reviewedAt || !today(message.reviewedAt)) continue;
    const proposal = reviewProposalVM(message, data, ctx);
    done.push({
      at: message.reviewedAt,
      item: {
        id: `done:review:${message.id}`,
        kind: "review",
        company: proposal.company,
        title: proposal.subject,
        outcome: ctx.intl.formatMessage(outcome),
        doneAt: relativeTime(message.reviewedAt, ctx),
      },
    });
  }
  for (const event of data.applicationEvents) {
    if (event.revertsEventId === null || event.toStatus === null || !today(event.occurredAt)) continue;
    const application = data.applications.find((candidate) => candidate.id === event.applicationId);
    if (!application) continue;
    done.push({
      at: event.occurredAt,
      item: {
        id: `done:autoUpdate:${event.revertsEventId}`,
        kind: "autoUpdate",
        company: companyVM(application.company, application.companyDomain),
        title: application.role,
        outcome: ctx.intl.formatMessage(messages.undone, {
          status: ctx.intl.formatMessage(STATUS_MESSAGES[event.toStatus]),
        }),
        doneAt: relativeTime(event.occurredAt, ctx),
      },
    });
  }
  if (done.length === 0) return null;
  const items = done.sort((a, b) => b.at.getTime() - a.at.getTime()).map(({ item }) => item);
  return {
    title: ctx.intl.formatMessage(messages.doneToday),
    countLabel: ctx.intl.formatNumber(items.length),
    items,
  };
}

function agenda(
  data: UserData,
  deadlines: readonly DeadlineItemVM[],
  nextUpId: string | null,
  ctx: ModelContext,
): AgendaVM {
  const entries: { at: Date; entry: AgendaEntryVM }[] = [];
  for (const { interview, application } of upcomingInterviews(data, ctx)) {
    const itemId = `interview:${interview.id}`;
    entries.push({
      at: interview.startsAt,
      entry: {
        id: `agenda:${itemId}`,
        kind: "interview",
        itemId: itemId === nextUpId ? itemId : null,
        applicationId: application.id,
        company: companyVM(application.company, application.companyDomain),
        title: interview.title,
        time: clockTime(interview.startsAt, ctx),
        at: dayAndTime(interview.startsAt, ctx),
      },
    });
  }
  for (const deadline of deadlines) {
    const at = new Date(deadline.due.iso);
    entries.push({
      at,
      entry: {
        id: `agenda:${deadline.id}`,
        kind: "deadline",
        itemId: deadline.id,
        applicationId: deadline.applicationId,
        company: deadline.company,
        title: deadline.title,
        time: clockTime(at, ctx),
        at: dayAndTime(at, ctx),
      },
    });
  }

  const days: { offset: number; label: string; entries: AgendaEntryVM[] }[] = [];
  for (const { at, entry } of entries.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const offset = calendarDaysFromNow(at, ctx);
    if (offset < 0 || offset >= AGENDA_DAYS) continue;
    let day = days.find((candidate) => candidate.offset === offset);
    if (!day) {
      const word = new Intl.RelativeTimeFormat(ctx.locale, { numeric: "auto" }).format(offset, "day");
      const label =
        offset <= 1 ? word.charAt(0).toLocaleUpperCase(ctx.locale) + word.slice(1) : longDate(at, ctx);
      day = { offset, label, entries: [] };
      days.push(day);
    }
    day.entries.push(entry);
  }

  return {
    title: ctx.intl.formatMessage(messages.agendaTitle, { days: AGENDA_DAYS }),
    days: days.map(({ offset, label, entries: dayEntries }) => ({
      id: `day+${offset}`,
      label,
      entries: dayEntries,
    })),
    emptyLabel: days.length === 0 ? ctx.intl.formatMessage(messages.agendaEmpty) : null,
  };
}

/** Hour of the day an item snoozed to a picked date comes back, in the user's zone. */
const SNOOZE_DATE_HOUR = 9;

/** Wall-clock fields of `date` in `timeZone`, as the UTC epoch of that wall time. */
function zonedWallTime(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** `YYYY-MM-DD` of the calendar day `days` after `now`'s day in `timeZone` (date-input format). */
function zonedIsoDay(now: Date, days: number, timeZone: string): string {
  return new Date(zonedWallTime(now, timeZone) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The instant a snooze to the picked day `value` (`YYYY-MM-DD` from the date field) ends:
 * `SNOOZE_DATE_HOUR`:00 on that day in `timeZone`, independent of the machine's zone. Null when
 * `value` isn't a date.
 */
export function snoozeDateInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), SNOOZE_DATE_HOUR);
  // Start from the wall time read as UTC and shift by the zone's offset there; a second pass
  // settles days where the offset changes (daylight saving).
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) instant += wall - zonedWallTime(new Date(instant), timeZone);
  return new Date(instant);
}

export function buildTodayModel(
  data: UserData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): TodayModel {
  const nextUpLimit = ctx.now.getTime() + NEXT_UP_WINDOW_HOURS * HOUR_MS;
  const next = upcomingInterviews(data, ctx).find(
    ({ interview }) => interview.startsAt.getTime() <= nextUpLimit,
  );
  const nextUp = next ? [interviewItem(next.interview, next.application, data, ctx)] : [];
  const deadlines = deadlineItems(data, ctx);
  const reviews = reviewItems(data, ctx);
  const followUps = followUpItems(data, ctx);
  const matches = matchItems(data, ctx);

  // The third entry is the header count: To review counts only emails waiting for confirmation (D01).
  const sections = (
    [
      ["nextUp", nextUp, null],
      ["toReview", [...reviews, ...autoUpdateItems(data, ctx)], reviews.length],
      ["followUps", followUps, followUps.length],
      ["deadlines", deadlines, deadlines.length],
      ["newMatches", matches, matches.length],
    ] as const
  )
    .filter(([, items]) => items.length > 0)
    .map(([id, items, count]): TodaySectionVM => ({
      id,
      title: ctx.intl.formatMessage(SECTION_TITLE_MESSAGES[id]),
      countLabel: count === null || count === 0 ? null : ctx.intl.formatNumber(count),
      seeAllLabel: id === "newMatches" ? ctx.intl.formatMessage(messages.seeAllMatches) : null,
      items,
    }));
  const items = sections.flatMap((candidate) => candidate.items);

  const connectMail =
    data.mailAccounts.length === 0
      ? {
          message: ctx.intl.formatMessage(messages.connectMail),
          estimate: ctx.intl.formatMessage(messages.connectEstimate),
          actionLabel: ctx.intl.formatMessage(messages.connectAction),
        }
      : null;
  const findJobs =
    connectMail && data.jobs.length === 0 && data.applications.length === 0
      ? { actionLabel: ctx.intl.formatMessage(messages.findJobs) }
      : null;

  return {
    title: ctx.intl.formatMessage(messages.title),
    dateLabel: longDate(ctx.now, ctx),
    sections,
    items,
    selectedId: items.find((item) => item.id === params.item)?.id ?? items[0]?.id ?? null,
    doneToday: doneToday(data, ctx),
    agenda: agenda(data, deadlines, nextUp[0]?.id ?? null, ctx),
    firstUse: connectMail ? { connectMail, findJobs } : null,
    caughtUp:
      items.length === 0 && !connectMail ? { message: ctx.intl.formatMessage(messages.caughtUp) } : null,
    snoozeDate: { min: zonedIsoDay(ctx.now, 1, ctx.timeZone), timeZone: ctx.timeZone },
  };
}
