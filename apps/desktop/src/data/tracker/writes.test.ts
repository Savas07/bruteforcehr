import {
  ApplicationEventSchema,
  ApplicationSchema,
  canRevert,
  InterviewSchema,
  JobSchema,
  TransitionError,
} from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "./memory";
import type { TrackerData } from "./repository";
import {
  newApplication,
  type NewId,
  planCreateApplications,
  planMoves,
  planSaveInterview,
  planUndo,
} from "./writes";

const at = new Date("2026-10-23T10:00:00.000Z");
const ids = (): NewId => {
  let n = 0;
  return (collection) => `${collection}-${(n += 1)}`;
};

function store(): MemoryTrackerStore {
  return createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
}

function data(memory: MemoryTrackerStore): TrackerData {
  const state = memory.source.getState();
  if (state.status !== "ready") throw new Error("not ready");
  return state.data;
}

describe("newApplication", () => {
  it("fills every maybe field with null and sets appliedAt from Applied on", () => {
    const applied = newApplication({ company: " Acme ", role: "Engineer", status: "applied" }, at);
    expect(ApplicationSchema.parse({ id: "a", ...applied })).toMatchObject({
      company: "Acme",
      appliedAt: at,
      threadRefs: [],
      followUpSnoozedUntil: null,
      priority: "normal",
    });
    expect(newApplication({ company: "Acme", role: "Engineer", status: "saved" }, at).appliedAt).toBeNull();
    const backdated = new Date("2026-10-01T00:00:00.000Z");
    expect(
      newApplication({ company: "A", role: "B", status: "screening", appliedAt: backdated }, at).appliedAt,
    ).toBe(backdated);
  });
});

describe("planCreateApplications", () => {
  it("writes the application, its created event and a manual job for the link", () => {
    const plan = planCreateApplications(
      [
        {
          application: newApplication({ company: "Acme", role: "Engineer", status: "applied" }, at),
          link: "https://jobs.acme.example/1",
          reason: "Imported from tracker.csv · row 2",
          occurredAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      ],
      at,
      ids(),
    );
    expect(
      plan.writes.map((write) => `${write.op} ${"collection" in write ? write.collection : "profile"}`),
    ).toEqual(["create jobs", "create applications", "create applicationEvents"]);
    const [job, application, event] = plan.writes;
    if (job?.op !== "create" || application?.op !== "create" || event?.op !== "create")
      throw new Error("creates");
    expect(JobSchema.parse(job.entity).applyUrl).toBe("https://jobs.acme.example/1");
    expect(ApplicationSchema.parse(application.entity).jobId).toBe(job.entity.id);
    expect(ApplicationEventSchema.parse(event.entity)).toMatchObject({
      type: "created",
      toStatus: "applied",
      actor: "user",
      evidence: { mailMessageId: null, reason: "Imported from tracker.csv · row 2" },
      occurredAt: new Date("2026-10-02T00:00:00.000Z"),
      createdAt: at,
    });
    expect(plan.applicationIds).toEqual([application.entity.id]);
  });
});

describe("planMoves and planUndo", () => {
  const application = ApplicationSchema.parse({
    id: "a1",
    ...newApplication({ company: "Acme", role: "Engineer", status: "applied" }, at),
  });

  it("patches the application and appends one user event per move", () => {
    const later = new Date(at.getTime() + 60_000);
    const plan = planMoves([{ application, to: "screening" }], later, ids());
    expect(plan.writes).toEqual([
      {
        op: "update",
        collection: "applications",
        id: "a1",
        patch: { status: "screening", statusChangedAt: later, updatedAt: later },
      },
      expect.objectContaining({
        op: "create",
        collection: "applicationEvents",
        entity: expect.objectContaining({ fromStatus: "applied", toStatus: "screening", actor: "user" }),
      }),
    ]);
  });

  it("refuses moves the state machine forbids", () => {
    expect(() => planMoves([{ application, to: "accepted" }], at, ids())).toThrow(TransitionError);
  });

  it("undoes with a reverting event that points at the move", () => {
    const later = new Date(at.getTime() + 60_000);
    const moved = planMoves([{ application, to: "screening" }], later, ids()).writes[1];
    if (moved?.op !== "create" || moved.collection !== "applicationEvents") throw new Error("event");
    const undo = planUndo(
      [{ application: { ...application, status: "screening" }, event: moved.entity, events: [moved.entity] }],
      new Date(later.getTime() + 1000),
      ids(),
    );
    const event = undo.writes[1];
    expect(event).toMatchObject({
      op: "create",
      entity: {
        fromStatus: "screening",
        toStatus: "applied",
        revertsEventId: moved.entity.id,
        actor: "user",
      },
    });
  });
});

describe("planSaveInterview", () => {
  it("creates the round with an interview_scheduled event, then updates in place", () => {
    const input = {
      applicationId: "a1",
      round: 1,
      kind: "technical" as const,
      title: "Technical interview",
      startsAt: new Date("2026-10-28T12:00:00.000Z"),
      durationMinutes: 60,
      timezone: "Europe/Berlin",
      location: null,
      meetingUrl: null,
      people: [],
      prepNotes: "",
    };
    const created = planSaveInterview(input, null, at, ids());
    const [interview, event] = created.writes;
    if (interview?.op !== "create" || interview.collection !== "interviews") throw new Error("interview");
    expect(InterviewSchema.parse(interview.entity).id).toBe(created.interviewId);
    expect(event).toMatchObject({ entity: { type: "interview_scheduled", text: "Technical interview" } });
    const updated = planSaveInterview({ ...input, round: 2 }, interview.entity, at, ids());
    expect(updated.writes).toEqual([
      {
        op: "update",
        collection: "interviews",
        id: created.interviewId,
        patch: { ...input, round: 2, updatedAt: at },
      },
    ]);
  });
});

describe("memory store", () => {
  it("applies a move and its Undo like the app (durable Undo while it's the latest move)", async () => {
    const memory = store();
    const before = data(memory);
    const application = before.applications.find((candidate) => candidate.status === "applied");
    if (!application) throw new Error("fixture has an applied application");
    const move = memory.repository.moveStatus([{ application, to: "screening" }]);
    await move.done;
    const after = data(memory);
    const moved = after.applications.find((candidate) => candidate.id === application.id);
    const event = after.applicationEvents.find((candidate) => candidate.id === move.ids.eventIds[0]);
    if (!moved || !event) throw new Error("move applied");
    expect(moved.status).toBe("screening");
    expect(canRevert({ application: moved, event, events: after.applicationEvents })).toEqual({
      allowed: true,
    });
    await memory.repository.undo([{ application: moved, event, events: after.applicationEvents }]).done;
    expect(data(memory).applications.find((candidate) => candidate.id === application.id)?.status).toBe(
      "applied",
    );
  });

  it("persists suggestion answers on the application", async () => {
    const memory = store();
    const [application] = data(memory).applications;
    if (!application) throw new Error("fixture applications");
    const until = new Date(FIXTURE_NOW.getTime() + 86_400_000);
    await memory.repository.snoozeSuggestion(application.id, "followUp", until).done;
    await memory.repository.dismissSuggestion(application.id, "noResponse", true).done;
    expect(data(memory).applications.find((candidate) => candidate.id === application.id)).toMatchObject({
      followUpSnoozedUntil: until,
      ghostedDismissedAt: FIXTURE_NOW,
    });
  });
});
