/**
 * One application's path through the Insights funnel, derived from its append-only events
 * (decisions.md D30). Undone moves and the undo events themselves are ignored, so an undone
 * "Interviewing" never counts as a response.
 */
import type { Application, ApplicationEvent, Interview } from "../application";
import type { ApplicationStatus, MailCategory } from "../enums";
import { statusRank } from "../status";
import { type CivilDate, civilDate } from "./calendar";
import { type Market, marketOf } from "./market";

/** The application fields Insights reads. */
export type InsightsApplication = Pick<
  Application,
  "id" | "status" | "appliedAt" | "channel" | "source" | "cvId" | "location"
>;

/** The event fields Insights reads. */
export type InsightsEvent = Pick<
  ApplicationEvent,
  "id" | "applicationId" | "type" | "toStatus" | "revertsEventId" | "occurredAt" | "evidence"
>;

export type InsightsInterview = Pick<Interview, "id" | "applicationId" | "startsAt">;

export interface InsightsInput {
  readonly applications: readonly InsightsApplication[];
  /** Events of other (e.g. deleted) applications are ignored. */
  readonly events: readonly InsightsEvent[];
  /** For "interviews held" in the weekly activity. */
  readonly interviews?: readonly InsightsInterview[];
  /**
   * Category of each linked mail message by id (`mailMessages/{id}.category`). A `mail_received`
   * event is a response when its `evidence.mailMessageId` maps to a response category.
   */
  readonly mailCategories?: Readonly<Record<string, MailCategory>>;
}

/** Status moves that are an employer's decision (D30 rule 1). */
export const RESPONSE_STATUSES = [
  "screening",
  "interviewing",
  "offer",
  "rejected",
] as const satisfies readonly ApplicationStatus[];

/** Mail categories that are a human reply about the application (D30 rule 2, F10). */
export const RESPONSE_MAIL_CATEGORIES = [
  "interview_invite",
  "assessment",
  "offer",
  "rejection",
  "info_request",
] as const satisfies readonly MailCategory[];

/** A `mail_sent` within this long after applying is the application itself, not a follow-up. */
export const APPLICATION_MAIL_WINDOW_MS = 3_600_000;

/** Groups for applications without a source / channel / CV / known market. */
export const NONE_KEY = "none";

export interface Journey {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly source: string;
  readonly channel: string;
  readonly cv: string;
  readonly market: Market;
  /** When the application was sent; null when it never reached Applied. */
  readonly appliedAt: Date | null;
  readonly appliedDate: CivilDate | null;
  readonly responded: boolean;
  /** Time of the first response; null when there is none or its time is unknown. */
  readonly respondedAt: Date | null;
  readonly interviewed: boolean;
  readonly interviewedAt: Date | null;
  readonly offered: boolean;
  readonly offeredAt: Date | null;
  /** Follow-up emails sent after applying. */
  readonly followUps: readonly Date[];
}

const APPLIED_RANK = statusRank("applied") ?? 0;
const INTERVIEW_RANK = statusRank("interviewing") ?? 0;
const OFFER_RANK = statusRank("offer") ?? 0;
const SIDE_EXITS: readonly ApplicationStatus[] = ["rejected", "withdrawn", "ghosted"];

const atLeast = (status: ApplicationStatus, rank: number) => (statusRank(status) ?? -1) >= rank;

/**
 * The journey of `application` from `events` (any order; other applications' events are skipped).
 *
 * - Applied: a kept `created` or `status_changed` reaching Applied or later, or a `created` into a
 *   closed status when `appliedAt` is set (logged or imported after the fact). The time is
 *   `application.appliedAt` (the spreadsheet date for imports), else that event's time.
 * - A stage reached by the `created` event itself counts, but its time is unknown.
 * - Response: the first kept move to a response status after Applied, or a `mail_received` at or
 *   after the applied time whose linked message has a response category.
 */
