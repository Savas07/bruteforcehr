/**
 * Conformance vectors for ports of the status state machine (packages/swift/BFHRCore). Every
 * expected value is computed by running the TypeScript implementation, which stays the source of
 * truth; the vectors only choose the inputs. Dates serialize as ISO-8601 (`Date.toJSON`).
 */
import {
  type ApplicationEvent,
  ApplicationEventSchema,
  type ApplicationStatus,
  ApplicationStatusSchema,
  canRevert,
  canTransition,
  type EventActor,
  EventActorSchema,
  type EventEvidence,
  followUpDue,
  matchBand,
  revert,
  statusPhase,
  statusRank,
  suggestGhosted,
  type SuggestionState,
  transition,
  TransitionError,
  visibleSuggestions,
} from "../src/index";

/** Bumped when the vector file layout changes (not when the expected values change). */
export const STATE_MACHINE_VECTORS_FORMAT = 1;

const STATUSES = ApplicationStatusSchema.options;
const ACTORS = EventActorSchema.options;
const DAY_MS = 86_400_000;
const T0 = new Date("2026-10-01T09:00:00.000Z");
const day = (days: number, ms = 0) => new Date(T0.getTime() + days * DAY_MS + ms);

/** Fields of an application the state machine reads (TS `Pick<Application, …>`). */
interface Subject {
  readonly id: string;
  readonly status: ApplicationStatus;
  readonly appliedAt: Date | null;
  readonly statusChangedAt: Date;
}

/** Thrown errors become data: `TransitionError` by code, `RangeError` as `invalid_argument`. */
type Outcome<T> = { readonly result: T } | { readonly error: string };

function outcome<T>(run: () => T): Outcome<T> {
  try {
    return { result: run() };
  } catch (error) {
    if (error instanceof TransitionError) return { error: error.code };
    if (error instanceof RangeError) return { error: "invalid_argument" };
    throw error;
  }
}

const evidence: EventEvidence = { mailMessageId: "mail-1", reason: "Reply from jobs@acme.com" };

interface TransitionCase {
  readonly name: string;
  readonly application: Subject;
  readonly to: ApplicationStatus;
  readonly actor: EventActor;
  readonly at: Date;
  readonly confidence?: number;
  readonly evidence?: EventEvidence;
  readonly text?: string;
}

function transitionCases() {
  const cases: TransitionCase[] = [];
  const at = day(3);
  for (const actor of ACTORS) {
    for (const from of STATUSES) {
      for (const appliedAt of [null, T0]) {
        for (const to of STATUSES) {
          const application: Subject = { id: "app-1", status: from, appliedAt, statusChangedAt: T0 };
          const automated = actor !== "user";
          cases.push({
            name: `${actor} ${from} → ${to}, appliedAt ${appliedAt === null ? "null" : "set"}`,
            application,
            to,
            actor,
            at,
            ...(automated ? { confidence: 0.93, evidence } : {}),
          });
        }
      }
    }
  }
  const base: Subject = { id: "app-2", status: "applied", appliedAt: T0, statusChangedAt: T0 };
  cases.push(
    { name: "rule without evidence", application: base, to: "screening", actor: "rule", at, confidence: 0.9 },
    { name: "ai without confidence", application: base, to: "screening", actor: "ai", at, evidence },
    { name: "ai with neither", application: base, to: "interviewing", actor: "ai", at },
    { name: "denial wins over missing evidence", application: base, to: "ghosted", actor: "ai", at },
    {
      name: "ai confidence above 1",
      application: base,
      to: "screening",
      actor: "ai",
      at,
      confidence: 1.2,
      evidence,
    },
    {
      name: "ai confidence below 0",
      application: base,
      to: "screening",
      actor: "ai",
      at,
      confidence: -0.1,
      evidence,
    },
    {
      name: "ai confidence exactly 1",
      application: base,
      to: "screening",
      actor: "ai",
      at,
      confidence: 1,
      evidence,
    },
    {
      name: "ai confidence exactly 0",
      application: base,
      to: "screening",
      actor: "ai",
      at,
      confidence: 0,
      evidence,
    },
    {
      name: "user confidence is validated",
      application: base,
      to: "screening",
      actor: "user",
      at,
      confidence: 2,
    },
    {
      name: "user confidence is dropped",
      application: base,
      to: "screening",
      actor: "user",
      at,
      confidence: 0.5,
    },
    {
      name: "user with evidence and text",
      application: base,
      to: "rejected",
      actor: "user",
      at,
      evidence: { mailMessageId: null, reason: "Phone call" },
      text: "They went with another candidate.",
    },
    {
      name: "rule with text",
      application: base,
      to: "acknowledged",
      actor: "rule",
      at,
      confidence: 0.99,
      evidence,
      text: "Auto-reply",
    },
  );
  return cases.map((input) => ({
    ...input,
    expected: outcome(() => transition(input)),
  }));
}

