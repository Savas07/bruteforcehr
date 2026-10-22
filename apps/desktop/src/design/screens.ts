/**
 * The five core screens in the design build: which builder feeds each and which documents count
 * as local writes under `?state=offline`. Views are discovered from `src/features/<id>/Screen.tsx`
 * (DesignScreen.tsx), so screen agents never edit this file.
 */
import { buildCvEditorModel, type CvEditorModel } from "../features/cv-editor/model";
import { buildJobDetailModel, type JobDetailModel } from "../features/job-detail/model";
import { buildMailReviewModel, type MailReviewModel } from "../features/mail-review/model";
import { buildTodayModel, type TodayModel } from "../features/today/model";
import { buildTrackerBoardModel, type TrackerBoardModel } from "../features/tracker-board/model";
import type { DesignScreenSpec } from "./DesignScreen";

/** Local writes in the offline state: the sidebar says "2 changes waiting to sync". */
export const OFFLINE_PENDING_WRITES = 2;

/** Today ids are `<kind>:<document id>`; these kinds key `pendingSync` on that document. */
const TODAY_PENDING_KINDS: Readonly<Record<string, true>> = {
  review: true,
  followUp: true,
  match: true,
  interview: true,
};

export const todayScreen: DesignScreenSpec<TodayModel> = {
  id: "today",
  title: "Today",
  build: buildTodayModel,
  offlinePending: (data, ctx) =>
    buildTodayModel(data, ctx, {})
      .items.filter((item) => TODAY_PENDING_KINDS[item.kind])
      .map((item) => item.id.split(":")[1] ?? item.id)
      .slice(0, OFFLINE_PENDING_WRITES),
};

export const jobDetailScreen: DesignScreenSpec<JobDetailModel> = {
  id: "job-detail",
  title: "Jobs",
  build: buildJobDetailModel,
  offlinePending: (data, ctx) =>
    buildJobDetailModel(data, ctx, {})
      .list.rows.map((row) => row.jobId)
      .slice(0, OFFLINE_PENDING_WRITES),
};

export const cvEditorScreen: DesignScreenSpec<CvEditorModel> = {
  id: "cv-editor",
  title: "CVs",
  build: buildCvEditorModel,
  // An edit writes the CV and its new revision.
  offlinePending: (data, ctx) => {
    const editor = buildCvEditorModel(data, ctx, {}).editor;
    return editor ? [editor.cvId, editor.currentRevisionId] : [];
  },
};

export const trackerBoardScreen: DesignScreenSpec<TrackerBoardModel> = {
  id: "tracker-board",
  title: "Tracker",
  build: buildTrackerBoardModel,
  offlinePending: (data, ctx) =>
    buildTrackerBoardModel(data, ctx, {})
      .columns.flatMap((column) => column.cards.slice(0, 1).map((card) => card.applicationId))
      .slice(0, OFFLINE_PENDING_WRITES),
};

export const mailReviewScreen: DesignScreenSpec<MailReviewModel> = {
  id: "mail-review",
  title: "Mail",
  build: buildMailReviewModel,
  offlinePending: (data, ctx) =>
    buildMailReviewModel(data, ctx, {})
      .rows.flatMap((row) => (row.kind === "review" ? [row.messageId] : []))
      .slice(0, OFFLINE_PENDING_WRITES),
};
