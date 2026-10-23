import { firestorePaths } from "@bfhr/api";
import {
  type JobSourceReason,
  type JobSourceStatus,
  type SourceRunReport,
  sourceErrorMessage,
} from "@bfhr/core";
import type {
  BoardConnector,
  CallBudget,
  ConnectorSecrets,
  FeedCache,
  RobotsRecord,
  SearchConnector,
} from "@bfhr/jobs-connectors";
import type { Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { adminConverters } from "../converters";

/** Shared (all users) per-source counters; server-only. */
const STATE_PATH = (sourceId: string) => `serverOnly/jobSources/state/${sourceId}`;
const ROBOTS_PATH = (host: string) => `serverOnly/jobSources/robots/${host.replace(/[^a-z0-9.-]/gi, "_")}`;

/** Consecutive failed runs before a source shows as failing (instead of degraded). */
const FAILING_AFTER = 3;

export interface SourceCounters {
  day: string;
  dayCalls: number;
  lifetimeCalls: number;
  consecutiveFailures: number;
}

/** Counters after one more call, or null when the budget is used up. */
export function admitSourceCall(
  counters: SourceCounters,
  budget: CallBudget,
  day: string,
): SourceCounters | null {
  const dayCalls = counters.day === day ? counters.dayCalls : 0;
  const used = budget.period === "day" ? dayCalls : counters.lifetimeCalls;
  if (used >= budget.limit) return null;
  return { ...counters, day, dayCalls: dayCalls + 1, lifetimeCalls: counters.lifetimeCalls + 1 };
}

/**
 * The public health document after a run. Only enums, counts, dates and the fixed
 * `sourceErrorMessage` text are stored: the document is readable by every user.
 */
export function nextSourceStatus(input: {
  connector: Pick<SearchConnector | BoardConnector, "id" | "label" | "kind" | "markets" | "attribution">;
  previous: JobSourceStatus | null;
  report: SourceRunReport;
  consecutiveFailures: number;
  quota: { used: number; limit: number } | null;
  now: Date;
}): JobSourceStatus {
  const { connector, previous, report, now } = input;
  const state: JobSourceStatus["state"] =
    report.status === "ok"
      ? "ok"
      : report.status === "skipped"
        ? "skipped"
        : input.consecutiveFailures >= FAILING_AFTER
          ? "failing"
          : "degraded";
  const reason: JobSourceReason | null = report.status === "ok" ? null : report.reason;
  return {
    id: connector.id,
    label: connector.label,
    kind: connector.kind,
    markets: [...connector.markets],
    state,
    reason,
    lastRunAt: report.status === "skipped" ? (previous?.lastRunAt ?? null) : now,
    lastSuccessAt: report.status === "ok" ? now : (previous?.lastSuccessAt ?? null),
    lastError: reason === null ? null : sourceErrorMessage(reason),
    lastResultCount: report.status === "ok" ? report.count : (previous?.lastResultCount ?? null),
    quota: input.quota,
    attribution: connector.attribution,
    updatedAt: now,
  };
}

function readCounters(data: Record<string, unknown> | undefined): SourceCounters {
  const number = (key: string) => (typeof data?.[key] === "number" ? (data[key] as number) : 0);
  return {
    day: typeof data?.["day"] === "string" ? (data["day"] as string) : "",
    dayCalls: number("dayCalls"),
    lifetimeCalls: number("lifetimeCalls"),
    consecutiveFailures: number("consecutiveFailures"),
  };
}

/** Shared source state in Firestore: call budgets, health documents and robots.txt records. */
export class SourceState {
  constructor(
    private readonly db: Firestore,
    private readonly now: Date,
  ) {}

  /** Takes one call from the source's shared budget; false when it is used up. */
  async admitCall(connector: SearchConnector, secrets: ConnectorSecrets): Promise<boolean> {
    const budget = connector.callBudget(secrets);
    if (budget === null) return true;
    const ref = this.db.doc(STATE_PATH(connector.id));
    const day = this.now.toISOString().slice(0, 10);
    return this.db.runTransaction(async (transaction) => {
      const next = admitSourceCall(readCounters((await transaction.get(ref)).data()), budget, day);
      if (next === null) return false;
      transaction.set(ref, next, { merge: true });
      return true;
    });
  }

  /** Updates `jobSources/{id}` from this run's reports (one per source that took part). */
  async record(
    reports: readonly SourceRunReport[],
    connectors: readonly (SearchConnector | BoardConnector)[],
    secrets: ConnectorSecrets,
  ): Promise<void> {
    await Promise.all(
      reports.map(async (report) => {
        const connector = connectors.find((candidate) => candidate.id === report.source);
        if (connector === undefined) return;
        const stateRef = this.db.doc(STATE_PATH(connector.id));
        const healthRef = this.db.doc(firestorePaths.jobSource(connector.id));
        await this.db.runTransaction(async (transaction) => {
          const [stateSnapshot, healthSnapshot] = await Promise.all([
            transaction.get(stateRef),
            transaction.get(healthRef),
          ]);
          const counters = readCounters(stateSnapshot.data());
          const consecutiveFailures =
            report.status === "error"
              ? counters.consecutiveFailures + 1
              : report.status === "ok"
                ? 0
                : counters.consecutiveFailures;
          const budget = "callBudget" in connector ? connector.callBudget(secrets) : null;
          const used =
            budget === null
              ? 0
              : budget.period === "day" && counters.day !== this.now.toISOString().slice(0, 10)
                ? 0
                : budget.period === "day"
                  ? counters.dayCalls
                  : counters.lifetimeCalls;
          let previous: JobSourceStatus | null = null;
          if (healthSnapshot.exists) {
            try {
              previous = adminConverters.jobSource.fromSnapshot(healthSnapshot);
            } catch {
              previous = null;
            }
          }
          const status = nextSourceStatus({
            connector,
            previous,
            report,
            consecutiveFailures,
            quota: budget === null ? null : { used, limit: budget.limit },
            now: this.now,
          });
          transaction.set(stateRef, { consecutiveFailures }, { merge: true });
          transaction.set(healthRef, adminConverters.jobSource.toFirestore(status));
        });
      }),
    );
  }

  /** Records a robots.txt verdict per host (server-only; ADR 0005 "fetched and recorded"). */
  async recordRobots(records: readonly RobotsRecord[]): Promise<void> {
    await Promise.all(
      records.map((record) =>
        this.db
          .doc(ROBOTS_PATH(record.host))
          .set({ host: record.host, allowed: record.allowed, checkedAt: record.checkedAt }),
      ),
    );
  }
}

/** Whole-feed responses shared across users, in the default bucket under `serverOnly/jobFeeds/` (no client access). */
export function storageFeedCache(): FeedCache {
  const file = (key: string) =>
    getStorage()
      .bucket()
      .file(`serverOnly/jobFeeds/${key.replace(/[^a-z0-9_-]/gi, "_")}.json`);
  return {
    async get(key, maxAgeMs) {
      const handle = file(key);
      const [exists] = await handle.exists();
      if (!exists) return null;
      const [metadata] = await handle.getMetadata();
      const updated = Date.parse(String(metadata.updated ?? ""));
      if (Number.isNaN(updated) || Date.now() - updated > maxAgeMs) return null;
      const [body] = await handle.download();
      return body.toString("utf8");
    },
    async put(key, body) {
      await file(key).save(body, { contentType: "application/json", resumable: false });
    },
  };
}