let nextEventId = 0;
function event(
  partial: Partial<ApplicationEvent> & Pick<ApplicationEvent, "type" | "occurredAt">,
): ApplicationEvent {
  nextEventId += 1;
  return ApplicationEventSchema.parse({
    id: `ev-${nextEventId}`,
    applicationId: "app-1",
    fromStatus: null,
    toStatus: null,
    actor: "user",
    confidence: null,
    evidence: null,
    text: null,
    revertsEventId: null,
    createdAt: partial.occurredAt,
    ...partial,
  });
}

interface RevertScenario {
  readonly name: string;
  readonly application: Subject;
  readonly event: ApplicationEvent;
  readonly events: readonly ApplicationEvent[];
  readonly at: Date;
  readonly text?: string;
}

function revertScenarios(): RevertScenario[] {
  const subject = (status: ApplicationStatus, id = "app-1"): Subject => ({
    id,
    status,
    appliedAt: T0,
    statusChangedAt: day(5),
  });
  const created = event({ type: "created", toStatus: "applied", occurredAt: T0 });
  const autoRejection = event({
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "rejected",
    actor: "ai",
    confidence: 0.94,
    evidence,
    occurredAt: day(5),
  });
  const undo = event({
    type: "status_changed",
    fromStatus: "rejected",
    toStatus: "applied",
    revertsEventId: autoRejection.id,
    occurredAt: day(6),
  });
  const reopen = event({
    type: "status_changed",
    fromStatus: "rejected",
    toStatus: "screening",
    occurredAt: day(6),
  });
  const backToRejected = event({
    type: "status_changed",
    fromStatus: "screening",
    toStatus: "rejected",
    occurredAt: day(7),
  });
  const note = event({ type: "note", text: "Asked for feedback", occurredAt: day(6) });
  const mail = event({ type: "mail_received", text: "Re: your application", occurredAt: day(6) });
  const sameInstant = event({
    type: "status_changed",
    fromStatus: "rejected",
    toStatus: "offer",
    occurredAt: day(5),
  });
  const laterCreated = event({ type: "created", toStatus: "saved", occurredAt: day(9) });
  const otherApp = event({
    type: "status_changed",
    applicationId: "app-2",
    fromStatus: "applied",
    toStatus: "screening",
    occurredAt: day(8),
  });
  const acceptedReopen = event({
    type: "status_changed",
    fromStatus: "accepted",
    toStatus: "interviewing",
    occurredAt: day(1),
  });
  const userForward = event({
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "screening",
    occurredAt: day(2),
  });
  const userBackward = event({
    type: "status_changed",
    fromStatus: "offer",
    toStatus: "screening",
    occurredAt: day(2),
  });
  const withdrawal = event({
    type: "status_changed",
    fromStatus: "interviewing",
    toStatus: "withdrawn",
    occurredAt: day(2),
  });
  const at = day(10);

  return [
    {
      name: "latest automatic rejection",
      application: subject("rejected"),
      event: autoRejection,
      events: [created, autoRejection],
      at,
    },
    {
      name: "with undo note",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection],
      at,
      text: "Not a rejection",
    },
    {
      name: "already reverted",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, undo],
      at,
    },
    {
      name: "status changed since",
      application: subject("applied"),
      event: autoRejection,
      events: [autoRejection],
      at,
    },
    {
      name: "newer move back to same status",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, reopen, backToRejected],
      at,
    },
    {
      name: "notes and mail do not supersede",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, note, mail],
      at,
    },
    {
      name: "same-instant move does not supersede",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, sameInstant],
      at,
    },
    {
      name: "newer created event supersedes",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, laterCreated],
      at,
    },
    {
      name: "other application's moves are ignored",
      application: subject("rejected"),
      event: autoRejection,
      events: [autoRejection, otherApp],
      at,
    },
    {
      name: "undo event itself",
      application: subject("applied"),
      event: undo,
      events: [autoRejection, undo],
      at,
    },
    { name: "created event", application: subject("applied"), event: created, events: [created], at },
    { name: "note event", application: subject("rejected"), event: note, events: [autoRejection, note], at },
    {
      name: "event of another application",
      application: subject("rejected", "app-9"),
      event: autoRejection,
      events: [],
      at,
    },
    {
      name: "event missing from the list",
      application: subject("rejected"),
      event: autoRejection,
      events: [],
      at,
    },
    {
      name: "restores across a gated move",
      application: subject("interviewing"),
      event: acceptedReopen,
      events: [acceptedReopen],
      at,
    },
    {
      name: "user forward move",
      application: subject("screening"),
      event: userForward,
      events: [created, userForward],
      at,
    },
    {
      name: "user backward move",
      application: subject("screening"),
      event: userBackward,
      events: [userBackward],
      at,
    },
    {
      name: "user withdrawal",
      application: subject("withdrawn"),
      event: withdrawal,
      events: [withdrawal],
      at,
    },
  ];
}

