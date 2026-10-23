/**
 * View-model of an application's full page (`/tracker/applications/$applicationId`, BRIEF §4.6,
 * research/tracker.md "Record detail") and of its compact side panel (`ApplicationPanel`): the
 * record header with the stage strip and one next action, the suggestion card (D15 / D19), the
 * timeline with durable Undo (D11), the documents used (pins are write-once after applying,
 * ADR 0002), contacts, interview rounds with their `.ics` exports, the free-text notes and the
 * user's own reminder. Pure: the clock, locale and zone come from `ctx`.
 *
 * The editors work on drafts of plain strings (`YYYY-MM-DD`, `HH:mm`) that the builder fills and
 * the `*Input` / `*Patch` helpers below turn back into documents, so views never parse or format
 * dates themselves.
 */
import {
  ACTIVE_STATUSES,
  type Application,
  type ApplicationStatus,
  type Contact,
  type CvRevision,
  EmailSchema,
  followUpDue,
  type Interview,
  type InterviewKind,
  isActiveStatus,
  suggestGhosted,
  UrlSchema,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { icsFileName, interviewsToIcs } from "../../data/tracker/ics";
import { EVENING_HOUR, QUIET_HOURS, SHORT_LEAD_MINUTES } from "../../data/tracker/reminders";
import { instantOfWallTime, zonedIsoDay, zonedWallTime } from "../../data/tracker/snooze";
import type { ApplicationPatch, InterviewInput, SuggestionKind } from "../../data/tracker/writes";
import type { ApplicationSummaryVM, NudgeVM, TimelineEventVM } from "../../shared/model/blocks";
import { applicationSummaryVM, nudgeVMs, timelineVMs } from "../../shared/model/build-blocks";
import { calendarDaysFromNow, dayAndTime, shortDate } from "../../shared/model/format";
import type { CompanyVM, ModelContext, ScreenData, StatusVM, TimeVM } from "../../shared/model/types";
import { companyVM, STATUS_MESSAGES, statusVM } from "../../shared/model/vocabulary";

/** Interview kinds as the editor and the rounds list name them. */
export const INTERVIEW_KIND_MESSAGES: Readonly<Record<InterviewKind, MessageDescriptor>> = defineMessages({
  recruiter_call: { id: "application-detail.kind.recruiterCall", defaultMessage: "Recruiter call" },
  hiring_manager: { id: "application-detail.kind.hiringManager", defaultMessage: "Hiring manager" },
  technical: { id: "application-detail.kind.technical", defaultMessage: "Technical" },
  system_design: { id: "application-detail.kind.systemDesign", defaultMessage: "System design" },
  take_home_review: { id: "application-detail.kind.takeHomeReview", defaultMessage: "Take-home review" },
  behavioral: {
    id: "application-detail.kind.behavioral",
    defaultMessage: "Behavioural",
    description: "Interview kind about past behaviour and teamwork",
  },
  onsite: { id: "application-detail.kind.onsite", defaultMessage: "On-site" },
  final: { id: "application-detail.kind.final", defaultMessage: "Final round" },
  other: { id: "application-detail.kind.other", defaultMessage: "Other" },
});

/** Kinds in the editor's order (the usual order of a hiring process). */
export const INTERVIEW_KINDS: readonly InterviewKind[] = [
  "recruiter_call",
  "hiring_manager",
  "technical",
  "system_design",
  "take_home_review",
  "behavioral",
  "onsite",
  "final",
  "other",
];

const messages = defineMessages({
  documentTitle: {
    id: "application-detail.model.documentTitle",
    defaultMessage: "{company} · {role}",
    description: "Window title of an application",
  },
  inStatus: {
    id: "application-detail.model.inStatus",
    defaultMessage:
      "{days, plural, =0 {In {status} since today} one {# day in {status}} other {# days in {status}}}",
    description: "How long the application has had its status; {status} is a status name",
  },
  closedSince: {
    id: "application-detail.model.closedSince",
    defaultMessage: "{days, plural, =0 {Closed today} one {Closed yesterday} other {Closed # days ago}}",
    description: "When a closed application (Not selected, Withdrawn, …) was closed",
  },
  progressActive: {
    id: "application-detail.model.progressActive",
    defaultMessage: "Stage {position} of {total}: {status}",
    description: "Screen-reader summary of the stage strip",
  },
  progressClosed: {
    id: "application-detail.model.progressClosed",
    defaultMessage: "Closed as {status} after {stage}",
    description: "Screen-reader summary of the stage strip of a closed application; both are status names",
  },
  progressClosedEarly: {
    id: "application-detail.model.progressClosedEarly",
    defaultMessage: "Closed as {status}",
    description: "Stage strip summary when no earlier stage is known",
  },
  nextPrepare: {
    id: "application-detail.model.next.prepare",
    defaultMessage: "Prepare for {title}",
    description: "Header button: open the next interview's prep notes; {title} is the interview's title",
  },
  nextAddInterview: {
    id: "application-detail.model.next.addInterview",
    defaultMessage: "Add interview round",
  },
  nextSetReminder: { id: "application-detail.model.next.setReminder", defaultMessage: "Set a reminder" },
  nextChangeReminder: {
    id: "application-detail.model.next.changeReminder",
    defaultMessage: "Change reminder",
  },
  snoozedFollowUp: {
    id: "application-detail.model.snoozed.followUp",
    defaultMessage: "Follow-up suggestion snoozed until {date}",
    description: "{date} is a day and time like 'Tomorrow, 09:00'",
  },
  snoozedNoResponse: {
    id: "application-detail.model.snoozed.noResponse",
    defaultMessage: "No-response suggestion snoozed until {date}",
    description: "{date} is a day and time like 'Tomorrow, 09:00'",
  },
  lockedPins: {
    id: "application-detail.model.lockedPins",
    defaultMessage: "Recorded on {date}, when you applied. Documents used stay as you sent them.",
    description: "Why the pinned CV can't be changed; {date} is the application date",
  },
  revisionSaved: {
    id: "application-detail.model.revision",
    defaultMessage:
      "{source, select, ai_tailor {Tailored version · {date}} import {Imported version · {date}} other {Version of {date}}}",
    description: "A CV revision in the picker; {date} is a short date like '3 Oct'",
  },
  revisionLatest: {
    id: "application-detail.model.revisionLatest",
    defaultMessage: "{label} (latest)",
    description: "Marks the CV's current revision in the picker",
  },
  roundLabel: { id: "application-detail.model.round", defaultMessage: "Round {round}" },
  interviewWhen: {
    id: "application-detail.model.interviewWhen",
    defaultMessage: "{day} · {time}",
    description: "An interview's day and time range: 'Thu 29 Oct · 17:00–17:45'",
  },
  organiserTime: {
    id: "application-detail.model.organiserTime",
    defaultMessage: "{time} {city} time",
    description: "The interview's time in the organiser's zone: '10:00–10:45 New York time'",
  },
  durationMinutes: {
    id: "application-detail.model.duration.minutes",
    defaultMessage: "{minutes} min",
  },
  durationHours: {
    id: "application-detail.model.duration.hours",
    defaultMessage: "{hours} h",
  },
  durationBoth: {
    id: "application-detail.model.duration.both",
    defaultMessage: "{hours} h {minutes} min",
  },
  allRounds: {
    id: "application-detail.model.allRounds",
    defaultMessage: "All rounds",
    description: "Part of the file name when every interview round is exported",
  },
  addressBookEntry: {
    id: "application-detail.model.addressBookEntry",
    defaultMessage: "{name} · {company}",
    description: "A contact in the link picker",
  },
});

// ─── Model ─────────────────────────────────────────────────────────────────────────────────────

export type StageStepState = "done" | "current" | "upcoming";

export interface StageStepVM {
  readonly key: ApplicationStatus;
  readonly label: string;
  readonly state: StageStepState;
}

/** Past ✓ / current / future; a closed application's strip ends with its outcome. */
export interface StageProgressVM {
  readonly steps: readonly StageStepVM[];
  /** "Stage 6 of 7: Interviewing" / "Closed as Not selected after Screening" (screen readers). */
  readonly summary: string;
  readonly closed: boolean;
}

/** The header's one next-action button. */
export type NextActionVM =
  | {
      readonly kind: "prepareInterview";
      readonly label: string;
      readonly interviewId: string;
      readonly at: TimeVM;
    }
  | { readonly kind: "addInterview"; readonly label: string }
  | { readonly kind: "reminder"; readonly label: string };

export interface HeaderVM {
  readonly company: CompanyVM;
  readonly role: string;
  readonly location: string | null;
  readonly status: StatusVM;
  /** "2 days in Interviewing"; closed outcomes "Closed 16 days ago". */
  readonly inStatus: string;
  readonly pendingSync: boolean;
  /** The posting this application came from ("Open posting" when the job has a link). */
  readonly jobId: string | null;
}

/** A suggestion the user put off with "Later", so the page can say so and bring it back. */
export interface SnoozedSuggestionVM {
  readonly kind: SuggestionKind;
  /** "Follow-up suggestion snoozed until Tomorrow, 09:00". */
  readonly label: string;
}

/** Plain-string drafts the editors work on (dates in the zone named alongside). */
export interface ReminderDraft {
  readonly text: string;
  /** `YYYY-MM-DD`, or "" for no date. */
  readonly date: string;
  /** `HH:mm`, or "" (09:00 when a date is set). */
  readonly time: string;
}

/** The user's own reminder (`nextAction` + `nextActionAt`), listed on Today's Deadlines. */
export interface ReminderVM {
  readonly label: string | null;
  readonly due: TimeVM | null;
  readonly overdue: boolean;
  readonly draft: ReminderDraft;
  /** The reminder as stored, for Undo after a change. */
  readonly restore: ApplicationPatch;
}

export interface CvChoiceVM {
  readonly id: string;
  readonly title: string;
  readonly currentRevisionId: string;
}

export interface DocumentsVM {
  /** The pinned CV, or null when none is recorded. */
  readonly cv: {
    readonly id: string;
    readonly title: string;
    readonly revisionId: string | null;
    readonly archived: boolean;
  } | null;
  readonly coverLetter: { readonly id: string; readonly title: string } | null;
  /** Why the pins are read-only (applied with a pinned revision); null while they may change. */
  readonly lockedReason: string | null;
  /** CVs to pin (not archived), by title. */
  readonly cvChoices: readonly CvChoiceVM[];
}

export interface ContactFields {
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly company: string;
  readonly notes: string;
}

export interface ContactVM {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
  readonly company: string | null;
  readonly email: string | null;
  readonly links: readonly { readonly label: string; readonly url: string }[];
  readonly notes: string;
  readonly pendingSync: boolean;
  readonly draft: ContactFields;
}

/** A contact in the address book that isn't linked yet (the "Link existing" picker). */
export interface AddressBookEntryVM {
  readonly id: string;
  /** "Emre Kaya · Kervan Teknoloji". */
  readonly label: string;
  readonly email: string | null;
}

export interface InterviewPersonDraft {
  readonly name: string;
  readonly title: string;
  readonly email: string;
  readonly contactId: string | null;
}

export interface InterviewDraft {
  readonly round: number;
  readonly kind: InterviewKind;
  readonly title: string;
  /** `YYYY-MM-DD` and `HH:mm` in `timeZone`. */
  readonly date: string;
  readonly time: string;
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly location: string;
  readonly meetingUrl: string;
  readonly people: readonly InterviewPersonDraft[];
  readonly prepNotes: string;
}

export interface IcsFileVM {
  readonly fileName: string;
  readonly content: string;
}

export interface InterviewVM {
  readonly id: string;
  /** "Round 2". */
  readonly roundLabel: string;
  readonly kindLabel: string;
  readonly title: string;
  /** Label "Thu 29 Oct · 17:00–17:45" in the user's zone; `absolute` for the tooltip. */
  readonly when: TimeVM;
  /** "10:00–10:45 New York time" when the organiser's zone shows another time; else null. */
  readonly organiserTime: string | null;
  /** "45 min", "2 h". */
  readonly duration: string;
  readonly location: string | null;
  readonly meetingUrl: string | null;
  readonly people: readonly {
    readonly name: string;
    readonly title: string | null;
    readonly email: string | null;
  }[];
  readonly prepNotes: string;
  /** Over already. */
  readonly past: boolean;
  readonly pendingSync: boolean;
  readonly draft: InterviewDraft;
  readonly ics: IcsFileVM;
}

export interface ApplicationDetailVM {
  readonly applicationId: string;
  /** "Brightwave · Frontend Engineer, Editor" (window title). */
  readonly documentTitle: string;
  readonly header: HeaderVM;
  readonly progress: StageProgressVM;
  /** Null for closed applications and while a suggestion is due (the card is the next step). */
  readonly nextAction: NextActionVM | null;
  /** The follow-up or no-response suggestion due now (`nudgeVMs`), or null. */
  readonly suggestion: NudgeVM | null;
  readonly snoozed: SnoozedSuggestionVM | null;
  readonly summary: ApplicationSummaryVM;
  /** Newest first. */
  readonly timeline: readonly TimelineEventVM[];
  readonly documents: DocumentsVM;
  readonly contacts: readonly ContactVM[];
  readonly addressBook: readonly AddressBookEntryVM[];
  /** Prefill of the "Add contact" dialog. */
  readonly newContact: ContactFields;
  /** By start time. */
  readonly interviews: readonly InterviewVM[];
  /** Prefill of "Add interview round" (round auto-increments; the user's zone). */
  readonly newInterview: InterviewDraft;
  /** Every round in one calendar file; null without rounds. */
  readonly exportAll: IcsFileVM | null;
  readonly notes: { readonly text: string; readonly pendingSync: boolean };
  readonly reminder: ReminderVM;
  /** Zone of the drafts (`ctx.timeZone`). */
  readonly timeZone: string;
  /** Earliest "Pick a date…" day for snoozing (tomorrow, `YYYY-MM-DD`). */
  readonly snoozeMinDate: string;
  /** The interview prep reminder rules as clock times ("18:00"; quiet hours "22:00"–"08:00"). */
  readonly reminderRules: {
    readonly evening: string;
    readonly leadMinutes: number;
    readonly quietStart: string;
    readonly quietEnd: string;
  };
}

export type ApplicationDetailModel =
  | { readonly status: "notFound"; readonly applicationId: string | null }
  | { readonly status: "found"; readonly detail: ApplicationDetailVM };

// ─── Builder ───────────────────────────────────────────────────────────────────────────────────

type DetailData = Pick<
  ScreenData,
  "applications" | "applicationEvents" | "interviews" | "contacts" | "cvs" | "coverLetters" | "profile"
>;

export function buildApplicationDetailModel(
  data: DetailData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): ApplicationDetailModel {
  const applicationId = params["applicationId"] ?? null;
  const application = data.applications.find((candidate) => candidate.id === applicationId);
  if (!application) return { status: "notFound", applicationId };

  const interviews = data.interviews
    .filter((interview) => interview.applicationId === application.id)
    .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const interviewVMs = interviews.map((interview) => interviewVM(interview, application, ctx));
  const [firstInterview] = interviews;
  const linked = data.contacts.filter((contact) => contact.applicationIds.includes(application.id));
  const byName = (a: Pick<Contact, "name">, b: Pick<Contact, "name">) =>
    a.name.localeCompare(b.name, ctx.locale);
  const suggestion = nudgeVMs({ ...data, applications: [application] }, ctx)[0] ?? null;

  return {
    status: "found",
    detail: {
      applicationId: application.id,
      documentTitle: ctx.intl.formatMessage(messages.documentTitle, {
        company: application.company,
        role: application.role,
      }),
      header: headerVM(application, ctx),
      progress: progressVM(application, data, ctx),
      // A suggestion due now is the next step itself: the header then offers no second one.
      nextAction: suggestion === null ? nextActionVM(application, interviews, ctx) : null,
      suggestion,
      snoozed: snoozedVM(application, data, ctx),
      summary: applicationSummaryVM(application, data, ctx),
      timeline: timelineVMs(application, data, ctx),
      documents: documentsVM(application, data, ctx),
      contacts: linked.toSorted(byName).map((contact) => contactVM(contact, ctx)),
      addressBook: data.contacts
        .filter((contact) => !contact.applicationIds.includes(application.id))
        .toSorted(byName)
        .map((contact) => ({
          id: contact.id,
          label: contact.company
            ? ctx.intl.formatMessage(messages.addressBookEntry, {
                name: contact.name,
                company: contact.company,
              })
            : contact.name,
          email: contact.email,
        })),
      newContact: { name: "", email: "", role: "", company: application.company, notes: "" },
      interviews: interviewVMs,
      newInterview: newInterviewDraft(interviews, ctx),
      exportAll: firstInterview
        ? {
            fileName: icsFileName({
              interview: { ...firstInterview, title: ctx.intl.formatMessage(messages.allRounds) },
              application,
            }),
            content: interviewsToIcs(
              interviews.map((interview) => ({ interview, application })),
              ctx.intl,
              ctx.now,
            ),
          }
        : null,
      notes: { text: application.notes, pendingSync: ctx.pendingWrites.has(application.id) },
      reminder: reminderVM(application, ctx),
      timeZone: ctx.timeZone,
      snoozeMinDate: zonedIsoDay(ctx.now, 1, ctx.timeZone),
      reminderRules: {
        evening: hourLabel(EVENING_HOUR, ctx.locale),
        leadMinutes: SHORT_LEAD_MINUTES,
        quietStart: hourLabel(QUIET_HOURS.start, ctx.locale),
        quietEnd: hourLabel(QUIET_HOURS.end, ctx.locale),
      },
    },
  };
}

/** "18:00" (or "6:00 PM" in en-US): a whole hour as the locale writes clock times. */
function hourLabel(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", timeStyle: "short" }).format(
    new Date(Date.UTC(2000, 0, 1, hour)),
  );
}

