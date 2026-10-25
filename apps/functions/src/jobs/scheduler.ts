import { firestorePaths } from "@bfhr/api";
import type { SavedSearch } from "@bfhr/core";
import { type DocumentSnapshot, type Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { ANTHROPIC_API_KEY } from "../ai/common";
import { adminConverters } from "../converters";
import { JOB_SOURCE_SECRETS } from "../secrets";
import { projectId } from "./callables";
import { VertexEmbedder } from "./embeddings";
import { UserQuota } from "./quota";
import { nextRunAt, runSearch } from "./run";

/** Due searches picked up per invocation (each query); the rest wait for the next tick. */
const DUE_PER_TICK = 40;
/** Stop starting new runs after this long, so the invocation ends well inside its timeout. */
const TICK_BUDGET_MS = 420_000;

export interface DueSearch {
  uid: string;
  search: SavedSearch;
}

/** Due saved searches, at most one per user per tick (fair across users), oldest due first. */
export function pickDue(snapshots: readonly DocumentSnapshot[]): DueSearch[] {
  const seen = new Set<string>();
  const due: DueSearch[] = [];
  for (const snapshot of snapshots) {
    const uid = snapshot.ref.parent.parent?.id;
    if (uid === undefined || seen.has(uid)) continue;
    try {
      due.push({ uid, search: adminConverters.savedSearch.fromSnapshot(snapshot) });
      seen.add(uid);
    } catch {
      logger.warn("saved_search_unparsable");
    }
  }
  return due;
}

/**
 * Runs due saved searches every 30 minutes (Cloud Scheduler via `onSchedule`). A search is due
 * when enabled and `nextRunAt <= now`, or never scheduled (`nextRunAt == null`). Each run is
 * admitted against the user's daily budget; refused or failed runs move on to their next slot.
 */
export const savedSearchesRunner = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
    secrets: [ANTHROPIC_API_KEY, ...JOB_SOURCE_SECRETS],
    retryCount: 0,
  },
  async () => {
    const started = Date.now();
    const db = getFirestore();
    const now = new Date();
    const group = db.collectionGroup("savedSearches").where("enabled", "==", true);
    const [scheduled, unscheduled] = await Promise.all([
      group.where("nextRunAt", "<=", Timestamp.fromDate(now)).orderBy("nextRunAt").limit(DUE_PER_TICK).get(),
      group.where("nextRunAt", "==", null).limit(DUE_PER_TICK).get(),
    ]);
    const due = pickDue([...unscheduled.docs, ...scheduled.docs]);
    const embedder = new VertexEmbedder(projectId());
    let ran = 0;
    for (const { uid, search } of due) {
      if (Date.now() - started > TICK_BUDGET_MS) break;
      if (await runDue(db, uid, search, embedder)) ran++;
    }
    logger.info("saved_searches_tick", { due: due.length, ran, ms: Date.now() - started });
  },
);

/**
 * Runs one saved search against the user's daily budget; resolves whether it ran. Refused or
 * failed runs move on to their next slot instead of retrying every tick.
 */
async function runDue(
  db: Firestore,
  uid: string,
  search: SavedSearch,
  embedder: VertexEmbedder,
): Promise<boolean> {
  const runAt = new Date();
  const quota = new UserQuota(db, uid, runAt);
  try {
    if (await quota.admit("scheduledRun")) {
      await runSearch(
        {
          db,
          uid,
          query: search.query,
          filters: search.filters,
          mode: "saved",
          savedSearch: search,
          embedder,
          aiAvailable: true,
          limit: 50,
          now: runAt,
          version: __BFHR_VERSION__,
        },
        quota,
      );
      return true;
    }
    logger.info("saved_search_over_budget");
  } catch (error) {
    logger.error("saved_search_run_failed", { name: error instanceof Error ? error.name : typeof error });
  }
  await db
    .doc(firestorePaths.savedSearch(uid, search.id))
    .update(adminConverters.savedSearch.toFirestoreUpdate({ nextRunAt: nextRunAt(search.schedule, runAt) }));
  return false;
}

/**
 * A new saved search runs at once instead of waiting up to 30 minutes for the next tick, so the
 * first search from onboarding (or the Jobs screen) fills the feed while the user looks at it.
 * Skips a search that already ran (the client's "Run now" got there first) or is turned off.
 */
export const savedSearchCreatedRun = onDocumentCreated(
  {
    document: "users/{uid}/savedSearches/{searchId}",
    timeoutSeconds: 300,
    memory: "512MiB",
    secrets: [ANTHROPIC_API_KEY, ...JOB_SOURCE_SECRETS],
    retry: false,
  },
  async (event) => {
    const snapshot = event.data;
    if (snapshot === undefined) return;
    const db = getFirestore();
    const current = await snapshot.ref.get();
    if (!current.exists) return;
    let search: SavedSearch;
    try {
      search = adminConverters.savedSearch.fromSnapshot(current);
    } catch {
      logger.warn("saved_search_unparsable");
      return;
    }
    if (!search.enabled || search.lastRunAt !== null) return;
    const ran = await runDue(db, event.params.uid, search, new VertexEmbedder(projectId()));
    logger.info("saved_search_created_run", { ran });
  },
);
