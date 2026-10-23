/**
 * The design build's route views (`RouteViewsContext`, src/router.tsx). Loaded by main.tsx only
 * when `__BFHR_DESIGN__` is true, so production bundles never contain it or @bfhr/fixtures.
 */
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import { CvBackendContext } from "../features/cv-editor/backend";
import { designSuggestions } from "../features/cv-editor/design-suggestions";
import { createMemoryCvStore } from "../features/cv-editor/memoryBackend";
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
/**
 * The CV editor on an in-memory backend over the fixtures (src/features/cv-editor/memoryBackend.ts),
 * so edits, saves, restores and conflicts behave as in the app.
 */
function CvEditor() {
  const search = readDesignParams(useSearch({ strict: false }));
  const dataset = search.fixture === "empty" ? emptyDataset : populatedDataset;
  const store = useMemo(() => createMemoryCvStore(dataset.uid, dataset, () => FIXTURE_NOW), [dataset]);
  const version = useSyncExternalStore(store.subscribe, () => store.data());
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
    design: DesignIndex,
    designDemo: Demo,
  },
};
