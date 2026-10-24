/**
 * Live mail for screens. `MailProviders` puts a `MailSource` + `MailRepository` in context and
 * feeds the accounts and messages to the tracker view-models (`ModelExtrasContext`, merged over
 * the outer extras, with their load state and local writes merged into
 * `ModelExtrasStatusContext`), so every `useTrackerModel` builder (Mail, Today, application
 * detail) sees them. `LiveMailProvider` does that for the signed-in user (inside
 * `LiveTrackerProvider`); the design build and tests pass a memory store.
 */
import { type ReactNode, useContext, useMemo, useSyncExternalStore } from "react";
import { currentUid } from "../../features/auth/firebaseAuth";
import {
  type ModelExtras,
  ModelExtrasContext,
  type ModelExtrasStatus,
  ModelExtrasStatusContext,
} from "../tracker/model";
import { createFirestoreMailRepository, firestoreMailSource } from "./firestore";
import {
  type LiveMailState,
  type MailRepository,
  MailRepositoryContext,
  type MailSource,
  MailSourceContext,
} from "./repository";

const signedOut: LiveMailState = { status: "loading" };
const idleSource: MailSource = { subscribe: () => () => undefined, getState: () => signedOut };

/** The mail data in context (`MailProviders`); loading outside them. */
export function useMailData(): LiveMailState {
  const source = useContext(MailSourceContext) ?? idleSource;
  return useSyncExternalStore(source.subscribe, source.getState);
}

export function MailProviders({
  source,
  repository,
  children,
}: {
  readonly source: MailSource;
  readonly repository: MailRepository;
  readonly children: ReactNode;
}) {
  const state = useSyncExternalStore(source.subscribe, source.getState);
  const outer = useContext(ModelExtrasContext);
  const outerStatus = useContext(ModelExtrasStatusContext);
  const extras = useMemo(
    (): ModelExtras =>
      state.status === "ready"
        ? { ...outer, mailAccounts: state.data.mailAccounts, mailMessages: state.data.mailMessages }
        : outer,
    [state, outer],
  );
  const status = useMemo((): ModelExtrasStatus => {
    if (outerStatus.status !== "ready") return outerStatus;
    if (state.status !== "ready") return state;
    return {
      status: "ready",
      pendingWrites:
        state.data.pendingWrites.size === 0
          ? outerStatus.pendingWrites
          : new Set([...outerStatus.pendingWrites, ...state.data.pendingWrites]),
      fromCache: outerStatus.fromCache || state.data.fromCache,
    };
  }, [state, outerStatus]);
  return (
    <MailRepositoryContext.Provider value={repository}>
      <MailSourceContext.Provider value={source}>
        <ModelExtrasStatusContext.Provider value={status}>
          <ModelExtrasContext.Provider value={extras}>{children}</ModelExtrasContext.Provider>
        </ModelExtrasStatusContext.Provider>
      </MailSourceContext.Provider>
    </MailRepositoryContext.Provider>
  );
}

/** The signed-in user's mail listeners and actions; renders nothing while signed out. */
export function LiveMailProvider({ children }: { readonly children: ReactNode }) {
  const uid = currentUid();
  const repository = useMemo(() => (uid === null ? null : createFirestoreMailRepository(uid)), [uid]);
  if (repository === null || uid === null) return null;
  return (
    <MailProviders source={firestoreMailSource(uid)} repository={repository}>
      {children}
    </MailProviders>
  );
}
