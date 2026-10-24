// Scheduled, task-queue and trigger functions of mail sync (docs/adr/0012-mail-sync.md).
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  type Application,
  type ApplicationEvent,
  categoryTargetStatus,
  canTransition,
  DEFAULT_PROFILE_SETTINGS,
  isActiveStatus,
  MailAccountRequestSchema,
  MailBackfillStartRequestSchema,
  type MailDisconnectResponse,
  mailBodyPurgeAt,
  MAIL_REVIEW_CLIENT_STATES,
  transition,
} from "@bfhr/core";
import { type DocumentSnapshot, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { ANTHROPIC_API_KEY } from "../ai/common";
import { verifiedUid } from "../callable";
import { adminConverters as converters } from "../converters";
import { loadMailSecret } from "./accounts";
import { MAIL_SECRETS, oauthProvider } from "./config";
import { MailCallableError } from "./errors";
import { deleteSeenHashes } from "./pipeline";
import { prepareInterviewFromMail } from "./interviews";
import { enqueueSync, runSync, startBackfill, SYNC_BUDGET_MS, type SyncTaskData } from "./sync";

/** One account's sync step; long lookback scans re-enqueue themselves until done. */
export const mailSyncTask = onTaskDispatched<SyncTaskData>(
  {
    secrets: [...MAIL_SECRETS, ANTHROPIC_API_KEY],
    timeoutSeconds: 540,
    memory: "512MiB",
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 60, maxBackoffSeconds: 900 },
    rateLimits: { maxConcurrentDispatches: 5 },
  },
  async (request) => {
    const data = request.data;
    if (
      typeof data?.uid !== "string" ||
      typeof data.accountId !== "string" ||
      (data.mode !== "incremental" && data.mode !== "backfill")
    )
      return;
    const more = await runSync(data, Date.now() + SYNC_BUDGET_MS);
    if (more) await enqueueSync(data, { delaySeconds: 5, dedupe: false });
  },
);

/** Polls every connected account every 5 minutes (BRIEF §4.7 step 1). */
export const mailPoll = onSchedule({ schedule: "every 5 minutes", timeoutSeconds: 120 }, async () => {
  const accounts = await getFirestore()
    .collectionGroup("mailAccounts")
    .where("status", "in", ["connected", "syncing", "error"])
    .select()
    .get();
  let enqueued = 0;
  for (const doc of accounts.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid === undefined) continue;
    await enqueueSync({ uid, accountId: doc.id, mode: "incremental" });
    enqueued += 1;
  }
  logger.info("mail_poll", { accounts: enqueued });
});

async function ownedAccount(uid: string, accountId: string) {
  const snapshot = await getFirestore().doc(firestorePaths.mailAccount(uid, accountId)).get();
  if (!snapshot.exists)
    throw new MailCallableError("not-found", "account_not_found", "This account was not found.");
  return converters.mailAccount.fromSnapshot(snapshot);
}

/** Pull to refresh: an immediate incremental sync. */
export const mailSyncNow = onCall(async (request): Promise<{ queued: true }> => {
  const uid = verifiedUid(request);
  const parsed = MailAccountRequestSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { accountId }.");
  await ownedAccount(uid, parsed.data.accountId);
  await enqueueSync({ uid, accountId: parsed.data.accountId, mode: "incremental" });
  return { queued: true };
});

/** "Try the scan again" / "Scan the last 180 days". */
export const mailBackfillStart = onCall(async (request): Promise<{ queued: true }> => {
  const uid = verifiedUid(request);
  const parsed = MailBackfillStartRequestSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { accountId, lookbackDays }.");
  const account = await ownedAccount(uid, parsed.data.accountId);
  if (account.backfill?.state === "running" || account.backfill?.state === "queued") return { queued: true };
  await startBackfill(uid, account.id, parsed.data.lookbackDays);
  return { queued: true };
});

/**
 * Disconnect and delete (BRIEF §6.4, ADR 0002 retention): revokes the grant where the provider
 * allows it, deletes the account's stored messages, its encrypted credentials and dedupe hashes.
 */
export const mailDisconnect = onCall(
  { secrets: MAIL_SECRETS, timeoutSeconds: 300 },
  async (request): Promise<MailDisconnectResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailAccountRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { accountId }.");
    const account = await ownedAccount(uid, parsed.data.accountId);
    return { deletedMessages: await disconnectAccount(uid, account.id) };
  },
);

