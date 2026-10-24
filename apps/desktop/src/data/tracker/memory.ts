/**
 * The tracker in memory: the design build's data (fixtures) and the tests' backend. It applies the
 * same `writes.ts` plans as the Firestore repository, so moves, Undo, adds and edits behave as in
 * the app, and notifies subscribers like a snapshot listener would.
 */
import type {
  Application,
  ApplicationEvent,
  Contact,
  Cv,
  CvRevision,
  Interview,
  Job,
  JobMatch,
  Profile,
  SavedSearch,
} from "@bfhr/core";
import type {
  LiveTrackerState,
  PendingWrite,
  TrackerData,
  TrackerRepository,
  TrackerSource,
} from "./repository";
import {
  planAddNote,
  planCreateApplications,
  planDeleteApplications,
  planDeleteContact,
  planDeleteInterview,
  planDismissSuggestion,
  planLinkContact,
  planLogFollowUp,
  planMoves,
  planSaveContact,
  planSaveInterview,
  planSnoozeSuggestion,
  planUndo,
  planUpdateApplication,
  type NewId,
  type TrackerEntities,
  type TrackerWrite,
} from "./writes";

/** The collections the memory store starts from (a `FixtureDataset` has them all). */
export interface MemoryTrackerSeed {
  readonly uid: string;
  readonly profile: Profile | null;
  readonly applications: readonly Application[];
  readonly applicationEvents: readonly ApplicationEvent[];
  readonly interviews: readonly Interview[];
  readonly contacts: readonly Contact[];
  readonly cvs: readonly Cv[];
  readonly cvRevisions: readonly CvRevision[];
  readonly jobs: readonly Job[];
  readonly jobMatches?: readonly JobMatch[];
  readonly savedSearches?: readonly SavedSearch[];
}

export interface MemoryTrackerStore {
  readonly source: TrackerSource;
  readonly repository: TrackerRepository;
  /** Every write applied so far, in order (tests assert on them). */
  readonly log: readonly TrackerWrite[];
  /** The jobs, including manual ones created for links. */
  jobs(): readonly Job[];
  /** Every CV revision, including ones written by plans (`createCvRevision`). */
  cvRevisions(): readonly CvRevision[];
  jobMatches(): readonly JobMatch[];
  savedSearches(): readonly SavedSearch[];
  /** Applies a plan like a committed batch (the memory jobs repository writes through it). */
  apply(writes: readonly TrackerWrite[]): Promise<void>;
  readonly newId: NewId;
  readonly clock: () => Date;
  /** Subscribes to every change of the store (tracker and jobs tables). */
  subscribe(listener: () => void): () => void;
}

type Tables = { -readonly [C in keyof TrackerEntities]: TrackerEntities[C][] };