interface SuggestionCase {
  readonly name: string;
  readonly application: Subject;
  /** Key into `histories`: the application's events. */
  readonly history: string;
  readonly now: Date;
  readonly days?: number;
}

/** Event histories are shared by name so every case doesn't repeat them. */
function suggestionVectors() {
  const applied: Subject = { id: "app-1", status: "applied", appliedAt: T0, statusChangedAt: T0 };
  const received = event({ type: "mail_received", text: "Thanks for applying", occurredAt: day(5) });
  const receivedBefore = event({ type: "mail_received", text: "Job alert", occurredAt: day(-2) });
  const note = event({ type: "note", text: "Pinged the recruiter", occurredAt: day(15) });
  const sent = event({ type: "mail_sent", text: "Following up", occurredAt: day(8) });
  const sentAgain = event({ type: "mail_sent", text: "Second follow-up", occurredAt: day(16) });
  const scheduled = event({ type: "interview_scheduled", text: "Recruiter call", occurredAt: day(12) });
  const otherApp = event({ type: "mail_received", applicationId: "app-2", occurredAt: day(20) });
  const wrong = event({
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "screening",
    actor: "ai",
    confidence: 0.92,
    evidence,
    occurredAt: day(10),
  });
  const undo = event({
    type: "status_changed",
    fromStatus: "screening",
    toStatus: "applied",
    revertsEventId: wrong.id,
    occurredAt: day(11),
  });
  const revertedMail = event({ type: "mail_received", occurredAt: day(3) });
  const createdLater = event({ type: "created", toStatus: "applied", occurredAt: day(4) });

  const histories: Record<string, readonly ApplicationEvent[]> = {
    "no events": [],
    "mail received": [received],
    "mail received before applying": [receivedBefore],
    "notes and follow-ups only": [note, sent, sentAgain],
    "interview scheduled": [scheduled],
    "other application's mail": [otherApp],
    "reverted move and its undo": [wrong, undo],
    "created later": [createdLater],
    mixed: [received, note, sent, otherApp],
    "follow-up sent": [sent],
    // An undo pointing at a mail event removes it from the signals too.
    "undo of a mail event": [revertedMail, { ...undo, id: "ev-undo-mail", revertsEventId: revertedMail.id }],
  };
  const subjects: { name: string; application: Subject }[] = [
    ...STATUSES.map((status) => ({ name: status, application: { ...applied, status } })),
    {
      name: "applied without appliedAt",
      application: { ...applied, appliedAt: null, statusChangedAt: day(2) },
    },
    {
      name: "interviewing without appliedAt",
      application: { ...applied, status: "interviewing", appliedAt: null, statusChangedAt: day(2) },
    },
  ];
  const nows = [
    day(-1),
    day(0),
    day(6, -1),
    day(7),
    day(9),
    day(15),
    day(20, -1),
    day(21),
    day(23),
    day(26),
    day(37),
    day(60),
  ];

  const cases: SuggestionCase[] = [];
  for (const subject of subjects) {
    for (const history of Object.keys(histories)) {
      for (const now of nows) {
        cases.push({ name: `${subject.name}, ${history}`, application: subject.application, history, now });
      }
    }
  }
  for (const days of [1, 3, 10, 30]) {
    for (const now of [day(2), day(9), day(10), day(30), day(31)]) {
      cases.push({ name: `custom ${days} days`, application: applied, history: "follow-up sent", now, days });
    }
  }
  for (const days of [0, -1]) {
    cases.push({
      name: `invalid ${days} days`,
      application: applied,
      history: "no events",
      now: day(30),
      days,
    });
  }
  return {
    histories,
    cases: cases.map((input) => {
      const events = histories[input.history] ?? [];
      return {
        ...input,
        expectedGhosted: outcome(() => suggestGhosted(input.application, events, input.now, input.days)),
        expectedFollowUp: outcome(() => followUpDue(input.application, events, input.now, input.days)),
      };
    }),
  };
}