function headerVM(application: Application, ctx: ModelContext): HeaderVM {
  const status = statusVM(application.status, ctx.intl);
  const days = Math.max(0, -calendarDaysFromNow(application.statusChangedAt, ctx));
  return {
    company: companyVM(application.company, application.companyDomain),
    role: application.role,
    location: application.location,
    status,
    inStatus: isActiveStatus(application.status)
      ? ctx.intl.formatMessage(messages.inStatus, { days, status: status.label })
      : ctx.intl.formatMessage(messages.closedSince, { days }),
    pendingSync: ctx.pendingWrites.has(application.id),
    jobId: application.jobId,
  };
}

/** The furthest active stage the history reached (closed applications end their strip after it). */
function furthestStage(application: Application, data: Pick<ScreenData, "applicationEvents">): number {
  const reverted = new Set(
    data.applicationEvents.flatMap((event) =>
      event.applicationId === application.id && event.revertsEventId ? [event.revertsEventId] : [],
    ),
  );
  let furthest = -1;
  for (const event of data.applicationEvents) {
    if (event.applicationId !== application.id || reverted.has(event.id)) continue;
    for (const status of [event.fromStatus, event.toStatus]) {
      if (status !== null && isActiveStatus(status))
        furthest = Math.max(furthest, ACTIVE_STATUSES.indexOf(status));
    }
  }
  return furthest;
}

