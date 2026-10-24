import type { CvRevision } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import type { NewId, TrackerWrite } from "../tracker/writes";
import {
  planCreateSavedSearch,
  planDismiss,
  planRecordApplied,
  planSave,
  planSaveTailoredRevision,
  planUnsave,
  planUpdateSavedSearch,
} from "./writes";

const at = new Date("2026-10-20T09:00:00.000Z");
const ids = (): NewId => {
  let counter = 0;
  return (collection) => `${collection}-${(counter += 1)}`;
};
const summary = (writes: readonly TrackerWrite[]) =>
  writes.map((write) =>
    write.op === "createCvRevision" ? write.op : `${write.op} ${"collection" in write ? write.collection : "profile"}`,
  );

const [firstApplication] = populatedDataset.applications;
const [firstSearch] = populatedDataset.savedSearches;
const job = populatedDataset.jobs.find((candidate) => candidate.id === "job-fernweh-frontend");
const match =
  populatedDataset.jobMatches.find((candidate) => candidate.id === "job-fernweh-frontend") ?? null;
if (!job || !match || !firstApplication || !firstSearch) throw new Error("fixtures missing");

describe("Jobs write plans", () => {
  it("saves as one batch: the Saved application, its created event and the match (D02)", () => {
    const plan = planSave(job, match, at, ids());
    expect(summary(plan.writes)).toEqual([
      "create applications",
      "create applicationEvents",
      "update jobMatches",
    ]);
    const [application] = plan.writes;
    expect(application).toMatchObject({ entity: { status: "saved", jobId: job.id, company: job.company } });
    expect(plan.writes[2]).toMatchObject({
      patch: { state: "saved", dismissReasons: [], stateChangedAt: at },
    });
  });

  it("unsaves only a still-Saved application", () => {
    const saved = { ...firstApplication, status: "saved" as const, jobId: job.id };
    expect(summary(planUnsave({ ...match, state: "saved" }, saved, at))).toEqual([
      "delete applications",
      "update jobMatches",
    ]);
    expect(summary(planUnsave(match, { ...saved, status: "applied" }, at))).toEqual([]);
  });

  it("dismisses with unique reasons and touches only the client fields", () => {
    const [write] = planDismiss(job.id, ["location", "location", "salary"], at);
    expect(write).toEqual({
      op: "update",
      collection: "jobMatches",
      id: job.id,
      patch: { state: "dismissed", dismissReasons: ["location", "salary"], stateChangedAt: at },
    });
  });

  it("records an external apply: a new Applied application with the CV pinned", () => {
    const plan = planRecordApplied(
      { job, application: null, channel: "external_link", cvId: "cv-1", cvRevisionId: "rev-1" },
      at,
      ids(),
    );
    expect(plan.created).toBe(true);
    expect(summary(plan.writes)).toEqual(["create applications", "create applicationEvents"]);
    expect(plan.writes[0]).toMatchObject({
      entity: {
        status: "applied",
        appliedAt: at,
        channel: "external_link",
        cvId: "cv-1",
        cvRevisionId: "rev-1",
      },
    });
  });

  it("moves a Saved application to Applied with a status event; pins chosen before applying are replaced", () => {
    const saved = {
      ...firstApplication,
      status: "saved" as const,
      appliedAt: null,
      cvId: "cv-0",
      cvRevisionId: null,
    };
    const plan = planRecordApplied(
      { job, application: saved, channel: "external_link", cvId: "cv-1", cvRevisionId: "rev-1" },
      at,
      ids(),
    );
    expect(plan.created).toBe(false);
    expect(summary(plan.writes)).toEqual([
      "update applications",
      "create applicationEvents",
      "update applications",
    ]);
    expect(plan.writes[2]).toMatchObject({ patch: { cvId: "cv-1", cvRevisionId: "rev-1", channel: "external_link" } });
    // From appliedAt on the pins are write-once: only empty ones are filled.
    const applied = { ...saved, status: "applied" as const, appliedAt: at, cvId: "cv-0", cvRevisionId: "rev-0" };
    expect(planRecordApplied({ job, application: applied, channel: "email", cvId: "cv-1", cvRevisionId: "rev-1" }, at, ids()).writes).toEqual([]);
  });

  it("saves a tailored revision with its pin on the job's application, in one batch", () => {
    const revision = {
      id: "rev-t",
      cvId: "cv-1",
      content: { meta: { template: "classic", theme: { accentColor: "#0f766e", fontPair: "inter-source-serif", density: "comfortable", paperSize: "a4" }, sectionOrder: [], customSections: [] } },
      source: "ai_tailor",
      basedOnRevisionId: "rev-1",
      jobId: job.id,
      diffSummary: null,
      createdAt: at,
    } as const satisfies CvRevision;
    const saved = { ...firstApplication, status: "saved" as const, appliedAt: null };
    const pinned = planSaveTailoredRevision({ job, match: null, application: saved, revision }, at, ids());
    expect(summary(pinned.writes)).toEqual(["createCvRevision", "update applications"]);
    expect(pinned.writes[1]).toMatchObject({ patch: { cvId: "cv-1", cvRevisionId: "rev-t" } });
    const created = planSaveTailoredRevision({ job, match: null, application: null, revision }, at, ids());
    expect(summary(created.writes)).toEqual(["createCvRevision", "create applications", "create applicationEvents"]);
    expect(created.writes[1]).toMatchObject({ entity: { status: "saved", cvId: "cv-1", cvRevisionId: "rev-t" } });
    const applied = { ...saved, status: "applied" as const, appliedAt: at };
    expect(summary(planSaveTailoredRevision({ job, match: null, application: applied, revision }, at, ids()).writes)).toEqual([
      "createCvRevision",
    ]);
  });

  it("schedules a new or re-enabled saved search for the runner's next pass", () => {
    const input = {
      name: "React",
      query: " react ",
      filters: firstSearch.filters,
      schedule: "daily" as const,
      alertThreshold: 65,
      dailyDigest: true,
      enabled: true,
    };
    const created = planCreateSavedSearch(input, at, ids());
    expect(created.writes[0]).toMatchObject({ entity: { query: "react", nextRunAt: at, lastRunAt: null } });
    const search = { id: "s1", enabled: false, schedule: "daily" as const };
    expect(planUpdateSavedSearch(search, { enabled: true }, at)[0]).toMatchObject({
      patch: { nextRunAt: at },
    });
    expect(planUpdateSavedSearch({ ...search, enabled: true }, { enabled: false }, at)[0]).toMatchObject({
      patch: { nextRunAt: null },
    });
  });
});
