/**
 * The tracker on Firestore: one set of snapshot listeners per signed-in user, shared by every
 * screen (`firestoreTrackerSource`), and the repository that commits `writes.ts` plans as batches
 * (`createFirestoreTrackerRepository`). Listeners include metadata changes, so local writes show at
 * once with `hasPendingWrites` (the outbox, ADR 0002) and clear when the server confirms them.
 */
import { firestorePaths, type EntityConverter } from "@bfhr/api";
import type { Application, ApplicationEvent, Contact, Cv, CvRevision, Interview, Profile } from "@bfhr/core";
import {
  collection,
  doc,
  type DocumentSnapshot,
  type Firestore,
  type FirestoreError,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "../../lib/firebaseServices";
import { converters } from "../converters";
import type { LiveTrackerState, PendingWrite, TrackerRepository, TrackerSource } from "./repository";
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
  type TrackerCollection,
  type TrackerWrite,
} from "./writes";

/** A document that fails validation is skipped (and logged) instead of failing the whole list. */
function decoded<T>(document: DocumentSnapshot, decode: (snapshot: DocumentSnapshot) => T): T | null {
  try {
    return decode(document);
  } catch (error) {
    console.error(`Skipping ${document.ref.path}`, error);
    return null;
  }
}

// ─── Live data ─────────────────────────────────────────────────────────────────────────────────

interface ListSnapshot<T> {
  readonly value: readonly T[];
  readonly pending: ReadonlySet<string>;
  readonly cache: boolean;
}

interface Snapshots {
  profile: { value: Profile | null; pending: boolean; cache: boolean } | null;
  applications: ListSnapshot<Application> | null;
  applicationEvents: ListSnapshot<ApplicationEvent> | null;
  interviews: ListSnapshot<Interview> | null;
  contacts: ListSnapshot<Contact> | null;
  cvs: ListSnapshot<Cv> | null;
}

/** Keeps listeners for this long after the last screen unsubscribed, so switching screens doesn't reload. */
const LINGER_MS = 30_000;

class FirestoreTrackerSource implements TrackerSource {
  private state: LiveTrackerState = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private stops: (() => void)[] = [];
  private lingerTimer: number | null = null;
  private syncedAt = new Date();

  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
  ) {}

  getState = (): LiveTrackerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.lingerTimer !== null) {
      clearTimeout(this.lingerTimer);
      this.lingerTimer = null;
    }
    if (this.stops.length === 0) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.lingerTimer = window.setTimeout(() => {
          this.lingerTimer = null;
          if (this.listeners.size === 0) this.stop();
        }, LINGER_MS);
      }
    };
  };

  private emit(state: LiveTrackerState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  private start(): void {
    const { db, uid } = this;
    const snapshots: Snapshots = {
      profile: null,
      applications: null,
      applicationEvents: null,
      interviews: null,
      contacts: null,
      cvs: null,
    };
    let failed = false;

    const fail = (error: FirestoreError) => {
      console.error("Tracker data listener failed", error);
      if (failed) return;
      failed = true;
      this.stop();
      this.emit({
        status: "error",
        retry: () => {
          this.emit({ status: "loading" });
          this.start();
        },
      });
    };

    const publish = () => {
      const { profile, applications, applicationEvents, interviews, contacts, cvs } = snapshots;
      if (failed || !profile || !applications || !applicationEvents || !interviews || !contacts || !cvs)
        return;
      const lists = [applications, applicationEvents, interviews, contacts, cvs];
      const pending = new Set<string>();
      for (const list of lists) for (const id of list.pending) pending.add(id);
      if (profile.pending) pending.add(uid);
      const fromCache = profile.cache || lists.some((list) => list.cache);
      if (!fromCache) this.syncedAt = new Date();
      this.emit({
        status: "ready",
        data: {
          profile: profile.value,
          applications: applications.value,
          applicationEvents: applicationEvents.value,
          interviews: interviews.value,
          contacts: contacts.value,
          cvs: cvs.value,
          pendingWrites: pending,
          fromCache,
          syncedAt: this.syncedAt,
        },
      });
    };

    const listen = <K extends Exclude<keyof Snapshots, "profile">, T>(
      key: K,
      path: string,
      converter: EntityConverter<T, never> | { fromSnapshot(snapshot: DocumentSnapshot): T },
    ) =>
      onSnapshot(
        collection(db, path),
        { includeMetadataChanges: true },
        (snapshot) => {
          const value: T[] = [];
          const pending = new Set<string>();
          for (const document of snapshot.docs) {
            const entity = decoded(document, (d) => converter.fromSnapshot(d));
            if (entity === null) continue;
            value.push(entity);
            if (document.metadata.hasPendingWrites) pending.add(document.id);
          }
          (snapshots[key] as ListSnapshot<T>) = { value, pending, cache: snapshot.metadata.fromCache };
          publish();
        },
        fail,
      );

    this.stops = [
      onSnapshot(
        doc(db, firestorePaths.user(uid)),
        { includeMetadataChanges: true },
        (snapshot) => {
          snapshots.profile = {
            value: snapshot.exists() ? decoded(snapshot, (d) => converters.profile.fromSnapshot(d)) : null,
            pending: snapshot.metadata.hasPendingWrites,
            cache: snapshot.metadata.fromCache,
          };
          publish();
        },
        fail,
      ),
      listen("applications", firestorePaths.applications(uid), converters.application),
      listen("applicationEvents", firestorePaths.applicationEvents(uid), converters.applicationEvent),
      listen("interviews", firestorePaths.interviews(uid), converters.interview),
      listen("contacts", firestorePaths.contacts(uid), converters.contact),
      listen("cvs", firestorePaths.cvs(uid), converters.cv),
    ];
  }
}

