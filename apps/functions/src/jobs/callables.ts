import { firestorePaths } from "@bfhr/api";
import {
  type JobMatchesRefreshResponse,
  JobMatchesRefreshRequestSchema,
  type JobsErrorReason,
  type JobsSearchResponse,
  JobsSearchRequestSchema,
  SavedSearchRunNowRequestSchema,
} from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ANTHROPIC_API_KEY } from "../ai/common";
import { ReasonedHttpsError, verifiedUid } from "../callable";
import { adminConverters } from "../converters";
import { JOB_SOURCE_SECRETS } from "../secrets";
import { profileEmbeddingText, VertexEmbedder } from "./embeddings";
import { matchJobs } from "./matcher";
import { loadMatchingContext } from "./profile-context";
import { type RunKind, UserQuota } from "./quota";
import { matcherAi, runSearch } from "./run";
import { JobStore } from "./store";

export class JobsCallableError extends ReasonedHttpsError<JobsErrorReason> {}

/** Neighbours requested from vector search when re-scoring without explicit ids (ADR 0002: ≤ 200). */
const REFRESH_NEIGHBOURS = 200;

const RUN_OPTIONS = {
  secrets: [ANTHROPIC_API_KEY, ...JOB_SOURCE_SECRETS],
  timeoutSeconds: 300,
  memory: "512MiB" as const,
};

export function projectId(): string {
  const id = process.env["GCLOUD_PROJECT"] ?? process.env["GOOGLE_CLOUD_PROJECT"];
  if (id === undefined || id === "") throw new Error("project id unknown");
  return id;
}

async function admit(uid: string, kind: RunKind, now: Date): Promise<UserQuota> {
  const quota = new UserQuota(getFirestore(), uid, now);
  if (!(await quota.admit(kind))) {
    throw new JobsCallableError(
      "resource-exhausted",
      "search_rate_limited",
      "You've searched a lot just now. Please wait a moment, or try again tomorrow.",
    );
  }
  return quota;
}

function noSources(response: JobsSearchResponse): boolean {
  return response.sources.length > 0 && response.sources.every((report) => report.status !== "ok");
}

/**
 * `jobsSearch({ query, filters, limit? })`: on-demand search across the keyless and configured
 * sources (Jooble excluded: lifetime quota). Writes `jobs` + `jobMatches`; returns the ranked ids.
 */
export const jobsSearch = onCall(RUN_OPTIONS, async (request): Promise<JobsSearchResponse> => {
  const uid = verifiedUid(request);
  const parsed = JobsSearchRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new JobsCallableError(
      "invalid-argument",
      "invalid_request",
      "Expected { query, filters, limit? }.",
    );
  }
  const now = new Date();
  const quota = await admit(uid, "search", now);
  const response = await runSearch(
    {
      db: getFirestore(),
      uid,
      query: parsed.data.query,
      filters: parsed.data.filters,
      mode: "adhoc",
      savedSearch: null,
      embedder: new VertexEmbedder(projectId()),
      aiAvailable: true,
      limit: parsed.data.limit ?? 30,
      now,
      version: __BFHR_VERSION__,
    },
    quota,
  );
  if (noSources(response)) {
    throw new JobsCallableError(
      "unavailable",
      "no_sources",
      "No job source answered. Please try again later.",
    );
  }
  return response;
});

/** `savedSearchRunNow({ savedSearchId })`: runs one saved search immediately (all its sources). */
export const savedSearchRunNow = onCall(RUN_OPTIONS, async (request): Promise<JobsSearchResponse> => {
  const uid = verifiedUid(request);
  const parsed = SavedSearchRunNowRequestSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new JobsCallableError("invalid-argument", "invalid_request", "Expected { savedSearchId }.");
  }
  const db = getFirestore();
  const snapshot = await db.doc(firestorePaths.savedSearch(uid, parsed.data.savedSearchId)).get();
  if (!snapshot.exists) {
    throw new JobsCallableError("not-found", "saved_search_not_found", "This saved search no longer exists.");
  }
  const savedSearch = adminConverters.savedSearch.fromSnapshot(snapshot);
  const now = new Date();
  const quota = await admit(uid, "runNow", now);
  const response = await runSearch(
    {
      db,
      uid,
      query: savedSearch.query,
      filters: savedSearch.filters,
      mode: "saved",
      savedSearch,
      embedder: new VertexEmbedder(projectId()),
      aiAvailable: true,
      limit: 50,
      now,
      version: __BFHR_VERSION__,
    },
    quota,
  );
  if (noSources(response)) {
    throw new JobsCallableError(
      "unavailable",
      "no_sources",
      "No job source answered. Please try again later.",
    );
  }
  return response;
});

/**
 * `jobMatchesRefresh({ jobIds? })`: re-scores the given jobs, or the 200 nearest to the current
 * profile/CV, after a profile or CV change. Creates missing matches; never changes `state`.
 */
export const jobMatchesRefresh = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request): Promise<JobMatchesRefreshResponse> => {
    const uid = verifiedUid(request);
    const parsed = JobMatchesRefreshRequestSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new JobsCallableError("invalid-argument", "invalid_request", "Expected { jobIds?: string[] }.");
    }
    const db = getFirestore();
    const now = new Date();
    const quota = await admit(uid, "refresh", now);
    const embedder = new VertexEmbedder(projectId());
    const store = new JobStore(db, uid, embedder);
    const context = await loadMatchingContext(db, uid);
    const [vector] = await embedder.embed(
      [profileEmbeddingText(context.profile, context.cv)],
      "RETRIEVAL_QUERY",
    );
    if (vector === undefined) throw new HttpsError("internal", "Something went wrong. Please try again.");
    const jobs =
      parsed.data.jobIds === undefined
        ? await store.nearest(vector, REFRESH_NEIGHBOURS)
        : await store.ensureEmbeddings(await store.load(parsed.data.jobIds));
    const outcomes = await matchJobs(jobs, {
      db,
      uid,
      context,
      profileVector: vector,
      ai: matcherAi({ uid, quota, aiAvailable: true, context, now }),
      now,
    });
    return { matched: outcomes.length };
  },
);