function progressVM(
  application: Application,
  data: Pick<ScreenData, "applicationEvents">,
  ctx: ModelContext,
): StageProgressVM {
  const label = (status: ApplicationStatus) => ctx.intl.formatMessage(STATUS_MESSAGES[status]);
  const current = application.status;
  if (isActiveStatus(current)) {
    const index = ACTIVE_STATUSES.indexOf(current);
    return {
      steps: ACTIVE_STATUSES.map((key, position) => ({
        key,
        label: label(key),
        state: position < index ? "done" : position === index ? "current" : "upcoming",
      })),
      summary: ctx.intl.formatMessage(messages.progressActive, {
        position: index + 1,
        total: ACTIVE_STATUSES.length,
        status: label(current),
      }),
      closed: false,
    };
  }
  const reached = furthestStage(application, data);
  const past = ACTIVE_STATUSES.slice(0, reached + 1);
  const last = past.at(-1);
  return {
    steps: [
      ...past.map((key): StageStepVM => ({ key, label: label(key), state: "done" })),
      { key: current, label: label(current), state: "current" },
    ],
    summary:
      last === undefined
        ? ctx.intl.formatMessage(messages.progressClosedEarly, { status: label(current) })
        : ctx.intl.formatMessage(messages.progressClosed, { status: label(current), stage: label(last) }),
    closed: true,
  };
}