export function buildJourney(
  application: InsightsApplication,
  events: readonly InsightsEvent[],
  mailCategories: Readonly<Record<string, MailCategory>>,
  timeZone: string,
): Journey {
  const own = events.filter((event) => event.applicationId === application.id);
  const undone = new Set(
    own.flatMap((event) => (event.revertsEventId === null ? [] : [event.revertsEventId])),
  );
  const kept = own
    .filter((event) => event.revertsEventId === null && !undone.has(event.id))
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.occurredAt.getTime() - b.event.occurredAt.getTime() || a.index - b.index)
    .map(({ event }) => event);

  let applied = false;
  let appliedAt: Date | null = null;
  let responded = false;
  let respondedAt: Date | null = null;
  let interviewed = false;
  let interviewedAt: Date | null = null;
  let offered = false;
  let offeredAt: Date | null = null;
  const mails: Date[] = [];
  const sent: Date[] = [];

  for (const event of kept) {
    const to = event.toStatus;
    if (event.type === "created" && to !== null) {
      const closedWithDate = SIDE_EXITS.includes(to) && application.appliedAt !== null;
      if (!atLeast(to, APPLIED_RANK) && !closedWithDate) continue;
      applied = true;
      appliedAt = application.appliedAt ?? event.occurredAt;
      // Logged or imported at a later stage: reached, time unknown.
      if ((RESPONSE_STATUSES as readonly ApplicationStatus[]).includes(to) || atLeast(to, OFFER_RANK)) {
        responded = true;
      }
      if (atLeast(to, INTERVIEW_RANK)) interviewed = true;
      if (atLeast(to, OFFER_RANK)) offered = true;
    } else if (event.type === "status_changed" && to !== null) {
      if (!applied) {
        if (!atLeast(to, APPLIED_RANK)) continue;
        applied = true;
        appliedAt = application.appliedAt ?? event.occurredAt;
        // Saved → Interviewing in one move: applied and responded together; the time is unknown.
        if ((RESPONSE_STATUSES as readonly ApplicationStatus[]).includes(to)) responded = true;
        if (atLeast(to, INTERVIEW_RANK)) interviewed = true;
        if (atLeast(to, OFFER_RANK)) offered = true;
        continue;
      }
      if (!responded && (RESPONSE_STATUSES as readonly ApplicationStatus[]).includes(to)) {
        responded = true;
        respondedAt = event.occurredAt;
      }
      if (!interviewed && atLeast(to, INTERVIEW_RANK)) {
        interviewed = true;
        interviewedAt = event.occurredAt;
      }
      if (!offered && atLeast(to, OFFER_RANK)) {
        offered = true;
        offeredAt = event.occurredAt;
      }
    } else if (event.type === "mail_received") {
      const id = event.evidence?.mailMessageId ?? null;
      const category = id === null ? undefined : mailCategories[id];
      if (
        category !== undefined &&
        (RESPONSE_MAIL_CATEGORIES as readonly MailCategory[]).includes(category)
      ) {
        mails.push(event.occurredAt);
      }
    } else if (event.type === "mail_sent") {
      sent.push(event.occurredAt);
    }
  }

  if (applied && appliedAt !== null) {
    const appliedTime = appliedAt.getTime();
    const mail = mails.find((at) => at.getTime() >= appliedTime);
    if (
      mail !== undefined &&
      (!responded || (respondedAt !== null && mail.getTime() < respondedAt.getTime()))
    ) {
      responded = true;
      respondedAt = mail;
    }
    // An untimed response (created/one-move) stays untimed even when a reply email follows later.
  }

  const appliedTime = appliedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return {
    id: application.id,
    status: application.status,
    source: application.source ?? NONE_KEY,
    channel: application.channel ?? NONE_KEY,
    cv: application.cvId ?? NONE_KEY,
    market: marketOf(application.location) ?? NONE_KEY,
    appliedAt: applied ? appliedAt : null,
    appliedDate: applied && appliedAt !== null ? civilDate(appliedAt, timeZone) : null,
    responded: applied && responded,
    respondedAt: applied ? respondedAt : null,
    interviewed: applied && interviewed,
    interviewedAt: applied ? interviewedAt : null,
    offered: applied && offered,
    offeredAt: applied ? offeredAt : null,
    followUps: applied ? sent.filter((at) => at.getTime() > appliedTime + APPLICATION_MAIL_WINDOW_MS) : [],
  };
}
