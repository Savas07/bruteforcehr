/**
 * The Jobs area in memory: the design build's data (fixtures) and the tests' backend. Writes go
 * through the memory tracker store (`../tracker/memory.ts`), so a save shows up on the Tracker and
 * Undo behaves as in the app; the callables are the caller's `MemoryJobsCallables` (the design
 * build answers from the fixtures, tests with spies).
 */
import type { Answer, CoverLetter, JobSourceStatus, MailAccount, RenderedFile } from "@bfhr/core";
import type { MemoryTrackerStore } from "../tracker/memory";
import type { JobsData, JobsRepository, JobsSource, LiveJobsState } from "./repository";
import {
  planCreateSavedSearch,
  planDismiss,
  planHideCompany,
  planProfileSkill,
  planRecordApplied,
  planRestore,
  planSave,
  planSaveImportedJob,
  planSaveTailoredRevision,
  planUnsave,
  planUpdateSavedSearch,
} from "./writes";

/** What the memory store starts from besides the tracker store's tables. */
export interface MemoryJobsSeed {
  readonly mailAccounts: readonly MailAccount[];
  readonly coverLetters: readonly CoverLetter[];
  readonly renderedFiles: readonly RenderedFile[];
  readonly jobSources: readonly JobSourceStatus[];
  /** The answers library; none when absent. */
  readonly answers?: readonly Answer[];
}

export type MemoryJobsCallables = Pick<
  JobsRepository,
  | "search"
  | "runSavedSearch"
  | "importUrl"
  | "refreshMatches"
  | "sendEmail"
  | "cancelEmail"
  | "sendEmailNow"
  | "tailorCv"
  | "draftCoverLetter"
>;

export interface MemoryJobsStore {
  readonly source: JobsSource;
  readonly repository: JobsRepository;
}