function nextActionVM(
  application: Application,
  interviews: readonly Interview[],
  ctx: ModelContext,
): NextActionVM | null {
  if (!isActiveStatus(application.status)) return null;
  const upcoming = interviews.find(
    (interview) => interview.startsAt.getTime() + interview.durationMinutes * 60_000 > ctx.now.getTime(),
  );
  if (upcoming)
    return {
      kind: "prepareInterview",
      label: ctx.intl.formatMessage(messages.nextPrepare, { title: upcoming.title }),
      interviewId: upcoming.id,
      at: dayAndTime(upcoming.startsAt, ctx),
    };
  if (
    (application.status === "screening" || application.status === "interviewing") &&
    application.nextAction === null
  )
    return { kind: "addInterview", label: ctx.intl.formatMessage(messages.nextAddInterview) };
  return {
    kind: "reminder",
    label: ctx.intl.formatMessage(
      application.nextAction === null ? messages.nextSetReminder : messages.nextChangeReminder,
    ),
  };
}

function snoozedVM(
  application: Application,
  data: Pick<ScreenData, "applicationEvents" | "profile">,
  ctx: ModelContext,
): SnoozedSuggestionVM | null {
  const { settings } = data.profile;
  const now = ctx.now.getTime();
  const ghostedUntil = application.ghostedSnoozedUntil;
  if (
    ghostedUntil !== null &&
    ghostedUntil.getTime() > now &&
    suggestGhosted(application, data.applicationEvents, ctx.now, settings.ghostedAfterDays) !== null
  )
    return {
      kind: "noResponse",
      label: ctx.intl.formatMessage(messages.snoozedNoResponse, {
        date: dayAndTime(ghostedUntil, ctx).label,
      }),
    };
  const followUpUntil = application.followUpSnoozedUntil;
  if (
    followUpUntil !== null &&
    followUpUntil.getTime() > now &&
    followUpDue(application, data.applicationEvents, ctx.now, settings.followUpAfterDays) !== null
  )
    return {
      kind: "followUp",
      label: ctx.intl.formatMessage(messages.snoozedFollowUp, { date: dayAndTime(followUpUntil, ctx).label }),
    };
  return null;
}

