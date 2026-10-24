import { firestorePaths } from "@bfhr/api";
import type { Cv, CvRevision, Job } from "@bfhr/core";
import type { Firestore } from "firebase-admin/firestore";
import { adminConverters } from "../converters";
import { AiCallableError } from "./common";

/** What `cvTailor` and `coverLetterDraft` read: the CV, the requested revision and the job. */
export interface ApplySources {
  cv: Cv;
  revision: CvRevision;
  job: Job;
}

/**
 * Reads the caller's CV, revision and job (paths under `users/{uid}`, so another user's ids are
 * simply not found). A document that doesn't parse counts as missing.
 */
export async function loadApplySources(
  db: Firestore,
  uid: string,
  ids: { cvId: string; revisionId: string; jobId: string },
): Promise<ApplySources> {
  const [cvSnapshot, revisionSnapshot, jobSnapshot] = await Promise.all([
    db.doc(firestorePaths.cv(uid, ids.cvId)).get(),
    db.doc(firestorePaths.cvRevision(uid, ids.cvId, ids.revisionId)).get(),
    db.doc(firestorePaths.job(uid, ids.jobId)).get(),
  ]);
  const cvMissing = () => new AiCallableError("not-found", "cv_not_found", "This CV version was not found.");
  if (!cvSnapshot.exists || !revisionSnapshot.exists) throw cvMissing();
  if (!jobSnapshot.exists) throw new AiCallableError("not-found", "job_not_found", "This job was not found.");
  let cv: Cv;
  let revision: CvRevision;
  try {
    cv = adminConverters.cv.fromSnapshot(cvSnapshot);
    revision = adminConverters.cvRevision.fromSnapshot(revisionSnapshot);
  } catch {
    throw cvMissing();
  }
  try {
    return { cv, revision, job: adminConverters.job.fromSnapshot(jobSnapshot) };
  } catch {
    throw new AiCallableError("not-found", "job_not_found", "This job was not found.");
  }
}
