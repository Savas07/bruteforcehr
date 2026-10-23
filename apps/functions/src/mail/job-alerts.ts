// Job-alert postings → users/{uid}/jobs (docs/adr/0012-mail-sync.md, "Job alerts").
import { firestorePaths } from "@bfhr/api";
import {
  alertPostingToJob,
  type AlertPosting,
  isSameJob,
  type Job,
  MAX_ALERT_POSTINGS,
  mergeJobListing,
} from "@bfhr/core";
import { type DocumentSnapshot, getFirestore } from "firebase-admin/firestore";
import { converters } from "../converters";

type JobDraft = Omit<Job, "id">;

/** Firestore `in` / `array-contains-any` take at most 30 values. */
const QUERY_CHUNK = 30;

export interface AlertUpsertPlan {
  created: Job[];
  updated: Job[];
}

/**
 * Dedupes alert drafts against each other and the stored candidates (ADR 0002 "Normalize +
 * dedupe"): same source key → same job, else `isSameJob` (fingerprint or same company/title);
 * a match merges the listing (`mergeJobListing`), anything else is a new job. Pure.
 */
export function planAlertUpserts(
  drafts: readonly JobDraft[],
  stored: readonly Job[],
  newId: () => string,
  now: Date,
): AlertUpsertPlan {
  const pool = new Map(stored.map((job) => [job.id, job]));
  const created = new Set<string>();
  const updated = new Set<string>();
  for (const draft of drafts) {
    const jobs = [...pool.values()];
    const existing =
      jobs.find((job) => draft.sourceKeys.some((key) => job.sourceKeys.includes(key))) ??
      jobs.find((job) => isSameJob(job, draft));
    if (existing === undefined) {
      const job = { id: newId(), ...draft };
      pool.set(job.id, job);
      created.add(job.id);
    } else {
      pool.set(existing.id, mergeJobListing(existing, draft, now));
      if (!created.has(existing.id)) updated.add(existing.id);
    }
  }
  const pick = (ids: Set<string>) => [...ids].flatMap((id) => pool.get(id) ?? []);
  return { created: pick(created), updated: pick(updated) };
}

/**
 * Upserts the postings of one alert (≤ `MAX_ALERT_POSTINGS`) into the user's jobs. Matching
 * (`jobMatches`) is left to the jobs pipeline: see ADR 0012 for the follow-up.
 */
export async function upsertAlertPostings(
  uid: string,
  postings: readonly AlertPosting[],
  now: Date,
): Promise<{ created: number; updated: number }> {
  if (postings.length === 0) return { created: 0, updated: 0 };
  const db = getFirestore();
  const jobs = db.collection(firestorePaths.jobs(uid));
  const drafts = postings.slice(0, MAX_ALERT_POSTINGS).map((posting) => alertPostingToJob(posting, now));
  const keys = [...new Set(drafts.flatMap((draft) => draft.sourceKeys))];
  const fingerprints = [...new Set(drafts.map((draft) => draft.fingerprint))];
  const queries = [];
  for (let i = 0; i < keys.length; i += QUERY_CHUNK)
    queries.push(jobs.where("sourceKeys", "array-contains-any", keys.slice(i, i + QUERY_CHUNK)).get());
  for (let i = 0; i < fingerprints.length; i += QUERY_CHUNK)
    queries.push(jobs.where("fingerprint", "in", fingerprints.slice(i, i + QUERY_CHUNK)).get());
  const found = new Map<string, DocumentSnapshot>();
  for (const snapshot of await Promise.all(queries)) for (const doc of snapshot.docs) found.set(doc.id, doc);
  const stored: Job[] = [];
  for (const snapshot of found.values()) {
    try {
      stored.push(converters.job.fromSnapshot(snapshot));
    } catch {
      // A document that no longer parses is left alone; the posting becomes a new job.
    }
  }
  const plan = planAlertUpserts(drafts, stored, () => jobs.doc().id, now);
  const batch = db.batch();
  for (const job of plan.created) batch.create(jobs.doc(job.id), converters.job.toFirestore(job));
  for (const job of plan.updated) {
    const { id, createdAt: _createdAt, ...patch } = job;
    batch.update(jobs.doc(id), converters.job.toFirestoreUpdate(patch));
  }
  await batch.commit();
  return { created: plan.created.length, updated: plan.updated.length };
}
