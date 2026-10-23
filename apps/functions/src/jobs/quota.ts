import { serverOnlyPaths } from "@bfhr/api";
import { type Firestore, Timestamp } from "firebase-admin/firestore";

/**
 * Per-user limits on job searching (docs/runbooks/jobs.md), enforced server-side in
 * `serverOnly/jobQuota/users/{uid}/jobQuotaDays/{YYYY-MM-DD}` (UTC day; TTL after 35 days).
 * AI spend is additionally capped by the shared AI ledger (DAILY_COST_CAP_MICRO_USD).
 */
export const JOB_BUDGETS = {
  /** On-demand `jobsSearch`: spacing and daily count. */
  searchMinIntervalMs: 15_000,
  searchesPerDay: 60,
  /** `savedSearchRunNow`: spacing and daily count. */
  runNowMinIntervalMs: 60_000,
  runNowPerDay: 30,
  /** Scheduled saved-search runs per user and day. */
  scheduledRunsPerDay: 72,
  /** `jobMatchesRefresh` calls per day. */
  refreshesPerDay: 30,
  /** HTTP calls to job sources on the user's behalf per day (all runs together). */
  connectorCallsPerDay: 800,
  /** AI match rationales per day (each also counts against the AI cost cap). */
  rationalesPerDay: 40,
} as const;

export type RunKind = "search" | "runNow" | "scheduledRun" | "refresh";
export type MeteredUnit = "connectorCalls" | "rationales";

/** One user's counters for one UTC day. */
export interface QuotaDay {
  search: number;
  runNow: number;
  scheduledRun: number;
  refresh: number;
  connectorCalls: number;
  rationales: number;
  lastSearchAt: number | null;
  lastRunNowAt: number | null;
}

export const EMPTY_QUOTA_DAY: QuotaDay = {
  search: 0,
  runNow: 0,
  scheduledRun: 0,
  refresh: 0,
  connectorCalls: 0,
  rationales: 0,
  lastSearchAt: null,
  lastRunNowAt: null,
};

const RUN_LIMITS: Readonly<Record<RunKind, number>> = {
  search: JOB_BUDGETS.searchesPerDay,
  runNow: JOB_BUDGETS.runNowPerDay,
  scheduledRun: JOB_BUDGETS.scheduledRunsPerDay,
  refresh: JOB_BUDGETS.refreshesPerDay,
};

const UNIT_LIMITS: Readonly<Record<MeteredUnit, number>> = {
  connectorCalls: JOB_BUDGETS.connectorCallsPerDay,
  rationales: JOB_BUDGETS.rationalesPerDay,
};

/** The day's counters after starting one run of `kind`, or null when a limit refuses it. */
export function admitRun(day: QuotaDay, kind: RunKind, nowMs: number): QuotaDay | null {
  if (day[kind] >= RUN_LIMITS[kind]) return null;
  if (
    kind === "search" &&
    day.lastSearchAt !== null &&
    nowMs - day.lastSearchAt < JOB_BUDGETS.searchMinIntervalMs
  ) {
    return null;
  }
  if (
    kind === "runNow" &&
    day.lastRunNowAt !== null &&
    nowMs - day.lastRunNowAt < JOB_BUDGETS.runNowMinIntervalMs
  ) {
    return null;
  }
  return {
    ...day,
    [kind]: day[kind] + 1,
    ...(kind === "search" ? { lastSearchAt: nowMs } : {}),
    ...(kind === "runNow" ? { lastRunNowAt: nowMs } : {}),
  };
}

/** How many of `wanted` units are still available today, and the counters after taking them. */
export function takeUnits(
  day: QuotaDay,
  unit: MeteredUnit,
  wanted: number,
): { granted: number; day: QuotaDay } {
  const granted = Math.max(0, Math.min(wanted, UNIT_LIMITS[unit] - day[unit]));
  return { granted, day: { ...day, [unit]: day[unit] + granted } };
}

/** UTC day key. */
export function quotaDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const RETENTION_DAYS = 35;

function readDay(data: Record<string, unknown> | undefined): QuotaDay {
  const day = { ...EMPTY_QUOTA_DAY };
  if (data === undefined) return day;
  for (const key of Object.keys(EMPTY_QUOTA_DAY) as (keyof QuotaDay)[]) {
    const value = data[key];
    if (typeof value === "number") (day as Record<keyof QuotaDay, number | null>)[key] = value;
  }
  return day;
}

/** Firestore-backed quota for one user and day. Every change is a transaction. */
export class UserQuota {
  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly now: Date,
  ) {}

  private get ref() {
    return this.db.doc(serverOnlyPaths.jobQuotaDay(this.uid, quotaDayKey(this.now)));
  }

  private async update<T>(change: (day: QuotaDay) => { day: QuotaDay | null; result: T }): Promise<T> {
    const expireAt = Timestamp.fromMillis(
      Date.parse(`${quotaDayKey(this.now)}T00:00:00Z`) + RETENTION_DAYS * 86_400_000,
    );
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.ref);
      const { day, result } = change(readDay(snapshot.data()));
      if (day !== null) transaction.set(this.ref, { ...day, expireAt });
      return result;
    });
  }

  /** Starts a run; false when a daily limit or the spacing refuses it. */
  async admit(kind: RunKind): Promise<boolean> {
    return this.update((day) => {
      const next = admitRun(day, kind, this.now.getTime());
      return { day: next, result: next !== null };
    });
  }

  /** Reserves up to `wanted` units; returns how many were granted. */
  async take(unit: MeteredUnit, wanted: number): Promise<number> {
    if (wanted <= 0) return 0;
    return this.update((day) => {
      const taken = takeUnits(day, unit, wanted);
      return { day: taken.day, result: taken.granted };
    });
  }
}
