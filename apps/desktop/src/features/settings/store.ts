/**
 * What the Settings panes read and write beyond the tracker and mail data: profile fields on
 * `users/{uid}` (dotted field paths + `updatedAt`, firestore.rules lets the owner update), the
 * followed companies (`users/{uid}/watchlist`, WATCHLIST_CLIENT_FIELDS), the project-wide job source
 * health (`jobSources`, read-only) and the per-install update channel. The app implements it on
 * Firestore (`firestore.ts`), the design build and tests in memory (`memory.ts`). The profile itself
 * is read from the tracker data (`useTrackerData`), which already listens to `users/{uid}`.
 */
import {
  DEFAULT_AI_ENABLED,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_PROFILE_SETTINGS,
  type JobSourceStatus,
  type NotificationPreferences,
  type Profile,
  type ProfileSettings,
  type UiLanguage,
  type WatchedCompany,
} from "@bfhr/core";
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { useTrackerData } from "../../data/tracker/live";
import type { UpdateChannel } from "../../lib/desktop";

/** Settings fields the panes change; `settings.*` keys are written as dotted field paths. */
export type ProfileSettingsPatch = Partial<
  Pick<ProfileSettings, "notifications" | "notifyRejections" | "quietHours" | "aiMailTextAllowed">
>;

export interface ProfilePatch {
  readonly aiEnabled?: boolean;
  readonly uiLanguage?: UiLanguage;
  readonly settings?: ProfileSettingsPatch;
}

export type ListState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | {
      readonly status: "ready";
      readonly items: readonly T[];
      /** Ids with local writes the server hasn't confirmed. */
      readonly pending: ReadonlySet<string>;
      readonly fromCache: boolean;
    };

export interface ListSource<T> {
  subscribe(listener: () => void): () => void;
  /** The same object until something changes. */
  getState(): ListState<T>;
}

export interface NewWatchedCompany {
  readonly name: string;
  readonly careersUrl: string;
}

export type WatchedCompanyPatch = Partial<Pick<WatchedCompany, "name" | "careersUrl" | "enabled">>;

/**
 * Writes apply locally at once (Firestore's cache shows them to every listener); the promise
 * settles when the server accepted or refused them.
 */
export interface SettingsStore {
  readonly uid: string;
  updateProfile(patch: ProfilePatch): Promise<void>;
  readonly watchlist: ListSource<WatchedCompany>;
  readonly jobSources: ListSource<JobSourceStatus>;
  addCompany(input: NewWatchedCompany): Promise<void>;
  updateCompany(companyId: string, patch: WatchedCompanyPatch): Promise<void>;
  removeCompany(companyId: string): Promise<void>;
  /** Undo of a removal: the entry comes back pending (the server resolves its board again). */
  restoreCompany(company: WatchedCompany): Promise<void>;
  /** Stable/Beta for this install (src-tauri/src/updater.rs). */
  setUpdateChannel(channel: UpdateChannel): Promise<void>;
  /**
   * Profile changes the tracker data doesn't show yet. Firestore's cache shows local writes at
   * once, so the live store keeps it null; the memory twin accumulates its patches here.
   */
  readonly profileOverlay: {
    subscribe(listener: () => void): () => void;
    getState(): ProfilePatch | null;
  };
}

export const SettingsStoreContext = createContext<SettingsStore | null>(null);

export function useSettingsStore(): SettingsStore {
  const store = useContext(SettingsStoreContext);
  if (!store) throw new Error("useSettingsStore outside SettingsStoreContext");
  return store;
}

export function useListState<T>(source: ListSource<T>): ListState<T> {
  return useSyncExternalStore(source.subscribe, source.getState);
}

/** The profile fields Settings shows, with the documented defaults for missing values. */
export interface SettingsProfile {
  /** False before onboarding created `users/{uid}`. */
  readonly exists: boolean;
  readonly aiEnabled: boolean;
  readonly uiLanguage: UiLanguage | null;
  /** The profile's zone (quiet hours), else this computer's. */
  readonly timeZone: string;
  readonly notifications: NotificationPreferences;
  readonly notifyRejections: boolean;
  readonly quietHours: ProfileSettings["quietHours"];
  readonly aiMailTextAllowed: boolean;
}

/** Applies `patch` over `profile` (both may be missing). */
export function settingsProfile(profile: Profile | null, patch: ProfilePatch | null): SettingsProfile {
  const settings: ProfileSettings = {
    ...(profile?.settings ?? DEFAULT_PROFILE_SETTINGS),
    ...patch?.settings,
  };
  return {
    exists: profile !== null,
    aiEnabled: patch?.aiEnabled ?? profile?.aiEnabled ?? DEFAULT_AI_ENABLED,
    uiLanguage: patch?.uiLanguage ?? profile?.uiLanguage ?? null,
    timeZone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifications: settings.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
    notifyRejections: settings.notifyRejections,
    quietHours: settings.quietHours,
    aiMailTextAllowed: settings.aiMailTextAllowed,
  };
}

export type SettingsProfileState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly profile: SettingsProfile; readonly fromCache: boolean };

/** The signed-in user's settings (tracker data's profile plus the store's overlay). */
export function useSettingsProfile(): SettingsProfileState {
  const tracker = useTrackerData();
  const { profileOverlay } = useSettingsStore();
  const overlay = useSyncExternalStore(profileOverlay.subscribe, profileOverlay.getState);
  return useMemo((): SettingsProfileState => {
    if (tracker.status !== "ready") return tracker;
    return {
      status: "ready",
      profile: settingsProfile(tracker.data.profile, overlay),
      fromCache: tracker.data.fromCache,
    };
  }, [tracker, overlay]);
}
