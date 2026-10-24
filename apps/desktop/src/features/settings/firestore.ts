/**
 * The Settings store on Firestore: profile fields as dotted-path updates of `users/{uid}`, the
 * watchlist (create pending, update only WATCHLIST_CLIENT_FIELDS, delete) and the global
 * `jobSources` health, each listened to while a pane subscribes (with metadata changes, so local
 * writes show as pending at once).
 */
import { type EntityConverter, firestorePaths } from "@bfhr/api";
import {
  type JobSourceStatus,
  ProfileSettingsSchema,
  WATCHLIST_PENDING_FIELDS,
  type WatchedCompany,
} from "@bfhr/core";
import {
  collection,
  deleteDoc,
  doc,
  type FirestoreError,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { converters } from "../../data/converters";
import { setUpdateChannel } from "../../lib/desktop";
import { firestore } from "../../lib/firebaseServices";
import type { ListSource, ListState, ProfilePatch, SettingsStore } from "./store";

/** Keeps a listener this long after the last pane unsubscribed, so switching panes doesn't reload. */
const LINGER_MS = 30_000;

function collectionSource<T extends { readonly id: string }>(
  path: string,
  converter: EntityConverter<T, "id">,
): ListSource<T> {
  let state: ListState<T> = { status: "loading" };
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  let linger: number | null = null;
  const emit = (next: ListState<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const start = () => {
    stop = onSnapshot(
      collection(firestore(), path),
      { includeMetadataChanges: true },
      (snapshot) => {
        const items: T[] = [];
        const pending = new Set<string>();
        for (const document of snapshot.docs) {
          try {
            items.push(converter.fromSnapshot(document));
          } catch (error) {
            console.error(`Skipping ${document.ref.path}`, error);
            continue;
          }
          if (document.metadata.hasPendingWrites) pending.add(document.id);
        }
        emit({ status: "ready", items, pending, fromCache: snapshot.metadata.fromCache });
      },
      (error: FirestoreError) => {
        console.error(`Listener on ${path} failed`, error);
        stop?.();
        stop = null;
        emit({
          status: "error",
          retry: () => {
            emit({ status: "loading" });
            start();
          },
        });
      },
    );
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (linger !== null) {
        clearTimeout(linger);
        linger = null;
      }
      if (stop === null && state.status !== "error") start();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        linger = window.setTimeout(() => {
          linger = null;
          if (listeners.size > 0) return;
          stop?.();
          stop = null;
          state = { status: "loading" };
        }, LINGER_MS);
      };
    },
  };
}

/** The update data of a profile patch: top-level fields through the converter, `settings.*` dotted. */
export function profileUpdate(patch: ProfilePatch, now: Date): Record<string, unknown> {
  const data: Record<string, unknown> = converters.profile.toFirestoreUpdate({
    ...(patch.aiEnabled !== undefined && { aiEnabled: patch.aiEnabled }),
    ...(patch.uiLanguage !== undefined && { uiLanguage: patch.uiLanguage }),
    ...(patch.fullName !== undefined && { fullName: patch.fullName }),
    ...patch.preferences,
    updatedAt: now,
  });
  for (const [key, value] of Object.entries(patch.settings ?? {})) {
    const field = ProfileSettingsSchema.shape[key as keyof typeof ProfileSettingsSchema.shape];
    data[`settings.${key}`] = field.parse(value);
  }
  return data;
}

/** Shared by every signed-in user of this install (the collection is project-wide). */
let jobSources: ListSource<JobSourceStatus> | null = null;
const stores = new Map<string, SettingsStore>();

/** The Settings store of `uid` (one per user, so listeners outlive a pane switch). */
export function firestoreSettingsStore(uid: string): SettingsStore {
  const existing = stores.get(uid);
  if (existing) return existing;
  const db = firestore();
  const companyRef = (id: string) => doc(db, firestorePaths.watchedCompany(uid, id));
  jobSources ??= collectionSource<JobSourceStatus>(firestorePaths.jobSources(), converters.jobSource);
  const store: SettingsStore = {
    uid,
    updateProfile: (patch) => updateDoc(doc(db, firestorePaths.user(uid)), profileUpdate(patch, new Date())),
    watchlist: collectionSource<WatchedCompany>(firestorePaths.watchlist(uid), converters.watchedCompany),
    jobSources,
    addCompany({ name, careersUrl }) {
      const now = new Date();
      const id = doc(collection(db, firestorePaths.watchlist(uid))).id;
      const company: WatchedCompany = {
        id,
        name,
        careersUrl,
        enabled: true,
        ...WATCHLIST_PENDING_FIELDS,
        createdAt: now,
        updatedAt: now,
      };
      return setDoc(companyRef(id), converters.watchedCompany.toFirestore(company));
    },
    updateCompany: (companyId, patch) =>
      updateDoc(
        companyRef(companyId),
        converters.watchedCompany.toFirestoreUpdate({ ...patch, updatedAt: new Date() }),
      ),
    removeCompany: (companyId) => deleteDoc(companyRef(companyId)),
    restoreCompany(company) {
      const restored: WatchedCompany = {
        ...company,
        ...WATCHLIST_PENDING_FIELDS,
        updatedAt: new Date(),
      };
      return setDoc(companyRef(company.id), converters.watchedCompany.toFirestore(restored));
    },
    setUpdateChannel,
    profileOverlay: { subscribe: () => () => undefined, getState: () => null },
  };
  stores.set(uid, store);
  return store;
}
