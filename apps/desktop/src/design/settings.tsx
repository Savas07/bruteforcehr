/**
 * Settings in the design build: the panes on the design tracker and mail stores plus an in-memory
 * Settings store (src/features/settings/memory.ts) with fixture job sources and followed
 * companies, so switches, quiet hours, the watchlist and the channel behave as in the app.
 * `?fixture=empty` starts with no companies and no source health; `?state=loading|error` forces
 * the lists' load state; `?privacy=` forces a Data & privacy state (src/design/data-privacy.tsx).
 */
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import type { JobSourceStatus, WatchedCompany } from "@bfhr/core";
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { createMemorySettingsStore, type MemorySettingsStore } from "../features/settings/memory";
import SettingsScreen from "../features/settings/Screen";
import {
  type ListSource,
  type ListState,
  type SettingsStore,
  SettingsStoreContext,
} from "../features/settings/store";
import { DesignAccountData } from "./data-privacy";
import { useDesignReady } from "./DesignScreen";
import { readDesignParams } from "./search";
import { DesignTrackerProviders } from "./tracker";

const HOUR_MS = 3_600_000;
const ago = (hours: number) => new Date(FIXTURE_NOW.getTime() - hours * HOUR_MS);

const source = (
  fields: Pick<JobSourceStatus, "id" | "label" | "kind" | "state" | "reason"> & Partial<JobSourceStatus>,
): JobSourceStatus => ({
  markets: ["remote"],
  lastRunAt: ago(2),
  lastSuccessAt: fields.state === "skipped" ? null : ago(2),
  lastError: null,
  lastResultCount: fields.state === "skipped" ? null : 40,
  quota: null,
  attribution: { label: fields.label, url: `https://${fields.id}.example/`, minSize: null },
  updatedAt: ago(2),
  ...fields,
});

/** Source health as Deniz sees it mid-search. */
export const DESIGN_JOB_SOURCES: readonly JobSourceStatus[] = [
  source({
    id: "remotive",
    label: "Remotive",
    kind: "keyless",
    state: "ok",
    reason: null,
    lastResultCount: 64,
    attribution: { label: "Remotive", url: "https://remotive.com/", minSize: null },
  }),
  source({
    id: "arbeitnow",
    label: "Arbeitnow",
    kind: "keyless",
    state: "ok",
    reason: null,
    lastResultCount: 38,
    attribution: { label: "Arbeitnow", url: "https://www.arbeitnow.com/", minSize: null },
  }),
  source({
    id: "greenhouse",
    label: "Greenhouse boards",
    kind: "keyless",
    state: "degraded",
    reason: "rate_limited",
    lastResultCount: 12,
    attribution: { label: "Greenhouse", url: "https://www.greenhouse.com/", minSize: null },
  }),
  source({
    id: "adzuna",
    label: "Adzuna",
    kind: "keyed",
    state: "ok",
    reason: null,
    lastResultCount: 120,
    attribution: { label: "Adzuna", url: "https://www.adzuna.com/", minSize: { width: 116, height: 23 } },
  }),
  source({
    id: "jooble",
    label: "Jooble",
    kind: "keyed",
    state: "ok",
    reason: null,
    lastResultCount: 25,
    quota: { used: 312, limit: 500 },
    attribution: { label: "Jooble", url: "https://jooble.org/", minSize: null },
  }),
  source({
    id: "reed",
    label: "Reed",
    kind: "keyed",
    state: "skipped",
    reason: "no_key",
    lastRunAt: null,
    attribution: { label: "Reed", url: "https://www.reed.co.uk/", minSize: null },
  }),
  source({
    id: "kariyer",
    label: "Kariyer.net",
    kind: "scrape",
    state: "failing",
    reason: "blocked",
    lastSuccessAt: ago(50),
    lastResultCount: null,
    attribution: { label: "Kariyer.net", url: "https://www.kariyer.net/", minSize: null },
  }),
];

const company = (
  fields: Pick<WatchedCompany, "id" | "name" | "careersUrl" | "status"> & Partial<WatchedCompany>,
): WatchedCompany => ({
  enabled: true,
  ats: null,
  boardToken: null,
  companyDomain: null,
  lastError: null,
  openJobs: null,
  lastFetchedAt: null,
  createdAt: ago(240),
  updatedAt: ago(3),
  ...fields,
});

export const DESIGN_WATCHLIST: readonly WatchedCompany[] = [
  company({
    id: "watch-brightwave",
    name: "Brightwave",
    careersUrl: "https://jobs.lever.co/brightwave",
    status: "ok",
    ats: "lever",
    boardToken: "brightwave",
    openJobs: 7,
    lastFetchedAt: ago(3),
  }),
  company({
    id: "watch-nordlicht",
    name: "Nordlicht Mobility",
    careersUrl: "https://jobs.ashbyhq.com/nordlicht",
    status: "ok",
    ats: "ashby",
    boardToken: "nordlicht",
    openJobs: 0,
    lastFetchedAt: ago(3),
  }),
  company({
    id: "watch-kumsal",
    name: "Kumsal Yazılım",
    careersUrl: "https://kumsal.example/kariyer",
    status: "not_found",
    lastError: "No supported job board or job postings on this page.",
    lastFetchedAt: ago(3),
  }),
  company({
    id: "watch-tannenbaum",
    name: "Tannenbaum Software",
    careersUrl: "https://tannenbaum.jobs.personio.de/",
    status: "pending",
    enabled: false,
  }),
];

const stores = new Map<string, MemorySettingsStore>();

function forced<T>(list: ListSource<T>, state: string): ListSource<T> {
  if (state !== "loading" && state !== "error") return list;
  const fixed: ListState<T> =
    state === "loading" ? { status: "loading" } : { status: "error", retry: () => undefined };
  return { subscribe: list.subscribe, getState: () => fixed };
}

function DesignSettingsScreen() {
  const search = readDesignParams(useSearch({ strict: false }));
  const { pane } = useParams({ strict: false });
  const empty = search.fixture === "empty";
  let memory = stores.get(search.fixture);
  if (!memory) {
    memory = createMemorySettingsStore({
      uid: (empty ? emptyDataset : populatedDataset).uid,
      watchlist: empty ? [] : DESIGN_WATCHLIST,
      jobSources: empty ? [] : DESIGN_JOB_SOURCES,
      now: () => FIXTURE_NOW,
      latencyMs: 400,
    });
    stores.set(search.fixture, memory);
  }
  const base = memory.store;
  const store = useMemo(
    (): SettingsStore => ({
      ...base,
      watchlist: forced(base.watchlist, search.state),
      jobSources: forced(base.jobSources, search.state),
    }),
    [base, search.state],
  );
  useDesignReady(
    `settings:${pane ?? ""}:${search.fixture}:${search.state}:${search.rest["privacy"] ?? ""}`,
    false,
  );
  return (
    <SettingsStoreContext.Provider value={store}>
      <DesignAccountData>
        <SettingsScreen pane={pane ?? ""} />
      </DesignAccountData>
    </SettingsStoreContext.Provider>
  );
}

export function DesignSettings() {
  return (
    <DesignTrackerProviders>
      <DesignSettingsScreen />
    </DesignTrackerProviders>
  );
}
