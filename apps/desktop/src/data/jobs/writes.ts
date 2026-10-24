/**
 * What every Jobs action writes, as plain `TrackerWrite` plans (the tracker's writer commits them,
 * `../tracker/writes.ts`), so the Firestore and memory repositories behave the same and the rules
 * are tested once (`writes.test.ts`):
 * - Save (decisions.md D02 / F1) is the Saved application + its `created` event + the match's
 *   `state: saved`, one batch; unsave deletes the still-Saved application;
 * - matches change only `state`, `dismissReasons` and `stateChangedAt` (firestore.rules);
 * - "Yes, I applied" moves the job's application to Applied (or creates it there) and pins the CV
 *   revision, cover letter and files used; pins are write-once, so set ones are never replaced.
 */
import {
  type Application,
  type ApplicationStatus,
  type Channel,
  type DismissReason,
  type Job,
  type JobMatch,
  type SavedSearch,
  type SavedSearchFilters,
  type SavedSearchSchedule,
  statusPhase,
} from "@bfhr/core";
import {
  newApplication,
  type NewId,
  planCreateApplications,
  planMoves,
  type TrackerWrite,
} from "../tracker/writes";
import type { HiddenCompany } from "./repository";

// ─── Matches ───────────────────────────────────────────────────────────────────────────────────

function matchState(
  jobId: string,
  state: JobMatch["state"],
  reasons: readonly DismissReason[],
  at: Date,
): TrackerWrite {
  return {
    op: "update",
    collection: "jobMatches",
    id: jobId,
    patch: { state, dismissReasons: [...reasons], stateChangedAt: at },
  };
}

export interface SavePlan {
  readonly writes: readonly TrackerWrite[];
  readonly applicationId: string;
}

/** The application a saved job starts (`status: saved`, linked by `jobId`, D02). */
function savedApplication(job: Job, at: Date): Omit<Application, "id"> {
  return {
    ...newApplication(
      {
        company: job.company,
        role: job.title,
        status: "saved",
        location: job.locations[0]?.label ?? null,
        source: job.sources[0]?.source ?? null,
        jobId: job.id,
      },
      at,
    ),
    companyDomain: job.companyDomain,
  };
}

export function planSave(job: Job, match: JobMatch | null, at: Date, newId: NewId): SavePlan {
  const plan = planCreateApplications([{ application: savedApplication(job, at) }], at, newId);
  const writes = [...plan.writes];
  if (match) writes.push(matchState(job.id, "saved", [], at));
  return { writes, applicationId: plan.applicationIds[0] ?? "" };
}

/** Deletes the application only while it is still Saved: anything later is the user's tracker history. */
export function planUnsave(
  match: JobMatch | null,
  application: Application | null,
  at: Date,
): TrackerWrite[] {
  const writes: TrackerWrite[] = [];
  if (application?.status === "saved")
    writes.push({ op: "delete", collection: "applications", id: application.id });
  if (match?.state === "saved") writes.push(matchState(match.id, "new", [], at));
  return writes;
}

export function planDismiss(jobId: string, reasons: readonly DismissReason[], at: Date): TrackerWrite[] {
  return [matchState(jobId, "dismissed", [...new Set(reasons)], at)];
}

export function planRestore(jobId: string, at: Date): TrackerWrite[] {
  return [matchState(jobId, "new", [], at)];
}

/** Adds or removes the company (matched by domain when both have one, else by name). */
export function planHideCompany(
  company: HiddenCompany,
  hidden: boolean,
  current: readonly HiddenCompany[],
  at: Date,
): TrackerWrite[] {
  const same = (entry: HiddenCompany) =>
    entry.domain !== null && company.domain !== null
      ? entry.domain === company.domain
      : entry.name.toLocaleLowerCase("en") === company.name.toLocaleLowerCase("en");
  const rest = current.filter((entry) => !same(entry));
  return [
    { op: "updateProfile", patch: { hiddenCompanies: hidden ? [...rest, company] : rest, updatedAt: at } },
  ];
}

/** Matching skills are normalized lower-case (ProfileSchema `skills`). */
export function planProfileSkill(
  skill: string,
  added: boolean,
  current: readonly string[],
  at: Date,
): TrackerWrite[] {
  const normalized = skill.trim().toLocaleLowerCase("en");
  const rest = current.filter((entry) => entry !== normalized);
  return [{ op: "updateProfile", patch: { skills: added ? [...rest, normalized] : rest, updatedAt: at } }];
}

// ─── Saved searches ────────────────────────────────────────────────────────────────────────────

/** What the user sets on a saved search (save-search popover and editor). */
export interface SavedSearchInput {
  readonly name: string;
  readonly query: string;
  readonly filters: SavedSearchFilters;
  readonly schedule: SavedSearchSchedule;
  readonly alertThreshold: number;
  readonly dailyDigest: boolean;
  readonly enabled: boolean;
}

export type SavedSearchPatch = Partial<SavedSearchInput>;

/**
 * A new saved search. `nextRunAt` is now, so the scheduled runner picks it up on its next pass
 * (JobsBackend contract: clients set it on create, enable and schedule change).
 */
