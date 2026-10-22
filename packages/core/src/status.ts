import type { Application, ApplicationEvent, ApplicationEventDraft, EventEvidence } from "./application";
import type { ApplicationStatus, EventActor } from "./enums";

/**
 * §4.6 tracker state machine — the single implementation used by every client and by Cloud
 * Functions. Pure: no I/O, no clock; callers pass `at`/`now`.
 *
 * Progress order: saved < preparing < applied < acknowledged < screening < interviewing < offer
 * < accepted | declined. Side exits rejected, withdrawn, ghosted are reachable from any active
 * (progress) status. Accepted, declined and the side exits are terminal.
 */

export const ACTIVE_STATUSES = [
  "saved",
  "preparing",
  "applied",
  "acknowledged",
  "screening",
  "interviewing",
  "offer",
] as const satisfies readonly ApplicationStatus[];
export const OUTCOME_STATUSES = ["accepted", "declined"] as const satisfies readonly ApplicationStatus[];
export const SIDE_EXIT_STATUSES = [
  "rejected",
  "withdrawn",
  "ghosted",
] as const satisfies readonly ApplicationStatus[];
export const TERMINAL_STATUSES = [...OUTCOME_STATUSES, ...SIDE_EXIT_STATUSES] as const;

export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/** Statuses automation (`rule`/`ai`) may never set. */
export const AUTOMATION_FORBIDDEN_STATUSES = [
  "accepted",
  "declined",
  "withdrawn",
  "ghosted",
] as const satisfies readonly ApplicationStatus[];

/** Progress rank of the active statuses. */
const ACTIVE_RANK: Record<ActiveStatus, number> = {
  saved: 0,
  preparing: 1,
  applied: 2,
  acknowledged: 3,
  screening: 4,
  interviewing: 5,
  offer: 6,
};

/** Rank in the progress order (accepted/declined rank above offer); side exits have none. */
export function statusRank(status: ApplicationStatus): number | null {
  if (isActiveStatus(status)) return ACTIVE_RANK[status];
  return status === "accepted" || status === "declined" ? ACTIVE_RANK.offer + 1 : null;
}

export function isActiveStatus(status: ApplicationStatus): status is ActiveStatus {
  return (ACTIVE_STATUSES as readonly ApplicationStatus[]).includes(status);
}

export function isTerminalStatus(status: ApplicationStatus): status is TerminalStatus {
  return !isActiveStatus(status);
}

/**
 * Phase grouping shared by board, iPhone sections, filters and Insights:
 * Shortlist (saved, preparing) · In progress (applied → offer) · Closed (terminal statuses).
 */
export type StatusPhase = "shortlist" | "in_progress" | "closed";

export function statusPhase(status: ApplicationStatus): StatusPhase {
  if (status === "saved" || status === "preparing") return "shortlist";
  return isActiveStatus(status) ? "in_progress" : "closed";
}

export type TransitionDirection = "forward" | "backward" | "exit" | "reopen" | "correction";

export type TransitionDenial =
  /** `to` equals `from`. */
  | "same_status"
  /** Automation targeting accepted/declined/withdrawn/ghosted. */
  | "automation_forbidden_target"
  /** Automation moving to a lower progress rank. */
  | "automation_backward"
  /** Automation moving a terminal application (only the user reopens). */
  | "automation_from_terminal"
  /** Accepted/declined are reachable only from offer. */
  | "outcome_requires_offer";

export type TransitionCheck =
  | { readonly allowed: true; readonly direction: TransitionDirection }
  | { readonly allowed: false; readonly reason: TransitionDenial };

/** Whether `actor` may move an application from `from` to `to`, and how the move is classified. */
export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: EventActor,
): TransitionCheck {
  if (from === to) return { allowed: false, reason: "same_status" };
  const automated = actor !== "user";

  if (isTerminalStatus(from)) {
    if (automated) return { allowed: false, reason: "automation_from_terminal" };
    return { allowed: true, direction: isActiveStatus(to) ? "reopen" : "correction" };
  }

  if (automated && (AUTOMATION_FORBIDDEN_STATUSES as readonly ApplicationStatus[]).includes(to)) {
    return { allowed: false, reason: "automation_forbidden_target" };
  }
  if (to === "accepted" || to === "declined") {
    return from === "offer"
      ? { allowed: true, direction: "forward" }
      : { allowed: false, reason: "outcome_requires_offer" };
  }
  if (!isActiveStatus(to)) return { allowed: true, direction: "exit" };
  if (ACTIVE_RANK[to] > ACTIVE_RANK[from]) return { allowed: true, direction: "forward" };
  if (automated) return { allowed: false, reason: "automation_backward" };
  return { allowed: true, direction: "backward" };
}

export type TransitionErrorCode =
  | TransitionDenial
  | RevertDenial
  /** Automation must state confidence and evidence. */
  | "automation_needs_evidence";

export class TransitionError extends Error {
  readonly code: TransitionErrorCode;

