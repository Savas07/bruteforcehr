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
  isActiveStatus,
  suggestGhosted,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import type { ApplicationSummaryVM, NudgeVM, TimelineEventVM } from "../../shared/model/blocks";
import { applicationSummaryVM, nudgeVMs, timelineVMs } from "../../shared/model/build-blocks";
import { defineMessages, type IntlShape } from "react-intl";
import { calendarDaysFromNow, dayAndTime, relativeTime } from "../../shared/model/format";
import type { CompanyVM, ModelContext, StatusVM, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, MOVE_DENIAL_MESSAGES, sourceVM, statusVM } from "../../shared/model/vocabulary";

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
  timelineMovedTo: {
    id: "tracker-board.timeline.movedTo",
    defaultMessage: "Moved to {status}",
    description: "Timeline title of a move the user just made; {status} is a status name",
  },
  timelineUndidMove: {
    id: "tracker-board.timeline.undidMove",
    defaultMessage: "Undid a move · back to {status}",
    description: "Timeline title after undoing an automatic move; {status} is the status it returned to",
  },
  undoSuperseded: {
    id: "tracker-board.timeline.undoSuperseded",
    defaultMessage: "Can't undo — the status changed since.",
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
  /** Whole calendar days in the current stage (0 = since today): the column's "oldest" line. */
  readonly daysInStage: number;
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
  /** "What usually happens next" per status, so a local move can re-word `summary.nextStep`. */
  readonly nextStepByStatus: Readonly<Record<ApplicationStatus, string | null>>;
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
  /** The model's "now", for events a local (optimistic) move adds to the timeline. */
  readonly justNow: TimeVM;
}

type BoardData = Pick<
  UserData,
  "applications" | "applicationEvents" | "interviews" | "profile" | "cvs" | "coverLetters"
>;

const ALL_STATUSES: readonly ApplicationStatus[] = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

function moveTargets(from: ApplicationStatus, intl: IntlShape): MoveTargetVM[] {
  return ALL_STATUSES.map((to) => {
    const check = canTransition(from, to, "user");
    return {
      status: statusVM(to, intl),
      current: to === from,
      disabledReason:
        !check.allowed && check.reason === "outcome_requires_offer"
          ? intl.formatMessage(MOVE_DENIAL_MESSAGES.outcome_requires_offer)
          : null,
    };
  });
}

function activeStep(status: ApplicationStatus, offset: 1 | -1, intl: IntlShape): StatusVM | null {
  const index = ACTIVE_STATUSES.findIndex((candidate) => candidate === status);
  if (index === -1) return null;
  const target = ACTIVE_STATUSES[index + offset];
  return target ? statusVM(target, intl) : null;
}

function daysInStage(application: Application, ctx: ModelContext): number {
  return Math.max(0, -calendarDaysFromNow(application.statusChangedAt, ctx));
}

function ageVM(days: number, status: StatusVM, since: TimeVM, intl: IntlShape): TrackerCardVM["age"] {
  return {
    label: intl.formatMessage(days === 0 ? messages.ageNew : messages.ageDays, { days }),
    accessibleLabel: intl.formatMessage(days === 0 ? messages.ageNewAccessible : messages.ageDaysAccessible, {
      days,
      status: status.label,
    }),
    since,
  };
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
    age: ageVM(days, status, relativeTime(application.statusChangedAt, ctx), ctx.intl),
    daysInStage: days,
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
    stepForward: activeStep(application.status, 1, ctx.intl),
    stepBack: activeStep(application.status, -1, ctx.intl),
    moves: moveTargets(application.status, ctx.intl),
    pendingSync:
      ctx.pendingWrites.has(application.id) || events.some((event) => ctx.pendingWrites.has(event.id)),
  };
}

/**
 * Board order ("Next action" sort): dated next actions soonest first, then longest in stage. Works
 * on card view-models so local moves keep the order the builder uses.
 */
function boardOrder(a: TrackerCardVM, b: TrackerCardVM): number {
  const due = (card: TrackerCardVM) =>
    card.nextAction?.due ? Date.parse(card.nextAction.due.iso) : Number.POSITIVE_INFINITY;
  const aDue = due(a);
  const bDue = due(b);
  if (aDue !== bDue) return aDue - bDue;
  return Date.parse(a.age.since.iso) - Date.parse(b.age.since.iso);
}

/** A column from its (already ordered) cards: counts, oldest age, empty line and default collapse. */
function columnFromCards(
  status: StatusVM,
  cards: readonly TrackerCardVM[],
  intl: IntlShape,
  firstUse: boolean,
): TrackerColumnVM {
  const oldest = cards.reduce((max, card) => Math.max(max, card.daysInStage), -1);
  return {
    status,
    count: cards.length,
    countLabel: intl.formatNumber(cards.length),
    accessibleLabel: intl.formatMessage(messages.columnAccessible, {
      status: status.label,
      count: cards.length,
    }),
    oldestLabel:
      oldest === -1
        ? null
        : intl.formatMessage(oldest === 0 ? messages.oldestToday : messages.oldestDays, { days: oldest }),
    oldestAccessibleLabel:
      oldest === -1
        ? null
        : intl.formatMessage(oldest === 0 ? messages.oldestTodayAccessible : messages.oldestDaysAccessible, {
            days: oldest,
          }),
    cards,
    emptyLine: cards.length === 0 && !firstUse ? intl.formatMessage(messages.columnEmpty) : null,
    collapsedByDefault:
      !firstUse && (cards.length === 0 || (status.key === "saved" && cards.length > SAVED_COLLAPSE_ABOVE)),
  };
}