export function planCreateSavedSearch(
  input: SavedSearchInput,
  at: Date,
  newId: NewId,
): { writes: TrackerWrite[]; savedSearchId: string } {
  const savedSearchId = newId("savedSearches");
  const entity: SavedSearch = {
    id: savedSearchId,
    ...input,
    name: input.name.trim(),
    query: input.query.trim(),
    lastRunAt: null,
    nextRunAt: input.enabled ? at : null,
    createdAt: at,
    updatedAt: at,
  };
  return { writes: [{ op: "create", collection: "savedSearches", entity }], savedSearchId };
}

export function planUpdateSavedSearch(
  savedSearch: Pick<SavedSearch, "id" | "enabled" | "schedule">,
  patch: SavedSearchPatch,
  at: Date,
): TrackerWrite[] {
  const enabled = patch.enabled ?? savedSearch.enabled;
  const rescheduled =
    (patch.enabled === true && !savedSearch.enabled) ||
    (patch.schedule !== undefined && patch.schedule !== savedSearch.schedule);
  return [
    {
      op: "update",
      collection: "savedSearches",
      id: savedSearch.id,
      patch: {
        ...patch,
        ...(patch.name !== undefined && { name: patch.name.trim() }),
        ...(patch.query !== undefined && { query: patch.query.trim() }),
        ...(!enabled ? { nextRunAt: null } : rescheduled ? { nextRunAt: at } : {}),
        updatedAt: at,
      },
    },
  ];
}

// ─── Import ────────────────────────────────────────────────────────────────────────────────────

/** A confirmed `jobImportUrl` result: a new job, or the existing one it merged into. */
export function planSaveImportedJob(
  job: Omit<Job, "id">,
  existingJobId: string | null,
  at: Date,
  newId: NewId,
): { writes: TrackerWrite[]; jobId: string } {
  if (existingJobId !== null) {
    const { createdAt: _createdAt, ...fields } = job;
    return {
      writes: [{ op: "update", collection: "jobs", id: existingJobId, patch: { ...fields, updatedAt: at } }],
      jobId: existingJobId,
    };
  }
  const jobId = newId("jobs");
  return {
    writes: [
      { op: "create", collection: "jobs", entity: { ...job, id: jobId, createdAt: at, updatedAt: at } },
    ],
    jobId,
  };
}

// ─── Apply ─────────────────────────────────────────────────────────────────────────────────────

/** "Yes, I applied" (external apply) or an email sent outside the app. */
export interface ApplyRecord {
  readonly job: Job;
  /** The job's application, if it has one (Saved or Preparing after D02). */
  readonly application: Application | null;
  readonly channel: Extract<Channel, "email" | "external_link">;
  readonly cvId: string | null;
  readonly cvRevisionId: string | null;
  readonly cvFileId?: string | null;
  readonly coverLetterId?: string | null;
  readonly coverLetterFileId?: string | null;
}

/** Pins only where the application has none yet (they are write-once, firestore.rules `pinKept`). */
function pinPatch(record: ApplyRecord, application: Application | null): Partial<Application> {
  const patch: Partial<Application> = {};
  const pins = [
    ["cvId", record.cvId],
    ["cvRevisionId", record.cvRevisionId],
    ["cvFileId", record.cvFileId ?? null],
    ["coverLetterId", record.coverLetterId ?? null],
    ["coverLetterFileId", record.coverLetterFileId ?? null],
  ] as const;
  for (const [field, value] of pins)
    if (value !== null && (application?.[field] ?? null) === null) patch[field] = value;
  return patch;
}

const APPLIED: ApplicationStatus = "applied";

export interface ApplyPlan {
  readonly writes: readonly TrackerWrite[];
  readonly applicationId: string;
  /** The `status_changed` (moved) or `created` event; null when the application was past Saved already. */
  readonly eventId: string | null;
  /** The application is new: Undo deletes it; otherwise Undo reverts `eventId`. */
  readonly created: boolean;
}

export function planRecordApplied(record: ApplyRecord, at: Date, newId: NewId): ApplyPlan {
  const { job, application } = record;
  const source = job.sources[0]?.source ?? null;
  if (application && statusPhase(application.status) === "shortlist") {
    const moves = planMoves([{ application, to: APPLIED }], at, newId);
    const pins = pinPatch(record, application);
    return {
      writes: [
        ...moves.writes,
        {
          op: "update",
          collection: "applications",
          id: application.id,
          patch: {
            ...pins,
            channel: record.channel,
            ...(application.source === null && { source }),
            updatedAt: at,
          },
        },
      ],
      applicationId: application.id,
      eventId: moves.eventIds[0] ?? null,
      created: false,
    };
  }
  if (application) return { writes: [], applicationId: application.id, eventId: null, created: false };
  const created = planCreateApplications(
    [
      {
        application: {
          ...newApplication(
            {
              company: job.company,
              role: job.title,
              status: APPLIED,
              location: job.locations[0]?.label ?? null,
              channel: record.channel,
              source,
              jobId: job.id,
            },
            at,
          ),
          companyDomain: job.companyDomain,
          ...pinPatch(record, null),
        },
      },
    ],
    at,
    newId,
  );
  return {
    writes: created.writes,
    applicationId: created.applicationIds[0] ?? "",
    eventId: created.eventIds[0] ?? null,
    created: true,
  };
}
