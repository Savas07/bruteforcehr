/**
 * The application detail route in the app: the signed-in user's live tracker data (inside
 * `LiveTrackerProvider`, router.tsx) built into the page's model for the route's application.
 */
import { useParams } from "@tanstack/react-router";
import { useTrackerModel } from "../../data/tracker/model";
import { buildApplicationDetailModel } from "./model";
import ApplicationDetailScreen from "./Screen";

export default function LiveApplicationDetail() {
  const params: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const model = useTrackerModel(buildApplicationDetailModel, params);
  return <ApplicationDetailScreen model={model} params={params} />;
}