export async function disconnectAccount(uid: string, accountId: string): Promise<number> {
  const db = getFirestore();
  try {
    const secret = await loadMailSecret(uid, accountId);
    if (secret.kind === "oauth") await oauthProvider(secret.provider)?.revoke(secret.refreshToken);
  } catch (error) {
    logger.warn("mail_revoke_failed", { name: error instanceof Error ? error.name : typeof error });
  }
  await db
    .doc(firestorePaths.mailAccount(uid, accountId))
    .update({ status: "disconnected", updatedAt: Timestamp.now() })
    .catch(() => undefined);
  let deleted = 0;
  for (;;) {
    const page = await db
      .collection(firestorePaths.mailMessages(uid))
      .where("accountId", "==", accountId)
      .limit(400)
      .get();
    if (page.empty) break;
    const batch = db.batch();
    for (const doc of page.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += page.size;
  }
  await deleteSeenHashes(uid, accountId);
  await db.doc(serverOnlyPaths.mailToken(uid, accountId)).delete();
  await db.doc(firestorePaths.mailAccount(uid, accountId)).delete();
  logger.info("mail_disconnected", { deletedMessages: deleted });
  return deleted;
}

/** Revokes and deletes every mail account of a user (account deletion). */
export async function revokeAllMailAccounts(uid: string): Promise<void> {
  const accounts = await getFirestore().collection(firestorePaths.mailAccounts(uid)).select().get();
  for (const doc of accounts.docs) await disconnectAccount(uid, doc.id);
}

/** Daily retention purge (ADR 0002): clears bodies and snippets of due messages, keeps the metadata. */
export const mailBodyPurge = onSchedule(
  { schedule: "every day 03:30", timeZone: "UTC", timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    let purged = 0;
    for (;;) {
      const due = await db
        .collectionGroup("mailMessages")
        .where("bodyPurgeAt", "<=", Timestamp.now())
        .limit(400)
        .get();
      if (due.empty) break;
      const batch = db.batch();
      for (const doc of due.docs)
        batch.update(doc.ref, { bodyText: null, snippet: "", bodyPurgeAt: null, updatedAt: Timestamp.now() });
      await batch.commit();
      purged += due.size;
    }
    logger.info("mail_body_purge", { purged });
  },
);

/**
 * Keeps `bodyPurgeAt` in step with the linked application (ADR 0002): closing it starts the
 * retention clock for its messages, reopening it stops it again.
 */
export const mailApplicationChanged = onDocumentUpdated(
  { document: "users/{uid}/applications/{applicationId}", region: "europe-west1" },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (before === undefined || after === undefined) return;
    await syncBodyPurgeAt(event.params.uid, event.params.applicationId, before, after);
  },
);

/** Body of `mailApplicationChanged` (exported for the emulator tests). */
export async function syncBodyPurgeAt(
  uid: string,
  applicationId: string,
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): Promise<void> {
  const wasActive = isActiveStatus(before.get("status"));
  const isActive = isActiveStatus(after.get("status"));
  if (wasActive === isActive) return;
  const db = getFirestore();
  const profile = await db.doc(firestorePaths.user(uid)).get();
  const retentionDays = Number(
    profile.get("settings.mailBodyRetentionDays") ?? DEFAULT_PROFILE_SETTINGS.mailBodyRetentionDays,
  );
  const application = converters.application.fromSnapshot(after);
  const messages = await db
    .collection(firestorePaths.mailMessages(uid))
    .where("applicationId", "==", applicationId)
    .get();
  const batch = db.batch();
  for (const doc of messages.docs) {
    if (doc.get("bodyText") === null) continue;
    const receivedAt = (doc.get("receivedAt") as Timestamp).toDate();
    const purgeAt = mailBodyPurgeAt({ receivedAt, retentionDays, application });
    batch.update(doc.ref, {
      bodyPurgeAt: purgeAt === null ? null : Timestamp.fromDate(purgeAt),
      updatedAt: Timestamp.now(),
    });
  }
  if (!messages.empty) await batch.commit();
}

/**
 * Turns a review decision into tracker changes (flows.md §3: clients write only the four review
 * fields; this trigger writes the events). Confirm/Change on a pending message links it and, when
 * the category proposes a forward move, applies it as the user's change. "Not job mail" deletes the
 * message. Every changed category or link is kept as a labeled example (no body text).
 */
export const mailMessageReviewed = onDocumentUpdated(
  { document: "users/{uid}/mailMessages/{messageId}", region: "europe-west1" },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (before === undefined || after === undefined) return;
    await reviewMailMessage(event.params.uid, event.params.messageId, before, after);
  },
);

