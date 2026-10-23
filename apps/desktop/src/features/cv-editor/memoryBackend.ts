/**
 * The CV backend in memory, with the Firestore rules' behaviour (create-only revisions, `version + 1`
 * updates or a rejection). Feeds the design build (fixtures become editable) and unit tests.
 * `simulateRemoteEdit` plays "another device saved" for the conflict UI.
 */
import { CV_INITIAL_VERSION, CV_VERSION_INCREMENT, type Cv, type CvContent, type CvRevision } from "@bfhr/core";
import { CvConflictError, mirroredDesign, type CvStudioBackend } from "./backend";
import type { CvEditorData } from "./model";

export interface MemoryCvStore {
  readonly backend: CvStudioBackend;
  data(): CvEditorData;
  subscribe(listener: () => void): () => void;
  /** Another device saves `content` as a new revision of `cvId`. */
  simulateRemoteEdit(cvId: string, content: CvContent): void;
}

export function createMemoryCvStore(uid: string, initial: CvEditorData, now: () => Date = () => new Date()): MemoryCvStore {
  let data = initial;
  let sequence = 0;
  const listeners = new Set<() => void>();
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const replaceCv = (cv: Cv) => {
    data = { ...data, cvs: data.cvs.map((candidate) => (candidate.id === cv.id ? cv : candidate)) };
  };
  const addRevision = (revision: CvRevision) => {
    data = { ...data, cvRevisions: [...data.cvRevisions, revision] };
  };
  const stored = (cvId: string) => {
    const cv = data.cvs.find((candidate) => candidate.id === cvId);
    if (!cv) throw new Error(`No CV ${cvId}`);
    return cv;
  };
  /** The rules: an update must carry exactly the stored version + 1. */
  const update = (cvId: string, fromVersion: number, patch: Partial<Cv>): boolean => {
    const cv = stored(cvId);
    if (cv.version !== fromVersion) return false;
    replaceCv({ ...cv, ...patch, version: fromVersion + CV_VERSION_INCREMENT, updatedAt: now() });
    return true;
  };
  const revision = (cvId: string, content: CvContent, fields: Pick<CvRevision, "source" | "basedOnRevisionId" | "diffSummary">): CvRevision => ({
    id: nextId("rev"),
    cvId,
    content,
    jobId: null,
    createdAt: now(),
    ...fields,
  });

  const backend: CvStudioBackend = {
    uid,
    createCv(input) {
      const cvId = nextId("cv");
      const first = revision(cvId, input.content, input);
      const time = now();
      data = {
        ...data,
        cvs: [
          ...data.cvs,
          {
            id: cvId,
            title: input.title,
            language: input.language,
            parentCvId: input.parentCvId,
            currentRevisionId: first.id,
            ...mirroredDesign(input.content),
            isDefault: false,
            archivedAt: null,
            version: CV_INITIAL_VERSION,
            importedFrom: input.importedFrom,
            createdAt: time,
            updatedAt: time,
          },
        ],
      };
      addRevision(first);
      emit();
      return { ids: { cvId, revisionId: first.id }, done: Promise.resolve() };
    },
    commitRevision(input) {
      const next = revision(input.cv.id, input.content, input);
      addRevision(next);
      const accepted = update(input.cv.id, input.cv.version, { currentRevisionId: next.id, ...mirroredDesign(input.content) });
      emit();
      return {
        ids: { revisionId: next.id },
        done: accepted ? Promise.resolve() : Promise.reject(new CvConflictError(next.id)),
      };
    },
    adoptRevision(cv, revisionId, content) {
      const accepted = update(cv.id, cv.version, { currentRevisionId: revisionId, ...mirroredDesign(content) });
      emit();
      return { ids: {}, done: accepted ? Promise.resolve() : Promise.reject(new CvConflictError(revisionId)) };
    },
    updateCv(cv, patch) {
      const accepted = update(cv.id, cv.version, patch);
      emit();
      return { ids: {}, done: accepted ? Promise.resolve() : Promise.reject(new Error("Version mismatch")) };
    },
  };

  return {
    backend,
    data: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    simulateRemoteEdit(cvId, content) {
      const cv = stored(cvId);
      const next = revision(cvId, content, { source: "manual", basedOnRevisionId: cv.currentRevisionId, diffSummary: null });
      addRevision(next);
      update(cvId, cv.version, { currentRevisionId: next.id, ...mirroredDesign(content) });
      emit();
    },
  };
}
