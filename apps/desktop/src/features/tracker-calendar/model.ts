/**
 * Tracker › Calendar (`/tracker?view=calendar`, research/tracker.md "Decision — Desktop ›
 * Calendar"): interviews (timed), deadlines and reminders (shared with Today through
 * `collectDeadlines`) and suggested follow-ups (`@bfhr/core` `followUpDue`, never applied, only
 * shown) by day, in the user's zone. Pure: everything time- and locale-dependent comes from `ctx`.
 */
import { type Application, type ApplicationEvent, followUpDue, isoDay, isActiveStatus } from "@bfhr/core";
import { defineMessages, type MessageDescriptor } from "react-intl";
import { collectDeadlines, type DeadlineKind } from "../../data/tracker/deadlines";
import { absoluteDateTime, clockTime } from "../../shared/model/format";
import type { CompanyVM, ModelContext, ProfileView, UserData } from "../../shared/model/types";
import { companyVM } from "../../shared/model/vocabulary";

export type CalendarEntryKind = "interview" | "deadline" | "followUp" | "reminder";
export const CALENDAR_ENTRY_KINDS: readonly CalendarEntryKind[] = ["interview", "deadline", "followUp", "reminder"];

export const KIND_MESSAGES: Readonly<Record<CalendarEntryKind, MessageDescriptor>> = defineMessages({
  interview: { id: "tracker-calendar.kind.interview", defaultMessage: "Interviews" },
  deadline: { id: "tracker-calendar.kind.deadline", defaultMessage: "Deadlines" },
  followUp: { id: "tracker-calendar.kind.followUp", defaultMessage: "Follow-ups" },
  reminder: { id: "tracker-calendar.kind.reminder", defaultMessage: "Reminders" },
});

const messages = defineMessages({
  assessment: { id: "tracker-calendar.deadline.assessment", defaultMessage: "Assessment due" },
  offerReply: { id: "tracker-calendar.deadline.offerReply", defaultMessage: "Offer reply due" },
  jobClosing: { id: "tracker-calendar.deadline.jobClosing", defaultMessage: "Job closes" },
  followUp: {
    id: "tracker-calendar.followUp.title",
    defaultMessage: "Follow up",
    description: "Calendar entry: a suggested follow-up email for an application with no reply",
  },
  duration: {
    id: "tracker-calendar.interview.duration",
    defaultMessage: "{time} · {minutes} min",
  },
});

const DEADLINE_TITLES: Readonly<Record<Exclude<DeadlineKind, "reminder">, MessageDescriptor>> = {
  assessment: messages.assessment,
  offerReply: messages.offerReply,
  jobClosing: messages.jobClosing,
};

export interface CalendarEntryVM {
  /** Unique: `interview:<id>`, a deadline id, `followUp:<applicationId>`. */
  readonly id: string;
  readonly kind: CalendarEntryKind;
  /** "Recruiter call", "Assessment due", the reminder's text, "Follow up". */
  readonly title: string;
  readonly company: CompanyVM;
  /** The role (or the job's title). */
  readonly context: string;
  readonly applicationId: string | null;
  /** Interviews only (Add to calendar). */
  readonly interviewId: string | null;
  /** `YYYY-MM-DD` in the user's zone. */
  readonly day: string;
  /** "14:00" for timed entries (interviews); null for all-day ones. */
  readonly time: string | null;
  /** "14:00 · 45 min" for interviews. */
  readonly timeDetail: string | null;
  readonly iso: string;
  /** "Thursday 29 October 2026 at 14:00". */
  readonly absolute: string;
  readonly sort: number;
  /** A suggestion the app makes (follow-ups), not a date the user or an employer set. */
  readonly suggested: boolean;
  readonly pendingSync: boolean;
}

export interface TrackerCalendarModel {
  readonly entries: readonly CalendarEntryVM[];
  /** `YYYY-MM-DD` today in the user's zone. */
  readonly today: string;
  /** 0 = Sunday … 6 = Saturday, from the locale (Monday in TR, DE, en-GB). */
  readonly weekStartsOn: number;
  readonly hasInterviewsAhead: boolean;
}

export type CalendarData = Pick<
  UserData,
  "applications" | "applicationEvents" | "interviews" | "mailMessages" | "jobs" | "jobMatches"
> & { readonly profile: ProfileView };

/** How far back and ahead the calendar collects dates. */
const RANGE_DAYS = 400;
const DAY_MS = 86_400_000;
/** "When would the follow-up be due": `followUpDue` answers for any `now` past the due date. */
const FAR_FUTURE = new Date(8.64e15);

function weekStart(locale: string): number {
  try {
    const info = (new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number } }).getWeekInfo?.();
    if (info) return info.firstDay % 7;
  } catch {
    // fall through
  }
  return /-US$/i.test(locale) ? 0 : 1;
}

