import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { RawIntlProvider, useIntl } from "react-intl";
import { AppShell } from "../components/AppShell";
import { AddApplicationHost } from "../features/application-add";
import { createAppIntl } from "../i18n/intl";
import { resolveAppLocale } from "../i18n/locale";
import { type Connectivity, ConnectivityContext } from "../shared/connectivity";
import { fixtureContext } from "../shared/model/fixture-context";
import { relativeTime } from "../shared/model/format";
import { OFFLINE_PENDING_WRITES } from "./screens";
import { readDesignParams } from "./search";
import { DesignAuth } from "./auth";
import { privacyDesignReauth } from "./data-privacy";
import { DesignTrackerProviders } from "./tracker";
import { DesignUpdates } from "./updates";

const MINUTE_MS = 60_000;

/**
 * Root of the design build: the real AppShell with the connection state the route forces
 * (`?state=offline` → strip, sidebar sync line, sync glyphs), the update UI state (`?update=`,
 * src/design/updates.tsx), the signed-out sign-in states (`?auth=`, src/design/auth.tsx; signed
 * in without it), an optional `?theme=` override and an optional locale pin
 * (`?locale=en-GB`, replacing the OS locale for the whole UI, also in the real app) so captures from every machine show the same text. `?tz=` is applied where the
 * view-models are built (DesignScreen). Online: synced a moment ago. Offline: the cache is from 25
 * minutes ago, changes are queued.
 */
export function DesignRoot() {
  const params = readDesignParams(useSearch({ strict: false }));
  const appIntl = useIntl();
  const pinned = useMemo(
    () => (params.locale === null ? null : createAppIntl(resolveAppLocale([params.locale]))),
    [params.locale],
  );
  const intl = pinned ?? appIntl;

  const connectivity = useMemo((): Connectivity => {
    const ctx = fixtureContext(populatedDataset, [], intl, params.tz ?? undefined);
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
  }, [params.state, params.tz, intl]);

  useEffect(() => {
    const root = document.documentElement;
    if (params.theme === null) delete root.dataset["theme"];
    else root.dataset["theme"] = params.theme;
  }, [params.theme]);

  useEffect(() => {
    document.documentElement.lang = intl.locale;
  }, [intl.locale]);

  const shell = (
    <ConnectivityContext.Provider value={connectivity}>
      <DesignUpdates state={params.rest["update"]}>
        <DesignAuth
          state={params.rest["auth"]}
          reauth={privacyDesignReauth(params.rest["privacy"], populatedDataset.profile.email.toLowerCase())}
        >
          <AppShell
            hosts={
              <DesignTrackerProviders>
                <AddApplicationHost />
              </DesignTrackerProviders>
            }
          />
        </DesignAuth>
      </DesignUpdates>
    </ConnectivityContext.Provider>
  );
  return pinned ? <RawIntlProvider value={pinned}>{shell}</RawIntlProvider> : shell;
}