function documentsVM(
  application: Application,
  data: Pick<ScreenData, "cvs" | "coverLetters">,
  ctx: ModelContext,
): DocumentsVM {
  const cv = data.cvs.find((candidate) => candidate.id === application.cvId);
  const letter = data.coverLetters.find((candidate) => candidate.id === application.coverLetterId);
  // Firestore rules: once applied, a pin may go from null to a value only (ADR 0002).
  const locked = application.appliedAt !== null && application.cvRevisionId !== null;
  return {
    cv: cv
      ? { id: cv.id, title: cv.title, revisionId: application.cvRevisionId, archived: cv.archivedAt !== null }
      : null,
    coverLetter: letter ? { id: letter.id, title: letter.title } : null,
    lockedReason:
      locked && application.appliedAt
        ? ctx.intl.formatMessage(messages.lockedPins, { date: shortDate(application.appliedAt, ctx) })
        : null,
    cvChoices: data.cvs
      .filter((candidate) => candidate.archivedAt === null)
      .toSorted((a, b) => a.title.localeCompare(b.title, ctx.locale))
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        currentRevisionId: candidate.currentRevisionId,
      })),
  };
}

export interface CvRevisionOptionVM {
  readonly id: string;
  /** "Version of 3 Oct (latest)", "Tailored version · 12 Sept". */
  readonly label: string;
}