function followUpEntry(
  application: Application,
  events: readonly ApplicationEvent[],
  days: number,
  ctx: ModelContext,
): CalendarEntryVM | null {
  if (application.followUpDismissedAt !== null) return null;
  const due = followUpDue(application, events, FAR_FUTURE, days);
  if (!due) return null;
  const snoozed = application.followUpSnoozedUntil;
  const at = snoozed !== null && snoozed > due.dueAt ? snoozed : due.dueAt;
  return {
    id: `followUp:${application.id}`,
    kind: "followUp",
    title: ctx.intl.formatMessage(messages.followUp),
    company: companyVM(application.company, application.companyDomain),
    context: application.role,
    applicationId: application.id,
    interviewId: null,
    day: isoDay(at, ctx.timeZone),
    time: null,
    timeDetail: null,
    iso: at.toISOString(),
    absolute: absoluteDateTime(at, ctx),
    sort: at.getTime(),
    suggested: true,
    pendingSync: ctx.pendingWrites.has(application.id),
  };
}

export function buildTrackerCalendarModel(data: CalendarData, ctx: ModelContext): TrackerCalendarModel {
  const { intl } = ctx;
  const applications = new Map(data.applications.map((application) => [application.id, application]));
  const entries: CalendarEntryVM[] = [];

  for (const interview of data.interviews) {
    const application = applications.get(interview.applicationId);
    if (!application) continue;
    const time = clockTime(interview.startsAt, ctx);
    entries.push({
      id: `interview:${interview.id}`,
      kind: "interview",
      title: interview.title,
      company: companyVM(application.company, application.companyDomain),
      context: application.role,
      applicationId: application.id,
      interviewId: interview.id,
      day: isoDay(interview.startsAt, ctx.timeZone),
      time,
      timeDetail: intl.formatMessage(messages.duration, { time, minutes: interview.durationMinutes }),
      iso: interview.startsAt.toISOString(),
      absolute: absoluteDateTime(interview.startsAt, ctx),
      sort: interview.startsAt.getTime(),
      suggested: false,
      pendingSync: ctx.pendingWrites.has(interview.id),
    });
  }

  const range = { from: new Date(ctx.now.getTime() - RANGE_DAYS * DAY_MS), until: new Date(ctx.now.getTime() + RANGE_DAYS * DAY_MS) };
  for (const deadline of collectDeadlines(data, range)) {
    const reminder = deadline.kind === "reminder";
    entries.push({
      id: deadline.id,
      kind: reminder ? "reminder" : "deadline",
      title: reminder ? (deadline.label ?? deadline.title) : intl.formatMessage(DEADLINE_TITLES[deadline.kind as Exclude<DeadlineKind, "reminder">]),
      company: companyVM(deadline.company, deadline.companyDomain),
      context: deadline.title,
      applicationId: deadline.applicationId,
      interviewId: null,
      day: isoDay(deadline.at, ctx.timeZone),
      time: null,
      timeDetail: null,
      iso: deadline.at.toISOString(),
      absolute: absoluteDateTime(deadline.at, ctx),
      sort: deadline.at.getTime(),
      suggested: false,
      pendingSync: ctx.pendingWrites.has(deadline.applicationId ?? deadline.id),
    });
  }

  const eventsByApplication = new Map<string, ApplicationEvent[]>();
  for (const event of data.applicationEvents) {
    const list = eventsByApplication.get(event.applicationId) ?? [];
    list.push(event);
    eventsByApplication.set(event.applicationId, list);
  }
  for (const application of data.applications) {
    if (!isActiveStatus(application.status)) continue;
    const entry = followUpEntry(
      application,
      eventsByApplication.get(application.id) ?? [],
      data.profile.settings.followUpAfterDays,
      ctx,
    );
    if (entry) entries.push(entry);
  }

  entries.sort((a, b) => a.sort - b.sort);
  return {
    entries,
    today: isoDay(ctx.now, ctx.timeZone),
    weekStartsOn: weekStart(ctx.locale),
    hasInterviewsAhead: entries.some((entry) => entry.kind === "interview" && entry.sort >= ctx.now.getTime()),
  };
}

/* ── Day arithmetic on `YYYY-MM-DD` (calendar days, no zones involved) ─────────────────────────── */

const toUtc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS);
}

/** Same day of the month `months` away, clamped to the month's length. */
export function addMonths(day: string, months: number): string {
  const date = new Date(toUtc(day));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const length = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), length));
  return fromUtc(target.getTime());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function startOfWeek(day: string, weekStartsOn: number): string {
  return addDays(day, -((weekday(day) - weekStartsOn + 7) % 7));
}

export const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;

/** The weeks (7 days each, from `weekStartsOn`) covering `day`'s month. */
export function monthWeeks(day: string, weekStartsOn: number): string[][] {
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let start = startOfWeek(first, weekStartsOn); start <= last; start = addDays(start, 7))
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(start, index)));
  return weeks;
}

/** The 7 days of `day`'s week. */
export function weekDays(day: string, weekStartsOn: number): string[] {
  const start = startOfWeek(day, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** A `Date` at noon UTC of `day`, for `Intl` formatting with `timeZone: "UTC"`. */
export function dayDate(day: string): Date {
  return new Date(toUtc(day) + DAY_MS / 2);
}
