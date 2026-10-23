/**
 * Where the update UI gets its data: the live updater (src-tauri/src/updater.rs) and the
 * minimum-version gate (`appConfig/{platform}`), or, in the design build, a forced state
 * (src/design/updates.ts provides `UpdatesContext` itself).
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { VersionRequirement } from "../../lib/appConfig";
import {
  checkForUpdates,
  chrome,
  onUpdateStatus,
  restartToUpdate,
  updateStatus,
  type UpdateSnapshot,
} from "../../lib/desktop";

/** UI state a design route can open the update UI in. Production always starts from `{}`. */
export interface UpdatesUiPreset {
  readonly dialog?: "check" | "notes" | "save-first";
  readonly cardCollapsed?: boolean;
  readonly restarting?: boolean;
}

export interface UpdatesValue {
  readonly snapshot: UpdateSnapshot;
  readonly currentVersion: string;
  /** Set while this version is below `minSupportedVersion`: the blocking "Update required" screen. */
  readonly requirement: VersionRequirement | null;
  /** Starts a check (and download); the result arrives in `snapshot`. */
  readonly check: () => void;
  /** Installs the downloaded update and relaunches; rejects when the install failed. */
  readonly restart: () => Promise<void>;
  readonly preset: UpdatesUiPreset;
}

export const UpdatesContext = createContext<UpdatesValue | null>(null);

/** Same cadence as the updater's own checks (BRIEF §7). */
const RECHECK_MS = 6 * 60 * 60 * 1000;

const idle: UpdateSnapshot = { status: { state: "idle" }, channel: "stable" };

function LiveUpdates({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot>(idle);
  const [requirement, setRequirement] = useState<VersionRequirement | null>(null);

  useEffect(() => {
    let current = true;
    // Subscribe first, so a change between the two calls isn't lost.
    const stop = onUpdateStatus(setSnapshot);
    void updateStatus().then((initial) => {
      if (current) setSnapshot(initial);
    });
    return () => {
      current = false;
      stop();
    };
  }, []);

  useEffect(() => {
    const platform = chrome.platform;
    if (platform === "linux") return;
    let current = true;
    // Loaded on demand: Firebase and the @bfhr/core schemas stay out of the startup bundle.
    const read = () =>
      void Promise.all([import("../../lib/appConfig"), import("../../lib/version")]).then(
        async ([{ fetchVersionRequirement }, { isBelowMinimum }]) => {
          const found = await fetchVersionRequirement(platform);
          // A failed read keeps the last answer: going offline never lifts or raises the gate.
          if (!current || found === null) return;
          setRequirement(isBelowMinimum(chrome.version, found.minSupportedVersion) ? found : null);
        },
      );
    read();
    const timer = window.setInterval(read, RECHECK_MS);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, []);

  const value = useMemo(
    (): UpdatesValue => ({
      snapshot,
      currentVersion: chrome.version,
      requirement,
      check: () => {
        void checkForUpdates().catch((error: unknown) =>
          console.error("Couldn't start the update check", error),
        );
      },
      restart: restartToUpdate,
      preset: {},
    }),
    [snapshot, requirement],
  );
  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}

/** Provides the live updater unless a design route already provides a forced state. */
export function UpdatesProvider({ children }: { children: ReactNode }) {
  const forced = useContext(UpdatesContext);
  return forced ? children : <LiveUpdates>{children}</LiveUpdates>;
}

export function useUpdates(): UpdatesValue {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error("useUpdates needs an UpdatesProvider (AppShell)");
  return value;
}
