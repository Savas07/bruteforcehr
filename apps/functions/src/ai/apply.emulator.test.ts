// `cvTailor` / `coverLetterDraft` inputs against the Firestore emulator: the caller's CV revision,
// job and templates are found; other users' ids, missing documents and non-templates are not.
import { firestorePaths } from "@bfhr/api";
import { populatedDataset } from "@bfhr/fixtures";
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { adminConverters } from "../converters";
import { clearFirestore } from "../mail/emulator/helpers";
import { loadApplySources } from "./apply-sources";
import { AiCallableError } from "./common";
import { coverLetterTemplateBody } from "./cover-letter-draft";

const UID = "apply-owner";
const OTHER = "apply-other";
const [cv] = populatedDataset.cvs;
const revision = populatedDataset.cvRevisions.find((candidate) => candidate.cvId === cv?.id);
const [job] = populatedDataset.jobs;
const [letter] = populatedDataset.coverLetters;
if (cv === undefined || revision === undefined || job === undefined || letter === undefined)
  throw new Error("fixtures lack a CV, revision, job or cover letter");
const ids = { cvId: cv.id, revisionId: revision.id, jobId: job.id };

const reason = async (promise: Promise<unknown>): Promise<string | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof AiCallableError ? error.reason : String(error);
  }
};

beforeEach(async () => {
  await clearFirestore();
  const db = getFirestore();
  const batch = db.batch();
  batch.set(db.doc(firestorePaths.cv(UID, cv.id)), adminConverters.cv.toFirestore(cv));
  batch.set(
    db.doc(firestorePaths.cvRevision(UID, cv.id, revision.id)),
    adminConverters.cvRevision.toFirestore(revision),
  );
  batch.set(db.doc(firestorePaths.job(UID, job.id)), adminConverters.job.toFirestore(job));
  batch.set(
    db.doc(firestorePaths.coverLetter(UID, "template-1")),
    adminConverters.coverLetter.toFirestore({
      ...letter,
      id: "template-1",
      isTemplate: true,
      body: "Hi {company}",
    }),
  );
  batch.set(
    db.doc(firestorePaths.coverLetter(UID, "letter-1")),
    adminConverters.coverLetter.toFirestore({ ...letter, id: "letter-1", isTemplate: false }),
  );
  await batch.commit();
});

describe("loadApplySources", () => {
  it("reads the caller's CV, revision and job", async () => {
    const sources = await loadApplySources(getFirestore(), UID, ids);
    expect(sources.cv.id).toBe(cv.id);
    expect(sources.revision.content).toEqual(revision.content);
    expect(sources.job.title).toBe(job.title);
  });

  it("doesn't find other users' or missing documents", async () => {
    expect(await reason(loadApplySources(getFirestore(), OTHER, ids))).toBe("cv_not_found");
    expect(await reason(loadApplySources(getFirestore(), UID, { ...ids, revisionId: "nope" }))).toBe(
      "cv_not_found",
    );
    expect(await reason(loadApplySources(getFirestore(), UID, { ...ids, jobId: "nope" }))).toBe(
      "job_not_found",
    );
  });
});

describe("coverLetterTemplateBody", () => {
  it("resolves starter templates and the caller's own templates only", async () => {
    expect(await coverLetterTemplateBody(getFirestore(), UID, "starter-de")).toContain("{company}");
    expect(await coverLetterTemplateBody(getFirestore(), UID, "template-1")).toBe("Hi {company}");
    expect(await reason(coverLetterTemplateBody(getFirestore(), UID, "letter-1"))).toBe("template_not_found");
    expect(await reason(coverLetterTemplateBody(getFirestore(), OTHER, "template-1"))).toBe(
      "template_not_found",
    );
  });
});
