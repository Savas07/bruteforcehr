/**
 * The Settings store in memory for the design build and tests: the same `SettingsStore` as the
 * app over seeds (fixtures). Profile patches accumulate in `profileOverlay` (the tracker memory
 * store has no profile writes); watchlist writes follow firestore.rules (create pending, update
 * only the client fields). `latencyMs` delays every settle so busy states show; `fail` makes the
 * next writes reject (the "Couldn't save" state).
 */
import { type JobSourceStatus, WATCHLIST_PENDING_FIELDS, type WatchedCompany } from "@bfhr/core";
import type { UpdateChannel } from "../../lib/desktop";
import type { ListSource, ListState, ProfilePatch, SettingsStore } from "./store";

export type SettingsMemoryLogEntry =
  | { readonly kind: "profile"; readonly patch: ProfilePatch }
  | { readonly kind: "addCompany"; readonly name: string; readonly careersUrl: string }
  | { readonly kind: "updateCompany"; readonly companyId: string; readonly patch: object }
  | { readonly kind: "removeCompany"; readonly companyId: string }
  | { readonly kind: "restoreCompany"; readonly companyId: string }
  | { readonly kind: "channel"; readonly channel: UpdateChannel };

export interface MemorySettingsStore {
  readonly store: SettingsStore;
  readonly log: readonly SettingsMemoryLogEntry[];
  /** While true, writes apply locally and then reject, like a write the server refused. */
  failWrites(fail: boolean): void;
  readonly channel: () => UpdateChannel;
}

export interface MemorySettingsOptions {
  readonly uid?: string;
  readonly watchlist: readonly WatchedCompany[];
  readonly jobSources: readonly JobSourceStatus[];
  readonly now: () => Date;
  readonly latencyMs?: number;
  readonly channel?: UpdateChannel;
}

function listSource<T>(initial: readonly T[]): ListSource<T> & { set(items: readonly T[]): void } {
  const listeners = new Set<() => void>();
  let state: ListState<T> = { status: "ready", items: initial, pending: new Set(), fromCache: false };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    set(items) {
      state = { status: "ready", items, pending: new Set(), fromCache: false };
      for (const listener of listeners) listener();
    },
  };
}

export function createMemorySettingsStore(options: MemorySettingsOptions): MemorySettingsStore {
  const { now, latencyMs = 0 } = options;
  const log: SettingsMemoryLogEntry[] = [];
  let fail = false;
  let channel: UpdateChannel = options.channel ?? "stable";
  let companies = [...options.watchlist];
  let nextId = 1;
  const watchlist = listSource<WatchedCompany>(companies);
  const jobSources = listSource<JobSourceStatus>(options.jobSources);
  const overlayListeners = new Set<() => void>();
  let overlay: ProfilePatch | null = null;

  const settle = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const failed = fail;
      setTimeout(() => (failed ? reject(new Error("permission-denied")) : resolve()), latencyMs);
    });
  const setCompanies = (next: WatchedCompany[]) => {
    companies = next;
    watchlist.set(companies);
  };

  const store: SettingsStore = {
    uid: options.uid ?? "memory-user",
    updateProfile(patch) {
      log.push({ kind: "profile", patch });
      overlay = {
        ...overlay,
        ...patch,
        settings: { ...overlay?.settings, ...patch.settings },
      };
      for (const listener of overlayListeners) listener();
      return settle();
    },
    watchlist,
    jobSources,
    addCompany({ name, careersUrl }) {
      log.push({ kind: "addCompany", name, careersUrl });
      const at = now();
      setCompanies([
        ...companies,
        {
          id: `memory-company-${nextId++}`,
          name,
          careersUrl,
          enabled: true,
          ...WATCHLIST_PENDING_FIELDS,
          createdAt: at,
          updatedAt: at,
        },
      ]);
      return settle();
    },
    updateCompany(companyId, patch) {
      log.push({ kind: "updateCompany", companyId, patch });
      setCompanies(
        companies.map((company) =>
          company.id === companyId ? { ...company, ...patch, updatedAt: now() } : company,
        ),
      );
      return settle();
    },
    removeCompany(companyId) {
      log.push({ kind: "removeCompany", companyId });
      setCompanies(companies.filter((company) => company.id !== companyId));
      return settle();
    },
    restoreCompany(company) {
      log.push({ kind: "restoreCompany", companyId: company.id });
      setCompanies([...companies, { ...company, ...WATCHLIST_PENDING_FIELDS, updatedAt: now() }]);
      return settle();
    },
    setUpdateChannel(next) {
      log.push({ kind: "channel", channel: next });
      channel = next;
      return settle();
    },
    profileOverlay: {
      subscribe(listener) {
        overlayListeners.add(listener);
        return () => overlayListeners.delete(listener);
      },
      getState: () => overlay,
    },
  };

  return {
    store,
    log,
    failWrites(next) {
      fail = next;
    },
    channel: () => channel,
  };
}
