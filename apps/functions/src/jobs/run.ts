import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  type JobsSearchResponse,
  JobsSearchResponseSchema,
  type SavedSearch,
  type SavedSearchFilters,
  type SavedSearchSchedule,
  type SourceRunReport,
  type WatchedCompany,
} from "@bfhr/core";
import {
  BOARD_CONNECTORS,
  HttpClient,
  type RobotsRecord,
  SEARCH_CONNECTORS,
  userAgent,
} from "@bfhr/jobs-connectors";
import { type Firestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { aiProvider } from "../ai/common";
import { firestoreUsageLedger } from "../ai/usage-ledger";
import { adminConverters } from "../converters";
import { jobSourceSecrets } from "../secrets";
import { collectListings, type WatchedBoard } from "./collect";
import { type Embedder, profileEmbeddingText } from "./embeddings";
import { type MatchOutcome, matchJobs } from "./matcher";
import { loadMatchingContext, type MatchingContext } from "./profile-context";
import type { UserQuota } from "./quota";
import { SourceState, storageFeedCache } from "./source-state";
import { JobStore } from "./store";

/** Listings each source is asked for per run. */
export const LISTINGS_PER_SOURCE = 40;
/** Pending alerts expire after this many days (M5 picks them up long before). */
const ALERT_TTL_DAYS = 14;

const SCHEDULE_MS: Readonly<Record<SavedSearchSchedule, number>> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
};

/** Next run of a saved search after one that started at `now`. */
export function nextRunAt(schedule: SavedSearchSchedule, now: Date): Date {
  return new Date(now.getTime() + SCHEDULE_MS[schedule]);
}

/** Matches worth an alert: new to the user, at or above the search's threshold, not dismissed. */
export function alertCandidates(outcomes: readonly MatchOutcome[], threshold: number): MatchOutcome[] {
  return outcomes.filter(
    (outcome) => outcome.isNew && outcome.match.state !== "dismissed" && outcome.match.score >= threshold,
  );
}

export interface RunInput {
  db: Firestore;
  uid: string;
  query: string;
  filters: SavedSearchFilters;
  mode: "adhoc" | "saved";
  savedSearch: SavedSearch | null;
  embedder: Embedder;
  /** Whether AI rationales may be generated (needs the Anthropic secret on the calling function). */
  aiAvailable: boolean;
  limit: number;
  now: Date;
  version: string;
}

/** The user's enabled, resolved watchlist boards. */
async function watchedBoards(db: Firestore, uid: string): Promise<WatchedBoard[]> {
  const snapshot = await db.collection(firestorePaths.watchlist(uid)).where("enabled", "==", true).get();
  return snapshot.docs.flatMap((doc) => {
    let company: WatchedCompany;
    try {
      company = adminConverters.watchedCompany.fromSnapshot(doc);
    } catch {
      return [];
    }
    if (company.ats === null || company.boardToken === null || company.status === "not_found") return [];
    const region: "us" | "eu" = /\.eu\./.test(company.careersUrl) ? "eu" : "us";
    return [{ ats: company.ats, boardToken: company.boardToken, region }];
  });
}

/** Unit profile/CV embedding for matching; null (logged) when the embedder fails. */
export async function profileVector(embedder: Embedder, context: MatchingContext): Promise<number[] | null> {
  try {
    const [vector] = await embedder.embed(
      [profileEmbeddingText(context.profile, context.cv)],
      "RETRIEVAL_QUERY",
    );
    return vector ?? null;
  } catch (error) {
    logger.warn("profile_embedding_failed", { name: error instanceof Error ? error.name : typeof error });
    return null;
  }
}

/** AI hooks for the matcher: the user's AI ledger plus the per-user rationale budget. */
export function matcherAi(input: {
  uid: string;
  quota: UserQuota;
  aiAvailable: boolean;
  context: MatchingContext;
  now: Date;
}) {
  if (!input.aiAvailable || !input.context.aiEnabled) return null;
  return {
    provider: aiProvider(),
    ledger: firestoreUsageLedger(input.uid, input.now),
    grantRationales: (wanted: number) => input.quota.take("rationales", wanted),
  };
}