export function createMemoryJobsStore(
  tracker: MemoryTrackerStore,
  seed: MemoryJobsSeed,
  callables: MemoryJobsCallables,
): MemoryJobsStore {
  const coverLetters = [...seed.coverLetters];
  const renderedFiles = [...seed.renderedFiles];
  let answers: readonly Answer[] = [...(seed.answers ?? [])];
  const listeners = new Set<() => void>();
  const snapshot = (): LiveJobsState => {
    const data: JobsData = {
      jobs: [...tracker.jobs()],
      jobMatches: [...tracker.jobMatches()],
      savedSearches: [...tracker.savedSearches()],
      mailAccounts: seed.mailAccounts,
      coverLetters: [...coverLetters],
      renderedFiles: [...renderedFiles],
      answers,
      jobSources: seed.jobSources,
      pendingWrites: new Set(),
      fromCache: false,
    };
    return { status: "ready", data };
  };
  let state = snapshot();
  const changed = () => {
    state = snapshot();
    for (const listener of listeners) listener();
  };
  tracker.subscribe(changed);
  const { clock, newId } = tracker;
  /** Ids for the collections outside the tracker tables. */
  let localIds = 0;
  const pending = <Ids extends object>(ids: Ids, writes: Parameters<MemoryTrackerStore["apply"]>[0]) => ({
    ids,
    done: tracker.apply(writes),
  });

  const repository: JobsRepository = {
    uid: tracker.repository.uid,
    ...callables,
    save(job, match) {
      const plan = planSave(job, match, clock(), newId);
      return pending({ applicationId: plan.applicationId }, plan.writes);
    },
    unsave(match, application) {
      return pending({}, planUnsave(match, application, clock()));
    },
    dismiss(jobId, reasons) {
      return pending({}, planDismiss(jobId, reasons, clock()));
    },
    restore(jobId) {
      return pending({}, planRestore(jobId, clock()));
    },
    hideCompany(company, hidden, current) {
      return pending({}, planHideCompany(company, hidden, current, clock()));
    },
    setProfileSkill(skill, added, current) {
      return pending({}, planProfileSkill(skill, added, current, clock()));
    },
    setMatchingCv(cvId) {
      return pending({}, [{ op: "updateProfile", patch: { defaultCvId: cvId, updatedAt: clock() } }]);
    },
    createSavedSearch(input) {
      const plan = planCreateSavedSearch(input, clock(), newId);
      return pending({ savedSearchId: plan.savedSearchId }, plan.writes);
    },
    updateSavedSearch(savedSearch, patch) {
      return pending({}, planUpdateSavedSearch(savedSearch, patch, clock()));
    },
    deleteSavedSearch(savedSearchId) {
      return pending({}, [{ op: "delete", collection: "savedSearches", id: savedSearchId }]);
    },
    restoreSavedSearch(savedSearch) {
      return pending({}, [{ op: "create", collection: "savedSearches", entity: savedSearch }]);
    },
    saveImportedJob(job, existingJobId) {
      const plan = planSaveImportedJob(job, existingJobId, clock(), newId);
      return pending({ jobId: plan.jobId }, plan.writes);
    },
    recordApplied(record) {
      const { writes, ...ids } = planRecordApplied(record, clock(), newId);
      return pending(ids, writes);
    },
    saveCoverLetter(input, existing) {
      const at = clock();
      const coverLetterId = existing?.id ?? `mem-coverLetters-${(localIds += 1)}`;
      const { author, ...fields } = input;
      const letter: CoverLetter = {
        id: coverLetterId,
        ...fields,
        author: author ?? existing?.author ?? "user",
        isTemplate: false,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      const index = coverLetters.findIndex((candidate) => candidate.id === coverLetterId);
      if (index === -1) coverLetters.push(letter);
      else coverLetters[index] = letter;
      changed();
      return { ids: { coverLetterId }, done: Promise.resolve() };
    },
    saveCoverLetterTemplate(input) {
      const at = clock();
      const coverLetterId = `mem-coverLetters-${(localIds += 1)}`;
      coverLetters.push({
        id: coverLetterId,
        ...input,
        jobId: null,
        applicationId: null,
        author: "user",
        isTemplate: true,
        createdAt: at,
        updatedAt: at,
      });
      changed();
      return { ids: { coverLetterId }, done: Promise.resolve() };
    },
    saveTailoredRevision(input) {
      const revisionId = `mem-cvRevisions-${(localIds += 1)}`;
      const plan = planSaveTailoredRevision(
        { ...input, revision: { ...input.revision, id: revisionId, createdAt: clock() } },
        clock(),
        newId,
      );
      return pending({ revisionId, applicationId: plan.applicationId }, plan.writes);
    },
    createRenderedFile(input) {
      const file: RenderedFile = {
        id: `mem-renderedFiles-${(localIds += 1)}`,
        kind: input.kind,
        cvId: input.cvId,
        cvRevisionId: input.cvRevisionId,
        coverLetterId: input.coverLetterId,
        storagePath: `memory/${input.fileName}`,
        fileName: input.fileName,
        sizeBytes: Math.max(1, input.bytes.byteLength),
        sha256: "0".repeat(64),
        createdAt: clock(),
      };
      renderedFiles.push(file);
      changed();
      return Promise.resolve(file);
    },
    uploadMailAttachment() {
      return Promise.resolve({
        storagePath: `users/${tracker.repository.uid}/mail-attachments/mem-upload-${(localIds += 1)}`,
      });
    },
    saveAnswer(input, existing) {
      const at = clock();
      const answerId = existing?.id ?? `mem-answers-${(localIds += 1)}`;
      const answer: Answer = { id: answerId, ...input, createdAt: existing?.createdAt ?? at, updatedAt: at };
      answers = existing
        ? answers.map((candidate) => (candidate.id === answerId ? answer : candidate))
        : [...answers, answer];
      changed();
      return { ids: { answerId }, done: Promise.resolve() };
    },
    deleteAnswer(answerId) {
      answers = answers.filter((candidate) => candidate.id !== answerId);
      changed();
      return { ids: {}, done: Promise.resolve() };
    },
    restoreAnswer(answer) {
      answers = [...answers.filter((candidate) => candidate.id !== answer.id), answer];
      changed();
      return { ids: {}, done: Promise.resolve() };
    },
    reorderAnswers(positions) {
      const at = clock();
      const next = new Map(positions.map((entry) => [entry.answerId, entry.position]));
      answers = answers.map((answer) => {
        const position = next.get(answer.id);
        return position === undefined ? answer : { ...answer, position, updatedAt: at };
      });
      changed();
      return { ids: {}, done: Promise.resolve() };
    },
  };

  return {
    source: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => state,
    },
    repository,
  };
}