function columnVM(
  status: ApplicationStatus,
  data: BoardData,
  ctx: ModelContext,
  firstUse: boolean,
): TrackerColumnVM {
  const cards = data.applications
    .filter((application) => application.status === status)
    .map((application) => cardVM(application, data, ctx))
    .toSorted(boardOrder);
  return columnFromCards(statusVM(status, ctx.intl), cards, ctx.intl, firstUse);
}

function closedRailVM(outcomes: readonly TrackerColumnVM[], intl: IntlShape): ClosedRailVM {
  const count = outcomes.reduce((sum, outcome) => sum + outcome.count, 0);
  // Outcome names and counts as ICU arguments ({accepted} {acceptedCount}, …) in core order.
  const outcomeValues = Object.fromEntries(
    outcomes.flatMap((outcome) => [
      [outcome.status.key, outcome.status.label],
      [`${outcome.status.key}Count`, outcome.count],
    ]),
  );
  return {
    label: intl.formatMessage(messages.closed),
    count,
    countLabel: intl.formatNumber(count),
    accessibleLabel: intl.formatMessage(messages.closedAccessible, { ...outcomeValues, count }),
    outcomes,
    emptyLine: count === 0 ? intl.formatMessage(messages.closedEmpty) : null,
  };
}

function positionVM(
  applicationId: string,
  columns: readonly TrackerColumnVM[],
  intl: IntlShape,
): TrackerSelectionVM["position"] | null {
  for (const column of columns) {
    const index = column.cards.findIndex((card) => card.applicationId === applicationId);
    if (index === -1) continue;
    return {
      label: intl.formatMessage(messages.position, {
        position: index + 1,
        total: column.cards.length,
        status: column.status.label,
      }),
      previousId: column.cards[index - 1]?.applicationId ?? null,
      nextId: column.cards[index + 1]?.applicationId ?? null,
    };
  }
  return null;
}

export function buildTrackerBoardModel(
  data: UserData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): TrackerBoardModel {
  const firstUse = data.applications.length === 0;
  const columns = ACTIVE_STATUSES.map((status) => columnVM(status, data, ctx, firstUse));
  const outcomes = TERMINAL_STATUSES.map((status) => columnVM(status, data, ctx, firstUse));
  const nudges = nudgeVMs(data, ctx);

  const application = data.applications.find((candidate) => candidate.id === params["applicationId"]);
  // The selected card sits in its status's column: reuse its order, moves and sync state.
  const card = [...columns, ...outcomes]
    .flatMap((column) => column.cards)
    .find((candidate) => candidate.applicationId === application?.id);
  const position = card ? positionVM(card.applicationId, [...columns, ...outcomes], ctx.intl) : null;
  const selected: TrackerSelectionVM | null =
    application && card && position
      ? {
          applicationId: card.applicationId,
          company: card.company,
          role: card.role,
          location: card.location,
          status: card.status,
          position,
          nextAction: card.nextAction,
          nudge: nudges.find((nudge) => nudge.applicationId === card.applicationId) ?? null,
          summary: applicationSummaryVM(application, data, ctx),
          timeline: timelineVMs(application, data, ctx),
          moves: card.moves,
          pendingSync: card.pendingSync,
          nextStepByStatus: Object.fromEntries(
            ALL_STATUSES.map((status) => [
              status,
              applicationSummaryVM({ ...application, status }, data, ctx).nextStep,
            ]),
          ) as Record<ApplicationStatus, string | null>,
        }
      : null;

  return {
    columns,
    closedRail: closedRailVM(outcomes, ctx.intl),
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
    justNow: relativeTime(ctx.now, ctx),
  };
}

// ─── Local (optimistic) moves ─────────────────────────────────────────────────────────────────

/**
 * One status move the user made on this device and that isn't in the data yet (M0 has no
 * backend; later milestones get it back from the Firestore cache). Undo removes it again.
 */
export interface BoardMove {
  /** Local event id (the timeline row it adds). */
  readonly id: string;
  readonly applicationId: string;
  readonly from: ApplicationStatus;
  readonly to: ApplicationStatus;
  /** Set when the move undoes an automatic change from the timeline (D11). */
  readonly revertsEventId: string | null;
}

/** Whether the user may move an application `from` → `to` (`@bfhr/core`, actor `user`). */
export type BoardMoveCheck =
  | { readonly allowed: true }
  /** `reason` is the D16 sentence ("Accepted and Declined come after an offer."); null for a no-op. */
  | { readonly allowed: false; readonly reason: string | null };

