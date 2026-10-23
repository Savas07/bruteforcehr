/**
 * Today on the signed-in user's live tracker data (inside `LiveTrackerProvider`). The route's
 * `?item=` selects an item (deep links, notifications).
 */
import { useSearch } from "@tanstack/react-router";
import { useTrackerModel } from "../../data/tracker/model";
import { buildTodayModel } from "./model";
import TodayScreen from "./Screen";

export default function LiveToday() {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const item = typeof search["item"] === "string" ? search["item"] : undefined;
  const params = { item };
  const model = useTrackerModel(buildTodayModel, params);
  return <TodayScreen model={model} params={params} />;
}
