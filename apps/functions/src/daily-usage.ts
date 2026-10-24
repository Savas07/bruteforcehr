// Daily usage limits shared by several functions (docs/runbooks/limits.md): per-user counters
// next to each feature's data, and project-wide ceilings in `serverOnly/projectUsage`, so that many
// self-registered accounts together can't run up the owner's bill (AI spend, Chromium renders).
import { serverOnlyPaths } from "@bfhr/api";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

/** Project-wide ceilings per UTC day, across all users. */
export const PROJECT_DAILY_LIMITS = {
  /** AI spend in millionths of a dollar (each user is also capped at DAILY_COST_CAP_MICRO_USD). */
  aiMicroUsd: 3_000_000,
  /** `cvRenderPdf` renders (2 GiB Chromium each). */
  renders: 300,
} as const;

/** Per-user limits per UTC day (jobs limits are in jobs/quota.ts, AI spend in @bfhr/ai). */
export const USER_DAILY_LIMITS = {
  /** `cvRenderPdf` calls. */
  renders: 40,
  /** `mailConnectImap` calls (each tries IMAP and SMTP logins at a user-chosen server). */
  mailConnectAttempts: 20,
} as const;

/** Day documents are kept this long, then the TTL policy on `expireAt` removes them. */
const RETENTION_DAYS = 35;

/** UTC day key (`YYYY-MM-DD`). */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The TTL timestamp of a day document. */
export function dayExpireAt(day: string): Timestamp {
  return Timestamp.fromMillis(Date.parse(`${day}T00:00:00Z`) + RETENTION_DAYS * 86_400_000);
}

export interface DailyCounter<TName extends string = string> {
  /** Names the counter in the result when it refuses. */
  name: TName;
  /** Day document path. */
  path: string;
  field: string;
  amount: number;
  limit: number;
  /** Other fields written with the counter (e.g. a request count). */
  also?: Readonly<Record<string, unknown>>;
}

/**
 * Adds `amount` to every counter in one transaction, or to none: returns the first counter the
 * addition would take past its limit, or null when all were taken.
 */
export async function takeDaily<TName extends string>(
  counters: readonly DailyCounter<TName>[],
  day: string,
): Promise<TName | null> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const refs = counters.map((counter) => db.doc(counter.path));
    const snapshots = await tx.getAll(...refs);
    for (const [index, counter] of counters.entries()) {
      const used = Number(snapshots[index]?.get(counter.field) ?? 0);
      if (used + counter.amount > counter.limit) return counter.name;
    }
    for (const [index, counter] of counters.entries()) {
      const ref = refs[index];
      if (ref === undefined) continue;
      tx.set(
        ref,
        {
          ...counter.also,
          [counter.field]: FieldValue.increment(counter.amount),
          day,
          expireAt: dayExpireAt(day),
        },
        { merge: true },
      );
    }
    return null;
  });
}

/** The project-wide counter of `field` for `day`. */
export function projectCounter<TName extends string>(
  name: TName,
  field: keyof typeof PROJECT_DAILY_LIMITS,
  day: string,
  amount = 1,
): DailyCounter<TName> {
  return {
    name,
    path: serverOnlyPaths.projectUsageDay(day),
    field,
    amount,
    limit: PROJECT_DAILY_LIMITS[field],
  };
}