/**
 * One search run (on-demand `jobsSearch`, `savedSearchRunNow` or the scheduler): collect from
 * the sources, dedupe into `jobs`, embed, score into `jobMatches`, record source health and, for
 * saved searches, queue alerts. The caller has already admitted the run against the user quota.
 */
export async function runSearch(input: RunInput, quota: UserQuota): Promise<JobsSearchResponse> {
  const { db, uid, now } = input;
  const secrets = jobSourceSecrets();
  const robots: RobotsRecord[] = [];
  const http = new HttpClient({
    userAgent: userAgent(input.version),
    onRobots: (record) => robots.push(record),
  });
  const sourceState = new SourceState(db, now);
  const context = { http, cache: storageFeedCache(), secrets, now };
  const [matching, watched] = await Promise.all([
    loadMatchingContext(db, uid),
    input.mode === "saved" ? watchedBoards(db, uid) : Promise.resolve([]),
  ]);

  const collected = await collectListings({
    query: { query: input.query, filters: input.filters, limit: LISTINGS_PER_SOURCE },
    mode: input.mode,
    connectors: SEARCH_CONNECTORS,
    boards: BOARD_CONNECTORS,
    watched,
    context,
    gate: {
      admitSource: (connector) => sourceState.admitCall(connector, secrets),
      grantCalls: (wanted) => quota.take("connectorCalls", wanted),
    },
  });
  await Promise.all([
    sourceState.record(collected.reports, [...SEARCH_CONNECTORS, ...BOARD_CONNECTORS], secrets),
    sourceState.recordRobots(robots),
  ]);

  const store = new JobStore(db, uid, input.embedder);
  const upserted =
    collected.drafts.length === 0
      ? { jobs: [], created: [], updated: [] }
      : await store.upsert(collected.drafts, now);
  const vector = upserted.jobs.length === 0 ? null : await profileVector(input.embedder, matching);
  const outcomes = await matchJobs(upserted.jobs, {
    db,
    uid,
    context: matching,
    profileVector: vector,
    ai: matcherAi({ uid, quota, aiAvailable: input.aiAvailable, context: matching, now }),
    now,
  });

  if (input.savedSearch !== null) {
    const alerts = alertCandidates(outcomes, input.savedSearch.alertThreshold);
    const batch = db.batch();
    for (const { match } of alerts) {
      batch.set(db.doc(serverOnlyPaths.jobAlert(uid, match.id)), {
        jobId: match.id,
        savedSearchId: input.savedSearch.id,
        score: match.score,
        dailyDigest: input.savedSearch.dailyDigest,
        createdAt: Timestamp.fromDate(now),
        notifiedAt: null,
        expireAt: Timestamp.fromMillis(now.getTime() + ALERT_TTL_DAYS * 86_400_000),
      });
    }
    batch.update(
      db.doc(firestorePaths.savedSearch(uid, input.savedSearch.id)),
      adminConverters.savedSearch.toFirestoreUpdate({
        lastRunAt: now,
        nextRunAt: nextRunAt(input.savedSearch.schedule, now),
        updatedAt: now,
      }),
    );
    await batch.commit();
  }

  const ranked = outcomes.map((outcome) => outcome.match).sort((a, b) => b.score - a.score);
  const reports: SourceRunReport[] = collected.reports;
  logger.info("jobs_run", {
    mode: input.mode,
    sources: reports.map(
      (report) =>
        `${report.source}:${report.status}${report.reason === null ? "" : `:${report.reason}`}:${report.count}`,
    ),
    found: collected.found,
    drafts: collected.drafts.length,
    created: upserted.created.length,
    updated: upserted.updated.length,
    matched: outcomes.length,
  });
  return JobsSearchResponseSchema.parse({
    jobIds: ranked.slice(0, input.limit).map((match) => match.id),
    counts: {
      found: collected.found,
      created: upserted.created.length,
      updated: upserted.updated.length,
      matched: outcomes.length,
    },
    sources: reports.slice(0, 60),
  });
}
