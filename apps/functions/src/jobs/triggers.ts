import { firestorePaths } from "@bfhr/api";
import { detectAtsBoard, initialMatchState, type WatchedCompany } from "@bfhr/core";
import {
  BOARD_CONNECTORS,
  employerDomain,
  HttpClient,
  type Listing,
  type RobotsRecord,
  SourceError,
  userAgent,
} from "@bfhr/jobs-connectors";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { ANTHROPIC_API_KEY } from "../ai/common";
import { adminConverters } from "../converters";
import { loadJobImportConfig } from "../jobImport/config";
import { projectId } from "./callables";
import { VertexEmbedder } from "./embeddings";
import { matchJobs } from "./matcher";
import { guardedPageFetch } from "./page-fetch";
import { loadMatchingContext } from "./profile-context";
import { UserQuota } from "./quota";
import { matcherAi, profileVector } from "./run";
import { SourceState, storageFeedCache } from "./source-state";
import { JobStore } from "./store";

/**
 * A job the client created (URL import, "Log an application" link) gets its embedding and a
 * match, starting as `saved` (`initialMatchState`). Server-ingested jobs are matched inline by
 * the search run, so this returns early for them.
 */
export const jobCreatedMatch = onDocumentCreated(
  {
    document: "users/{uid}/jobs/{jobId}",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (snapshot === undefined) return;
    let job;
    try {
      job = adminConverters.job.fromSnapshot(snapshot);
    } catch {
      logger.warn("job_unparsable");
      return;
    }
    if (initialMatchState(job) !== "saved") return;
    const db = getFirestore();
    const uid = event.params.uid;
    if ((await db.doc(firestorePaths.jobMatch(uid, job.id)).get()).exists) return;
    const now = new Date();
    const quota = new UserQuota(db, uid, now);
    // Each client-created job costs a Vertex embedding and a function run: a daily allowance.
    if ((await quota.take("createdJobEmbeddings", 1)) === 0) {
      logger.info("job_created_match_quota");
      return;
    }
    const embedder = new VertexEmbedder(projectId());
    const store = new JobStore(db, uid, embedder);
    const context = await loadMatchingContext(db, uid);
    const [stored] = await store.ensureEmbeddings(await store.load([job.id]));
    if (stored === undefined) return;
    const vector = await profileVector(embedder, context);
    await matchJobs([stored], {
      db,
      uid,
      context,
      profileVector: vector,
      ai: matcherAi({ uid, quota, aiAvailable: true, context, now }),
      now,
    });
  },
);

/** Fixed, content-free messages for `WatchedCompany.lastError`. */
const WATCHLIST_ERRORS = {
  not_found: "We couldn't find job postings at this address.",
  error: "The job board didn't answer. We'll try again on the next run.",
  later: "We'll check this careers page with your next search.",
} as const;

/** Server fields of a watchlist entry after reading its board. */
export function resolvedFields(input: {
  careersUrl: string;
  outcome: { listings: readonly Listing[] } | { error: unknown };
  now: Date;
}): Pick<
  WatchedCompany,
  "ats" | "boardToken" | "companyDomain" | "status" | "lastError" | "openJobs" | "lastFetchedAt"
> {
  const board = detectAtsBoard(input.careersUrl);
  const ats = board?.ats ?? "web";
  const boardToken = board?.boardToken ?? input.careersUrl;
  const base = { ats, boardToken, lastFetchedAt: input.now };
  if ("error" in input.outcome) {
    const missing =
      input.outcome.error instanceof SourceError && input.outcome.error.reason === "invalid_response";
    const deferred =
      input.outcome.error instanceof SourceError && input.outcome.error.reason === "rate_limited";
    return {
      ...base,
      companyDomain: employerDomain(input.careersUrl),
      status: missing ? "not_found" : "error",
      lastError: missing
        ? WATCHLIST_ERRORS.not_found
        : deferred
          ? WATCHLIST_ERRORS.later
          : WATCHLIST_ERRORS.error,
      openJobs: null,
    };
  }
  const listings = input.outcome.listings;
  const domain =
    listings.find((listing) => listing.companyDomain)?.companyDomain ?? employerDomain(input.careersUrl);
  return {
    ...base,
    companyDomain: domain ?? null,
    status: listings.length === 0 && ats === "web" ? "not_found" : "ok",
    lastError: listings.length === 0 && ats === "web" ? WATCHLIST_ERRORS.not_found : null,
    openJobs: listings.length,
  };
}

/**
 * Resolves a followed company when it is added or its careers URL changes: detects the ATS,
 * reads the board once and records status + open postings. Postings themselves are ingested by
 * saved-search runs (filtered by each search's query), not here.
 */
export const watchlistResolve = onDocumentWritten(
  { document: "users/{uid}/watchlist/{companyId}", timeoutSeconds: 120 },
  async (event) => {
    const after = event.data?.after;
    if (after === undefined || !after.exists) return;
    const before = event.data?.before;
    const careersUrl: unknown = after.get("careersUrl");
    if (typeof careersUrl !== "string") return;
    const changed = before === undefined || !before.exists || before.get("careersUrl") !== careersUrl;
    if (!changed && after.get("status") !== "pending") return;

    const now = new Date();
    const db = getFirestore();
    const board = detectAtsBoard(careersUrl);
    const connector = BOARD_CONNECTORS.find((candidate) => candidate.ats === (board?.ats ?? "web"));
    const robots: RobotsRecord[] = [];
    const http = new HttpClient({
      userAgent: userAgent(__BFHR_VERSION__),
      onRobots: (record) => robots.push(record),
    });
    // The careers URL is the user's: pages go through the SSRF guard and the owner's denied hosts.
    const pageHttp = new HttpClient({
      userAgent: userAgent(__BFHR_VERSION__),
      fetch: guardedPageFetch((await loadJobImportConfig()).deniedHosts),
      onRobots: (record) => robots.push(record),
    });
    let outcome: { listings: Listing[] } | { error: unknown };
    try {
      if (connector === undefined) throw new SourceError("invalid_response", "no connector");
      // Every edit of the URL fires this trigger: a daily allowance per user.
      if ((await new UserQuota(db, event.params.uid, now).take("watchlistResolves", 1)) === 0)
        throw new SourceError("rate_limited", "watchlist resolve quota");
      outcome = {
        listings: await connector.list(board ?? { boardToken: careersUrl, region: "us" }, {
          http,
          pageHttp,
          cache: storageFeedCache(),
          // Board connectors are keyless.
          secrets: {},
          now,
        }),
      };
    } catch (error) {
      outcome = { error };
    }
    await new SourceState(db, now).recordRobots(robots);
    const fields = resolvedFields({ careersUrl, outcome, now });
    // Server fields only; the client's name/enabled edits in between are kept.
    await after.ref.update(adminConverters.watchedCompany.toFirestoreUpdate({ ...fields, updatedAt: now }));
    logger.info("watchlist_resolved", { ats: fields.ats, status: fields.status, openJobs: fields.openJobs });
  },
);
