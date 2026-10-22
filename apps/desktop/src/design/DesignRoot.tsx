import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useIntl } from "react-intl";
import { AppShell } from "../components/AppShell";
import { type Connectivity, ConnectivityContext } from "../shared/connectivity";
import { fixtureContext } from "../shared/model/fixture-context";
import { relativeTime } from "../shared/model/format";
import { OFFLINE_PENDING_WRITES } from "./screens";
import { readDesignParams } from "./search";

const MINUTE_MS = 60_000;

/**
 * Root of the design build: the real AppShell with the connection state the route forces
 * (`?state=offline` → strip, sidebar sync line, sync glyphs) and an optional `?theme=` override.
 * Online: synced a moment ago. Offline: the cache is from 25 minutes ago, changes are queued.
 */
export function DesignRoot() {
  const params = readDesignParams(useSearch({ strict: false }));
  const intl = useIntl();
  const connectivity = useMemo((): Connectivity => {
    const ctx = fixtureContext(populatedDataset, [], intl);
    return params.state === "offline"
      ? {
          status: "offline",
          pendingWrites: OFFLINE_PENDING_WRITES,
          lastSyncedAt: relativeTime(new Date(FIXTURE_NOW.getTime() - 25 * MINUTE_MS), ctx),
        }
      : {
          status: "online",
          pendingWrites: 0,
          lastSyncedAt: relativeTime(new Date(FIXTURE_NOW.getTime() - MINUTE_MS / 2), ctx),
        };
  }, [params.state, intl]);

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
