/**
 * The onboarding store on Firestore: the profile is created in a transaction (so an existing
 * document is never replaced), profile fields go through the Settings store's update, and the
 * saved search and match refresh through the Jobs repository (planCreateSavedSearch,
 * `jobMatchesRefresh`). firestore.rules let the owner create and update `users/{uid}` and manage
 * `savedSearches`.
 */
import { firestorePaths } from "@bfhr/api";
import { collection, doc, getDocs, limit, query, runTransaction, updateDoc } from "firebase/firestore";
import { converters } from "../../data/converters";
import { createFirestoreJobsRepository } from "../../data/jobs/firestore";
import { firestore } from "../../lib/firebaseServices";
import { firestoreSettingsStore } from "../settings/firestore";
import { newProfile } from "./model";
import type { OnboardingStore } from "./store";

const stores = new Map<string, OnboardingStore>();

export function firestoreOnboardingStore(uid: string): OnboardingStore {
  const existing = stores.get(uid);
  if (existing) return existing;
  const db = firestore();
  const profileRef = doc(db, firestorePaths.user(uid));
  const settings = firestoreSettingsStore(uid);
  const jobs = createFirestoreJobsRepository(uid);
  const store: OnboardingStore = {
    uid,
    ensureProfile: (seed) =>
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(profileRef);
        const full = converters.profile.toFirestore(newProfile(uid, seed, new Date()));
        if (!snapshot.exists()) {
          transaction.set(profileRef, full);
          return;
        }
        // A partial document (written by a script or an older client): add what it lacks.
        const current = snapshot.data();
        const missing = Object.fromEntries(Object.entries(full).filter(([key]) => !(key in current)));
        if (Object.keys(missing).length > 0) transaction.set(profileRef, missing, { merge: true });
      }),
    updateProfile: (patch) => settings.updateProfile(patch),
    setMatchingCv: (cvId) =>
      updateDoc(
        profileRef,
        converters.profile.toFirestoreUpdate({ defaultCvId: cvId, updatedAt: new Date() }),
      ),
    async createFirstSearches(inputs) {
      const existingSearches = await getDocs(
        query(collection(db, firestorePaths.savedSearches(uid)), limit(1)),
      );
      if (!existingSearches.empty) return false;
      for (const input of inputs) {
        jobs.createSavedSearch(input).done.catch((error: unknown) => {
          console.error("Couldn't create a first saved search", error);
        });
      }
      return true;
    },
    refreshMatches: () => jobs.refreshMatches(),
    complete: () => {
      const now = new Date();
      return updateDoc(
        profileRef,
        converters.profile.toFirestoreUpdate({ onboardingCompletedAt: now, updatedAt: now }),
      );
    },
  };
  stores.set(uid, store);
  return store;
}
