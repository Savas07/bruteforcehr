/**
 * The design build's route views (`RouteViewsContext`, src/router.tsx). Loaded by main.tsx only
 * when `__BFHR_DESIGN__` is true, so production bundles never contain it or @bfhr/fixtures.
 */
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { CvBackendContext } from "../features/cv-editor/backend";
import { designSuggestions } from "../features/cv-editor/design-suggestions";
import { createMemoryCvStore, type MemoryCvStore } from "../features/cv-editor/memoryBackend";
import { buildApplicationDetailModel } from "../features/application-detail/model";
import ApplicationDetailScreen from "../features/application-detail/Screen";
import { buildCvEditorModel } from "../features/cv-editor/model";
import { buildMailReviewModel } from "../features/mail-review/model";
import MailReviewScreen from "../features/mail-review/Screen";
import { buildTodayModel } from "../features/today/model";
import TodayScreen from "../features/today/Screen";
import { buildTrackerBoardModel } from "../features/tracker-board/model";
import TrackerBoardScreen from "../features/tracker-board/Screen";
import { CvSuggestionSeedContext } from "../features/cv-editor/suggestionSeed";
import type { ModelContext } from "../shared/model/types";
import type { RouteViews } from "../router";
import { readDesignParams } from "./search";
import { Demo } from "./Demo";
import { DesignIndex } from "./DesignIndex";
import { DesignRoot } from "./DesignRoot";
import { DesignScreen } from "./DesignScreen";
import { cvEditorScreen, insightsScreen, jobDetailScreen } from "./screens";
import { DesignSettings } from "./settings";
import { DesignTrackerProviders, DesignTrackerScreen } from "./tracker";
import { DesignTrackerCalendar, DesignTrackerTable } from "./tracker-views";
import { TrackerViewsRoute } from "../features/tracker-table/ViewSwitch";

/** Today, the board and the application detail run on the design tracker store (src/design/tracker.tsx). */
function Today() {
  return (
    <DesignTrackerProviders>
      <DesignTrackerScreen id="today" build={buildTodayModel} view={TodayScreen} />
    </DesignTrackerProviders>
  );
}
function JobDetail() {
  return <DesignScreen spec={jobDetailScreen} />;
}

declare global {
  interface Window {
    /** The design CV store, so capture scripts can play "another device saved" (conflict UI). */
    __bfhrCvStore?: MemoryCvStore;
  }
}

/**
 * The CV editor on an in-memory backend over the fixtures (src/features/cv-editor/memoryBackend.ts),
 * so edits, saves, restores and conflicts behave as in the app.
 */
function CvEditor() {
  const search = readDesignParams(useSearch({ strict: false }));
  const dataset = search.fixture === "empty" ? emptyDataset : populatedDataset;
  const store = useMemo(() => createMemoryCvStore(dataset.uid, dataset, () => FIXTURE_NOW), [dataset]);
  const version = useSyncExternalStore(store.subscribe, () => store.data());
  useEffect(() => {
    window.__bfhrCvStore = store;
    return () => {
      if (window.__bfhrCvStore === store) delete window.__bfhrCvStore;
    };
  }, [store]);
  const spec = useMemo(
    () => ({
      ...cvEditorScreen,
      build: (_: unknown, ctx: ModelContext, params: Readonly<Record<string, string | undefined>>) =>
        buildCvEditorModel(version, ctx, params),
    }),
    [version],
  );
  return (
    <CvBackendContext.Provider value={store.backend}>
      <CvSuggestionSeedContext.Provider value={designSuggestions}>
        <DesignScreen spec={spec} />
      </CvSuggestionSeedContext.Provider>
    </CvBackendContext.Provider>
  );
}
function DesignTrackerBoard() {
  return <DesignTrackerScreen id="tracker-board" build={buildTrackerBoardModel} view={TrackerBoardScreen} />;
}
const designTrackerViews = {
  board: DesignTrackerBoard,
  table: DesignTrackerTable,
  calendar: DesignTrackerCalendar,
} as const;
/** Tracker › Board · Table · Calendar (`?view=`) on the design tracker store. */
function Tracker() {
  return (
    <DesignTrackerProviders>
      <TrackerViewsRoute views={designTrackerViews} />
    </DesignTrackerProviders>
  );
}
function ApplicationDetail() {
  return (
    <DesignTrackerProviders>
      <DesignTrackerScreen
        id="application-detail"
        build={buildApplicationDetailModel}
        view={ApplicationDetailScreen}
      />
    </DesignTrackerProviders>
  );
}
function Insights() {
  return <DesignScreen spec={insightsScreen} />;
}
/** Mail on the design tracker and mail stores: decisions, Undo and connect behave as in the app. */
function MailReview() {
  return (
    <DesignTrackerProviders>
      <DesignTrackerScreen id="mail-review" build={buildMailReviewModel} view={MailReviewScreen} />
    </DesignTrackerProviders>
  );
}

export const designViews: RouteViews = {
  root: DesignRoot,
  routes: {
    today: Today,
    jobs: JobDetail,
    job: JobDetail,
    tracker: Tracker,
    application: ApplicationDetail,
    cvs: CvEditor,
    cv: CvEditor,
    mail: MailReview,
    mailReview: MailReview,
    insights: Insights,
    settings: DesignSettings,
    design: DesignIndex,
    designDemo: Demo,
  },
};
