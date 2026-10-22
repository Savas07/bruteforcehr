import { describe, expect, it } from "vitest";
import { type ApplicationEvent, ApplicationEventSchema } from "./application";
import { type ApplicationStatus, ApplicationStatusSchema, type EventActor } from "./enums";
import {
  canRevert,
  canTransition,
  followUpDue,
  revert,
  revertedBy,
  statusPhase,
  statusRank,
  suggestGhosted,
  transition,
  TransitionError,
  type TransitionErrorCode,
} from "./status";

const ALL = ApplicationStatusSchema.options;
const ORDER: ApplicationStatus[] = [
  "saved",
  "preparing",
  "applied",
  "acknowledged",
  "screening",
  "interviewing",
  "offer",
];
const ACTORS: EventActor[] = ["user", "rule", "ai"];
const T0 = new Date("2026-10-01T09:00:00.000Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

function expectCode(fn: () => unknown, code: TransitionErrorCode) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TransitionError);
    expect((error as TransitionError).code).toBe(code);
    return;
  }
  throw new Error(`expected TransitionError ${code}`);
}

let nextId = 0;
function event(
  partial: Partial<ApplicationEvent> & Pick<ApplicationEvent, "type" | "occurredAt">,
): ApplicationEvent {
  nextId += 1;
  return ApplicationEventSchema.parse({
    id: `ev${nextId}`,
    applicationId: "app1",
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

describe("canTransition", () => {
  // Independent oracle written from §4.6, checked against every (from, to, actor) triple.
  function oracle(from: ApplicationStatus, to: ApplicationStatus, actor: EventActor): boolean {
    if (from === to) return false;
    const fromActive = ORDER.includes(from);
    const automated = actor !== "user";
    if (!fromActive) return !automated;
    if (to === "accepted" || to === "declined") return !automated && from === "offer";
    if (to === "withdrawn" || to === "ghosted") return !automated;
    if (to === "rejected") return true;
    return ORDER.indexOf(to) > ORDER.indexOf(from) || !automated;
  }

  for (const actor of ACTORS) {
    for (const from of ALL) {
      for (const to of ALL) {
        it(`${actor}: ${from} → ${to}`, () => {
          expect(canTransition(from, to, actor).allowed).toBe(oracle(from, to, actor));
        });
      }
    }
  }

  it("classifies moves and explains denials", () => {
    expect(canTransition("applied", "interviewing", "ai")).toEqual({ allowed: true, direction: "forward" });
    expect(canTransition("interviewing", "applied", "user")).toEqual({
      allowed: true,
      direction: "backward",
    });
    expect(canTransition("screening", "rejected", "rule")).toEqual({ allowed: true, direction: "exit" });
    expect(canTransition("rejected", "screening", "user")).toEqual({ allowed: true, direction: "reopen" });
    expect(canTransition("rejected", "withdrawn", "user")).toEqual({
      allowed: true,
      direction: "correction",
    });
    expect(canTransition("offer", "accepted", "user")).toEqual({ allowed: true, direction: "forward" });
    expect(canTransition("offer", "offer", "user")).toEqual({ allowed: false, reason: "same_status" });
    expect(canTransition("offer", "accepted", "ai")).toEqual({
      allowed: false,
      reason: "automation_forbidden_target",
    });
    expect(canTransition("applied", "ghosted", "rule")).toEqual({
      allowed: false,
      reason: "automation_forbidden_target",
    });
    expect(canTransition("interviewing", "screening", "ai")).toEqual({
      allowed: false,
      reason: "automation_backward",
    });
    expect(canTransition("rejected", "interviewing", "ai")).toEqual({
      allowed: false,
      reason: "automation_from_terminal",
    });
    expect(canTransition("interviewing", "accepted", "user")).toEqual({
      allowed: false,
      reason: "outcome_requires_offer",
    });
  });

  it("ranks the progress order", () => {
    expect(ORDER.map(statusRank)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(statusRank("accepted")).toBe(7);
    expect(statusRank("declined")).toBe(7);
    expect(statusRank("ghosted")).toBeNull();
  });
});

describe("transition", () => {
  const app = { id: "app1", status: "applied" as const, appliedAt: T0 };

  it("returns the new status, an event draft and the application patch", () => {
    const result = transition({
      application: app,
      to: "interviewing",
      actor: "ai",
      at: day(3),
      confidence: 0.94,
      evidence: { mailMessageId: "mail1", reason: "Interview invite for Frontend Engineer" },
    });
    expect(result.status).toBe("interviewing");
    expect(result.direction).toBe("forward");
    expect(result.event).toEqual({
      applicationId: "app1",
      type: "status_changed",
      fromStatus: "applied",
      toStatus: "interviewing",
      actor: "ai",
      confidence: 0.94,
      evidence: { mailMessageId: "mail1", reason: "Interview invite for Frontend Engineer" },
      text: null,
      revertsEventId: null,
      occurredAt: day(3),
      createdAt: day(3),
    });
    expect(result.applicationPatch).toEqual({ status: "interviewing", statusChangedAt: day(3) });
    expect(ApplicationEventSchema.safeParse({ id: "x", ...result.event }).success).toBe(true);
  });

  it("sets appliedAt when first reaching applied or beyond", () => {
    const saved = { id: "app1", status: "saved" as const, appliedAt: null };
    expect(
      transition({ application: saved, to: "applied", actor: "user", at: day(1) }).applicationPatch,
    ).toEqual({
      status: "applied",
      statusChangedAt: day(1),
      appliedAt: day(1),
    });
    expect(
      transition({
        application: saved,
        to: "acknowledged",
        actor: "rule",
        at: day(2),
        confidence: 0.99,
        evidence: { mailMessageId: "m", reason: "ATS confirmation" },
      }).applicationPatch.appliedAt,
    ).toEqual(day(2));
    expect(
      transition({ application: saved, to: "preparing", actor: "user", at: day(1) }).applicationPatch,
    ).not.toHaveProperty("appliedAt");
    expect(
      transition({ application: saved, to: "rejected", actor: "user", at: day(1) }).applicationPatch,
    ).not.toHaveProperty("appliedAt");
  });

  it("drops confidence for user moves and keeps optional user evidence", () => {
    const result = transition({
      application: app,
      to: "withdrawn",
      actor: "user",
      at: day(1),
      confidence: 0.5,
      evidence: { mailMessageId: null, reason: "Accepted another process" },
      text: "Took the Lumenpay offer",
    });
    expect(result.event.confidence).toBeNull();
    expect(result.event.evidence).toEqual({ mailMessageId: null, reason: "Accepted another process" });
    expect(result.event.text).toBe("Took the Lumenpay offer");
  });

  it("enforces actor permissions", () => {
    const evidence = { mailMessageId: "m", reason: "r" };
    expectCode(
      () => transition({ application: app, to: "ghosted", actor: "rule", at: T0, confidence: 1, evidence }),
      "automation_forbidden_target",
    );
    expectCode(
      () => transition({ application: app, to: "saved", actor: "ai", at: T0, confidence: 1, evidence }),
      "automation_backward",
    );
    expectCode(
      () =>
        transition({
          application: { ...app, status: "rejected" },
          to: "offer",
          actor: "ai",
          at: T0,
          confidence: 1,
          evidence,
        }),
      "automation_from_terminal",
    );
    expectCode(() => transition({ application: app, to: "applied", actor: "user", at: T0 }), "same_status");
    expectCode(
      () => transition({ application: app, to: "accepted", actor: "user", at: T0 }),
      "outcome_requires_offer",
    );
  });

  it("requires confidence and evidence from automation", () => {
    expectCode(
      () => transition({ application: app, to: "screening", actor: "ai", at: T0, confidence: 0.9 }),
      "automation_needs_evidence",
    );
    expectCode(
      () =>
        transition({
          application: app,
          to: "screening",
          actor: "rule",
          at: T0,
          evidence: { mailMessageId: null, reason: "r" },
        }),
      "automation_needs_evidence",
    );
    expect(() =>
      transition({
        application: app,
        to: "screening",
        actor: "ai",
        at: T0,
        confidence: 1.2,
        evidence: { mailMessageId: null, reason: "r" },
      }),
    ).toThrow(RangeError);
  });

  it("lets the user reopen and move backward", () => {
    expect(
      transition({ application: { ...app, status: "rejected" }, to: "interviewing", actor: "user", at: T0 })
        .direction,
    ).toBe("reopen");
    expect(
      transition({ application: { ...app, status: "offer" }, to: "screening", actor: "user", at: T0 })
        .direction,
    ).toBe("backward");
  });
});

describe("revert", () => {
  const autoRejection = event({
    type: "status_changed",
    fromStatus: "applied",
    toStatus: "rejected",
    actor: "ai",
    confidence: 0.91,
    evidence: { mailMessageId: "mail9", reason: "Reads like a rejection" },
    occurredAt: day(5),
  });

  it("appends the inverse transition linked to the original", () => {
    const result = revert({
      application: { id: "app1", status: "rejected" },
      event: autoRejection,
      events: [autoRejection],
      at: day(6),
    });
    expect(result.status).toBe("applied");
    expect(result.direction).toBe("reopen");
    expect(result.event).toMatchObject({
      type: "status_changed",
      fromStatus: "rejected",
      toStatus: "applied",
      actor: "user",
      confidence: null,
      revertsEventId: autoRejection.id,
      occurredAt: day(6),
    });
    expect(result.applicationPatch).toEqual({ status: "applied", statusChangedAt: day(6) });

    const persisted = event({ ...result.event, occurredAt: day(6) });
    expect(revertedBy(autoRejection.id, [autoRejection, persisted])).toBe(persisted.id);
    expect(revertedBy(persisted.id, [autoRejection, persisted])).toBeNull();
  });

  it("restores exactly even where a direct move would be gated", () => {
    const reopen = event({
      type: "status_changed",
      fromStatus: "accepted",
      toStatus: "interviewing",
      occurredAt: day(1),
    });
    const result = revert({
      application: { id: "app1", status: "interviewing" },
      event: reopen,
      events: [reopen],
      at: day(2),
    });
    expect(result.status).toBe("accepted");
    expect(canTransition("interviewing", "accepted", "user").allowed).toBe(false);
  });

  it("refuses double, stale and non-status reverts", () => {
    const undo = event({
      type: "status_changed",
      fromStatus: "rejected",
      toStatus: "applied",
      revertsEventId: autoRejection.id,
      occurredAt: day(6),
    });
    expectCode(
      () =>
        revert({
          application: { id: "app1", status: "rejected" },
          event: autoRejection,
          events: [autoRejection, undo],
          at: day(7),
        }),
      "already_reverted",
    );
    expectCode(
      () =>
        revert({
          application: { id: "app1", status: "applied" },
          event: autoRejection,
          events: [autoRejection],
          at: day(7),
        }),
      "superseded",
    );
    expectCode(
      () =>
        revert({
          application: { id: "app1", status: "applied" },
          event: undo,
          events: [autoRejection, undo],
          at: day(7),
        }),
      "not_revertible",
    );
    expectCode(
      () =>
        revert({
          application: { id: "other", status: "rejected" },
          event: autoRejection,
          events: [],
          at: day(7),
        }),
      "not_revertible",
    );
    const created = event({ type: "created", toStatus: "saved", occurredAt: T0 });
    expectCode(
      () =>
        revert({
          application: { id: "app1", status: "saved" },
          event: created,
          events: [created],
          at: day(1),
        }),
      "not_revertible",
    );
    const note = event({ type: "note", text: "Called the recruiter", occurredAt: T0 });
    expectCode(
      () => revert({ application: { id: "app1", status: "saved" }, event: note, events: [note], at: day(1) }),
      "not_revertible",
    );
  });

  it("is offered only while the change is the latest status move", () => {
    const app = { id: "app1", status: "rejected" as const };
    expect(canRevert({ application: app, event: autoRejection, events: [autoRejection] })).toEqual({
      allowed: true,
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
    const events = [autoRejection, reopen, backToRejected];
    // Same status again, but a newer move exists: the old automatic change can no longer be undone.
    expect(canRevert({ application: app, event: autoRejection, events })).toEqual({
      allowed: false,
      reason: "superseded",
    });
    expectCode(() => revert({ application: app, event: autoRejection, events, at: day(8) }), "superseded");
    // Notes and mail do not supersede a status move.
    const note = event({ type: "note", text: "Asked for feedback", occurredAt: day(6) });
    expect(canRevert({ application: app, event: autoRejection, events: [autoRejection, note] }).allowed).toBe(
      true,
    );
  });
});

describe("statusPhase", () => {
  it("groups statuses into shortlist, in progress and closed", () => {
    expect(ALL.map((status) => [status, statusPhase(status)])).toEqual([
      ["saved", "shortlist"],
      ["preparing", "shortlist"],
      ["applied", "in_progress"],
      ["acknowledged", "in_progress"],
      ["screening", "in_progress"],
      ["interviewing", "in_progress"],
      ["offer", "in_progress"],
      ["accepted", "closed"],
      ["declined", "closed"],
      ["rejected", "closed"],
      ["withdrawn", "closed"],
      ["ghosted", "closed"],
    ]);
  });
});

describe("suggestGhosted", () => {
  const app = { id: "app1", status: "applied" as const, appliedAt: T0, statusChangedAt: T0 };

  it("triggers at exactly the configured number of silent days", () => {
    expect(suggestGhosted(app, [], new Date(day(21).getTime() - 1))).toBeNull();
    expect(suggestGhosted(app, [], day(21))).toEqual({ kind: "ghosted", silentSince: T0, silentDays: 21 });
    expect(suggestGhosted(app, [], day(10), 10)).toEqual({
      kind: "ghosted",
      silentSince: T0,
      silentDays: 10,
    });
    expect(suggestGhosted(app, [], day(9), 10)).toBeNull();
  });

  it("resets the clock on employer signals but not on notes or follow-ups sent", () => {
    const received = event({ type: "mail_received", text: "Thanks for applying", occurredAt: day(5) });
    const note = event({ type: "note", text: "Pinged on LinkedIn", occurredAt: day(15) });
    const sent = event({ type: "mail_sent", text: "Following up", occurredAt: day(16) });
    const otherApp = event({ type: "mail_received", applicationId: "app2", occurredAt: day(20) });
    expect(suggestGhosted(app, [received, note, sent, otherApp], day(25))).toBeNull();
    expect(suggestGhosted(app, [received, note, sent, otherApp], day(26))).toEqual({
      kind: "ghosted",
      silentSince: day(5),
      silentDays: 21,
    });
  });

  it("ignores reverted events and the undo itself", () => {
    const wrong = event({
      type: "status_changed",
      fromStatus: "applied",
      toStatus: "screening",
      actor: "ai",
      confidence: 0.92,
      evidence: { mailMessageId: "m", reason: "r" },
      occurredAt: day(10),
    });
    const undo = event({
      type: "status_changed",
      fromStatus: "screening",
      toStatus: "applied",
      revertsEventId: wrong.id,
      occurredAt: day(11),
    });
    expect(suggestGhosted(app, [wrong, undo], day(21))?.silentSince).toEqual(T0);
  });

  it("only applies to statuses awaiting the employer", () => {
    for (const status of [
      "saved",
      "preparing",
      "offer",
      "accepted",
      "declined",
      "rejected",
      "withdrawn",
      "ghosted",
    ] as const) {
      expect(suggestGhosted({ ...app, status }, [], day(60))).toBeNull();
    }
    for (const status of ["applied", "acknowledged", "screening", "interviewing"] as const) {
      expect(suggestGhosted({ ...app, status }, [], day(60))).not.toBeNull();
    }
  });

  it("falls back to statusChangedAt without appliedAt or events", () => {
    expect(
      suggestGhosted({ ...app, appliedAt: null, statusChangedAt: day(2) }, [], day(23))?.silentSince,
    ).toEqual(day(2));
  });

  it("rejects invalid day counts", () => {
    expect(() => suggestGhosted(app, [], day(1), 0)).toThrow(RangeError);
    expect(() => suggestGhosted(app, [], day(1), 1.5)).toThrow(RangeError);
  });
});

describe("followUpDue", () => {
  const app = { id: "app1", status: "applied" as const, appliedAt: T0, statusChangedAt: T0 };

  it("is due exactly the configured days after applying", () => {
    expect(followUpDue(app, [], new Date(day(7).getTime() - 1))).toBeNull();
    expect(followUpDue(app, [], day(7))).toEqual({ kind: "follow_up", since: T0, dueAt: day(7) });
    expect(followUpDue(app, [], day(3), 3)).toEqual({ kind: "follow_up", since: T0, dueAt: day(3) });
  });

  it("restarts after a follow-up was sent", () => {
    const sent = event({ type: "mail_sent", text: "Quick follow-up", occurredAt: day(8) });
    expect(followUpDue(app, [sent], day(14))).toBeNull();
    expect(followUpDue(app, [sent], day(15))).toEqual({ kind: "follow_up", since: day(8), dueAt: day(15) });
  });

  it("is not due once anything was received after applying", () => {
    const before = event({ type: "mail_received", occurredAt: day(-2) });
    const after = event({ type: "mail_received", occurredAt: day(2) });
    expect(followUpDue(app, [before], day(9))).not.toBeNull();
    expect(followUpDue(app, [after], day(9))).toBeNull();
  });

  it("only applies to Applied", () => {
    expect(followUpDue({ ...app, status: "acknowledged" }, [], day(30))).toBeNull();
    expect(followUpDue({ ...app, status: "saved" }, [], day(30))).toBeNull();
  });
});
