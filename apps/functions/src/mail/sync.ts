// Incremental sync and the lookback scan for one account (docs/adr/0012-mail-sync.md).
import { firestorePaths } from "@bfhr/api";
import type { MailAccount, MailBackfill } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { logger } from "firebase-functions/v2";
import { converters } from "../converters";
import {
  acquireSyncLease,
  type BackfillProgress,
  loadBackfillProgress,
  openAdapter,
  releaseSyncLease,
  saveBackfillProgress,
} from "./accounts";
import {
  emptyCounts,
  loadPipelineContext,
  type PipelineContext,
  type ProcessCounts,
  processRefs,
} from "./pipeline";
import {
  MailAuthError,
  MailCursorExpiredError,
  type MailProviderAdapter,
  MailScopeError,
  MailTransientError,
} from "./providers/types";

export type SyncMode = "incremental" | "backfill";

/** Work budget per invocation; the task re-enqueues itself to continue a long scan. */
export const SYNC_BUDGET_MS = 6 * 60_000;
/** Lease outlives the budget plus the task's own timeout margin. */
const LEASE_SECONDS = 9 * 60;
/** After an expired cursor, rescan this many days besides the time since the last sync. */
const RESYNC_MARGIN_DAYS = 2;

export const SYNC_TASK_FUNCTION = "mailSyncTask";

export interface SyncTaskData {
  uid: string;
  accountId: string;
  mode: SyncMode;
}

/** Enqueues a sync; the same id within one 5-minute bucket is deduplicated by Cloud Tasks. */
export async function enqueueSync(
  data: SyncTaskData,
  options: { delaySeconds?: number; dedupe?: boolean } = {},
): Promise<void> {
  const queue = getFunctions().taskQueue<SyncTaskData>(
    `locations/europe-west1/functions/${SYNC_TASK_FUNCTION}`,
  );
  const bucket = Math.floor(Date.now() / 300_000);
  try {
    await queue.enqueue(data, {
      ...(options.delaySeconds === undefined ? {} : { scheduleDelaySeconds: options.delaySeconds }),
      ...(options.dedupe === false
        ? {}
        : { id: `${data.mode}-${data.uid}-${data.accountId}-${bucket}`.replace(/[^A-Za-z0-9_-]/gu, "_") }),
    });
  } catch (error) {
    if (errorCode(error) === "functions/task-already-exists") return;
    throw error;
  }
}

function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

async function updateAccount(uid: string, accountId: string, patch: Partial<MailAccount>): Promise<void> {
  await getFirestore()
    .doc(firestorePaths.mailAccount(uid, accountId))
    .update(converters.mailAccount.toFirestoreUpdate({ ...patch, updatedAt: new Date() }));
}

function backfillPatch(
  previous: MailBackfill,
  counts: ProcessCounts,
  applications: number,
  patch: Partial<MailBackfill>,
): MailBackfill {
  return {
    ...previous,
    scanned: previous.scanned + counts.scanned,
    jobMessages: previous.jobMessages + counts.jobMessages,
    interviewInvites: previous.interviewInvites + counts.interviewInvites,
    jobAlerts: previous.jobAlerts + counts.jobAlerts,
    pendingReview: previous.pendingReview + counts.pendingReview,
    applications,
    ...patch,
  };
}

/** Starts a lookback scan: resets the progress shown to clients and enqueues the task. */
export async function startBackfill(uid: string, accountId: string, lookbackDays: number): Promise<void> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000);
  const backfill: MailBackfill = {
    state: "queued",
    stage: "scanning",
    lookbackDays,
    since,
    scanned: 0,
    total: null,
    jobMessages: 0,
    applications: 0,
    interviewInvites: 0,
    jobAlerts: 0,
    pendingReview: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  await updateAccount(uid, accountId, { backfill });
  await saveBackfillProgress(uid, accountId, {
    pageToken: null,
    since: since.getTime(),
    lookbackDays,
    applicationKeys: [],
  });
  await enqueueSync({ uid, accountId, mode: "backfill" }, { dedupe: false });
}

/**
 * Runs one sync step. Returns true when work remains (the caller re-enqueues): a lookback scan
 * that ran out of budget, or incremental changes beyond one batch.
 */
export async function runSync(data: SyncTaskData, deadline = Date.now() + SYNC_BUDGET_MS): Promise<boolean> {
  const { uid, accountId } = data;
  const db = getFirestore();
  const snapshot = await db.doc(firestorePaths.mailAccount(uid, accountId)).get();
  if (!snapshot.exists) return false;
  const account = converters.mailAccount.fromSnapshot(snapshot);
  if (account.status === "disconnected" || account.status === "needs_reauth") return false;
  if (!(await acquireSyncLease(uid, accountId, LEASE_SECONDS))) {
    // Another run holds the account; a scan step retries shortly, a poll waits for the next one.
    return data.mode === "backfill";
  }

  let adapter: MailProviderAdapter | null = null;
  try {
    adapter = await openAdapter(uid, account);
    const context = await loadPipelineContext(uid, account);
    await updateAccount(uid, accountId, { status: "syncing" });
    const more =
      data.mode === "backfill"
        ? await runBackfill(uid, account, adapter, context, deadline)
        : await runIncremental(uid, account, adapter, context, deadline);
    await updateAccount(uid, accountId, { status: "connected", lastSyncedAt: new Date(), lastError: null });
    return more;
  } catch (error) {
    await recordFailure(uid, account, data.mode, error);
    return false;
  } finally {
    await adapter?.close().catch(() => undefined);
    await releaseSyncLease(uid, accountId);
  }
}