const sources = new Map<string, FirestoreTrackerSource>();

/** The shared live tracker data of `uid` (listeners start with the first subscriber). */
export function firestoreTrackerSource(uid: string): TrackerSource {
  let source = sources.get(uid);
  if (!source) {
    source = new FirestoreTrackerSource(firestore(), uid);
    sources.set(uid, source);
  }
  return source;
}

// ─── Writes ────────────────────────────────────────────────────────────────────────────────────

/** Firestore allows 500 writes per batch. */
const MAX_BATCH_WRITES = 500;

const COLLECTION_PATHS: Readonly<Record<TrackerCollection, (uid: string) => string>> = {
  applications: firestorePaths.applications,
  applicationEvents: firestorePaths.applicationEvents,
  interviews: firestorePaths.interviews,
  contacts: firestorePaths.contacts,
  jobs: firestorePaths.jobs,
};

const CONVERTERS = {
  applications: converters.application,
  applicationEvents: converters.applicationEvent,
  interviews: converters.interview,
  contacts: converters.contact,
  jobs: converters.job,
} as const;

export function createFirestoreTrackerRepository(uid: string): TrackerRepository {
  const db = firestore();
  const ref = (name: TrackerCollection, id: string) => doc(db, COLLECTION_PATHS[name](uid), id);
  const newId: NewId = (name) => doc(collection(db, COLLECTION_PATHS[name](uid))).id;

  /**
   * Commits the writes in batches of at most 500, never splitting one item's writes (`groups`):
   * each group is all-or-nothing.
   */
  const commit = (groups: readonly (readonly TrackerWrite[])[]): Promise<void> => {
    const batches: TrackerWrite[][] = [[]];
    for (const group of groups) {
      const current = batches.at(-1) ?? [];
      if (current.length + group.length > MAX_BATCH_WRITES) batches.push([...group]);
      else current.push(...group);
    }
    return Promise.all(
      batches
        .filter((writes) => writes.length > 0)
        .map((writes) => {
          const batch = writeBatch(db);
          for (const write of writes) {
            switch (write.op) {
              case "create": {
                const converter = CONVERTERS[write.collection] as EntityConverter<typeof write.entity, "id">;
                batch.set(ref(write.collection, write.entity.id), converter.toFirestore(write.entity));
                break;
              }
              case "update": {
                const converter = CONVERTERS[write.collection] as EntityConverter<object, never>;
                batch.update(ref(write.collection, write.id), converter.toFirestoreUpdate(write.patch));
                break;
              }
              case "delete":
                batch.delete(ref(write.collection, write.id));
                break;
            }
          }
          return batch.commit();
        }),
    ).then(() => undefined);
  };

  const pending = <Ids extends object>(
    ids: Ids,
    groups: readonly (readonly TrackerWrite[])[],
  ): PendingWrite<Ids> => ({
    ids,
    done: commit(groups),
  });

  /** Splits a flat plan into per-item groups of `size` writes. */
  const chunked = (writes: readonly TrackerWrite[], size: number): TrackerWrite[][] => {
    const groups: TrackerWrite[][] = [];
    for (let index = 0; index < writes.length; index += size) groups.push(writes.slice(index, index + size));
    return groups;
  };

  return {
    uid,
    createApplications(items) {
      const groups: TrackerWrite[][] = [];
      const applicationIds: string[] = [];
      const eventIds: string[] = [];
      for (const item of items) {
        const plan = planCreateApplications([item], new Date(), newId);
        groups.push([...plan.writes]);
        applicationIds.push(...plan.applicationIds);
        eventIds.push(...plan.eventIds);
      }
      return pending({ applicationIds, eventIds }, groups);
    },
    moveStatus(moves) {
      const plan = planMoves(moves, new Date(), newId);
      return pending({ eventIds: plan.eventIds }, chunked(plan.writes, 2));
    },
    undo(targets) {
      const plan = planUndo(targets, new Date(), newId);
      return pending({ eventIds: plan.eventIds }, chunked(plan.writes, 2));
    },
    updateApplication(applicationId, patch) {
      return pending({}, [planUpdateApplication(applicationId, patch, new Date())]);
    },
    deleteApplications(applicationIds) {
      return pending({}, chunked(planDeleteApplications(applicationIds), 1));
    },
    addNote(applicationId, text) {
      const plan = planAddNote(applicationId, text, new Date(), newId);
      return pending({ eventId: plan.eventIds[0] ?? "" }, [plan.writes]);
    },
    logFollowUp(applicationId) {
      const plan = planLogFollowUp(applicationId, new Date(), newId);
      return pending({ eventId: plan.eventIds[0] ?? "" }, [plan.writes]);
    },
    snoozeSuggestion(applicationId, kind, until) {
      return pending({}, [planSnoozeSuggestion(applicationId, kind, until, new Date())]);
    },
    dismissSuggestion(applicationId, kind, dismissed) {
      const at = new Date();
      return pending({}, [planDismissSuggestion(applicationId, kind, dismissed ? at : null, at)]);
    },
    saveInterview(input, existing) {
      const plan = planSaveInterview(input, existing, new Date(), newId);
      return pending({ interviewId: plan.interviewId }, [plan.writes]);
    },
    deleteInterview(interviewId) {
      return pending({}, [planDeleteInterview(interviewId)]);
    },
    saveContact(input, existing) {
      const plan = planSaveContact(input, existing, new Date(), newId);
      return pending({ contactId: plan.contactId }, [plan.writes]);
    },
    linkContact(contact, applicationId, linked) {
      return pending({}, [planLinkContact(contact, applicationId, linked, new Date())]);
    },
    deleteContact(contactId) {
      return pending({}, [planDeleteContact(contactId)]);
    },
    watchJob(jobId, onChange) {
      onChange({ status: "loading" });
      return onSnapshot(
        doc(db, firestorePaths.job(uid, jobId)),
        (snapshot) =>
          onChange({
            status: "ready",
            value: snapshot.exists() ? decoded(snapshot, (d) => converters.job.fromSnapshot(d)) : null,
          }),
        (error) => {
          console.error(`Job ${jobId} listener failed`, error);
          onChange({ status: "ready", value: null });
        },
      );
    },
    watchCvRevisions(cvId, onChange) {
      onChange({ status: "loading" });
      return onSnapshot(
        query(collection(db, firestorePaths.cvRevisions(uid, cvId)), orderBy("createdAt", "desc")),
        (snapshot) => {
          const revisions: CvRevision[] = [];
          for (const document of snapshot.docs) {
            const revision = decoded(document, (d) => converters.cvRevision.fromSnapshot(d));
            if (revision) revisions.push(revision);
          }
          onChange({ status: "ready", value: revisions });
        },
        (error) => {
          console.error(`Revisions of ${cvId} listener failed`, error);
          onChange({ status: "ready", value: [] });
        },
      );
    },
  };
}