export function createMemoryTrackerStore(seed: MemoryTrackerSeed, clock: () => Date): MemoryTrackerStore {
  const tables: Tables = {
    applications: [...seed.applications],
    applicationEvents: [...seed.applicationEvents],
    interviews: [...seed.interviews],
    contacts: [...seed.contacts],
    jobs: [...seed.jobs],
    jobMatches: [...(seed.jobMatches ?? [])],
    savedSearches: [...(seed.savedSearches ?? [])],
  };
  let profile = seed.profile;
  let cvRevisions: readonly CvRevision[] = [...seed.cvRevisions];
  const log: TrackerWrite[] = [];
  const listeners = new Set<() => void>();
  let counter = 0;
  const newId: NewId = (collection) => `mem-${collection}-${(counter += 1)}`;

  const snapshot = (): LiveTrackerState => {
    const data: TrackerData = {
      profile,
      applications: [...tables.applications],
      applicationEvents: [...tables.applicationEvents],
      interviews: [...tables.interviews],
      contacts: [...tables.contacts],
      cvs: seed.cvs,
      pendingWrites: new Set(),
      fromCache: false,
      syncedAt: clock(),
    };
    return { status: "ready", data };
  };
  let state = snapshot();

  const apply = (writes: readonly TrackerWrite[]): Promise<void> => {
    for (const write of writes) {
      log.push(write);
      if (write.op === "updateProfile") {
        if (profile === null) return Promise.reject(new Error("The profile does not exist"));
        profile = { ...profile, ...write.patch };
        continue;
      }
      if (write.op === "createCvRevision") {
        cvRevisions = [...cvRevisions, write.revision];
        continue;
      }
      const table = tables[write.collection] as { id: string }[];
      switch (write.op) {
        case "create":
          table.push(write.entity);
          break;
        case "update": {
          const index = table.findIndex((row) => row.id === write.id);
          if (index === -1)
            return Promise.reject(new Error(`${write.collection}/${write.id} does not exist`));
          table[index] = { ...table[index], ...write.patch } as { id: string };
          break;
        }
        case "delete": {
          const index = table.findIndex((row) => row.id === write.id);
          if (index !== -1) table.splice(index, 1);
          if (write.collection === "applications") {
            // The server trigger's job: an application's events go with it.
            tables.applicationEvents = tables.applicationEvents.filter(
              (event) => event.applicationId !== write.id,
            );
          }
          break;
        }
      }
    }
    state = snapshot();
    for (const listener of listeners) listener();
    return Promise.resolve();
  };

  const pending = <Ids extends object>(ids: Ids, writes: readonly TrackerWrite[]): PendingWrite<Ids> => ({
    ids,
    done: apply(writes),
  });

  const repository: TrackerRepository = {
    uid: seed.uid,
    createApplications(items) {
      const plan = planCreateApplications(items, clock(), newId);
      return pending({ applicationIds: plan.applicationIds, eventIds: plan.eventIds }, plan.writes);
    },
    moveStatus(moves) {
      const plan = planMoves(moves, clock(), newId);
      return pending({ eventIds: plan.eventIds }, plan.writes);
    },
    undo(targets) {
      const plan = planUndo(targets, clock(), newId);
      return pending({ eventIds: plan.eventIds }, plan.writes);
    },
    updateApplication(applicationId, patch) {
      return pending({}, planUpdateApplication(applicationId, patch, clock()));
    },
    deleteApplications(applicationIds) {
      return pending({}, planDeleteApplications(applicationIds));
    },
    addNote(applicationId, text) {
      const plan = planAddNote(applicationId, text, clock(), newId);
      return pending({ eventId: plan.eventIds[0] ?? "" }, plan.writes);
    },
    logFollowUp(applicationId) {
      const plan = planLogFollowUp(applicationId, clock(), newId);
      return pending({ eventId: plan.eventIds[0] ?? "" }, plan.writes);
    },
    snoozeSuggestion(applicationId, kind, until) {
      return pending({}, planSnoozeSuggestion(applicationId, kind, until, clock()));
    },
    dismissSuggestion(applicationId, kind, dismissed) {
      const at = clock();
      return pending({}, planDismissSuggestion(applicationId, kind, dismissed ? at : null, at));
    },
    saveInterview(input, existing) {
      const plan = planSaveInterview(input, existing, clock(), newId);
      return pending({ interviewId: plan.interviewId }, plan.writes);
    },
    deleteInterview(interviewId) {
      return pending({}, planDeleteInterview(interviewId));
    },
    saveContact(input, existing) {
      const plan = planSaveContact(input, existing, clock(), newId);
      return pending({ contactId: plan.contactId }, plan.writes);
    },
    linkContact(contact, applicationId, linked) {
      return pending({}, planLinkContact(contact, applicationId, linked, clock()));
    },
    deleteContact(contactId) {
      return pending({}, planDeleteContact(contactId));
    },
    watchJob(jobId, onChange) {
      const emit = () =>
        onChange({ status: "ready", value: tables.jobs.find((job) => job.id === jobId) ?? null });
      emit();
      listeners.add(emit);
      return () => listeners.delete(emit);
    },
    watchCvRevisions(cvId, onChange) {
      const emit = () =>
        onChange({
          status: "ready",
          value: cvRevisions
            .filter((revision) => revision.cvId === cvId)
            .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        });
      emit();
      listeners.add(emit);
      return () => listeners.delete(emit);
    },
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    source: { subscribe, getState: () => state },
    repository,
    log,
    jobs: () => tables.jobs,
    jobMatches: () => tables.jobMatches,
    savedSearches: () => tables.savedSearches,
    cvRevisions: () => cvRevisions,
    apply,
    newId,
    clock,
    subscribe,
  };
}