async function recordFailure(
  uid: string,
  account: MailAccount,
  mode: SyncMode,
  error: unknown,
): Promise<void> {
  const at = new Date();
  if (error instanceof MailAuthError || error instanceof MailScopeError) {
    logger.warn("mail_sync_needs_reauth", { provider: account.provider, mode });
    await updateAccount(uid, account.id, {
      status: "needs_reauth",
      lastError: {
        code: error instanceof MailScopeError ? "scope_missing" : "auth_failed",
        message: "Reconnect this account to keep checking new mail.",
        at,
      },
      ...(mode === "backfill" && account.backfill !== null
        ? {
            backfill: {
              ...account.backfill,
              state: "failed",
              error: { code: "auth_failed", message: "Reconnect this account." },
              finishedAt: at,
            },
          }
        : {}),
    });
    return;
  }
  const transient = error instanceof MailTransientError;
  logger.error("mail_sync_failed", {
    provider: account.provider,
    mode,
    name: error instanceof Error ? error.name : typeof error,
    transient,
  });
  await updateAccount(uid, account.id, {
    status: transient ? "connected" : "error",
    lastError: {
      code: transient ? "temporarily_unavailable" : "sync_failed",
      message: transient
        ? "The mail server was busy. We'll try again shortly."
        : "We couldn't check this account. We'll keep trying.",
      at,
    },
    ...(mode === "backfill" && account.backfill !== null && !transient
      ? {
          backfill: {
            ...account.backfill,
            state: "failed",
            error: { code: "sync_failed", message: "We couldn't finish scanning." },
            finishedAt: at,
          },
        }
      : {}),
  });
  if (transient && mode === "backfill") throw error;
}

async function runIncremental(
  uid: string,
  account: MailAccount,
  adapter: MailProviderAdapter,
  context: PipelineContext,
  deadline: number,
): Promise<boolean> {
  const counts = emptyCounts();
  let cursor = account.syncCursor;
  if (cursor === null) {
    await updateAccount(uid, account.id, { syncCursor: await adapter.currentCursor() });
    return false;
  }
  try {
    for (;;) {
      const page = await adapter.changesSince(cursor);
      await processRefs(context, adapter, page.refs, counts);
      cursor = page.cursor;
      await updateAccount(uid, account.id, { syncCursor: cursor });
      if (!page.more) break;
      if (Date.now() > deadline) return true;
    }
  } catch (error) {
    if (!(error instanceof MailCursorExpiredError)) throw error;
    // The provider forgot the cursor: take a fresh one, then rescan the gap (dedupe skips known mail).
    const fresh = await adapter.currentCursor();
    const lastSync = account.lastSyncedAt?.getTime() ?? Date.now() - 7 * 86_400_000;
    const since = new Date(lastSync - RESYNC_MARGIN_DAYS * 86_400_000);
    let pageToken: string | null = null;
    do {
      const page = await adapter.listSince(since, pageToken);
      await processRefs(context, adapter, page.refs, counts);
      pageToken = page.nextPageToken;
    } while (pageToken !== null && Date.now() < deadline);
    await updateAccount(uid, account.id, { syncCursor: fresh });
  }
  logger.info("mail_sync", { provider: account.provider, mode: "incremental", ...countsLog(counts) });
  return false;
}

async function runBackfill(
  uid: string,
  account: MailAccount,
  adapter: MailProviderAdapter,
  context: PipelineContext,
  deadline: number,
): Promise<boolean> {
  const progress: BackfillProgress | null = await loadBackfillProgress(uid, account.id);
  const backfill = account.backfill;
  if (progress === null || backfill === null) return false;
  const applicationKeys = new Set(progress.applicationKeys);
  let current: MailBackfill = { ...backfill, state: "running", startedAt: backfill.startedAt ?? new Date() };
  await updateAccount(uid, account.id, { backfill: current });

  // Incremental sync must start where the scan started, so nothing arriving meanwhile is missed.
  if (account.syncCursor === null)
    await updateAccount(uid, account.id, { syncCursor: await adapter.currentCursor() });

  let pageToken = progress.pageToken;
  let total = current.total;
  for (;;) {
    const page = await adapter.listSince(new Date(progress.since), pageToken);
    if (page.total !== null) total = page.total;
    const counts = emptyCounts();
    await processRefs(context, adapter, page.refs, counts);
    for (const key of counts.applicationKeys) applicationKeys.add(key);
    pageToken = page.nextPageToken;
    current = backfillPatch(current, counts, applicationKeys.size, {
      total,
      stage: pageToken === null ? "preparing" : "scanning",
    });
    await updateAccount(uid, account.id, { backfill: current });
    await saveBackfillProgress(uid, account.id, {
      ...progress,
      pageToken,
      applicationKeys: [...applicationKeys],
    });
    if (pageToken === null) break;
    if (Date.now() > deadline) return true;
  }
  current = { ...current, state: "done", stage: "preparing", finishedAt: new Date() };
  await updateAccount(uid, account.id, { backfill: current });
  await saveBackfillProgress(uid, account.id, null);
  logger.info("mail_sync", {
    provider: account.provider,
    mode: "backfill",
    scanned: current.scanned,
    jobMessages: current.jobMessages,
    applications: current.applications,
    pendingReview: current.pendingReview,
  });
  return false;
}

function countsLog(counts: ProcessCounts) {
  return {
    scanned: counts.scanned,
    jobMessages: counts.jobMessages,
    autoApplied: counts.autoApplied,
    pendingReview: counts.pendingReview,
  };
}