/** A CV's revisions (newest first, from `watchCvRevisions`) as picker options. */
export function cvRevisionOptions(
  revisions: readonly CvRevision[],
  currentRevisionId: string | null,
  ctx: ModelContext,
): CvRevisionOptionVM[] {
  return revisions
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((revision) => {
      const label = ctx.intl.formatMessage(messages.revisionSaved, {
        source: revision.source,
        date: shortDate(revision.createdAt, ctx),
      });
      return {
        id: revision.id,
        label:
          revision.id === currentRevisionId
            ? ctx.intl.formatMessage(messages.revisionLatest, { label })
            : label,
      };
    });
}

function contactVM(contact: Contact, ctx: ModelContext): ContactVM {
  return {
    id: contact.id,
    name: contact.name,
    role: contact.role,
    company: contact.company,
    email: contact.email,
    links: contact.links,
    notes: contact.notes,
    pendingSync: ctx.pendingWrites.has(contact.id),
    draft: {
      name: contact.name,
      email: contact.email ?? "",
      role: contact.role ?? "",
      company: contact.company ?? "",
      notes: contact.notes,
    },
  };
}

/** `HH:mm` and `YYYY-MM-DD` of `date`'s wall clock in `timeZone`. */
function wallParts(date: Date, timeZone: string): { date: string; time: string } {
  const iso = new Date(zonedWallTime(date, timeZone)).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** "45 min", "2 h", "1 h 30 min" (the rounds list and the duration picker). */
export function durationLabel(minutes: number, intl: IntlShape): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return intl.formatMessage(messages.durationMinutes, { minutes });
  if (rest === 0) return intl.formatMessage(messages.durationHours, { hours });
  return intl.formatMessage(messages.durationBoth, { hours, minutes: rest });
}

