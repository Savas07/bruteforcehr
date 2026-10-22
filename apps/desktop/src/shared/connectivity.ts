/**
 * Connection and sync state for the whole window (states.md "Offline"): drives the 28 px
 * `ConnectionBanner` strip above the content, the sidebar `SyncStatus` line, `SyncGlyph` on rows
 * and `NeedsConnection` on server-only actions. Production has no data layer yet, so the default
 * is online with nothing to report; design builds force it with `?state=offline`.
 */
import { createContext, useContext } from "react";
import type { TimeVM } from "./model/types";

export interface Connectivity {
  /** `backOnline` shows "Back online" for `timing.backOnline` after a reconnect. */
  readonly status: "online" | "offline" | "backOnline";
  /** Local writes not yet on the server ("3 changes waiting to sync"). */
  readonly pendingWrites: number;
  /** Last successful sync; null until the data layer reports one (hides the sync line). */
  readonly lastSyncedAt: TimeVM | null;
}

export const ConnectivityContext = createContext<Connectivity>({
  status: "online",
  pendingWrites: 0,
  lastSyncedAt: null,
});

export function useConnectivity(): Connectivity {
  return useContext(ConnectivityContext);
}
