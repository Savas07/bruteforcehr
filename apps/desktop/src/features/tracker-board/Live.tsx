/**
 * The Tracker board in the app (`/tracker`, `?applicationId=` for the side panel) on live data:
 * `useTrackerModel` over the signed-in user's tracker listeners (inside `LiveTrackerProvider`).
 */
import { useSearch } from "@tanstack/react-router";
import { useTrackerModel } from "../../data/tracker/model";
import { buildTrackerBoardModel } from "./model";
import TrackerBoardScreen from "./Screen";

export default function LiveTrackerBoard() {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const applicationId = typeof search["applicationId"] === "string" ? search["applicationId"] : undefined;
  const params = { applicationId };
  const model = useTrackerModel(buildTrackerBoardModel, params);
  return <TrackerBoardScreen model={model} params={params} />;
}
