import { DAILY_COST_CAP_MICRO_USD, DailyCapError, type UsageLedger } from "@bfhr/ai";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

/** Usage documents are kept this long, then removed by the Firestore TTL policy on `expireAt`. */
const RETENTION_DAYS = 35;

/**
 * Per-user daily AI spend in `serverOnly/aiUsage/users/{uid}/aiUsageDays/{YYYY-MM-DD}` (UTC day), which
 * security rules keep away from clients. `microUsd` holds settled costs plus open reservations, so
 * concurrent requests cannot jointly pass the cap.
 */
export function firestoreUsageLedger(uid: string, now = new Date()): UsageLedger {
  const day = now.toISOString().slice(0, 10);
  const ref = getFirestore().doc(`serverOnly/aiUsage/users/${uid}/aiUsageDays/${day}`);
  const expireAt = Timestamp.fromMillis(Date.parse(`${day}T00:00:00Z`) + RETENTION_DAYS * 86_400_000);
  return {
    async reserve(microUsd) {
      await getFirestore().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const spent = Number(snapshot.get("microUsd") ?? 0);
        if (spent + microUsd > DAILY_COST_CAP_MICRO_USD) throw new DailyCapError();
        tx.set(
          ref,
          {
            microUsd: spent + microUsd,
            requests: FieldValue.increment(1),
            day,
            expireAt,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
    },
    async settle(reservedMicroUsd, actualMicroUsd) {
      await ref.set(
        {
          microUsd: FieldValue.increment(actualMicroUsd - reservedMicroUsd),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    },
  };
}
