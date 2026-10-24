/**
 * The CVs area in the app (`/cvs`, `/cvs/$cvId`): the CV editor fed by live Firestore data and
 * writing through the Firestore backend. Rendered behind `AuthGate`, so a user is signed in. The
 * tracker and Jobs listeners around it give the Check tab its jobs and applications, and "Tailor
 * for this job" its repository.
 */
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIntl } from "react-intl";
import { LiveJobsProvider, useJobsData } from "../../data/jobs/live";
import { useTrackerData } from "../../data/tracker/live";
import { clockTime, relativeTime } from "../../shared/model/format";
import type { Loadable, ModelContext } from "../../shared/model/types";
import { currentUid } from "../auth/firebaseAuth";
import { CvBackendContext } from "./backend";
import { createFirestoreCvBackend, useLiveCvData } from "./firestoreBackend";
import { buildCvEditorModel, type CvEditorModel } from "./model";
import CvEditorScreen from "./Screen";

function LiveStudio({ uid }: { uid: string }) {
  const intl = useIntl();
  const params: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const backend = useMemo(() => createFirestoreCvBackend(uid), [uid]);
  const live = useLiveCvData(uid);
  const jobs = useJobsData();
  const tracker = useTrackerData();
  const jobsData = jobs.status === "ready" ? jobs.data : null;
  const applications = tracker.status === "ready" ? tracker.data.applications : null;

  const model = useMemo((): Loadable<CvEditorModel> => {
    if (live.status !== "ready") return live;
    const { data } = live;
    const ctx: ModelContext = {
      now: new Date(),
      locale: intl.locale,
      intl,
      timeZone: data.profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      pendingWrites: data.pendingWrites,
    };
    return {
      status: "ready",
      data: buildCvEditorModel(
        {
          profile: data.profile,
          cvs: data.cvs,
          cvRevisions: data.cvRevisions,
          applications: applications ?? [],
          renderedFiles: jobsData?.renderedFiles ?? [],
          jobs: jobsData?.jobs ?? [],
          jobMatches: jobsData?.jobMatches ?? [],
        },
        ctx,
        { cvId: params.cvId },
      ),
      fromCache: data.fromCache,
      updatedAt: relativeTime(data.syncedAt, ctx),
      updatedClock: clockTime(data.syncedAt, ctx),
    };
  }, [live, intl, params.cvId, jobsData, applications]);

  return (
    <CvBackendContext.Provider value={backend}>
      <CvEditorScreen model={model} params={params} />
    </CvBackendContext.Provider>
  );
}

export default function LiveCvStudio() {
  const uid = currentUid();
  if (uid === null) return null;
  return (
    <LiveJobsProvider>
      <LiveStudio key={uid} uid={uid} />
    </LiveJobsProvider>
  );
}
