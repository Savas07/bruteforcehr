import { DAILY_COST_CAP_MICRO_USD, DailyCapError, type UsageLedger } from "@bfhr/ai";
import { serverOnlyPaths } from "@bfhr/api";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { projectCounter, takeDaily, utcDayKey } from "../daily-usage";

/**
 * Per-user daily AI spend in `serverOnly/aiUsage/users/{uid}/aiUsageDays/{YYYY-MM-DD}` (UTC day), which
 * security rules keep away from clients, plus the project-wide ceiling (`PROJECT_DAILY_LIMITS.aiMicroUsd`
 * in `serverOnly/projectUsage`). `microUsd` holds settled costs plus open reservations, so
 * concurrent requests cannot jointly pass either cap. A TTL policy removes the day documents.
 */
export function firestoreUsageLedger(uid: string, now = new Date()): UsageLedger {
  const day = utcDayKey(now);
  const userPath = serverOnlyPaths.aiUsageDay(uid, day);
  const projectPath = serverOnlyPaths.projectUsageDay(day);
  return {
    async reserve(microUsd) {
      const refused = await takeDaily(
        [
          {
            name: "user" as const,
            path: userPath,
            field: "microUsd",
            amount: microUsd,
            limit: DAILY_COST_CAP_MICRO_USD,
            also: { requests: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
          },
          projectCounter("project" as const, "aiMicroUsd", day, microUsd),
        ],
        day,
      );
      if (refused !== null) throw new DailyCapError(refused);
    },
    async settle(reservedMicroUsd, actualMicroUsd) {
      const db = getFirestore();
      const change = FieldValue.increment(actualMicroUsd - reservedMicroUsd);
      const batch = db.batch();
      batch.set(
        db.doc(userPath),
        { microUsd: change, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      batch.set(db.doc(projectPath), { aiMicroUsd: change }, { merge: true });
      await batch.commit();
    },
  };
}
