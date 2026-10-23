// FCM sender: preference and quiet-hours checks, APNs payload, stale-token cleanup
// (docs/runbooks/notifications.md).
import { firestorePaths } from "@bfhr/api";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_PROFILE_SETTINGS,
  ProfileSettingsSchema,
  UiLanguageSchema,
  type ProfileSettings,
  type UiLanguage,
} from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import { type BatchResponse, getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { pushCopy, type PushCopy } from "./copy";
import { quietHoursEnd } from "./quiet-hours";
import type { PushKind, PushNotification } from "./types";

export const PUSH_DELIVER_FUNCTION = "pushDeliver";

export interface PushDeliverData {
  uid: string;
  notification: PushNotification;
}

/** FCM errors meaning the token will never work again: the device doc's token is cleared. */
const STALE_TOKEN_CODES: readonly string[] = [
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
];

export type PushSettings = Pick<ProfileSettings, "quietHours" | "notifyRejections" | "notifications">;

export interface PushProfile {
  readonly language: UiLanguage;
  /** Valid IANA zone (falls back to UTC). */
  readonly timeZone: string;
  readonly settings: PushSettings;
}

export interface PushDevice {
  readonly id: string;
  readonly token: string;
}

/** Side effects of `sendPush`, injected so tests run without Firebase. */
export interface PushDeps {
  loadProfile(uid: string): Promise<PushProfile | null>;
  /** Devices with a push token. */
  loadDevices(uid: string): Promise<readonly PushDevice[]>;
  clearTokens(uid: string, devices: readonly PushDevice[]): Promise<void>;
  send(message: MulticastMessage): Promise<BatchResponse>;
  defer(uid: string, notification: PushNotification, at: Date): Promise<void>;
}

export type PushResult =
  | { readonly status: "sent"; readonly delivered: number; readonly failed: number; readonly removed: number }
  | { readonly status: "no_profile" | "muted" | "no_devices" }
  | { readonly status: "deferred"; readonly at: Date };

/** Whether the user wants this kind of push (Settings › Notifications). */
export function pushAllowed(kind: PushKind, settings: PushSettings): boolean {
  const preferences = settings.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
  switch (kind) {
    case "interview":
      return preferences.interviews;
    case "offer":
      return preferences.offers;
    case "assessment":
      return preferences.assessments;
    case "decision":
      return settings.notifyRejections;
    case "status_update":
      return preferences.autoApplied;
    case "job_alerts":
      return preferences.jobAlerts;
  }
}

/** The FCM message: visible alert, the deep link in `data.link`, APNs grouping and collapsing. */
export function buildPushMessage(
  tokens: readonly string[],
  notification: PushNotification,
  copy: PushCopy,
): MulticastMessage {
  const alert = copy.body === "" ? { title: copy.title } : { title: copy.title, body: copy.body };
  return {
    tokens: [...tokens],
    notification: alert,
    data: { link: notification.link, kind: notification.content.kind },
    apns: {
      headers: { "apns-push-type": "alert", "apns-collapse-id": notification.collapseId },
      payload: { aps: { alert, sound: "default", threadId: notification.threadId } },
    },
  };
}

/**
 * Sends one push to every registered device of `uid`, localized in the profile's app language.
 * Muted kinds are dropped; inside quiet hours the push is deferred to their end (Cloud Task) and
 * re-checked then. Tokens FCM reports as unregistered are cleared from their device documents.
 */
export async function sendPush(
  uid: string,
  notification: PushNotification,
  deps: PushDeps = adminPushDeps(),
  now: Date = new Date(),
): Promise<PushResult> {
  const kind = notification.content.kind;
  const profile = await deps.loadProfile(uid);
  if (profile === null) return { status: "no_profile" };
  if (!pushAllowed(kind, profile.settings)) return { status: "muted" };
  const quietUntil = quietHoursEnd(now, profile.settings.quietHours, profile.timeZone);
  if (quietUntil !== null) {
    await deps.defer(uid, notification, quietUntil);
    logger.info("push_deferred", { kind, at: quietUntil.toISOString() });
    return { status: "deferred", at: quietUntil };
  }
  const devices = await deps.loadDevices(uid);
  if (devices.length === 0) return { status: "no_devices" };

  const tokens = [...new Set(devices.map((device) => device.token))];
  const response = await deps.send(
    buildPushMessage(tokens, notification, pushCopy(notification.content, profile.language)),
  );
  const stale = new Set(
    tokens.filter((_, index) => STALE_TOKEN_CODES.includes(response.responses[index]?.error?.code ?? "")),
  );
  const staleDevices = devices.filter((device) => stale.has(device.token));
  if (staleDevices.length > 0) await deps.clearTokens(uid, staleDevices);
  const result = {
    status: "sent",
    delivered: response.successCount,
    failed: response.failureCount,
    removed: staleDevices.length,
  } as const;
  logger.info("push_sent", { kind, ...result });
  return result;
}

/** Enqueues a Cloud Task once: an id already used (a retried trigger) is a no-op. */
export async function enqueueOnce<T extends object>(
  functionName: string,
  data: T,
  scheduleTime: Date,
  id: string,
): Promise<void> {
  try {
    await getFunctions()
      .taskQueue<T>(`locations/europe-west1/functions/${functionName}`)
      .enqueue(data, { scheduleTime, id: id.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 500) });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "functions/task-already-exists") return;
    throw error;
  }
}

/** Profile fields a push needs; an invalid value falls back to its default instead of failing. */
const PushSettingsSchema = z
  .object({
    quietHours: ProfileSettingsSchema.shape.quietHours.catch(null),
    notifyRejections: ProfileSettingsSchema.shape.notifyRejections.catch(
      DEFAULT_PROFILE_SETTINGS.notifyRejections,
    ),
    notifications: ProfileSettingsSchema.shape.notifications.catch(null),
  })
  .catch(DEFAULT_PROFILE_SETTINGS);

function validTimeZone(value: unknown): string {
  if (typeof value !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/** Production dependencies: Firestore, FCM and the `pushDeliver` task queue. */
export function adminPushDeps(): PushDeps {
  const db = getFirestore();
  return {
    async loadProfile(uid) {
      const snapshot = await db.doc(firestorePaths.user(uid)).get();
      if (!snapshot.exists) return null;
      return {
        language: UiLanguageSchema.catch("en").parse(snapshot.get("uiLanguage")),
        timeZone: validTimeZone(snapshot.get("timezone")),
        settings: PushSettingsSchema.parse(snapshot.get("settings")),
      };
    },
    async loadDevices(uid) {
      const snapshot = await db.collection(firestorePaths.devices(uid)).get();
      return snapshot.docs.flatMap((doc) => {
        const token: unknown = doc.get("pushToken");
        return typeof token === "string" && token !== "" ? [{ id: doc.id, token }] : [];
      });
    },
    async clearTokens(uid, devices) {
      // Only if the device still holds that token: the app may have registered a new one meanwhile.
      await Promise.all(
        devices.map((device) =>
          db.runTransaction(async (tx) => {
            const ref = db.doc(firestorePaths.device(uid, device.id));
            const snapshot = await tx.get(ref);
            if (snapshot.get("pushToken") === device.token) tx.update(ref, { pushToken: null });
          }),
        ),
      );
    },
    send: (message) => getMessaging().sendEachForMulticast(message),
    defer: (uid, notification, at) =>
      enqueueOnce<PushDeliverData>(
        PUSH_DELIVER_FUNCTION,
        { uid, notification },
        at,
        `push-${notification.collapseId}-${String(at.getTime())}`,
      ),
  };
}
