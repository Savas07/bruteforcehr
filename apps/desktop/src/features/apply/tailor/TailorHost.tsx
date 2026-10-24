/**
 * Tailor review over the Jobs screen (`?apply=1&tailor=<cvId>[&rev=<revisionId>]`): reads the job,
 * its application and the CV version from the live data, and on save puts the tailored version in
 * the Apply draft, so the panel the user returns to sends it.
 */
import type { CvRevision } from "@bfhr/core";
import { useEffect, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../../data/jobs/live";
import { useJobsRepository } from "../../../data/jobs/repository";
import { useTrackerData } from "../../../data/tracker/live";
import { type Lookup, useTrackerRepository } from "../../../data/tracker/repository";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { PaneError } from "../../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../../shared/ui/Skeleton";
import { applySessions } from "../session";
import { TailorReview } from "./TailorReview";

const messages = defineMessages({
  loading: { id: "apply.tailor.host.loading", defaultMessage: "Loading your CV" },
  failedTitle: { id: "apply.tailor.host.failedTitle", defaultMessage: "Couldn't load your CV" },
  failedBody: { id: "apply.tailor.host.failedBody", defaultMessage: "Check your connection, then try again." },
  missing: {
    id: "apply.tailor.host.missing",
    defaultMessage: "This CV or job isn't available anymore. Close this to pick another CV.",
  },
});

/** One CV's revisions from the tracker repository (live), by id. */
export function useCvRevision(cvId: string | null, revisionId: string | null): Lookup<CvRevision> {
  const repository = useTrackerRepository();
  const [state, setState] = useState<{ readonly cvId: string; readonly lookup: Lookup<readonly CvRevision[]> } | null>(null);
  useEffect(() => {
    if (cvId === null) return;
    return repository.watchCvRevisions(cvId, (lookup) => setState({ cvId, lookup }));
  }, [repository, cvId]);
  if (cvId === null) return { status: "ready", value: null };
  if (state?.cvId !== cvId || state.lookup.status === "loading") return { status: "loading" };
  return { status: "ready", value: state.lookup.value?.find((revision) => revision.id === revisionId) ?? null };
}

export function TailorHost({
  jobId,
  cvId,
  revisionId,
  onClose,
}: {
  readonly jobId: string;
  readonly cvId: string;
  /** A specific version; the CV's current one when null. */
  readonly revisionId: string | null;
  readonly onClose: () => void;
}) {
  const intl = useIntl();
  const tracker = useTrackerData();
  const jobs = useJobsData();
  const repository = useJobsRepository();
  const cv = tracker.status === "ready" ? (tracker.data.cvs.find((candidate) => candidate.id === cvId) ?? null) : null;
  const revision = useCvRevision(cv?.id ?? null, revisionId ?? cv?.currentRevisionId ?? null);

  if (tracker.status === "error" || jobs.status === "error")
    return (
      <PaneError
        title={intl.formatMessage(messages.failedTitle)}
        body={intl.formatMessage(messages.failedBody)}
        onRetry={() => {
          if (tracker.status === "error") tracker.retry();
          if (jobs.status === "error") jobs.retry();
        }}
      />
    );
  if (tracker.status === "loading" || jobs.status === "loading" || revision.status === "loading")
    return (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loading)}
        skeleton={<SkeletonBlock className="m-6 h-96 flex-1 rounded-lg" />}
      >
        {null}
      </SkeletonRegion>
    );
  const job = jobs.data.jobs.find((candidate) => candidate.id === jobId) ?? null;
  if (!job || !cv || !revision.value)
    return <EmptyState kind="subArea" body={intl.formatMessage(messages.missing)} />;
  return (
    <TailorReview
      cv={cv}
      revision={revision.value}
      job={job}
      match={jobs.data.jobMatches.find((candidate) => candidate.id === jobId) ?? null}
      application={tracker.data.applications.find((candidate) => candidate.jobId === jobId) ?? null}
      aiEnabled={tracker.data.profile?.aiEnabled ?? true}
      onClose={onClose}
      onSaved={(saved) => {
        // The Apply draft (if open this session) now attaches the tailored version.
        const key = `${repository.uid}:${jobId}`;
        const session = applySessions.get(key);
        if (session)
          applySessions.set(key, { ...session, draft: { ...session.draft, cvId, cvRevisionId: saved.revisionId } });
        onClose();
      }}
    />
  );
}
