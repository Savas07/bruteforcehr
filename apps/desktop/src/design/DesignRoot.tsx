import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { AppShell } from "../components/AppShell";
import { type Connectivity, ConnectivityContext } from "../shared/connectivity";
import { fixtureContext } from "../shared/model/fixture-context";
import { relativeTime } from "../shared/model/format";
import { OFFLINE_PENDING_WRITES } from "./screens";
import { readDesignParams } from "./search";

const MINUTE_MS = 60_000;
const ctx = fixtureContext(populatedDataset);

/** Online: synced a moment ago. Offline: the cache is from 25 minutes ago, changes are queued. */
const connectivityByState = {
  online: {
    status: "online",
    pendingWrites: 0,
    lastSyncedAt: relativeTime(new Date(FIXTURE_NOW.getTime() - MINUTE_MS / 2), ctx),
  },
  offline: {
    status: "offline",
    pendingWrites: OFFLINE_PENDING_WRITES,
    lastSyncedAt: relativeTime(new Date(FIXTURE_NOW.getTime() - 25 * MINUTE_MS), ctx),
  },
} as const satisfies Record<string, Connectivity>;

/**
 * Root of the design build: the real AppShell with the connection state the route forces
 * (`?state=offline` → strip, sidebar sync line, sync glyphs) and an optional `?theme=` override.
 */
export function DesignRoot() {
  const params = readDesignParams(useSearch({ strict: false }));
  const connectivity = useMemo(
    () => (params.state === "offline" ? connectivityByState.offline : connectivityByState.online),
    [params.state],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (params.theme === null) delete root.dataset["theme"];
    else root.dataset["theme"] = params.theme;
  }, [params.theme]);

  return (
    <ConnectivityContext.Provider value={connectivity}>
      <AppShell />
    </ConnectivityContext.Provider>
  );
}
