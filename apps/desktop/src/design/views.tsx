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
import { buildCvEditorModel } from "../features/cv-editor/model";
import { CvSuggestionSeedContext } from "../features/cv-editor/suggestionSeed";
import type { ModelContext } from "../shared/model/types";
import type { RouteViews } from "../router";
import { readDesignParams } from "./search";
import { Demo } from "./Demo";
import { DesignIndex } from "./DesignIndex";
import { DesignRoot } from "./DesignRoot";
import { DesignScreen } from "./DesignScreen";
import {
  cvEditorScreen,
  insightsScreen,
  jobDetailScreen,
  mailReviewScreen,
  todayScreen,
  trackerBoardScreen,
} from "./screens";

function Today() {
  return <DesignScreen spec={todayScreen} />;
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
    () => ({ ...cvEditorScreen, build: (_: unknown, ctx: ModelContext, params: Readonly<Record<string, string | undefined>>) => buildCvEditorModel(version, ctx, params) }),
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
function TrackerBoard() {
  return <DesignScreen spec={trackerBoardScreen} />;
}
function Insights() {
  return <DesignScreen spec={insightsScreen} />;
}
function MailReview() {
  return <DesignScreen spec={mailReviewScreen} />;
}

export const designViews: RouteViews = {
  root: DesignRoot,
  routes: {
    today: Today,
    jobs: JobDetail,
    job: JobDetail,
    tracker: TrackerBoard,
    cvs: CvEditor,
    cv: CvEditor,
    mail: MailReview,
    mailReview: MailReview,
    insights: Insights,
    design: DesignIndex,
    designDemo: Demo,
  },
};
