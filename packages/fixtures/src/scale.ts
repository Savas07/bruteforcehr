import {
  type Application,
  type ApplicationEvent,
  type Interview,
  type Job,
  type JobMatch,
  jobSourceKey,
} from "@bfhr/core";
import { type FixtureDataset, populatedDataset } from "./datasets";

/** The data volume of the performance budgets (docs/BRIEF.md §9): 5,000 jobs and 1,000 applications. */
export const PERF_SIZES = { jobs: 5_000, applications: 1_000 } as const;

export interface DatasetSizes {
  readonly jobs: number;
  readonly applications: number;
}

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** Copy `copy` (≥ 1) of a document id; copy 0 is the populated document itself. */
const copyId = (id: string, copy: number) => (copy === 0 ? id : `${id}-x${copy}`);

const shift = (date: Date | null, ms: number) => (date === null ? null : new Date(date.getTime() - ms));

/** Copy `copy` of a job: its own source ids, URLs and fingerprint (so dedupe keeps it), posted a little earlier. */
function copyJob(job: Job, copy: number): Job {
  if (copy === 0) return job;
  const age = copy * HOUR_MS;
  const sources = job.sources.map((source) => {
    const url = new URL(source.url);
    url.searchParams.set("copy", String(copy));
    return {
      ...source,
      sourceId: source.sourceId === null ? null : `${source.sourceId}-x${copy}`,
      url: url.toString(),
      postedAt: shift(source.postedAt, age),
    };
  });
  return {
    ...job,
    id: copyId(job.id, copy),
    sources,
    sourceKeys: sources.map(jobSourceKey),
    fingerprint: `${job.fingerprint.slice(0, 112)}-x${copy}`,
    postedAt: shift(job.postedAt, age),
  };
}

/** Copy `copy` of a match: the same factors, a score spread over the bands. */
function copyMatch(match: JobMatch, copy: number): JobMatch {
  if (copy === 0) return match;
  return { ...match, id: copyId(match.id, copy), score: Math.max(0, match.score - ((copy * 7) % 40)) };
}

/**
 * Copy `copy` of an application with its events and interviews: the same company, role and history
 * (so every status column fills like the populated board), linked to the same copy of its job.
 */
function copyApplication(
  application: Application,
  events: readonly ApplicationEvent[],
  interviews: readonly Interview[],
  copy: number,
  jobIds: ReadonlySet<string>,
): { application: Application; events: ApplicationEvent[]; interviews: Interview[] } {
  if (copy === 0) return { application, events: [...events], interviews: [...interviews] };
  const jobId = application.jobId === null ? null : copyId(application.jobId, copy);
  return {
    application: {
      ...application,
      id: copyId(application.id, copy),
      jobId: jobId !== null && jobIds.has(jobId) ? jobId : null,
    },
    events: events.map((event) => ({
      ...event,
      id: copyId(event.id, copy),
      applicationId: copyId(event.applicationId, copy),
      revertsEventId: event.revertsEventId === null ? null : copyId(event.revertsEventId, copy),
    })),
    // Later copies interview in later weeks, so the calendar and agenda don't stack them.
    interviews: interviews.map((interview) => ({
      ...interview,
      id: copyId(interview.id, copy),
      applicationId: copyId(interview.applicationId, copy),
      startsAt: new Date(interview.startsAt.getTime() + copy * WEEK_MS),
    })),
  };
}

/**
 * `populatedDataset` grown to `sizes` by copying its jobs (with their matches) and applications
 * (with their events and interviews) under new ids. Everything else is the populated dataset's.
 * Deterministic: the same sizes always give the same documents.
 */
export function scaledDataset(sizes: DatasetSizes = PERF_SIZES): FixtureDataset {
  const base = populatedDataset;
  const matches = new Map(base.jobMatches.map((match) => [match.id, match]));
  const jobs: Job[] = [];
  const jobMatches: JobMatch[] = [];
  for (let index = 0; index < sizes.jobs; index++) {
    const copy = Math.floor(index / base.jobs.length);
    const job = base.jobs[index % base.jobs.length];
    if (!job) break;
    jobs.push(copyJob(job, copy));
    const match = matches.get(job.id);
    if (match) jobMatches.push(copyMatch(match, copy));
  }
  const jobIds = new Set(jobs.map((job) => job.id));

  const applications: Application[] = [];
  const applicationEvents: ApplicationEvent[] = [];
  const interviews: Interview[] = [];
  for (let index = 0; index < sizes.applications; index++) {
    const copy = Math.floor(index / base.applications.length);
    const application = base.applications[index % base.applications.length];
    if (!application) break;
    const copied = copyApplication(
      application,
      base.applicationEvents.filter((event) => event.applicationId === application.id),
      base.interviews.filter((interview) => interview.applicationId === application.id),
      copy,
      jobIds,
    );
    applications.push(copied.application);
    applicationEvents.push(...copied.events);
    interviews.push(...copied.interviews);
  }

  return { ...base, jobs, jobMatches, applications, applicationEvents, interviews };
}
