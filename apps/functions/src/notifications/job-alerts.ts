// Saved-search alerts: the jobs runner writes one `serverOnly/jobAlerts/users/{uid}/jobAlertItems/{jobId}`
// per new match at or above the search's alert threshold, all of a run in one batch. They are
// gathered into one digest push: a few minutes after the run, or at 09:00 local for searches with
// `dailyDigest` (decisions.md: "daily digest at 09:00 local").
import { createHash } from "node:crypto";
import { localDate, nextLocalTime } from "./quiet-hours";
import type { PushNotification } from "./types";

export const JOB_ALERT_DIGEST_FUNCTION = "pushJobAlertDigest";
/** Items of one run arrive within seconds; the digest waits for the end of this window. */
export const JOB_ALERT_DEBOUNCE_MS = 120_000;
/** decisions.md "Push threshold and digest defaults". */
export const DAILY_DIGEST_TIME = "09:00";

export type JobAlertMode = "instant" | "daily";

export interface JobAlertDigestData {
  uid: string;
  mode: JobAlertMode;
}

/** The fields of a `jobAlertItems` document the digest reads. */
export interface JobAlertItem {
  readonly jobId: string;
  readonly savedSearchId: string;
  readonly score: number;
}

/** When the digest task for a new item runs, and its id (one task per window per user). */
export function jobAlertSchedule(
  uid: string,
  mode: JobAlertMode,
  now: Date,
  timeZone: string,
): { readonly at: Date; readonly id: string } {
  if (mode === "daily") {
    const at = nextLocalTime(now, timeZone, DAILY_DIGEST_TIME);
    return { at, id: `jobalerts-daily-${uid}-${localDate(at, timeZone)}` };
  }
  const window = Math.floor(now.getTime() / JOB_ALERT_DEBOUNCE_MS);
  return {
    at: new Date((window + 1) * JOB_ALERT_DEBOUNCE_MS + 15_000),
    id: `jobalerts-instant-${uid}-${String(window)}`,
  };
}

/**
 * One digest push for pending alerts. `jobs` holds title and company of the best-scoring jobs
 * that still exist; `searchNames` the names of the saved searches involved.
 */
export function jobAlertDigest(
  items: readonly JobAlertItem[],
  jobs: ReadonlyMap<string, { readonly title: string; readonly company: string }>,
  searchNames: ReadonlyMap<string, string>,
): PushNotification | null {
  if (items.length === 0) return null;
  const ranked = [...items].sort((a, b) => b.score - a.score || a.jobId.localeCompare(b.jobId));
  const searches = [...new Set(ranked.map((item) => item.savedSearchId))];
  const onlySearch = searches.length === 1 ? (searches[0] ?? null) : null;
  const first = ranked[0];
  const id = encodeURIComponent;
  const link =
    ranked.length === 1 && first !== undefined
      ? `bruteforcehr://jobs/${id(first.jobId)}`
      : onlySearch === null
        ? "bruteforcehr://today"
        : `bruteforcehr://jobs/searches/${id(onlySearch)}`;
  return {
    content: {
      kind: "job_alerts",
      count: ranked.length,
      searchName: onlySearch === null ? null : (searchNames.get(onlySearch) ?? null),
      jobs: ranked.flatMap((item) => {
        const job = jobs.get(item.jobId);
        return job === undefined ? [] : [job];
      }),
    },
    link,
    threadId: "job-alerts",
    collapseId: `jobs-${createHash("sha256")
      .update(
        ranked
          .map((item) => item.jobId)
          .sort()
          .join("\n"),
      )
      .digest("hex")
      .slice(0, 40)}`,
  };
}