interface VisibleSuggestionCase {
  readonly name: string;
  readonly application: Subject & SuggestionState;
  readonly history: string;
  readonly now: Date;
  readonly settings: { readonly followUpAfterDays: number; readonly ghostedAfterDays: number };
}

/**
 * `visibleSuggestions`: the user's answers on the cards (Later / Not needed / Keep waiting) over
 * the same histories as `suggestions`.
 */
function visibleSuggestionVectors(histories: Readonly<Record<string, readonly ApplicationEvent[]>>) {
  const none: SuggestionState = {
    followUpSnoozedUntil: null,
    followUpDismissedAt: null,
    ghostedSnoozedUntil: null,
    ghostedDismissedAt: null,
  };
  const applied: Subject = { id: "app-1", status: "applied", appliedAt: T0, statusChangedAt: T0 };
  const states: { name: string; state: SuggestionState }[] = [
    { name: "no answers", state: none },
    { name: "follow-up later until day 10", state: { ...none, followUpSnoozedUntil: day(10) } },
    { name: "follow-up not needed on day 7", state: { ...none, followUpDismissedAt: day(7) } },
    { name: "follow-up not needed before applying", state: { ...none, followUpDismissedAt: day(-1) } },
    { name: "no response later until day 25", state: { ...none, ghostedSnoozedUntil: day(25) } },
    { name: "keep waiting on day 21", state: { ...none, ghostedDismissedAt: day(21) } },
    {
      name: "everything answered",
      state: {
        followUpSnoozedUntil: day(9),
        followUpDismissedAt: day(8),
        ghostedSnoozedUntil: day(22),
        ghostedDismissedAt: day(23),
      },
    },
  ];
  const subjects: { name: string; application: Subject }[] = [
    { name: "applied", application: applied },
    { name: "screening", application: { ...applied, status: "screening" } },
  ];
  const settingsList = [
    { followUpAfterDays: 7, ghostedAfterDays: 21 },
    { followUpAfterDays: 3, ghostedAfterDays: 10 },
  ];
  const nows = [day(6), day(7), day(10), day(21), day(24), day(25), day(42), day(60)];
  const cases: VisibleSuggestionCase[] = [];
  for (const subject of subjects)
    for (const { name, state } of states)
      for (const history of ["no events", "follow-up sent"])
        for (const settings of settingsList)
          for (const now of nows)
            cases.push({
              name: `${subject.name}, ${name}, ${history}, ${settings.followUpAfterDays}/${settings.ghostedAfterDays} days`,
              application: { ...subject.application, ...state },
              history,
              now,
              settings,
            });
  return cases.map((input) => ({
    ...input,
    expected: visibleSuggestions(
      input.application,
      histories[input.history] ?? [],
      input.now,
      input.settings,
    ),
  }));
}

/** The complete vector document written to `packages/core/conformance/state-machine.json`. */
export function buildStateMachineVectors() {
  nextEventId = 0;
  const transitions = transitionCases();
  const reverts = revertScenarios().map((scenario) => ({
    ...scenario,
    expectedCanRevert: canRevert(scenario),
    expected: outcome(() => revert(scenario)),
  }));
  const suggestions = suggestionVectors();
  return {
    format: STATE_MACHINE_VECTORS_FORMAT,
    statuses: STATUSES.map((status) => ({ status, rank: statusRank(status), phase: statusPhase(status) })),
    actors: ACTORS,
    canTransition: ACTORS.flatMap((actor) =>
      STATUSES.flatMap((from) =>
        STATUSES.map((to) => ({ from, to, actor, expected: canTransition(from, to, actor) })),
      ),
    ),
    transition: transitions,
    revert: reverts,
    suggestions,
    visibleSuggestions: visibleSuggestionVectors(suggestions.histories),
    matchBand: [-5, ...Array.from({ length: 101 }, (_, score) => score), 101, 150].map((score) => ({
      score,
      band: matchBand(score),
    })),
  };
}
