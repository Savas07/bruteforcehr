// Job-alert postings → users/{uid}/jobs + jobMatches (docs/adr/0012-mail-sync.md, "Job alerts").
import { alertPostingToJob, type AlertPosting, MAX_ALERT_POSTINGS } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { projectId } from "../jobs/callables";
import { VertexEmbedder } from "../jobs/embeddings";
import { matchJobs } from "../jobs/matcher";
import { loadMatchingContext, type MatchingContext } from "../jobs/profile-context";
import { profileVector } from "../jobs/run";
import { JobStore } from "../jobs/store";

export interface AlertImportResult {
  created: number;
  updated: number;
  matched: number;
}

/** Imports the postings of one job alert (≤ `MAX_ALERT_POSTINGS`). */
export type AlertImporter = (postings: readonly AlertPosting[], now: Date) => Promise<AlertImportResult>;

/**
 * The alert importer of one sync run: postings become `alert_email` job drafts, `JobStore.upsert`
 * dedupes them against the user's jobs (source key, fingerprint, `isSameJob`) and embeds them,
 * and `matchJobs` scores them into `jobMatches` (state `new`, no AI rationale: the jobs
 * pipeline adds those on its next refresh). Profile, CV and profile vector are loaded once.
 */
export function alertImporter(uid: string): AlertImporter {
  const db = getFirestore();
  const embedder = new VertexEmbedder(projectId());
  const store = new JobStore(db, uid, embedder);
  let matching: Promise<{ context: MatchingContext; vector: number[] | null }> | null = null;
  return async (postings, now) => {
    if (postings.length === 0) return { created: 0, updated: 0, matched: 0 };
    const drafts = postings.slice(0, MAX_ALERT_POSTINGS).map((posting) => alertPostingToJob(posting, now));
    const upserted = await store.upsert(drafts, now);
    matching ??= loadMatchingContext(db, uid).then(async (context) => ({
      context,
      vector: await profileVector(embedder, context),
    }));
    const { context, vector } = await matching;
    const outcomes = await matchJobs(upserted.jobs, {
      db,
      uid,
      context,
      profileVector: vector,
      ai: null,
      now,
    });
    return { created: upserted.created.length, updated: upserted.updated.length, matched: outcomes.length };
  };
}