  constructor(code: TransitionErrorCode, message: string) {
    super(message);
    this.name = "TransitionError";
    this.code = code;
  }
}

export interface TransitionInput {
  readonly application: Pick<Application, "id" | "status" | "appliedAt">;
  readonly to: ApplicationStatus;
  readonly actor: EventActor;
  readonly at: Date;
  /** Required for `rule`/`ai`; ignored for `user`. */
  readonly confidence?: number;
  /** Required for `rule`/`ai`; optional context for `user`. */
  readonly evidence?: EventEvidence;
  /** Optional note shown on the timeline. */
  readonly text?: string;
}

export interface ApplicationStatusPatch {
  readonly status: ApplicationStatus;
  readonly statusChangedAt: Date;
  /** Set when the application first reaches applied (or beyond) without an `appliedAt`. */
  readonly appliedAt?: Date;
}

export interface TransitionResult {
  readonly status: ApplicationStatus;
  readonly direction: TransitionDirection;
  /** Event to append to `applicationEvents` (id assigned by the writer). */
  readonly event: ApplicationEventDraft;
  /** Fields to write on the application in the same batch as the event. */
  readonly applicationPatch: ApplicationStatusPatch;
}

/**
 * Validates and performs a status transition. Throws `TransitionError` when the actor may not
 * make the move; use `canTransition` to gate UI affordances without throwing.
 */
export function transition(input: TransitionInput): TransitionResult {
  const { application, to, actor, at } = input;
  const check = canTransition(application.status, to, actor);
  if (!check.allowed) {
    throw new TransitionError(
      check.reason,
      `${actor} may not move ${application.status} → ${to} (${check.reason})`,
    );
  }

  const automated = actor !== "user";
  if (automated && (input.confidence === undefined || input.evidence === undefined)) {
    throw new TransitionError(
      "automation_needs_evidence",
      `${actor} transitions need confidence and evidence`,
    );
  }
  if (input.confidence !== undefined && (input.confidence < 0 || input.confidence > 1)) {
    throw new RangeError(`confidence must be within [0, 1], got ${input.confidence}`);
  }

  const reachesApplied =
    check.direction === "forward" && (!isActiveStatus(to) || ACTIVE_RANK[to] >= ACTIVE_RANK.applied);
  const applicationPatch: ApplicationStatusPatch =
    reachesApplied && application.appliedAt === null
      ? { status: to, statusChangedAt: at, appliedAt: at }
      : { status: to, statusChangedAt: at };

  return {
    status: to,
    direction: check.direction,
    event: {
      applicationId: application.id,
      type: "status_changed",
      fromStatus: application.status,
      toStatus: to,
      actor,
      confidence: automated ? (input.confidence ?? null) : null,
      evidence: input.evidence ?? null,
      text: input.text ?? null,
      revertsEventId: null,
      occurredAt: at,
      createdAt: at,
    },
    applicationPatch,
  };
}

/** Id of the event that reverted `eventId`, or null. Derives the brief's `reverted_by`. */
export function revertedBy(eventId: string, events: readonly ApplicationEvent[]): string | null {
  return events.find((event) => event.revertsEventId === eventId)?.id ?? null;
}

export type RevertDenial =
  /** Not a status change, itself an undo, or of another application. */
  | "not_revertible"
  | "already_reverted"
  /** A newer status move exists ("Can't undo — the status changed since"). */
  | "superseded";

export type RevertCheck =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: RevertDenial };

export interface RevertInput {
  readonly application: Pick<Application, "id" | "status">;
  /** The status change to undo. */
  readonly event: ApplicationEvent;
  /** Events of the application (any order), used to find newer moves and earlier undos. */
  readonly events: readonly ApplicationEvent[];
  readonly at: Date;
  readonly text?: string;
}

/**
 * Whether Undo is offered for `event`: only while it is the application's latest status move
 * and the application still sits in the status it moved to. No time limit.
 */
export function canRevert({ application, event, events }: Omit<RevertInput, "at" | "text">): RevertCheck {
  if (
    event.type !== "status_changed" ||
    event.fromStatus === null ||
    event.toStatus === null ||
    event.revertsEventId !== null ||
    event.applicationId !== application.id
  ) {
    return { allowed: false, reason: "not_revertible" };
  }
  if (revertedBy(event.id, events) !== null) return { allowed: false, reason: "already_reverted" };
  const newerMove = events.some(
    (other) =>
      other.id !== event.id &&
      other.applicationId === application.id &&
      (other.type === "status_changed" || other.type === "created") &&
      other.occurredAt.getTime() > event.occurredAt.getTime(),
  );
  if (newerMove || application.status !== event.toStatus) return { allowed: false, reason: "superseded" };
  return { allowed: true };
}

/**
 * Undo of a status change (typically an automatic one): appends the inverse transition, made by
 * the user and linked through `revertsEventId`; the original event is never edited. Permitted
 * whenever `canRevert` allows it, so even moves that are otherwise gated (e.g. back into accepted
 * after a mistaken reopen) restore exactly.
 */
