/**
 * The tracker's data as every screen sees it: live data (`TrackerSource`, read with
 * `useTrackerData` in `live.ts`) and writes (`TrackerRepository`). The app implements both on
 * Firestore (`firestore.ts`), the design build and tests in memory (`memory.ts`). Writes apply
 * locally at once and work offline: the Firestore cache shows them to every listener immediately
 * (`pendingWrites` marks them) and syncs them later; `done` settles when the server accepted or
 * rejected the batch.
 */
import type {
  Application,
  ApplicationEvent,
  Contact,
  Cv,
  CvRevision,
  Interview,
  Job,
  Profile,
} from "@bfhr/core";
import { createContext, useContext } from "react";
import type {
  ApplicationPatch,
  ContactInput,
  InterviewInput,
  NewApplication,
  RevertTarget,
  StatusMove,
  SuggestionKind,
} from "./writes";

export interface TrackerData {
  /** Null until the profile document exists (builders then use the default settings). */
  readonly profile: Profile | null;
  readonly applications: readonly Application[];
  readonly applicationEvents: readonly ApplicationEvent[];
  readonly interviews: readonly Interview[];
  readonly contacts: readonly Contact[];
  /** Every CV (archived ones too: an application may have pinned one). */
  readonly cvs: readonly Cv[];
  /** Ids of documents with local writes the server hasn't confirmed (`SyncGlyph`). */
  readonly pendingWrites: ReadonlySet<string>;
  /** Some data came from the local cache only (offline, or before the first server answer). */
  readonly fromCache: boolean;
  /** When the server last confirmed this data (now while online). */
  readonly syncedAt: Date;
}

export type LiveTrackerState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly data: TrackerData };

/** A store of tracker data that screens subscribe to (`useSyncExternalStore`). */
export interface TrackerSource {
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until something changes. */
  getState(): LiveTrackerState;
}

/** A write applied locally at once; `done` settles when the server accepted (or rejected) it. */
export interface PendingWrite<Ids extends object = object> {
  readonly ids: Ids;
  readonly done: Promise<void>;
}

/** A document read on demand (not part of the live tracker data). */
export type Lookup<T> =
  { readonly status: "loading" } | { readonly status: "ready"; readonly value: T | null };

export interface TrackerRepository {
  readonly uid: string;
  /** Applications with their `created` events (and manual jobs for links); one batch per 160 items. */
  createApplications(
    items: readonly NewApplication[],
  ): PendingWrite<{ readonly applicationIds: readonly string[]; readonly eventIds: readonly string[] }>;
  /** Status moves through the core state machine (`transition`, actor user): patch + event each, one batch. */
  moveStatus(moves: readonly StatusMove[]): PendingWrite<{ readonly eventIds: readonly string[] }>;
  /** Reverting events for status changes (`revert`), one batch. */
  undo(targets: readonly RevertTarget[]): PendingWrite<{ readonly eventIds: readonly string[] }>;
  updateApplication(applicationId: string, patch: ApplicationPatch): PendingWrite;
  /** Deletes applications (Undo import); a server trigger deletes their events. */
  deleteApplications(applicationIds: readonly string[]): PendingWrite;
  addNote(applicationId: string, text: string): PendingWrite<{ readonly eventId: string }>;
  /** "Later" on a suggestion card; `null` ends the snooze (Undo). */
  snoozeSuggestion(applicationId: string, kind: SuggestionKind, until: Date | null): PendingWrite;
  /** "Not needed" / "Keep waiting"; `dismissed: false` undoes it. */
  dismissSuggestion(applicationId: string, kind: SuggestionKind, dismissed: boolean): PendingWrite;
  /** Creates (with its `interview_scheduled` event) or updates an interview round. */
  saveInterview(
    input: InterviewInput,
    existing: Interview | null,
  ): PendingWrite<{ readonly interviewId: string }>;
  deleteInterview(interviewId: string): PendingWrite;
  saveContact(input: ContactInput, existing: Contact | null): PendingWrite<{ readonly contactId: string }>;
  linkContact(contact: Contact, applicationId: string, linked: boolean): PendingWrite;
  deleteContact(contactId: string): PendingWrite;
  /** Listens to one job (the posting a logged application links to). */
  watchJob(jobId: string, onChange: (job: Lookup<Job>) => void): () => void;
  /** Listens to one CV's revisions, newest first (the CV revision picker, documents used). */
  watchCvRevisions(cvId: string, onChange: (revisions: Lookup<readonly CvRevision[]>) => void): () => void;
}

export const TrackerRepositoryContext = createContext<TrackerRepository | null>(null);

/** The repository of the signed-in user (provided by the live routes and the design build). */
export function useTrackerRepository(): TrackerRepository {
  const repository = useContext(TrackerRepositoryContext);
  if (!repository) throw new Error("useTrackerRepository outside TrackerRepositoryContext");
  return repository;
}
