/**
 * Tracker board view-model (`/tracker`, optional `applicationId` for the right detail panel).
 * research/tracker.md "Decision — Desktop": the 7 active stages as columns, a Closed rail with
 * per-outcome counts, cards with age / staleness / automatic-move glyph, and the record detail
 * (header, summary, timeline, Move to…). states.md "Tracker board" defines the empty board.
 */
import {
  ACTIVE_STATUSES,
  type Application,
  type ApplicationStatus,
  canTransition,
  suggestGhosted,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import type { ApplicationSummaryVM, NudgeVM, TimelineEventVM } from "../../shared/model/blocks";
import { applicationSummaryVM, nudgeVMs, timelineVMs } from "../../shared/model/build-blocks";
import { defineMessages } from "react-intl";
import { calendarDaysFromNow, dayAndTime, relativeTime } from "../../shared/model/format";
import type { CompanyVM, ModelContext, StatusVM, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, MOVE_DENIAL_MESSAGES, statusVM } from "../../shared/model/vocabulary";

/** Saved is the backlog: its column starts collapsed above this many cards (tracker.md). */
const SAVED_COLLAPSE_ABOVE = 5;

const messages = defineMessages({
  ageNew: { id: "tracker-board.card.ageNew", defaultMessage: "New today" },
  ageDays: {
    id: "tracker-board.card.ageDays",
    defaultMessage: "{days} d in stage",
    description: "Card meta: whole days in the current stage, abbreviated",
  },
  ageNewAccessible: { id: "tracker-board.card.ageNewAccessible", defaultMessage: "In {status} since today" },
  ageDaysAccessible: {
    id: "tracker-board.card.ageDaysAccessible",
    defaultMessage: "{days, plural, one {# day} other {# days}} in {status}",
  },
  staleness: {
    id: "tracker-board.card.staleness",
    defaultMessage: "No reply in {days, plural, one {# day} other {# days}}",
  },
  autoMoveMail: {
    id: "tracker-board.card.autoMoveMail",
    defaultMessage: "Moved automatically from an email",
  },
  autoMove: { id: "tracker-board.card.autoMove", defaultMessage: "Moved automatically" },
  columnAccessible: {
    id: "tracker-board.column.accessibleLabel",
    defaultMessage: "{status}, {count, plural, one {# application} other {# applications}}",
  },
  oldestToday: { id: "tracker-board.column.oldestToday", defaultMessage: "oldest today" },
  oldestDays: {
    id: "tracker-board.column.oldestDays",
    defaultMessage: "oldest {days} d",
    description: "Column sub-line: age of the longest-waiting card, abbreviated days",
  },
  oldestTodayAccessible: {
    id: "tracker-board.column.oldestTodayAccessible",
    defaultMessage: "Oldest: in this stage since today",
  },
  oldestDaysAccessible: {
    id: "tracker-board.column.oldestDaysAccessible",
    defaultMessage: "Oldest: {days, plural, one {# day} other {# days}} in this stage",
  },
  columnEmpty: { id: "tracker-board.column.empty", defaultMessage: "No applications" },
  position: {
    id: "tracker-board.selection.position",
    defaultMessage: "{position} of {total} in {status}",
    description: "Detail top bar: the card's place in its column",
  },
  closed: { id: "tracker-board.closed.label", defaultMessage: "Closed" },
  closedAccessible: {
    id: "tracker-board.closed.accessibleLabel",
    defaultMessage:
      "Closed, {count, plural, one {# application} other {# applications}}: {accepted} {acceptedCount}, {declined} {declinedCount}, {rejected} {rejectedCount}, {withdrawn} {withdrawnCount}, {ghosted} {ghostedCount}",
    description: "Closed rail screen-reader label; each outcome status name followed by its count",
  },
  closedEmpty: { id: "tracker-board.closed.empty", defaultMessage: "Closed applications will appear here." },
  firstUseTitle: { id: "tracker-board.firstUse.title", defaultMessage: "No applications yet" },
  firstUseBody: {
    id: "tracker-board.firstUse.body",
    defaultMessage: "Add a job you've applied to, or save one from Jobs to track it here.",
  },
  firstUsePrimary: { id: "tracker-board.firstUse.primary", defaultMessage: "Add application" },
  firstUseSecondary: { id: "tracker-board.firstUse.secondary", defaultMessage: "Import CSV" },
  columnAdd: {
    id: "tracker-board.column.add",
    defaultMessage: "Add",
    description: "Column footer button that adds an application to that status",
  },
});

/** One status in "Move to…" / the status menu / a drop target (D16: disabled, never hidden). */
export interface MoveTargetVM {
  readonly status: StatusVM;
  /** The application's current status: shown checked, not selectable. */
  readonly current: boolean;
  /** Why this target can't be picked ("Accepted and Declined come after an offer."); null when it can. */
  readonly disabledReason: string | null;
}

/** The application's next to-do and when it's due. */
export interface NextActionVM {
  /** "On-site interview", "Reply to the offer". */
  readonly label: string;
  /** "Today, 15:00", "Thursday, 18:00"; null when undated. */
  readonly due: TimeVM | null;
}

/** `ApplicationCard` on the board (and in an expanded Closed outcome). */
export interface TrackerCardVM {
  readonly applicationId: string;
  readonly company: CompanyVM;
  readonly role: string;
  /** "Istanbul (hybrid)", "Remote"; null when unknown. */
  readonly location: string | null;
  readonly status: StatusVM;
  /**
   * Time in the current stage. The card's meta line shows `nextAction` when there is one, else
   * `age.label`.
   */
  readonly age: {
    /** "12 d in stage", "New today". */
    readonly label: string;
    /** "12 days in Interviewing", "In Saved since today". */
    readonly accessibleLabel: string;
    readonly since: TimeVM;
  };
  readonly nextAction: NextActionVM | null;
  /**
   * Calm staleness line while waiting on the employer: "No reply in 9 days". Shown from the
   * follow-up threshold on; null with an upcoming interview or outside the waiting stages.
   */
  readonly staleness: string | null;
  /**
   * Accessible label of the envelope glyph when the latest status move was automatic
   * ("Moved automatically from an email"); null when the user made it.
   */
  readonly autoMove: string | null;
  /** Keyboard parity: Mod+Shift+→ / ← move one active stage forward / back. Null at either end or when closed. */
  readonly stepForward: StatusVM | null;
  readonly stepBack: StatusVM | null;
  /** Every status in `@bfhr/core` order for "Move to…" (`M`) and drag targets. */
  readonly moves: readonly MoveTargetVM[];
  /** The application or one of its events is waiting to sync (`SyncGlyph`). */
  readonly pendingSync: boolean;
}

/** `BoardColumn`: one status with its cards, ordered by next action (due first), then oldest. */
export interface TrackerColumnVM {
  readonly status: StatusVM;
  readonly count: number;
  /** "3", "0" (header count, tabular-nums). */
  readonly countLabel: string;
  /** "Interviewing, 3 applications". */
  readonly accessibleLabel: string;
  /** "oldest 18 d", "oldest today"; null when empty. */
  readonly oldestLabel: string | null;
  /** "Oldest: 18 days in this stage"; null when empty. */
  readonly oldestAccessibleLabel: string | null;
  readonly cards: readonly TrackerCardVM[];
  /** Muted "No applications" line in an otherwise filled board; null when it has cards or on first use. */
  readonly emptyLine: string | null;
  /** Empty columns collapse to a 40 px rail; Saved also collapses above 5 cards. Never on first use. */
  readonly collapsedByDefault: boolean;
}

/** `ClosedRail` at the board's right edge; expands into one column per outcome. */
export interface ClosedRailVM {
  /** "Closed". */
  readonly label: string;
  readonly count: number;
  readonly countLabel: string;
  /** "Closed, 7 applications: Accepted 1, Declined 1, Not selected 3, Withdrawn 1, No response 1". */
  readonly accessibleLabel: string;
  /** Accepted, Declined, Not selected, Withdrawn, No response (core order). */
  readonly outcomes: readonly TrackerColumnVM[];
  /** "Closed applications will appear here." when no application is closed; else null. */
  readonly emptyLine: string | null;
}

/** The right detail panel (`RecordHeader` + Up next + timeline + summary). */
export interface TrackerSelectionVM {
  readonly applicationId: string;
  readonly company: CompanyVM;
  readonly role: string;
  readonly location: string | null;
  readonly status: StatusVM;
  /** Top bar "2 of 3 in Interviewing" with ‹ › (J/K) through the same column. */
  readonly position: {
    readonly label: string;
    readonly previousId: string | null;
    readonly nextId: string | null;
  };
  /** The header's one next-action button; null when there's nothing to do. */
  readonly nextAction: NextActionVM | null;
  /** Up next suggestion for this application (follow-up / no response); null when none is due. */
  readonly nudge: NudgeVM | null;
  readonly summary: ApplicationSummaryVM;
  /** Newest first; automatic rows carry their reason and Undo state (D11). */
  readonly timeline: readonly TimelineEventVM[];
  readonly moves: readonly MoveTargetVM[];
  readonly pendingSync: boolean;
}

/** No applications at all (states.md `tracker.empty`): explainer in the first column. */
export interface TrackerFirstUseVM {
  /** "No applications yet". */
  readonly title: string;
  /** "Add a job you've applied to, or save one from Jobs to track it here." */
  readonly body: string;
  /** Primary: "Add application", Mod+N. */
  readonly primary: { readonly label: string; readonly shortcut: string };
  /** Secondary: "Import CSV" (brief §4.6). */
  readonly secondary: { readonly label: string };
  /** Each column's "+ Add" footer label: "Add". */
  readonly columnAddLabel: string;
}

export interface TrackerBoardModel {
  /** The 7 active stages, Saved → Offer; always all present. */
  readonly columns: readonly TrackerColumnVM[];
  readonly closedRail: ClosedRailVM;
  /** Follow-up and no-response suggestions, oldest first (D15). */
  readonly nudges: readonly NudgeVM[];
  /** The application named by `params.applicationId`; null when missing or unknown. */
  readonly selected: TrackerSelectionVM | null;
  /** Non-null when there are no applications at all. */
  readonly firstUse: TrackerFirstUseVM | null;
}

type BoardData = Pick<
  UserData,
  "applications" | "applicationEvents" | "interviews" | "profile" | "cvs" | "coverLetters"
>;

function moveTargets(from: ApplicationStatus, ctx: ModelContext): MoveTargetVM[] {
  return [...ACTIVE_STATUSES, ...TERMINAL_STATUSES].map((to) => {
    const check = canTransition(from, to, "user");
    return {
      status: statusVM(to, ctx.intl),
      current: to === from,
      disabledReason:
        !check.allowed && check.reason === "outcome_requires_offer"
          ? ctx.intl.formatMessage(MOVE_DENIAL_MESSAGES.outcome_requires_offer)
          : null,
    };
  });
}

function activeStep(status: ApplicationStatus, offset: 1 | -1, ctx: ModelContext): StatusVM | null {
  const index = ACTIVE_STATUSES.findIndex((candidate) => candidate === status);
  if (index === -1) return null;
  const target = ACTIVE_STATUSES[index + offset];
  return target ? statusVM(target, ctx.intl) : null;
}

function daysInStage(application: Application, ctx: ModelContext): number {
  return Math.max(0, -calendarDaysFromNow(application.statusChangedAt, ctx));
}

function cardVM(application: Application, data: BoardData, ctx: ModelContext): TrackerCardVM {
  const events = data.applicationEvents.filter((event) => event.applicationId === application.id);
  const latestMove = events
    .filter((event) => event.type === "created" || event.type === "status_changed")
    .reduce<(typeof events)[number] | null>(
      (latest, event) => (latest === null || event.occurredAt >= latest.occurredAt ? event : latest),
      null,
    );
  const days = daysInStage(application, ctx);
  const status = statusVM(application.status, ctx.intl);
  const interviewAhead = data.interviews.some(
    (interview) => interview.applicationId === application.id && interview.startsAt > ctx.now,
  );
  // "Silent for at least the follow-up threshold": the ghosted check run at the follow-up days.
  const silence = interviewAhead
    ? null
    : suggestGhosted(application, data.applicationEvents, ctx.now, data.profile.settings.followUpAfterDays);
  return {
    applicationId: application.id,
    company: companyVM(application.company, application.companyDomain),
    role: application.role,
    location: application.location,
    status,
    age: {
      label: ctx.intl.formatMessage(days === 0 ? messages.ageNew : messages.ageDays, { days }),
      accessibleLabel: ctx.intl.formatMessage(
        days === 0 ? messages.ageNewAccessible : messages.ageDaysAccessible,
        { days, status: status.label },
      ),
      since: relativeTime(application.statusChangedAt, ctx),
    },
    nextAction:
      application.nextAction === null
        ? null
        : {
            label: application.nextAction,
            due: application.nextActionAt ? dayAndTime(application.nextActionAt, ctx) : null,
          },
    staleness: silence ? ctx.intl.formatMessage(messages.staleness, { days: silence.silentDays }) : null,
    autoMove:
      latestMove === null || latestMove.actor === "user"
        ? null
        : latestMove.evidence?.mailMessageId
          ? ctx.intl.formatMessage(messages.autoMoveMail)
          : ctx.intl.formatMessage(messages.autoMove),
    stepForward: activeStep(application.status, 1, ctx),
    stepBack: activeStep(application.status, -1, ctx),
    moves: moveTargets(application.status, ctx),
    pendingSync:
      ctx.pendingWrites.has(application.id) || events.some((event) => ctx.pendingWrites.has(event.id)),
  };
}

/** Board order ("Next action" sort): dated next actions soonest first, then longest in stage. */
function boardOrder(a: Application, b: Application): number {
  const aDue = a.nextActionAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDue = b.nextActionAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.statusChangedAt.getTime() - b.statusChangedAt.getTime();
}

function columnVM(
  status: ApplicationStatus,
  data: BoardData,
  ctx: ModelContext,
  firstUse: boolean,
): TrackerColumnVM {
  const members = data.applications
    .filter((application) => application.status === status)
    .toSorted(boardOrder);
  const vm = statusVM(status, ctx.intl);
  const oldest = members.reduce((max, application) => Math.max(max, daysInStage(application, ctx)), -1);
  return {
    status: vm,
    count: members.length,
    countLabel: ctx.intl.formatNumber(members.length),
    accessibleLabel: ctx.intl.formatMessage(messages.columnAccessible, {
      status: vm.label,
      count: members.length,
    }),
    oldestLabel:
      oldest === -1
        ? null
        : ctx.intl.formatMessage(oldest === 0 ? messages.oldestToday : messages.oldestDays, { days: oldest }),
    oldestAccessibleLabel:
      oldest === -1
        ? null
        : ctx.intl.formatMessage(
            oldest === 0 ? messages.oldestTodayAccessible : messages.oldestDaysAccessible,
            { days: oldest },
          ),
    cards: members.map((application) => cardVM(application, data, ctx)),
    emptyLine: members.length === 0 && !firstUse ? ctx.intl.formatMessage(messages.columnEmpty) : null,
    collapsedByDefault:
      !firstUse && (members.length === 0 || (status === "saved" && members.length > SAVED_COLLAPSE_ABOVE)),
  };
}

export function buildTrackerBoardModel(
  data: UserData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): TrackerBoardModel {
  const firstUse = data.applications.length === 0;
  const columns = ACTIVE_STATUSES.map((status) => columnVM(status, data, ctx, firstUse));
  const outcomes = TERMINAL_STATUSES.map((status) => columnVM(status, data, ctx, firstUse));
  const closedCount = outcomes.reduce((sum, outcome) => sum + outcome.count, 0);
  const nudges = nudgeVMs(data, ctx);

  const application = data.applications.find((candidate) => candidate.id === params["applicationId"]);
  // The selected card sits in its status's column: reuse its order, moves and sync state.
  const siblings =
    [...columns, ...outcomes].find((column) => column.status.key === application?.status)?.cards ?? [];
  const index = siblings.findIndex((card) => card.applicationId === application?.id);
  const card = siblings[index];
  const selected: TrackerSelectionVM | null =
    application && card
      ? {
          applicationId: card.applicationId,
          company: card.company,
          role: card.role,
          location: card.location,
          status: card.status,
          position: {
            label: ctx.intl.formatMessage(messages.position, {
              position: index + 1,
              total: siblings.length,
              status: card.status.label,
            }),
            previousId: siblings[index - 1]?.applicationId ?? null,
            nextId: siblings[index + 1]?.applicationId ?? null,
          },
          nextAction: card.nextAction,
          nudge: nudges.find((nudge) => nudge.applicationId === card.applicationId) ?? null,
          summary: applicationSummaryVM(application, data, ctx),
          timeline: timelineVMs(application, data, ctx),
          moves: card.moves,
          pendingSync: card.pendingSync,
        }
      : null;

  // Outcome names and counts as ICU arguments ({accepted} {acceptedCount}, …) in core order.
  const outcomeValues = Object.fromEntries(
    outcomes.flatMap((outcome) => [
      [outcome.status.key, outcome.status.label],
      [`${outcome.status.key}Count`, outcome.count],
    ]),
  );

  return {
    columns,
    closedRail: {
      label: ctx.intl.formatMessage(messages.closed),
      count: closedCount,
      countLabel: ctx.intl.formatNumber(closedCount),
      accessibleLabel: ctx.intl.formatMessage(messages.closedAccessible, {
        ...outcomeValues,
        count: closedCount,
      }),
      outcomes,
      emptyLine: closedCount === 0 ? ctx.intl.formatMessage(messages.closedEmpty) : null,
    },
    nudges,
    selected,
    firstUse: firstUse
      ? {
          title: ctx.intl.formatMessage(messages.firstUseTitle),
          body: ctx.intl.formatMessage(messages.firstUseBody),
          primary: { label: ctx.intl.formatMessage(messages.firstUsePrimary), shortcut: "Mod+N" },
          secondary: { label: ctx.intl.formatMessage(messages.firstUseSecondary) },
          columnAddLabel: ctx.intl.formatMessage(messages.columnAdd),
        }
      : null,
  };
}
