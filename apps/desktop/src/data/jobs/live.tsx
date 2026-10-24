/**
 * Live Jobs data for screens. `JobsProviders` puts a `JobsSource` + `JobsRepository` in context and
 * feeds the source's collections to the tracker view-models (`ModelExtrasContext`, with their load
 * state and local writes in `ModelExtrasStatusContext`), so `useTrackerModel` builders see jobs,
 * matches, saved searches and mail accounts. `LiveJobsProvider` does that for the signed-in user
 * (inside `LiveTrackerProvider`); the design build passes its memory store.
 */
import { type ReactNode, createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { currentUid } from "../../features/auth/firebaseAuth";
import {
  type ModelExtras,
  ModelExtrasContext,
  type ModelExtrasStatus,
  ModelExtrasStatusContext,
} from "../tracker/model";
import { createFirestoreJobsRepository, firestoreJobsSource } from "./firestore";
import {
  type JobsRepository,
  JobsRepositoryContext,
  type JobsSource,
  type LiveJobsState,
} from "./repository";

const JobsSourceContext = createContext<JobsSource | null>(null);

/** The Jobs data in context (`JobsProviders`). */
export function useJobsData(): LiveJobsState {
  const source = useContext(JobsSourceContext);
  if (!source) throw new Error("useJobsData outside JobsProviders");
  return useSyncExternalStore(source.subscribe, source.getState);
}

/**
 * Collections the builders read that the Jobs listeners don't load: they come from the outer
 * providers (CV revisions with the tracker, mail messages from `LiveMailProvider`) or `base`.
 */
const NOT_LOADED = { cvRevisions: [], mailMessages: [], devices: [] } as const;

export function JobsProviders({
  source,
  repository,
  base,
  children,
}: {
  readonly source: JobsSource;
  readonly repository: JobsRepository;
  /** Extras the caller already has (the design build's fixtures for mail messages and devices). */
  readonly base?: Pick<ModelExtras, "cvRevisions" | "mailMessages" | "devices">;
  readonly children: ReactNode;
}) {
  const state = useSyncExternalStore(source.subscribe, source.getState);
  const outer = useContext(ModelExtrasContext);
  const extras = useMemo((): ModelExtras | null => {
    if (state.status !== "ready") return null;
    const { data } = state;
    return {
      ...(outer ?? NOT_LOADED),
      ...base,
      jobs: data.jobs,
      jobMatches: data.jobMatches,
      savedSearches: data.savedSearches,
      mailAccounts: data.mailAccounts,
      coverLetters: data.coverLetters,
      renderedFiles: data.renderedFiles,
    };
  }, [state, base, outer]);
  const status = useMemo(
    (): ModelExtrasStatus =>
      state.status === "ready"
        ? { status: "ready", pendingWrites: state.data.pendingWrites, fromCache: state.data.fromCache }
        : state,
    [state],
  );
  return (
    <JobsRepositoryContext.Provider value={repository}>
      <JobsSourceContext.Provider value={source}>
        <ModelExtrasStatusContext.Provider value={status}>
          <ModelExtrasContext.Provider value={extras ?? outer}>{children}</ModelExtrasContext.Provider>
        </ModelExtrasStatusContext.Provider>
      </JobsSourceContext.Provider>
    </JobsRepositoryContext.Provider>
  );
}

/** The signed-in user's Jobs listeners and repository; renders nothing while signed out. */
export function LiveJobsProvider({ children }: { readonly children: ReactNode }) {
  const uid = currentUid();
  const repository = useMemo(() => (uid === null ? null : createFirestoreJobsRepository(uid)), [uid]);
  if (repository === null || uid === null) return null;
  return (
    <JobsProviders source={firestoreJobsSource(uid)} repository={repository}>
      {children}
    </JobsProviders>
  );
}
