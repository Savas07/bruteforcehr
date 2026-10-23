import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import type { NewId, TrackerWrite } from "../tracker/writes";
import {
  planCreateSavedSearch,
  planDismiss,
  planRecordApplied,
  planSave,
  planUnsave,
  planUpdateSavedSearch,
} from "./writes";

const at = new Date("2026-10-20T09:00:00.000Z");
const ids = (): NewId => {
  let counter = 0;
  return (collection) => `${collection}-${(counter += 1)}`;
};
const summary = (writes: readonly TrackerWrite[]) =>
  writes.map((write) => `${write.op} ${"collection" in write ? write.collection : "profile"}`);

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

  it("moves a Saved application to Applied with a status event and keeps existing pins", () => {
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
    expect(plan.writes[2]).toMatchObject({ patch: { cvRevisionId: "rev-1", channel: "external_link" } });
    expect(plan.writes[2]).not.toMatchObject({ patch: { cvId: "cv-1" } });
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
