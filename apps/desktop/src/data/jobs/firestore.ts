/**
 * The Jobs area on Firestore and Cloud Functions: one set of snapshot listeners per signed-in user
 * (`firestoreJobsSource`: jobs, matches, saved searches, mail accounts, cover letters, rendered
 * files, the answers library, and the shared `jobSources` health), and the repository that commits
 * `writes.ts` plans through the tracker's writer and calls the Jobs, import, mail and Apply AI
 * callables.
 */
import { firestorePaths, storagePaths } from "@bfhr/api";
import {
  type Answer,
  CoverLetterDraftResponseSchema,
  CvTailorResponseSchema,
  type JobImportUrlResponse,
  JobMatchesRefreshResponseSchema,
  JobImportUrlResponseSchema,
  type JobsSearchResponse,
  JobsSearchResponseSchema,
  type MailSendRequest,
  MailSendResponseSchema,
  type RenderedFile,
} from "@bfhr/core";
import {
  collection,
  deleteDoc,
  type DocumentSnapshot,
  doc,
  type FirestoreError,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { firestore, functions, storage } from "../../lib/firebaseServices";
import { converters } from "../converters";
import { createFirestoreWriter } from "../tracker/firestore";
import type { JobsData, JobsRepository, JobsSource, LiveJobsState } from "./repository";
import {
  planDismiss,
  planHideCompany,
  planProfileSkill,
  planRecordApplied,
  planRestore,
  planSave,
  planSaveImportedJob,
  planSaveTailoredRevision,
  planCreateSavedSearch,
  planUnsave,
  planUpdateSavedSearch,
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

/** Keeps listeners for this long after the last screen unsubscribed, so switching screens doesn't reload. */
const LINGER_MS = 30_000;

type ListKey = Exclude<keyof JobsData, "pendingWrites" | "fromCache">;

interface ListSnapshot {
  readonly value: readonly unknown[];
  readonly pending: ReadonlySet<string>;
  readonly cache: boolean;
}

class FirestoreJobsSource implements JobsSource {
  private state: LiveJobsState = { status: "loading" };
  private readonly listeners = new Set<() => void>();
  private stops: (() => void)[] = [];
  private lingerTimer: number | null = null;

  constructor(private readonly uid: string) {}

  getState = (): LiveJobsState => this.state;

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

  private emit(state: LiveJobsState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private stop(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }

  private start(): void {
    const db = firestore();
    const { uid } = this;
    const snapshots: Partial<Record<ListKey, ListSnapshot>> = {};
    const keys: readonly ListKey[] = [
      "jobs",
      "jobMatches",
      "savedSearches",
      "mailAccounts",
      "coverLetters",
      "renderedFiles",
      "answers",
      "jobSources",
    ];
    let failed = false;

    const fail = (error: FirestoreError) => {
      console.error("Jobs data listener failed", error);
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
      if (failed || keys.some((key) => snapshots[key] === undefined)) return;
      const pending = new Set<string>();
      let fromCache = false;
      const lists = {} as Record<ListKey, readonly unknown[]>;
      for (const key of keys) {
        const list = snapshots[key] as ListSnapshot;
        for (const id of list.pending) pending.add(id);
        // Source health is shared, cached reads of it don't make the user's data stale.
        if (key !== "jobSources") fromCache ||= list.cache;
        lists[key] = list.value;
      }
      this.emit({
        status: "ready",
        data: {
          ...(lists as Omit<JobsData, "pendingWrites" | "fromCache">),
          pendingWrites: pending,
          fromCache,
        },
      });
    };

    const listen = (
      key: ListKey,
      path: string,
      converter: { fromSnapshot(snapshot: DocumentSnapshot): unknown },
    ) =>
      onSnapshot(
        collection(db, path),
        { includeMetadataChanges: true },
        (snapshot) => {
          const value: unknown[] = [];
          const pending = new Set<string>();
          for (const document of snapshot.docs) {
            const entity = decoded(document, (d) => converter.fromSnapshot(d));
            if (entity === null) continue;
            value.push(entity);
            if (document.metadata.hasPendingWrites) pending.add(document.id);
          }
          snapshots[key] = { value, pending, cache: snapshot.metadata.fromCache };
          publish();
        },
        key === "jobSources" || key === "answers"
          ? (error) => {
              // Source health and the answers library are extras: without them the feed, apply
              // and the kit still work (the kit then offers to add answers in Settings).
              console.error(`${key} listener failed`, error);
              snapshots[key] = { value: [], pending: new Set(), cache: false };
              publish();
            }
          : fail,
      );

    this.stops = [
      listen("jobs", firestorePaths.jobs(uid), converters.job),
      listen("jobMatches", firestorePaths.jobMatches(uid), converters.jobMatch),
      listen("savedSearches", firestorePaths.savedSearches(uid), converters.savedSearch),
      listen("mailAccounts", firestorePaths.mailAccounts(uid), converters.mailAccount),
      listen("coverLetters", firestorePaths.coverLetters(uid), converters.coverLetter),
      listen("renderedFiles", firestorePaths.renderedFiles(uid), converters.renderedFile),
      listen("answers", firestorePaths.answers(uid), converters.answer),
      listen("jobSources", firestorePaths.jobSources(), converters.jobSource),
    ];
  }
}

const sources = new Map<string, FirestoreJobsSource>();

/** The shared live Jobs data of `uid` (listeners start with the first subscriber). */
export function firestoreJobsSource(uid: string): JobsSource {
  let source = sources.get(uid);
  if (!source) {
    source = new FirestoreJobsSource(uid);
    sources.set(uid, source);
  }
  return source;
}

declare global {
  interface Window {
    /**
     * E2E builds only: recorded callable answers by name, installed by the specs
     * (e2e/support/recorded.ts), so the Apply AI callables run without a model.
     */
    __BFHR_E2E_CALLABLES__?: Readonly<Record<string, unknown>>;
  }
}

/** Calls a callable and validates its answer (a `ZodError` means the server broke the contract). */
async function call<Request, Response>(
  name: string,
  request: Request,
  schema: { parse(value: unknown): Response },
  timeout?: number,
): Promise<Response> {
  if (__BFHR_E2E__) {
    const recorded = window.__BFHR_E2E_CALLABLES__?.[name];
    if (recorded !== undefined) return schema.parse(recorded);
  }
  const callable = httpsCallable<Request, unknown>(
    functions(),
    name,
    timeout === undefined ? {} : { timeout },
  );
  return schema.parse((await callable(request)).data);
}

/** Searches query every source; the slowest keyless ones answer in about 20 s. */
const SEARCH_TIMEOUT_MS = 120_000;
/** Tailoring and letter drafts: one model call plus a retry when grounding drops most of it. */
const AI_TIMEOUT_MS = 120_000;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // A copy backed by a plain ArrayBuffer (WebCrypto doesn't take SharedArrayBuffer views).
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createFirestoreJobsRepository(uid: string): JobsRepository {
  const { db, newId, pending } = createFirestoreWriter(uid);
  const ignoreState = { parse: () => undefined };

  return {
    uid,
    save(job, match) {
      const plan = planSave(job, match, new Date(), newId);
      return pending({ applicationId: plan.applicationId }, [plan.writes]);
    },
    unsave(match, application) {
      return pending({}, [planUnsave(match, application, new Date())]);
    },
    dismiss(jobId, reasons) {
      return pending({}, [planDismiss(jobId, reasons, new Date())]);
    },
    restore(jobId) {
      return pending({}, [planRestore(jobId, new Date())]);
    },
    hideCompany(company, hidden, current) {
      return pending({}, [planHideCompany(company, hidden, current, new Date())]);
    },
    setProfileSkill(skill, added, current) {
      return pending({}, [planProfileSkill(skill, added, current, new Date())]);
    },
    setMatchingCv(cvId) {
      return pending({}, [[{ op: "updateProfile", patch: { defaultCvId: cvId, updatedAt: new Date() } }]]);
    },
    async refreshMatches(jobIds) {
      await call(
        "jobMatchesRefresh",
        jobIds === undefined ? {} : { jobIds: [...jobIds] },
        JobMatchesRefreshResponseSchema,
        SEARCH_TIMEOUT_MS,
      );
    },
    createSavedSearch(input) {
      const plan = planCreateSavedSearch(input, new Date(), newId);
      return pending({ savedSearchId: plan.savedSearchId }, [plan.writes]);
    },
    updateSavedSearch(savedSearch, patch) {
      return pending({}, [planUpdateSavedSearch(savedSearch, patch, new Date())]);
    },
    deleteSavedSearch(savedSearchId) {
      return pending({}, [[{ op: "delete", collection: "savedSearches", id: savedSearchId }]]);
    },
    restoreSavedSearch(savedSearch) {
      return pending({}, [[{ op: "create", collection: "savedSearches", entity: savedSearch }]]);
    },
    search(request) {
      return call<typeof request, JobsSearchResponse>(
        "jobsSearch",
        request,
        JobsSearchResponseSchema,
        SEARCH_TIMEOUT_MS,
      );
    },
    runSavedSearch(savedSearchId) {
      return call("savedSearchRunNow", { savedSearchId }, JobsSearchResponseSchema, SEARCH_TIMEOUT_MS);
    },
    importUrl(url) {
      return call<{ url: string }, JobImportUrlResponse>(
        "jobImportUrl",
        { url },
        JobImportUrlResponseSchema,
        SEARCH_TIMEOUT_MS,
      );
    },
    saveImportedJob(job, existingJobId) {
      const plan = planSaveImportedJob(job, existingJobId, new Date(), newId);
      return pending({ jobId: plan.jobId }, [plan.writes]);
    },
    recordApplied(record) {
      const { writes, ...ids } = planRecordApplied(record, new Date(), newId);
      return pending(ids, [writes]);
    },
    saveCoverLetter(input, existing) {
      const at = new Date();
      const coverLetterId = existing?.id ?? doc(collection(db, firestorePaths.coverLetters(uid))).id;
      const { author, ...fields } = input;
      const entity = {
        id: coverLetterId,
        ...fields,
        author: author ?? existing?.author ?? ("user" as const),
        isTemplate: false,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      const done = setDoc(
        doc(db, firestorePaths.coverLetter(uid, coverLetterId)),
        converters.coverLetter.toFirestore(entity),
      );
      return { ids: { coverLetterId }, done };
    },
    saveCoverLetterTemplate(input) {
      const at = new Date();
      const coverLetterId = doc(collection(db, firestorePaths.coverLetters(uid))).id;
      const done = setDoc(
        doc(db, firestorePaths.coverLetter(uid, coverLetterId)),
        converters.coverLetter.toFirestore({
          id: coverLetterId,
          ...input,
          jobId: null,
          applicationId: null,
          author: "user",
          isTemplate: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
      return { ids: { coverLetterId }, done };
    },
    saveTailoredRevision(input) {
      const at = new Date();
      const revisionId = doc(collection(db, firestorePaths.cvRevisions(uid, input.revision.cvId))).id;
      const plan = planSaveTailoredRevision(
        { ...input, revision: { ...input.revision, id: revisionId, createdAt: at } },
        at,
        newId,
      );
      return pending({ revisionId, applicationId: plan.applicationId }, [plan.writes]);
    },
    async createRenderedFile(input) {
      const id = doc(collection(db, firestorePaths.renderedFiles(uid))).id;
      const storagePath = storagePaths.renderedFile(uid, id);
      await uploadBytes(ref(storage(), storagePath), input.bytes, { contentType: "application/pdf" });
      const file: RenderedFile = {
        id,
        kind: input.kind,
        cvId: input.cvId,
        cvRevisionId: input.cvRevisionId,
        coverLetterId: input.coverLetterId,
        storagePath,
        fileName: input.fileName,
        sizeBytes: input.bytes.byteLength,
        sha256: await sha256Hex(input.bytes),
        createdAt: new Date(),
      };
      await setDoc(doc(db, firestorePaths.renderedFile(uid, id)), converters.renderedFile.toFirestore(file));
      return file;
    },
    async uploadMailAttachment(input) {
      // Any unique id: the Storage path names the object, nothing in Firestore points at it.
      const storagePath = storagePaths.mailAttachment(uid, doc(collection(db, firestorePaths.renderedFiles(uid))).id);
      await uploadBytes(ref(storage(), storagePath), input.bytes, { contentType: input.contentType });
      return { storagePath };
    },
    sendEmail(request: MailSendRequest) {
      return call("mailSend", request, MailSendResponseSchema);
    },
    async cancelEmail(applicationId) {
      await call("mailSendCancel", { applicationId }, ignoreState);
    },
    async sendEmailNow(applicationId) {
      await call("mailSendNow", { applicationId }, ignoreState);
    },
    tailorCv(request) {
      return call("cvTailor", request, CvTailorResponseSchema, AI_TIMEOUT_MS);
    },
    draftCoverLetter(request) {
      return call("coverLetterDraft", request, CoverLetterDraftResponseSchema, AI_TIMEOUT_MS);
    },
    saveAnswer(input, existing) {
      const at = new Date();
      const answerId = existing?.id ?? doc(collection(db, firestorePaths.answers(uid))).id;
      const answer: Answer = { id: answerId, ...input, createdAt: existing?.createdAt ?? at, updatedAt: at };
      const done = setDoc(doc(db, firestorePaths.answer(uid, answerId)), converters.answer.toFirestore(answer));
      return { ids: { answerId }, done };
    },
    deleteAnswer(answerId) {
      return { ids: {}, done: deleteDoc(doc(db, firestorePaths.answer(uid, answerId))) };
    },
    restoreAnswer(answer) {
      return {
        ids: {},
        done: setDoc(doc(db, firestorePaths.answer(uid, answer.id)), converters.answer.toFirestore(answer)),
      };
    },
    reorderAnswers(positions) {
      const at = new Date();
      const batch = writeBatch(db);
      for (const { answerId, position } of positions)
        batch.update(
          doc(db, firestorePaths.answer(uid, answerId)),
          converters.answer.toFirestoreUpdate({ position, updatedAt: at }),
        );
      return { ids: {}, done: batch.commit() };
    },
  };
}