export function checkBoardMove(
  from: ApplicationStatus,
  to: ApplicationStatus,
  intl: IntlShape,
): BoardMoveCheck {
  const check = canTransition(from, to, "user");
  if (check.allowed) return { allowed: true };
  return {
    allowed: false,
    reason:
      check.reason === "outcome_requires_offer"
        ? intl.formatMessage(MOVE_DENIAL_MESSAGES.outcome_requires_offer)
        : null,
  };
}

/** Column headers for the loading and error states: the statuses are static, counts unknown. */
export function boardStatuses(intl: IntlShape): { active: StatusVM[]; closed: StatusVM[] } {
  return {
    active: ACTIVE_STATUSES.map((status) => statusVM(status, intl)),
    closed: TERMINAL_STATUSES.map((status) => statusVM(status, intl)),
  };
}

function applyOne(
  model: TrackerBoardModel,
  move: BoardMove,
  intl: IntlShape,
  pendingSync: boolean,
): TrackerBoardModel {
  const all = [...model.columns, ...model.closedRail.outcomes];
  const card = all
    .flatMap((column) => column.cards)
    .find((entry) => entry.applicationId === move.applicationId);
  // Stale (the card moved since) or refused by the state machine: the move doesn't apply.
  if (!card || card.status.key !== move.from || !checkBoardMove(move.from, move.to, intl).allowed)
    return model;

  const to = statusVM(move.to, intl);
  const moved: TrackerCardVM = {
    ...card,
    status: to,
    age: ageVM(0, to, model.justNow, intl),
    daysInStage: 0,
    staleness: null,
    autoMove: null,
    stepForward: activeStep(move.to, 1, intl),
    stepBack: activeStep(move.to, -1, intl),
    moves: moveTargets(move.to, intl),
    pendingSync: card.pendingSync || pendingSync,
  };
  const firstUse = model.firstUse !== null;
  const update = (column: TrackerColumnVM): TrackerColumnVM => {
    if (column.status.key === move.from)
      return columnFromCards(
        column.status,
        column.cards.filter((entry) => entry.applicationId !== move.applicationId),
        intl,
        firstUse,
      );
    if (column.status.key === move.to)
      return columnFromCards(column.status, [...column.cards, moved].toSorted(boardOrder), intl, firstUse);
    return column;
  };
  const columns = model.columns.map(update);
  const outcomes = model.closedRail.outcomes.map(update);

  let selected = model.selected;
  if (selected?.applicationId === move.applicationId) {
    const superseded = intl.formatMessage(messages.undoSuperseded);
    const event: TimelineEventVM = {
      id: move.id,
      kind: "status",
      title: intl.formatMessage(move.revertsEventId ? messages.timelineUndidMove : messages.timelineMovedTo, {
        status: to.label,
      }),
      detail: null,
      at: model.justNow,
      source: sourceVM("you", intl),
      move: { from: statusVM(move.from, intl), to },
      reason: null,
      mailMessageId: null,
      undo: null,
      reverted: false,
      pendingSync,
    };
    selected = {
      ...selected,
      status: to,
      moves: moved.moves,
      nudge: null,
      pendingSync: selected.pendingSync || pendingSync,
      summary: {
        ...selected.summary,
        status: to,
        nextStep: selected.nextStepByStatus[move.to],
        // Reaching Applied or beyond records the application date when none was set (core `transition`).
        appliedAt:
          selected.summary.appliedAt ??
          (isActiveStatus(move.to) && ACTIVE_STATUSES.indexOf(move.to) >= ACTIVE_STATUSES.indexOf("applied")
            ? model.justNow
            : null),
      },
      timeline: [
        event,
        ...selected.timeline.map((entry): TimelineEventVM => {
          if (entry.id === move.revertsEventId) return { ...entry, reverted: true };
          return entry.undo?.available ? { ...entry, undo: { available: false, reason: superseded } } : entry;
        }),
      ],
    };
  }

  return {
    ...model,
    columns,
    closedRail: closedRailVM(outcomes, intl),
    nudges: model.nudges.filter((nudge) => nudge.applicationId !== move.applicationId),
    selected,
  };
}

/**
 * The board with the user's local moves applied in order, each validated by `@bfhr/core` (stale or
 * refused moves are skipped): cards change column in board order with "New today" age, counts,
 * oldest ages and the Closed rail recount, and the selected record gains its timeline row (an undone
 * automatic move is tagged "Undone"; older Undo offers become "Can't undo"). `pendingSync` marks
 * moved cards and their rows as waiting to sync (offline).
 */
export function applyBoardMoves(
  model: TrackerBoardModel,
  moves: readonly BoardMove[],
  intl: IntlShape,
  options: { readonly pendingSync: boolean },
): TrackerBoardModel {
  const next = moves.reduce((current, move) => applyOne(current, move, intl, options.pendingSync), model);
  if (next === model || next.selected === null) return next;
  const position = positionVM(
    next.selected.applicationId,
    [...next.columns, ...next.closedRail.outcomes],
    intl,
  );
  return position ? { ...next, selected: { ...next.selected, position } } : next;
}
