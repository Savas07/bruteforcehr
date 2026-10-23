// Push triggers and task queues (docs/runbooks/notifications.md).
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { converters } from "../converters";
import { DIGEST_LISTED_JOBS } from "./copy";
import {
  JOB_ALERT_DIGEST_FUNCTION,
  type JobAlertDigestData,
  jobAlertDigest,
  type JobAlertItem,
  jobAlertSchedule,
} from "./job-alerts";
import { mailPush } from "./mail";
import { adminPushDeps, enqueueOnce, type PushDeliverData, sendPush } from "./push";

/** Pending alerts read per digest; more stay pending for the next one. */
const DIGEST_MAX_ITEMS = 200;

/** Interview invites, offers, assessments, decisions and automatic status changes from mail. */
export const pushMailMessage = onDocumentCreated(
  { document: "users/{uid}/mailMessages/{messageId}", region: "europe-west1" },
  async (event) => {
    if (event.data === undefined) return;
    const { uid } = event.params;
    const message = converters.mailMessage.fromSnapshot(event.data);
    let application = null;
    if (message.applicationId !== null) {
      const snapshot = await getFirestore().doc(firestorePaths.application(uid, message.applicationId)).get();
      if (snapshot.exists) application = converters.application.fromSnapshot(snapshot);
    }
    const notification = mailPush(message, application, new Date());
    if (notification === null) return;
    await sendPush(uid, notification);
  },
);

/** Schedules the digest that will include a new saved-search alert. */
export const pushJobAlert = onDocumentCreated(
  { document: "serverOnly/jobAlerts/users/{uid}/jobAlertItems/{jobId}", region: "europe-west1" },
  async (event) => {
    if (event.data === undefined) return;
    const { uid } = event.params;
    const mode = event.data.get("dailyDigest") === true ? "daily" : "instant";
    const timeZone = mode === "daily" ? ((await adminPushDeps().loadProfile(uid))?.timeZone ?? "UTC") : "UTC";
    const { at, id } = jobAlertSchedule(uid, mode, new Date(), timeZone);
    await enqueueOnce<JobAlertDigestData>(JOB_ALERT_DIGEST_FUNCTION, { uid, mode }, at, id);
  },
);

/**
 * Sends one digest for the user's pending alerts of that mode and marks them `notifiedAt` (also
 * when the push is muted or deferred: each alert is handled once).
 */
export const pushJobAlertDigest = onTaskDispatched<JobAlertDigestData>(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 10 } },
  async (request) => {
    const { uid, mode } = request.data;
    if (typeof uid !== "string" || (mode !== "instant" && mode !== "daily")) return;
    const db = getFirestore();
    const pending = await db
      .collection(`${serverOnlyPaths.jobAlertsRoot(uid)}/jobAlertItems`)
      .where("notifiedAt", "==", null)
      .limit(DIGEST_MAX_ITEMS)
      .get();
    const docs = pending.docs.filter((doc) => (doc.get("dailyDigest") === true) === (mode === "daily"));
    const items: JobAlertItem[] = docs.map((doc) => ({
      jobId: doc.id,
      savedSearchId: String(doc.get("savedSearchId")),
      score: Number(doc.get("score")),
    }));
    if (items.length === 0) return;

    const best = [...items].sort((a, b) => b.score - a.score).slice(0, DIGEST_LISTED_JOBS);
    const jobSnapshots = await db.getAll(...best.map((item) => db.doc(firestorePaths.job(uid, item.jobId))));
    const jobs = new Map<string, { title: string; company: string }>();
    for (const snapshot of jobSnapshots) {
      const title: unknown = snapshot.get("title");
      const company: unknown = snapshot.get("company");
      if (snapshot.exists && typeof title === "string" && typeof company === "string")
        jobs.set(snapshot.id, { title, company });
    }
    const searchIds = [...new Set(items.map((item) => item.savedSearchId))];
    const searchNames = new Map<string, string>();
    if (searchIds.length === 1 && searchIds[0] !== undefined) {
      const search = await db.doc(firestorePaths.savedSearch(uid, searchIds[0])).get();
      const name: unknown = search.get("name");
      if (typeof name === "string") searchNames.set(search.id, name);
    }

    const notification = jobAlertDigest(items, jobs, searchNames);
    if (notification !== null) await sendPush(uid, notification);
    const batch = db.batch();
    const notifiedAt = Timestamp.now();
    for (const doc of docs) batch.update(doc.ref, { notifiedAt });
    await batch.commit();
    logger.info("push_job_alert_digest", { mode, items: items.length });
  },
);

/** A push deferred by quiet hours; preferences and quiet hours are checked again. */
export const pushDeliver = onTaskDispatched<PushDeliverData>(
  { retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 10 } },
  async (request) => {
    const { uid, notification } = request.data;
    if (typeof uid !== "string" || typeof notification?.link !== "string") return;
    await sendPush(uid, notification);
  },
);
