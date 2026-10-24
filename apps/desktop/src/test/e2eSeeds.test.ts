/**
 * The apply E2E spec's seeds and recorded callable answers decode with the schemas the app uses
 * (a document that doesn't is skipped by the listeners, and the spec would wait for nothing).
 */
import {
  AnswerSchema,
  applyTailorEdits,
  CoverLetterDraftResponseSchema,
  CvRevisionSchema,
  CvSchema,
  CvTailorResponseSchema,
  JobMatchSchema,
  JobSchema,
} from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { seedAnswer, seedCv, seedJob, seedMatch, seedRevision } from "../../e2e/support/applySeed";
import { RECORDED_COVER_LETTER, RECORDED_CV_TAILOR } from "../../e2e/support/recordedData";

const now = new Date("2026-10-24T12:00:00Z");

describe("apply E2E seeds", () => {
  it("decode as the app's documents", () => {
    const entry = { id: "e2e-apply-mail-1", company: "E2E Fernweh 1" };
    expect(JobSchema.safeParse({ id: entry.id, ...seedJob(entry, { url: null, email: "jobs@example.com" }, now) }).error).toBeUndefined();
    expect(JobSchema.safeParse({ id: entry.id, ...seedJob(entry, { url: "https://boards.greenhouse.io/e2e/jobs/1", email: null }, now) }).error).toBeUndefined();
    expect(JobMatchSchema.safeParse({ id: entry.id, ...seedMatch(now) }).error).toBeUndefined();
    expect(CvRevisionSchema.safeParse({ id: "rev", cvId: "cv", ...seedRevision(now) }).error).toBeUndefined();
    expect(CvSchema.safeParse({ id: "cv", ...seedCv("E2E Apply CV", "rev", now) }).error).toBeUndefined();
    expect(AnswerSchema.safeParse({ id: "a", ...seedAnswer("Three months", now) }).error).toBeUndefined();
  });

  it("records callable answers that fit the contract and the seeded CV", () => {
    const tailor = CvTailorResponseSchema.parse(RECORDED_CV_TAILOR);
    expect(CoverLetterDraftResponseSchema.safeParse(RECORDED_COVER_LETTER).error).toBeUndefined();
    const result = applyTailorEdits(seedRevision(now).content as never, tailor.edits, ["e1", "e3"]);
    expect(result.skipped).toEqual([]);
    expect(result.applied).toEqual(["e1", "e3"]);
  });
});
