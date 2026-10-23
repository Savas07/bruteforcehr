/**
 * View-models from live tracker data: `useTrackerModel(build, params)` turns `useTrackerData()`
 * into the `Loadable<Model>` a screen takes, with the clock and zone of the environment (the app:
 * now and the profile's zone; the design build: the fixture clock and `?tz`). Data the tracker
 * doesn't listen to yet (mail, jobs, matches: M4/M5) comes from `ModelExtrasContext`, empty in the
 * app and the fixtures in the design build.
 */
import { createContext, useContext, useMemo } from "react";
import { useIntl } from "react-intl";
import { clockTime, relativeTime } from "../../shared/model/format";
import type { Loadable, ModelContext, ScreenData } from "../../shared/model/types";
import { displayTimeZone, profileView, useTrackerData } from "./live";

export interface ModelEnvironment {
  readonly now: () => Date;
  /** Zone override (design `?tz`, persona zone); null = the profile's zone, else the system's. */
  readonly timeZone: string | null;
}

export const ModelEnvironmentContext = createContext<ModelEnvironment>({
  now: () => new Date(),
  timeZone: null,
});

/** Collections outside the live tracker data. */
export type ModelExtras = Pick<
  ScreenData,
  | "cvRevisions"
  | "renderedFiles"
  | "coverLetters"
  | "jobs"
  | "jobMatches"
  | "savedSearches"
  | "mailAccounts"
  | "mailMessages"
  | "devices"
>;

export const NO_EXTRAS: ModelExtras = {
  cvRevisions: [],
  renderedFiles: [],
  coverLetters: [],
  jobs: [],
  jobMatches: [],
  savedSearches: [],
  mailAccounts: [],
  mailMessages: [],
  devices: [],
};

export const ModelExtrasContext = createContext<ModelExtras>(NO_EXTRAS);

export type ModelBuilder<Model> = (
  data: ScreenData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
) => Model;

export function useTrackerModel<Model>(
  build: ModelBuilder<Model>,
  params: Readonly<Record<string, string | undefined>>,
): Loadable<Model> {
  const state = useTrackerData();
  const environment = useContext(ModelEnvironmentContext);
  const extras = useContext(ModelExtrasContext);
  const intl = useIntl();
  // Params objects are fresh every render: key the memo on their content.
  const paramsKey = JSON.stringify(params);
  return useMemo((): Loadable<Model> => {
    if (state.status !== "ready") return state;
    const { data } = state;
    const ctx: ModelContext = {
      now: environment.now(),
      locale: intl.locale,
      intl,
      timeZone: environment.timeZone ?? displayTimeZone(data.profile),
      pendingWrites: data.pendingWrites,
    };
    const screenData: ScreenData = {
      ...extras,
      uid: data.profile?.id ?? "",
      profile: profileView(data.profile),
      applications: data.applications,
      applicationEvents: data.applicationEvents,
      interviews: data.interviews,
      contacts: data.contacts,
      cvs: data.cvs,
    };
    return {
      status: "ready",
      data: build(screenData, ctx, JSON.parse(paramsKey) as Readonly<Record<string, string | undefined>>),
      fromCache: data.fromCache,
      updatedAt: relativeTime(data.syncedAt, ctx),
      updatedClock: clockTime(data.syncedAt, ctx),
    };
  }, [state, environment, extras, intl, build, paramsKey]);
}
