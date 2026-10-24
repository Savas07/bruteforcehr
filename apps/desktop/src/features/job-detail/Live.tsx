/**
 * Jobs in the app (`/jobs`, `/jobs/$jobId`, `?q=&scope=&search=…`) on live data: the signed-in
 * user's tracker and Jobs listeners (inside `LiveTrackerProvider` + `LiveJobsProvider`).
 */
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { LiveJobsProvider } from "../../data/jobs/live";
import { useTrackerModel } from "../../data/tracker/model";
import { buildJobDetailModel } from "./model";
import JobDetailScreen from "./Screen";

function LiveJobsScreen() {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const route: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  // Every string search param is a screen param (`q`, `scope`, `search`, filters, dialogs).
  const paramsKey = JSON.stringify({
    ...Object.fromEntries(
      Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    jobId: route["jobId"],
  });
  const params = useMemo(
    (): Readonly<Record<string, string | undefined>> => JSON.parse(paramsKey),
    [paramsKey],
  );
  const model = useTrackerModel(buildJobDetailModel, params);
  return <JobDetailScreen model={model} params={params} />;
}

export default function LiveJobs() {
  return (
    <LiveJobsProvider>
      <LiveJobsScreen />
    </LiveJobsProvider>
  );
}
