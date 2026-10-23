/**
 * The Table and Calendar views on live data (inside `LiveTrackerProvider`): the model comes from
 * `useTrackerModel`, route params and string search params (Insights drill-downs) are `params`.
 */
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTrackerModel } from "../../data/tracker/model";
import { buildTrackerCalendarModel } from "../tracker-calendar/model";
import TrackerCalendarScreen from "../tracker-calendar/Screen";
import { buildTrackerTableModel } from "./model";
import TrackerTableScreen from "./Screen";

/** Route params plus the string search params, stable while their content is. */
function useViewParams(): Readonly<Record<string, string | undefined>> {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const routeParams: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const key = JSON.stringify({
    ...Object.fromEntries(
      Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    ...routeParams,
  });
  return useMemo(() => JSON.parse(key) as Readonly<Record<string, string | undefined>>, [key]);
}

export function LiveTrackerTable() {
  const params = useViewParams();
  const model = useTrackerModel(buildTrackerTableModel, params);
  return <TrackerTableScreen model={model} params={params} />;
}

export function LiveTrackerCalendar() {
  const params = useViewParams();
  const model = useTrackerModel(buildTrackerCalendarModel, params);
  return <TrackerCalendarScreen model={model} params={params} />;
}