export function revert(input: RevertInput): TransitionResult {
  const { application, event, at } = input;
  const allowed = canRevert(input);
  if (!allowed.allowed) {
    throw new TransitionError(
      allowed.reason,
      `Event ${event.id} of ${application.id} cannot be undone (${allowed.reason})`,
    );
  }
  if (event.fromStatus === null || event.toStatus === null) {
    throw new TransitionError("not_revertible", `Event ${event.id} is not a status change`);
  }
  const to = event.fromStatus;
  const check = canTransition(event.toStatus, to, "user");
  return {
    status: to,
    direction: check.allowed ? check.direction : "correction",
    event: {
      applicationId: application.id,
      type: "status_changed",
      fromStatus: event.toStatus,
      toStatus: to,
      actor: "user",
      confidence: null,
      evidence: null,
      text: input.text ?? null,
      revertsEventId: event.id,
      occurredAt: at,
      createdAt: at,
    },
    applicationPatch: { status: to, statusChangedAt: at },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Suggestions. Never applied automatically: the UI offers them, the user decides.
 * ---------------------------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

export const DEFAULT_GHOSTED_AFTER_DAYS = 21;
export const DEFAULT_FOLLOW_UP_AFTER_DAYS = 7;

/** Statuses where silence from the employer can mean ghosting. */
export const GHOSTABLE_STATUSES = [
  "applied",
  "acknowledged",
  "screening",
  "interviewing",
] as const satisfies readonly ApplicationStatus[];

/** Events that count as employer activity (or a status update the user learned of). */
const SIGNAL_EVENT_TYPES: readonly ApplicationEvent["type"][] = [
  "created",
  "status_changed",
  "mail_received",
  "interview_scheduled",
];

export interface GhostedSuggestion {
  readonly kind: "ghosted";
  /** Time of the last signal. */
  readonly silentSince: Date;
  readonly silentDays: number;
}

export interface FollowUpSuggestion {
  readonly kind: "follow_up";
  /** Application time or last follow-up sent, whichever is later. */
  readonly since: Date;
  readonly dueAt: Date;
}

type SuggestionApplication = Pick<Application, "id" | "status" | "appliedAt" | "statusChangedAt">;

function assertDays(days: number): void {
  if (!Number.isInteger(days) || days < 1)
    throw new RangeError(`days must be a positive integer, got ${days}`);
}

/** This application's events, minus undone ones and the undo events themselves. */
function effectiveEvents(applicationId: string, events: readonly ApplicationEvent[]): ApplicationEvent[] {
  const own = events.filter((event) => event.applicationId === applicationId);
  const reverted = new Set(
    own.flatMap((event) => (event.revertsEventId === null ? [] : [event.revertsEventId])),
  );
  return own.filter((event) => event.revertsEventId === null && !reverted.has(event.id));
}

/**
 * Suggest marking the application Ghosted after `days` (default 21) days without any signal.
 * Returns null when not applicable.
 */
export function suggestGhosted(
  application: SuggestionApplication,
  events: readonly ApplicationEvent[],
  now: Date,
  days: number = DEFAULT_GHOSTED_AFTER_DAYS,
): GhostedSuggestion | null {
  assertDays(days);
  if (!(GHOSTABLE_STATUSES as readonly ApplicationStatus[]).includes(application.status)) return null;

  const signals = effectiveEvents(application.id, events)
    .filter((event) => SIGNAL_EVENT_TYPES.includes(event.type))
    .map((event) => event.occurredAt.getTime());
  if (application.appliedAt !== null) signals.push(application.appliedAt.getTime());
  const last = signals.length > 0 ? Math.max(...signals) : application.statusChangedAt.getTime();

  const silentDays = Math.floor((now.getTime() - last) / DAY_MS);
  return silentDays >= days ? { kind: "ghosted", silentSince: new Date(last), silentDays } : null;
}

/**
 * Suggest a follow-up `days` (default 7) after applying (or after the last follow-up sent) while
 * the application is still Applied and nothing has been received since applying.
 */
export function followUpDue(
  application: SuggestionApplication,
  events: readonly ApplicationEvent[],
  now: Date,
  days: number = DEFAULT_FOLLOW_UP_AFTER_DAYS,
): FollowUpSuggestion | null {
  assertDays(days);
  if (application.status !== "applied") return null;

  const appliedAt = (application.appliedAt ?? application.statusChangedAt).getTime();
  const after = effectiveEvents(application.id, events).filter(
    (event) => event.occurredAt.getTime() >= appliedAt,
  );
  if (after.some((event) => event.type === "mail_received")) return null;

  const since = Math.max(
    appliedAt,
    ...after.filter((event) => event.type === "mail_sent").map((event) => event.occurredAt.getTime()),
  );
  const dueAt = since + days * DAY_MS;
  return now.getTime() >= dueAt
    ? { kind: "follow_up", since: new Date(since), dueAt: new Date(dueAt) }
    : null;
}
