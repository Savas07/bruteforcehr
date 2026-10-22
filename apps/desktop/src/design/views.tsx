/**
 * The design build's route views (`RouteViewsContext`, src/router.tsx). Loaded by main.tsx only
 * when `__BFHR_DESIGN__` is true, so production bundles never contain it or @bfhr/fixtures.
 */
import type { RouteViews } from "../router";
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
function CvEditor() {
  return <DesignScreen spec={cvEditorScreen} />;
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
