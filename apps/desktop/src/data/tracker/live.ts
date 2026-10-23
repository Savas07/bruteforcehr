/**
 * Live tracker data for screens: `useTrackerData()` reads the `TrackerSource` in context (the
 * design build's memory store), else the signed-in user's shared Firestore listeners. The live
 * routes wrap their screens in `LiveTrackerProvider`, which also provides the repository.
 */
import { DEFAULT_PROFILE_SETTINGS, type Profile } from "@bfhr/core";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { currentUid } from "../../features/auth/firebaseAuth";
import type { ProfileView } from "../../shared/model/types";
import { createFirestoreTrackerRepository, firestoreTrackerSource } from "./firestore";
import { type LiveTrackerState, type TrackerSource, TrackerRepositoryContext } from "./repository";

export const TrackerSourceContext = createContext<TrackerSource | null>(null);

const signedOut: LiveTrackerState = { status: "loading" };
const idleSource: TrackerSource = { subscribe: () => () => undefined, getState: () => signedOut };

/** The tracker data of the signed-in user (or of the design build's store). */
export function useTrackerData(): LiveTrackerState {
  const provided = useContext(TrackerSourceContext);
  const uid = provided ? null : currentUid();
  const source = provided ?? (uid === null ? idleSource : firestoreTrackerSource(uid));
  return useSyncExternalStore(source.subscribe, source.getState);
}

/**
 * Provides the signed-in user's Firestore repository (and listeners) to a live route. Renders
 * nothing while signed out (routes sit behind `AuthGate`, so that is only a moment at sign-out).
 */
export function LiveTrackerProvider({ children }: { readonly children: ReactNode }) {
  const uid = currentUid();
  const repository = useMemo(() => (uid === null ? null : createFirestoreTrackerRepository(uid)), [uid]);
  if (repository === null || uid === null) return null;
  return createElement(
    TrackerRepositoryContext.Provider,
    { value: repository },
    createElement(TrackerSourceContext.Provider, { value: firestoreTrackerSource(uid) }, children),
  );
}

/** What view-models read from the profile, with the default settings until it exists. */
export function profileView(profile: Profile | null): ProfileView {
  return {
    settings: profile?.settings ?? DEFAULT_PROFILE_SETTINGS,
    hiddenCompanies: profile?.hiddenCompanies ?? [],
  };
}

/** The zone wall-clock times are shown in: the profile's, else the system's. */
export function displayTimeZone(profile: Profile | null): string {
  return profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