/** "Europe/Istanbul" → "Istanbul", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");
}

function interviewVM(interview: Interview, application: Application, ctx: ModelContext): InterviewVM {
  const end = new Date(interview.startsAt.getTime() + interview.durationMinutes * 60_000);
  const day = new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(interview.startsAt);
  const at = dayAndTime(interview.startsAt, ctx);
  const range = (timeZone: string) =>
    new Intl.DateTimeFormat(ctx.locale, { timeZone, timeStyle: "short" }).formatRange(
      interview.startsAt,
      end,
    );
  // The organiser's time only when their wall clock differs from the user's.
  const differs =
    interview.timezone !== ctx.timeZone &&
    zonedWallTime(interview.startsAt, interview.timezone) !== zonedWallTime(interview.startsAt, ctx.timeZone);
  const wall = wallParts(interview.startsAt, interview.timezone);
  return {
    id: interview.id,
    roundLabel: ctx.intl.formatMessage(messages.roundLabel, { round: interview.round }),
    kindLabel: ctx.intl.formatMessage(INTERVIEW_KIND_MESSAGES[interview.kind]),
    title: interview.title,
    when: {
      iso: at.iso,
      label: ctx.intl.formatMessage(messages.interviewWhen, {
        day,
        time: range(ctx.timeZone),
      }),
      absolute: at.absolute,
    },
    organiserTime: differs
      ? ctx.intl.formatMessage(messages.organiserTime, {
          time: range(interview.timezone),
          city: zoneCity(interview.timezone),
        })
      : null,
    duration: durationLabel(interview.durationMinutes, ctx.intl),
    location: interview.location,
    meetingUrl: interview.meetingUrl,
    people: interview.people.map((person) => ({
      name: person.name,
      title: person.title,
      email: person.email,
    })),
    prepNotes: interview.prepNotes,
    past: end.getTime() <= ctx.now.getTime(),
    pendingSync: ctx.pendingWrites.has(interview.id),
    draft: {
      round: interview.round,
      kind: interview.kind,
      title: interview.title,
      date: wall.date,
      time: wall.time,
      durationMinutes: interview.durationMinutes,
      timeZone: interview.timezone,
      location: interview.location ?? "",
      meetingUrl: interview.meetingUrl ?? "",
      people: interview.people.map((person) => ({
        name: person.name,
        title: person.title ?? "",
        email: person.email ?? "",
        contactId: person.contactId,
      })),
      prepNotes: interview.prepNotes,
    },
    ics: {
      fileName: icsFileName({ interview, application }),
      content: interviewsToIcs([{ interview, application }], ctx.intl, ctx.now),
    },
  };
}

function newInterviewDraft(interviews: readonly Interview[], ctx: ModelContext): InterviewDraft {
  const round = Math.min(20, Math.max(0, ...interviews.map((interview) => interview.round)) + 1);
  return {
    round,
    kind: round === 1 ? "recruiter_call" : "technical",
    title: "",
    date: zonedIsoDay(ctx.now, 1, ctx.timeZone),
    time: "10:00",
    durationMinutes: 45,
    timeZone: ctx.timeZone,
    location: "",
    meetingUrl: "",
    people: [],
    prepNotes: "",
  };
}

function reminderVM(application: Application, ctx: ModelContext): ReminderVM {
  const at = application.nextActionAt;
  const wall = at ? wallParts(at, ctx.timeZone) : { date: "", time: "" };
  return {
    label: application.nextAction,
    due: at ? dayAndTime(at, ctx) : null,
    overdue: at !== null && at.getTime() < ctx.now.getTime(),
    draft: { text: application.nextAction ?? "", date: wall.date, time: wall.time },
    restore: { nextAction: application.nextAction, nextActionAt: application.nextActionAt },
  };
}

// ─── Draft helpers (editors → documents) ──────────────────────────────────────────────────────

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The instant the wall clock in `timeZone` reads `date` + `time`; null when either is malformed. */
export function wallInstant(date: string, time: string, timeZone: string): Date | null {
  const day = DATE.exec(date);
  const clock = TIME.exec(time);
  if (!day || !clock) return null;
  const wall = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  if (Number.isNaN(wall)) return null;
  return instantOfWallTime(wall, timeZone);
}

