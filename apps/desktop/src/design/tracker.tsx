/**
 * The tracker screens in the design build (board, application detail, Log an application, Today,
 * and the table/calendar views): an in-memory tracker store over the fixtures
 * (src/data/tracker/memory.ts) behind the same `useTrackerData` / `useTrackerRepository` the app
 * uses, so moves, Undo, adds and edits behave as in the app. The route's `?fixture=` picks the
 * dataset (each keeps its store while the build runs, so changes survive navigation) and `?state=`
 * forces loading, error or offline (cache 25 minutes old, `OFFLINE_PENDING_WRITES` applications
 * waiting to sync); the clock is the fixture clock and `?tz=` pins the zone.
 */
import { emptyDataset, FIXTURE_NOW, type FixtureDataset, populatedDataset } from "@bfhr/fixtures";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type ComponentType, type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";
import { TrackerSourceContext } from "../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../data/tracker/memory";
import {
  type ModelBuilder,
  ModelEnvironmentContext,
  type ModelExtras,
  ModelExtrasContext,
  useTrackerModel,
} from "../data/tracker/model";
import {
  type LiveTrackerState,
  TrackerRepositoryContext,
  type TrackerSource,
} from "../data/tracker/repository";
import type { ScreenProps } from "../shared/screen";
import { useDesignReady } from "./DesignScreen";
import { OFFLINE_PENDING_WRITES } from "./screens";
import { readDesignParams } from "./search";
import { createMemoryMailStore, type MemoryMailStore } from "../data/mail/memory";
import { MailProviders } from "../data/mail/live";
import { designScanAccount } from "./mail-connect";

const MINUTE_MS = 60_000;

declare global {
  interface Window {
    /** The design tracker store, so capture scripts can inspect or drive it. */
    __bfhrTrackerStore?: MemoryTrackerStore;
    /** The design mail store (accounts, messages, callables), for capture scripts. */
    __bfhrMailStore?: MemoryMailStore;
  }
}

const stores = new Map<FixtureDataset, MemoryTrackerStore>();
const mailStores = new Map<string, MemoryMailStore>();

/** The design tracker store of `dataset` (one per dataset while the build runs; jobs write through it too). */
export function designTrackerStore(dataset: FixtureDataset): MemoryTrackerStore {
  let store = stores.get(dataset);
  if (!store) {
    store = createMemoryTrackerStore(dataset, () => FIXTURE_NOW);
    stores.set(dataset, store);
  }
  return store;
}

/**
 * The dataset's mail: callables answer like the deployed functions (OAuth providers not
 * configured yet, `?oauth=configured` turns them on) after a short delay so busy states show;
 * `?scan=` adds an inbox in a lookback scan (src/design/mail-connect.tsx).
 */
function mailStoreFor(dataset: FixtureDataset, oauthConfigured: boolean, scan: string | undefined): MemoryMailStore {
  const key = `${dataset.uid}:${dataset === emptyDataset ? "empty" : "populated"}:${String(oauthConfigured)}:${scan ?? ""}`;
  let store = mailStores.get(key);
  if (!store) {
    const scanned = designScanAccount(scan);
    store = createMemoryMailStore({
      uid: dataset.uid,
      accounts: scanned ? [...dataset.mailAccounts, scanned] : dataset.mailAccounts,
      messages: dataset.mailMessages,
      now: () => FIXTURE_NOW,
      oauthConfigured,
      latencyMs: 600,
    });
    mailStores.set(key, store);
  }
  return store;
}

