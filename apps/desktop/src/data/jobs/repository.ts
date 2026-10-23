/**
 * The Jobs area's data as every screen sees it: live data (`JobsSource`, read with `useJobsData` in
 * `live.tsx`) and actions (`JobsRepository`). The app implements both on Firestore and the Cloud
 * Functions callables (`firestore.ts`), the design build and tests in memory (`memory.ts`).
 *
 * Writes follow the tracker's rules (`../tracker/writes.ts`): they apply locally at once, work
 * offline and `done` settles when the server accepted the batch. Callables (search, import, send)
 * need a connection and reject with the callable's `FunctionsError`.
 */
import type {
  Application,
  CoverLetter,
  DismissReason,
  Job,
  JobImportUrlResponse,
  JobMatch,
  JobsSearchRequest,
  JobsSearchResponse,
  JobSourceStatus,
  MailAccount,
  MailSendRequest,
  MailSendResponse,
  Profile,
  RenderedFile,
  SavedSearch,
} from "@bfhr/core";
import { createContext, useContext } from "react";
import type { PendingWrite } from "../tracker/repository";
import type { ApplyPlan, ApplyRecord, SavedSearchInput, SavedSearchPatch } from "./writes";

export interface JobsData {
  readonly jobs: readonly Job[];
  readonly jobMatches: readonly JobMatch[];
  readonly savedSearches: readonly SavedSearch[];
  /** Connected mail accounts (status only, never secrets); `canSend` gates the email composer. */
  readonly mailAccounts: readonly MailAccount[];
  readonly coverLetters: readonly CoverLetter[];
  readonly renderedFiles: readonly RenderedFile[];
  /** Health of every job source (`jobSources/{id}`, server-written). */
  readonly jobSources: readonly JobSourceStatus[];
  /** Ids of documents with local writes the server hasn't confirmed. */
  readonly pendingWrites: ReadonlySet<string>;
  readonly fromCache: boolean;
}

export type LiveJobsState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly data: JobsData };

export interface JobsSource {
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until something changes. */
  getState(): LiveJobsState;
}

export type HiddenCompany = Profile["hiddenCompanies"][number];

/** A rendered PDF to store as a `renderedFiles` document (+ its bytes in Storage). */
export interface RenderedFileInput {
  readonly kind: RenderedFile["kind"];
  readonly cvId: string | null;
  readonly cvRevisionId: string | null;
  readonly coverLetterId: string | null;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** A cover letter the user wrote for one application (`coverLetters/{id}`). */
export interface CoverLetterInput {
  readonly jobId: string | null;
  readonly applicationId: string | null;
  readonly title: string;
  readonly language: string;
  readonly body: string;
}

export interface JobsRepository {
  readonly uid: string;
  /**
   * "Save" (decisions.md D02 / F1): the job's Saved application with its `created` event, and the
   * match marked saved, in one batch. Without a match yet only the application is written.
   */
  save(job: Job, match: JobMatch | null): PendingWrite<{ readonly applicationId: string }>;
  /** Undoes `save`: deletes the still-Saved application and puts the match back to new. */
  unsave(match: JobMatch | null, application: Application | null): PendingWrite;
  /** "Not for me": the match dismissed with the optional reasons ("What didn't fit?"). */
  dismiss(jobId: string, reasons: readonly DismissReason[]): PendingWrite;
  /** Back in the feed (Undo, Hidden jobs › Show again). */
  restore(jobId: string): PendingWrite;
  /** "Hide all jobs from {company}" (profile.hiddenCompanies); `hidden: false` undoes it. */
  hideCompany(company: HiddenCompany, hidden: boolean, current: readonly HiddenCompany[]): PendingWrite;
  /** "I have this" on a skill gap: adds it to `profile.skills` (`added: false` undoes it). */
  setProfileSkill(skill: string, added: boolean, current: readonly string[]): PendingWrite;
  /** "Change" on the match's CV basis: the CV matches are scored against (`profile.defaultCvId`). */
  setMatchingCv(cvId: string | null): PendingWrite;
  /** `jobMatchesRefresh`: re-scores these jobs against the current profile and CV. */
  refreshMatches(jobIds: readonly string[]): Promise<void>;
  createSavedSearch(input: SavedSearchInput): PendingWrite<{ readonly savedSearchId: string }>;
  /** Edits a saved search; enabling it or changing its schedule runs it on the runner's next pass. */
  updateSavedSearch(savedSearch: SavedSearch, patch: SavedSearchPatch): PendingWrite;
  deleteSavedSearch(savedSearchId: string): PendingWrite;
  /** Recreates a deleted saved search with its id (Undo delete). */
  restoreSavedSearch(savedSearch: SavedSearch): PendingWrite;
  /** `jobsSearch`: searches the sources now; results arrive through the jobs and match listeners. */
  search(request: JobsSearchRequest): Promise<JobsSearchResponse>;
  /** `savedSearchRunNow`. */
  runSavedSearch(savedSearchId: string): Promise<JobsSearchResponse>;
  /** `jobImportUrl`: reads a posting from a link; nothing is stored until `saveImportedJob`. */
  importUrl(url: string): Promise<JobImportUrlResponse>;
  /**
   * Stores a confirmed import: a new job, or the existing job it merged into. A server trigger
   * scores new jobs (their match starts Saved).
   */
  saveImportedJob(
    job: Omit<Job, "id">,
    existingJobId: string | null,
  ): PendingWrite<{ readonly jobId: string }>;
  /**
   * "Yes, I applied" / email apply without a send account: the application moves to (or is
   * created as) Applied with its event, and pins the CV revision and files used.
   */
  recordApplied(record: ApplyRecord): PendingWrite<Omit<ApplyPlan, "writes">>;
  saveCoverLetter(
    input: CoverLetterInput,
    existing: CoverLetter | null,
  ): PendingWrite<{ readonly coverLetterId: string }>;
  /** Uploads a rendered PDF and creates its immutable `renderedFiles` document. */
  createRenderedFile(input: RenderedFileInput): Promise<RenderedFile>;
  /** `mailSend`: schedules the email (10 s undo window); the application doc carries `emailSend`. */
  sendEmail(request: MailSendRequest): Promise<MailSendResponse>;
  /** `mailSendCancel` while the send is scheduled. */
  cancelEmail(applicationId: string): Promise<void>;
  /** `mailSendNow`: ends the undo window early. */
  sendEmailNow(applicationId: string): Promise<void>;
}

export const JobsRepositoryContext = createContext<JobsRepository | null>(null);

/** The Jobs repository of the signed-in user (provided by the live routes and the design build). */
export function useJobsRepository(): JobsRepository {
  const repository = useContext(JobsRepositoryContext);
  if (!repository) throw new Error("useJobsRepository outside JobsRepositoryContext");
  return repository;
}
