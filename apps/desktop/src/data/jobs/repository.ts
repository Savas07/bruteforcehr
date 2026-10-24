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
  Answer,
  Application,
  CoverLetter,
  CoverLetterAuthor,
  CoverLetterDraftRequest,
  CoverLetterDraftResponse,
  CvRevision,
  CvTailorRequest,
  CvTailorResponse,
  DismissReason,
  Job,
  JobImportUrlResponse,
  JobMatch,
  JobsSearchRequest,
  JobsSearchResponse,
  JobSourceStatus,
  MailAccount,
  MailSendAttachment,
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
  /**
   * The answers library (`users/{uid}/answers`, Settings › Application answers), copied from the
   * external-apply kit. Empty while it can't be read: the kit and Settings still work without it.
   */
  readonly answers: readonly Answer[];
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
  /** `ai` while the letter is an AI draft (edited or not); kept from `existing` when absent. */
  readonly author?: CoverLetterAuthor;
}

/** "Save as template": a reusable letter (`coverLetters/{id}` with `isTemplate: true`). */
export interface CoverLetterTemplateInput {
  readonly title: string;
  readonly language: string;
  readonly body: string;
}

/** A tailored revision to save: everything but the id and time the repository assigns. */
export interface TailoredRevisionInput {
  readonly job: Job;
  readonly match: JobMatch | null;
  readonly application: Application | null;
  readonly revision: Omit<CvRevision, "id" | "createdAt">;
}

/** Types a device file may have (`MAIL_ATTACHMENT_CONTENT_TYPES`). */
export type MailAttachmentContentType = Extract<MailSendAttachment, { kind: "upload" }>["contentType"];

/** A file from the user's computer attached to an email apply. */
export interface MailAttachmentUpload {
  readonly fileName: string;
  readonly contentType: MailAttachmentContentType;
  readonly bytes: Uint8Array;
}

/** What Settings › Application answers writes for one answer. */
export type AnswerInput = Omit<Answer, "id" | "createdAt" | "updatedAt">;

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
  /** "Save as template": a new `coverLetters` document with `isTemplate: true`. */
  saveCoverLetterTemplate(input: CoverLetterTemplateInput): PendingWrite<{ readonly coverLetterId: string }>;
  /**
   * "Save as new version" after tailoring: the `ai_tailor` revision and its pin on the job's
   * application in one batch (`planSaveTailoredRevision`). The CV's current revision doesn't move.
   */
  saveTailoredRevision(
    input: TailoredRevisionInput,
  ): PendingWrite<{ readonly revisionId: string; readonly applicationId: string }>;
  /** Uploads a rendered PDF and creates its immutable `renderedFiles` document. */
  createRenderedFile(input: RenderedFileInput): Promise<RenderedFile>;
  /** Uploads a device file to `users/{uid}/mail-attachments/{id}` for `mailSend`; returns its path. */
  uploadMailAttachment(input: MailAttachmentUpload): Promise<{ readonly storagePath: string }>;
  /** `mailSend`: schedules the email (10 s undo window); the application doc carries `emailSend`. */
  sendEmail(request: MailSendRequest): Promise<MailSendResponse>;
  /** `mailSendCancel` while the send is scheduled. */
  cancelEmail(applicationId: string): Promise<void>;
  /** `mailSendNow`: ends the undo window early. */
  sendEmailNow(applicationId: string): Promise<void>;
  /** `cvTailor`: proposed edits to one revision for one job (nothing is stored). */
  tailorCv(request: CvTailorRequest): Promise<CvTailorResponse>;
  /** `coverLetterDraft`: a letter drafted from the CV revision and the job (nothing is stored). */
  draftCoverLetter(request: CoverLetterDraftRequest): Promise<CoverLetterDraftResponse>;
  /** Creates (`existing` null) or replaces an answer of the library. */
  saveAnswer(input: AnswerInput, existing: Answer | null): PendingWrite<{ readonly answerId: string }>;
  deleteAnswer(answerId: string): PendingWrite;
  /** Undo of a delete: the answer comes back with its id. */
  restoreAnswer(answer: Answer): PendingWrite;
  /** New `position`s after a move within a kind. */
  reorderAnswers(positions: readonly { readonly answerId: string; readonly position: number }[]): PendingWrite;
}

export const JobsRepositoryContext = createContext<JobsRepository | null>(null);

/** The Jobs repository of the signed-in user (provided by the live routes and the design build). */
export function useJobsRepository(): JobsRepository {
  const repository = useContext(JobsRepositoryContext);
  if (!repository) throw new Error("useJobsRepository outside JobsRepositoryContext");
  return repository;
}