/** Body of `mailMessageReviewed` (exported for the emulator tests). */
export async function reviewMailMessage(
  uid: string,
  messageId: string,
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): Promise<void> {
  const state = after.get("reviewState") as string;
  if (
    state === before.get("reviewState") ||
    !(MAIL_REVIEW_CLIENT_STATES as readonly string[]).includes(state)
  )
    return;
  const db = getFirestore();
  const message = converters.mailMessage.fromSnapshot(after);
  const previousCategory = before.get("category") as string;
  const previousApplicationId = (before.get("applicationId") as string | null) ?? null;

  if (message.category !== previousCategory || message.applicationId !== previousApplicationId) {
    await db.collection(serverOnlyPaths.mailCorrections(uid)).add({
      from: {
        category: previousCategory,
        applicationId: previousApplicationId,
        reviewState: before.get("reviewState"),
      },
      to: { category: message.category, applicationId: message.applicationId, reviewState: state },
      senderDomain: message.from.address.slice(message.from.address.lastIndexOf("@") + 1),
      language: message.language,
      confidence: message.confidence,
      linkStrength: message.linkStrength,
      at: Timestamp.now(),
    });
  }
  if (message.category === "not_job") {
    await after.ref.delete();
    return;
  }
  const profile = await db.doc(firestorePaths.user(uid)).get();
  const userTimeZone =
    typeof profile.get("timezone") === "string" ? (profile.get("timezone") as string) : "UTC";
  // "Add interview" on an automatically applied invite: the status change stays, the interview
  // the invite proposes is created (review-first, ADR 0012).
  if (before.get("reviewState") === "auto_applied" && state === "confirmed") {
    await db.runTransaction(async (tx) => {
      const write = await prepareInterviewFromMail(tx, db, { uid, message, userTimeZone, now: new Date() });
      if (write !== null) tx.update(after.ref, { ...write(tx), updatedAt: FieldValue.serverTimestamp() });
    });
    return;
  }
  // Undo of an automatic change: the client already wrote the reverting event (ADR 0002).
  if (before.get("reviewState") === "auto_applied" || state === "dismissed" || message.applicationId === null)
    return;

  const appRef = db.doc(firestorePaths.application(uid, message.applicationId));
  const retentionDays = Number(
    profile.get("settings.mailBodyRetentionDays") ?? DEFAULT_PROFILE_SETTINGS.mailBodyRetentionDays,
  );
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(appRef);
    if (!snapshot.exists) return;
    const application: Application = converters.application.fromSnapshot(snapshot);
    const now = new Date();
    const interview = await prepareInterviewFromMail(tx, db, { uid, message, userTimeZone, now });
    const target =
      message.category === previousCategory && message.suggestedStatus !== null
        ? message.suggestedStatus
        : categoryTargetStatus(message.category, false);
    const eventsRef = db.collection(firestorePaths.applicationEvents(uid));
    const evidence = {
      mailMessageId: messageId,
      reason: state === "confirmed" ? "Confirmed from an email" : "Corrected from an email",
    };
    const linkEvent = eventsRef.doc();
    const received: ApplicationEvent = {
      id: linkEvent.id,
      applicationId: application.id,
      type: "mail_received",
      fromStatus: null,
      toStatus: null,
      actor: "user",
      confidence: null,
      evidence,
      text: message.subject.slice(0, 5_000) || null,
      revertsEventId: null,
      occurredAt: message.receivedAt,
      createdAt: now,
    };
    tx.create(linkEvent, converters.applicationEvent.toFirestore(received));
    let appliedEventId: string | null = null;
    let status = application.status;
    let statusChangedAt = application.statusChangedAt;
    const check = target === null ? null : canTransition(application.status, target, "user");
    if (
      target !== null &&
      check?.allowed === true &&
      (check.direction === "forward" || check.direction === "exit")
    ) {
      const result = transition({
        application,
        to: target,
        actor: "user",
        at: now,
        evidence,
        ...(message.subject ? { text: message.subject.slice(0, 5_000) } : {}),
      });
      const eventRef = eventsRef.doc();
      tx.create(eventRef, converters.applicationEvent.toFirestore({ id: eventRef.id, ...result.event }));
      tx.update(
        appRef,
        converters.application.toFirestoreUpdate({ ...result.applicationPatch, updatedAt: now }),
      );
      appliedEventId = eventRef.id;
      status = result.applicationPatch.status;
      statusChangedAt = result.applicationPatch.statusChangedAt;
    }
    const purgeAt = mailBodyPurgeAt({
      receivedAt: message.receivedAt,
      retentionDays,
      application: { status, statusChangedAt },
    });
    tx.update(after.ref, {
      appliedEventId,
      suggestedStatus: appliedEventId === null ? message.suggestedStatus : null,
      bodyPurgeAt: message.bodyText === null || purgeAt === null ? null : Timestamp.fromDate(purgeAt),
      ...interview?.(tx),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