/** Why a reminder draft can't be saved, or null. */
export type ReminderProblem = "noText" | "badDate";

export function reminderProblem(draft: ReminderDraft): ReminderProblem | null {
  if (draft.text.trim() === "") return "noText";
  if (draft.date !== "" && wallInstant(draft.date, draft.time || "09:00", "UTC") === null) return "badDate";
  return null;
}

/** The application patch of a reminder draft (time defaults to 09:00 when only a day is set). */
export function reminderPatch(draft: ReminderDraft, timeZone: string): ApplicationPatch {
  const text = draft.text.trim();
  return {
    nextAction: text === "" ? null : text,
    nextActionAt: draft.date === "" ? null : wallInstant(draft.date, draft.time || "09:00", timeZone),
  };
}

/** Why an interview draft can't be saved, or null. */
export type InterviewProblem = "date" | "time" | "duration" | "meetingUrl" | "personName" | "personEmail";

export function interviewProblem(draft: InterviewDraft): InterviewProblem | null {
  if (!DATE.test(draft.date)) return "date";
  if (!TIME.test(draft.time)) return "time";
  if (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 5 || draft.durationMinutes > 600)
    return "duration";
  if (draft.meetingUrl.trim() !== "" && !UrlSchema.safeParse(draft.meetingUrl.trim()).success)
    return "meetingUrl";
  for (const person of draft.people) {
    if (person.name.trim() === "" && (person.title.trim() !== "" || person.email.trim() !== ""))
      return "personName";
    if (person.email.trim() !== "" && !EmailSchema.safeParse(person.email.trim()).success)
      return "personEmail";
  }
  return null;
}

/** The interview of a valid draft (an empty title becomes the kind's name). */
export function interviewInput(
  draft: InterviewDraft,
  applicationId: string,
  kindLabel: string,
): InterviewInput | null {
  if (interviewProblem(draft) !== null) return null;
  const startsAt = wallInstant(draft.date, draft.time, draft.timeZone);
  if (startsAt === null) return null;
  const optional = (value: string) => (value.trim() === "" ? null : value.trim());
  return {
    applicationId,
    round: draft.round,
    kind: draft.kind,
    title: draft.title.trim() || kindLabel,
    startsAt,
    durationMinutes: draft.durationMinutes,
    timezone: draft.timeZone,
    location: optional(draft.location),
    meetingUrl: optional(draft.meetingUrl),
    people: draft.people
      .filter((person) => person.name.trim() !== "")
      .map((person) => ({
        name: person.name.trim(),
        title: optional(person.title),
        email: optional(person.email),
        contactId: person.contactId,
      })),
    prepNotes: draft.prepNotes,
  };
}

/** Why a contact can't be saved, or null. */
export type ContactProblem = "name" | "email";

export function contactProblem(fields: ContactFields): ContactProblem | null {
  if (fields.name.trim() === "") return "name";
  if (fields.email.trim() !== "" && !EmailSchema.safeParse(fields.email.trim()).success) return "email";
  return null;
}
