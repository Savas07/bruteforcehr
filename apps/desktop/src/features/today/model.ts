/**
 * Today (desktop): what needs attention, in a fixed section order (today-home.md "Decision —
 * Desktop"): Next up · To review · Follow-ups · Deadlines · New matches. Empty sections are left
 * out, never shown with "0". There is no greeting (decisions.md U8): the header is the title and
 * the date only. Pure: everything time- and locale-dependent comes from `ctx`.
 */
import { type Application, type Interview, isActiveStatus, revertedBy, type ReviewState } from "@bfhr/core";
import type { AutoChangeVM, NudgeVM, ReviewProposalVM } from "../../shared/model/blocks";
import {
  applicationSummaryVM,
  autoChangeVM,
  nudgeVMs,
  reviewProposalVM,
} from "../../shared/model/build-blocks";
import { calendarDaysFromNow, clockTime, dayAndTime, relativeTime } from "../../shared/model/format";
import type { CompanyVM, MatchVM, ModelContext, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, matchVM, STATUS_LABELS } from "../../shared/model/vocabulary";

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
  /** Plain-text count for the header ("To review · 6"); null for Next up (one hero card). */
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
}

/* ------------------------------------------------------------------------------------------------
 * Copy (today-home.md "Copy notes", D18, D19, states.md)
 * ---------------------------------------------------------------------------------------------- */

const SECTION_TITLES: Readonly<Record<TodaySectionId, string>> = {
  nextUp: "Next up",
  toReview: "To review",
  followUps: "Follow-ups",
  deadlines: "Deadlines",
  newMatches: "New matches",
};

const DEADLINE_LABELS: Readonly<Record<DeadlineKind, string>> = {
  assessment: "Assessment due",
  offerReply: "Reply to the offer by",
  jobClosing: "Posting closes",
};

const REVIEW_OUTCOMES: Readonly<Partial<Record<ReviewState, string>>> = {
  confirmed: "Confirmed",
  corrected: "Changed",
  dismissed: "Marked as not job mail",
};

const COPY = {
  title: "Today",
  caughtUp: "You're all caught up. New updates will show up here.",
  connectMail: "Connect your email to see interview invites and replies here.",
  connectEstimate: "About 2 minutes.",
  connectAction: "Connect email",
  findJobs: "Find jobs",
  seeAllMatches: "See all in Jobs",
  doneToday: "Done today",
  agendaTitle: "Next 7 days",
  agendaEmpty: "No interviews this week",
} as const;

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
  const when = sameDay ? theirClock : dayAndTime(interview.startsAt, theirs).label;
  return `${when} ${city} time`;
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
  const round = `Round ${interview.round}`;
  return {
    kind: "interview",
    id: `interview:${interview.id}`,
    interviewId: interview.id,
    applicationId: application.id,
    company: companyVM(application.company, application.companyDomain),
    title: interview.title,
    context: `${application.role} · ${round}`,
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
function autoUpdateTitle(change: AutoChangeVM): string {
  if (change.to.key === "rejected")
    return `${change.company.name} decided not to move forward. We updated the application.`;
  return change.mailMessageId
    ? `Moved to ${change.to.label} — from an email by ${change.company.name}`
    : `Moved to ${change.to.label} automatically`;
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
          title: autoUpdateTitle(change),
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
          title: DEADLINE_LABELS[deadlineKind],
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
        title: DEADLINE_LABELS.jobClosing,
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
        match: matchVM(match.score),
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
    const outcome = REVIEW_OUTCOMES[message.reviewState];
    if (!outcome || !message.reviewedAt || !today(message.reviewedAt)) continue;
    const proposal = reviewProposalVM(message, data, ctx);
    done.push({
      at: message.reviewedAt,
      item: {
        id: `done:review:${message.id}`,
        kind: "review",
        company: proposal.company,
        title: proposal.subject,
        outcome,
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
        outcome: `Undone · back to ${STATUS_LABELS[event.toStatus]}`,
        doneAt: relativeTime(event.occurredAt, ctx),
      },
    });
  }
  if (done.length === 0) return null;
  const items = done.sort((a, b) => b.at.getTime() - a.at.getTime()).map(({ item }) => item);
  return { title: COPY.doneToday, countLabel: new Intl.NumberFormat(ctx.locale).format(items.length), items };
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
    title: COPY.agendaTitle,
    days: days.map(({ offset, label, entries: dayEntries }) => ({
      id: `day+${offset}`,
      label,
      entries: dayEntries,
    })),
    emptyLabel: days.length === 0 ? COPY.agendaEmpty : null,
  };
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

  const sections = (
    [
      ["nextUp", nextUp],
      ["toReview", [...reviewItems(data, ctx), ...autoUpdateItems(data, ctx)]],
      ["followUps", followUpItems(data, ctx)],
      ["deadlines", deadlines],
      ["newMatches", matchItems(data, ctx)],
    ] as const
  )
    .filter(([, items]) => items.length > 0)
    .map(([id, items]): TodaySectionVM => ({
      id,
      title: SECTION_TITLES[id],
      countLabel: id === "nextUp" ? null : new Intl.NumberFormat(ctx.locale).format(items.length),
      seeAllLabel: id === "newMatches" ? COPY.seeAllMatches : null,
      items,
    }));
  const items = sections.flatMap((candidate) => candidate.items);

  const connectMail =
    data.mailAccounts.length === 0
      ? { message: COPY.connectMail, estimate: COPY.connectEstimate, actionLabel: COPY.connectAction }
      : null;
  const findJobs =
    connectMail && data.jobs.length === 0 && data.applications.length === 0
      ? { actionLabel: COPY.findJobs }
      : null;

  return {
    title: COPY.title,
    dateLabel: longDate(ctx.now, ctx),
    sections,
    items,
    selectedId: items.find((item) => item.id === params.item)?.id ?? items[0]?.id ?? null,
    doneToday: doneToday(data, ctx),
    agenda: agenda(data, deadlines, nextUp[0]?.id ?? null, ctx),
    firstUse: connectMail ? { connectMail, findJobs } : null,
    caughtUp: items.length === 0 && !connectMail ? { message: COPY.caughtUp } : null,
  };
}