/** The store's state with the route's forced load / connection state on top. */
function forcedSource(
  store: MemoryTrackerStore,
  forced: "ready" | "loading" | "error" | "offline",
  retry: () => void,
): TrackerSource {
  if (forced === "ready") return store.source;
  const cache = new Map<LiveTrackerState, LiveTrackerState>();
  const fixed: LiveTrackerState = forced === "loading" ? { status: "loading" } : { status: "error", retry };
  return {
    subscribe: store.source.subscribe,
    getState: () => {
      if (forced !== "offline") return fixed;
      const state = store.source.getState();
      if (state.status !== "ready") return state;
      let offline = cache.get(state);
      if (!offline) {
        const pending = state.data.applications
          .filter((application) => application.status !== "saved")
          .map((application) => application.id)
          .toSorted()
          .slice(0, OFFLINE_PENDING_WRITES);
        offline = {
          status: "ready",
          data: {
            ...state.data,
            pendingWrites: new Set(pending),
            fromCache: true,
            syncedAt: new Date(FIXTURE_NOW.getTime() - 25 * MINUTE_MS),
          },
        };
        cache.set(state, offline);
      }
      return offline;
    },
  };
}

/**
 * Provides the design tracker store, the design mail store, the fixture clock and the fixture
 * extras to the route.
 */
export function DesignTrackerProviders({ children }: { readonly children: ReactNode }) {
  const search = readDesignParams(useSearch({ strict: false }));
  const navigate = useNavigate();
  const dataset = search.fixture === "empty" ? emptyDataset : populatedDataset;
  const store = designTrackerStore(dataset);
  const mailStore = mailStoreFor(dataset, search.rest["oauth"] === "configured", search.rest["scan"]);
  useEffect(() => {
    window.__bfhrTrackerStore = store;
    window.__bfhrMailStore = mailStore;
  }, [store, mailStore]);
  const source = useMemo(
    () =>
      forcedSource(
        store,
        search.state,
        () =>
          void navigate({
            to: ".",
            search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, state: "ready" }),
          }),
      ),
    [store, search.state, navigate],
  );
  const version = useSyncExternalStore(store.source.subscribe, store.source.getState);
  const environment = useMemo(
    () => ({ now: () => FIXTURE_NOW, timeZone: search.tz ?? dataset.profile.timezone }),
    [search.tz, dataset],
  );
  const extras = useMemo(
    (): ModelExtras => ({
      cvRevisions: dataset.cvRevisions,
      renderedFiles: dataset.renderedFiles,
      coverLetters: dataset.coverLetters,
      jobs: store.jobs(),
      jobMatches: dataset.jobMatches,
      savedSearches: dataset.savedSearches,
      mailAccounts: dataset.mailAccounts,
      mailMessages: dataset.mailMessages,
      devices: dataset.devices,
    }),
    // A logged link adds a manual job: re-read the jobs whenever the store changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, store, version],
  );
  return (
    <TrackerRepositoryContext.Provider value={store.repository}>
      <TrackerSourceContext.Provider value={source}>
        <ModelEnvironmentContext.Provider value={environment}>
          <ModelExtrasContext.Provider value={extras}>
            <MailProviders source={mailStore.source} repository={mailStore.repository}>
              {children}
            </MailProviders>
          </ModelExtrasContext.Provider>
        </ModelEnvironmentContext.Provider>
      </TrackerSourceContext.Provider>
    </TrackerRepositoryContext.Provider>
  );
}

/**
 * One tracker screen fed by `useTrackerModel` (inside `DesignTrackerProviders`), with the design
 * build's ready signal for captures. Route params and the non-design search params are `params`.
 */
export function DesignTrackerScreen<Model>({
  id,
  build,
  view: View,
}: {
  readonly id: string;
  readonly build: ModelBuilder<Model>;
  readonly view: ComponentType<ScreenProps<Model>>;
}) {
  const search = readDesignParams(useSearch({ strict: false }));
  const routeParams: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const paramsKey = JSON.stringify({ ...search.rest, ...routeParams });
  const params = useMemo(
    (): Readonly<Record<string, string | undefined>> => JSON.parse(paramsKey),
    [paramsKey],
  );
  const model = useTrackerModel(build, params);
  useDesignReady(`${id}:${search.fixture}:${search.state}:${paramsKey}`, model.status === "loading");
  return <View model={model} params={params} />;
}
