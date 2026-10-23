/**
 * The CV editor on Firestore: live data (`useLiveCvData`) and writes (`createFirestoreCvBackend`),
 * through the shared @bfhr/api converters. Writes are batches applied to the local cache at once
 * (snapshot listeners show them immediately, `hasPendingWrites` marks them) and queued while
 * offline; see backend.ts for the concurrency rules.
 */
import { createConverters, firestorePaths } from "@bfhr/api";
import { CV_INITIAL_VERSION, type Cv, type CvRevision, type Profile } from "@bfhr/core";
import {
  collection,
  doc,
  FirestoreError,
  onSnapshot,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "../../lib/firebaseServices";
import {
  CvConflictError,
  mirroredDesign,
  type CommitInput,
  type CvStudioBackend,
  type NewCvInput,
  type PendingWrite,
} from "./backend";

export const converters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});

/** A rejected `version + 1` update: the rules answer `permission-denied`. */
function isVersionRejection(error: unknown): boolean {
  return error instanceof FirestoreError && error.code === "permission-denied";
}

export function createFirestoreCvBackend(uid: string): CvStudioBackend {
  const db = firestore();
  const cvRef = (cvId: string) => doc(db, firestorePaths.cv(uid, cvId));
  const newRevisionRef = (cvId: string) => doc(collection(db, firestorePaths.cvRevisions(uid, cvId)));
  const revisionData = (revision: CvRevision) => converters.cvRevision.toFirestore(revision);

  return {
    uid,

    createCv(input: NewCvInput) {
      const ref = doc(collection(db, firestorePaths.cvs(uid)));
      const revisionRef = newRevisionRef(ref.id);
      const now = new Date();
      const cv: Cv = {
        id: ref.id,
        title: input.title,
        language: input.language,
        parentCvId: input.parentCvId,
        currentRevisionId: revisionRef.id,
        ...mirroredDesign(input.content),
        isDefault: false,
        archivedAt: null,
        version: CV_INITIAL_VERSION,
        importedFrom: input.importedFrom,
        createdAt: now,
        updatedAt: now,
      };
      const batch = writeBatch(db);
      batch.set(ref, converters.cv.toFirestore(cv));
      batch.set(
        revisionRef,
        revisionData({
          id: revisionRef.id,
          cvId: ref.id,
          content: input.content,
          source: input.source,
          basedOnRevisionId: input.basedOnRevisionId,
          jobId: null,
          diffSummary: input.diffSummary,
          createdAt: now,
        }),
      );
      return { ids: { cvId: ref.id, revisionId: revisionRef.id }, done: batch.commit() };
    },

    commitRevision(input: CommitInput) {
      const revisionRef = newRevisionRef(input.cv.id);
      const now = new Date();
      const data = revisionData({
        id: revisionRef.id,
        cvId: input.cv.id,
        content: input.content,
        source: input.source,
        basedOnRevisionId: input.basedOnRevisionId,
        jobId: null,
        diffSummary: input.diffSummary,
        createdAt: now,
      });
      const batch = writeBatch(db);
      batch.set(revisionRef, data);
      batch.update(
        cvRef(input.cv.id),
        converters.cvUpdate(input.cv.version, {
          currentRevisionId: revisionRef.id,
          ...mirroredDesign(input.content),
          updatedAt: now,
        }),
      );
      const done = batch.commit().catch(async (error: unknown) => {
        if (!isVersionRejection(error)) throw error;
        // Keep our content as an orphan revision so "Keep this version" can adopt it.
        await setDoc(revisionRef, data);
        throw new CvConflictError(revisionRef.id);
      });
      return { ids: { revisionId: revisionRef.id }, done };
    },

    adoptRevision(cv, revisionId, content) {
      const done = updateDoc(
        cvRef(cv.id),
        converters.cvUpdate(cv.version, { currentRevisionId: revisionId, ...mirroredDesign(content), updatedAt: new Date() }),
      ).catch((error: unknown) => {
        throw isVersionRejection(error) ? new CvConflictError(revisionId) : error;
      });
      return { ids: {}, done };
    },

    updateCv(cv, patch): PendingWrite {
      const done = updateDoc(cvRef(cv.id), converters.cvUpdate(cv.version, { ...patch, updatedAt: new Date() }));
      return { ids: {}, done };
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Live data.
 * ---------------------------------------------------------------------------------------------- */

export interface LiveCvData {
  readonly profile: Profile | null;
  readonly cvs: readonly Cv[];
  readonly cvRevisions: readonly CvRevision[];
  /** Ids of documents with local writes the server hasn't confirmed. */
  readonly pendingWrites: ReadonlySet<string>;
  /** Some data came from the local cache only (offline, or before the first server answer). */
  readonly fromCache: boolean;
  /** When the server last confirmed this data (now while online). */
  readonly syncedAt: Date;
}

export type LiveCvState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly data: LiveCvData };

interface Snapshots {
  profile: { value: Profile | null; pending: boolean; cache: boolean } | null;
  cvs: { value: Cv[]; pending: Set<string>; cache: boolean } | null;
  revisions: Map<string, { value: CvRevision[]; pending: Set<string>; cache: boolean }>;
}

/**
 * Profile, CVs and every CV's revisions, kept live with snapshot listeners (metadata changes
 * included, for pending-write and cache state). Revisions are listened to per CV.
 */
export function useLiveCvData(uid: string): LiveCvState {
  const [state, setState] = useState<LiveCvState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const db = firestore();
    const snapshots: Snapshots = { profile: null, cvs: null, revisions: new Map() };
    const revisionListeners = new Map<string, () => void>();
    let syncedAt = new Date();
    let failed = false;

    const fail = (error: FirestoreError) => {
      console.error("CV data listener failed", error);
      failed = true;
      setState({ status: "error", retry: () => setAttempt((count) => count + 1) });
    };

    const publish = () => {
      if (failed || !snapshots.profile || !snapshots.cvs) return;
      const cvs = snapshots.cvs.value;
      if (cvs.some((cv) => !snapshots.revisions.has(cv.id))) return;
      const pending = new Set<string>(snapshots.cvs.pending);
      if (snapshots.profile.pending && snapshots.profile.value) pending.add(snapshots.profile.value.id);
      let fromCache = snapshots.profile.cache || snapshots.cvs.cache;
      const revisions: CvRevision[] = [];
      for (const cv of cvs) {
        const entry = snapshots.revisions.get(cv.id);
        if (!entry) continue;
        revisions.push(...entry.value);
        for (const id of entry.pending) pending.add(id);
        fromCache ||= entry.cache;
      }
      if (!fromCache) syncedAt = new Date();
      setState({
        status: "ready",
        data: { profile: snapshots.profile.value, cvs, cvRevisions: revisions, pendingWrites: pending, fromCache, syncedAt },
      });
    };

    const listenRevisions = (cvId: string) => {
      if (revisionListeners.has(cvId)) return;
      const stop = onSnapshot(
        collection(db, firestorePaths.cvRevisions(uid, cvId)),
        { includeMetadataChanges: true },
        (snapshot) => {
          const value: CvRevision[] = [];
          const pending = new Set<string>();
          for (const document of snapshot.docs) {
            value.push(converters.cvRevision.fromSnapshot(document));
            if (document.metadata.hasPendingWrites) pending.add(document.id);
          }
          snapshots.revisions.set(cvId, { value, pending, cache: snapshot.metadata.fromCache });
          publish();
        },
        fail,
      );
      revisionListeners.set(cvId, stop);
    };

    const stopProfile = onSnapshot(
      doc(db, firestorePaths.user(uid)),
      { includeMetadataChanges: true },
      (snapshot) => {
        snapshots.profile = {
          value: snapshot.exists() ? converters.profile.fromSnapshot(snapshot) : null,
          pending: snapshot.metadata.hasPendingWrites,
          cache: snapshot.metadata.fromCache,
        };
        publish();
      },
      fail,
    );
    const stopCvs = onSnapshot(
      collection(db, firestorePaths.cvs(uid)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const value: Cv[] = [];
        const pending = new Set<string>();
        for (const document of snapshot.docs) {
          value.push(converters.cv.fromSnapshot(document));
          if (document.metadata.hasPendingWrites) pending.add(document.id);
          listenRevisions(document.id);
        }
        snapshots.cvs = { value, pending, cache: snapshot.metadata.fromCache };
        publish();
      },
      fail,
    );

    return () => {
      stopProfile();
      stopCvs();
      for (const stop of revisionListeners.values()) stop();
    };
  }, [uid, attempt]);

  return state;
}
