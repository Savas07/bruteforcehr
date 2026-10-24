/**
 * The Apply panels' data gate: tracker and Jobs data loading, failed or missing the job, each in
 * the panel frame; otherwise the panel for the job's `ApplyInput`.
 */
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { useTrackerData } from "../../data/tracker/live";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { type ApplyInput, findApplyInput } from "./model";
import { Shell } from "./ui";

const messages = defineMessages({
  keyGroup: { id: "apply.email.panel.keyGroup", defaultMessage: "Apply" },
  keyClose: { id: "apply.email.panel.keyClose", defaultMessage: "Close the email composer" },
  loading: { id: "apply.email.panel.loading", defaultMessage: "Loading the application" },
  loadFailedTitle: { id: "apply.email.panel.loadFailedTitle", defaultMessage: "Couldn't load this job" },
  loadFailedBody: {
    id: "apply.email.panel.loadFailedBody",
    defaultMessage: "Check your connection, then try again. Nothing was sent.",
  },
  missingJob: { id: "apply.email.panel.missingJob", defaultMessage: "This job isn't available anymore." },
});

export function ApplyGate({
  jobId,
  fallbackTitle,
  onClose,
  children,
}: {
  readonly jobId: string;
  readonly fallbackTitle: string;
  readonly onClose: () => void;
  readonly children: (input: ApplyInput) => ReactNode;
}) {
  const intl = useIntl();
  const tracker = useTrackerData();
  const jobs = useJobsData();
  useKeyBindings([
    {
      id: "apply.close",
      keys: "Escape",
      label: intl.formatMessage(messages.keyClose),
      group: intl.formatMessage(messages.keyGroup),
      inTextFields: true,
      run: (event) => {
        event.preventDefault();
        onClose();
      },
    },
  ]);

  if (tracker.status === "error" || jobs.status === "error") {
    const retry = () => {
      if (tracker.status === "error") tracker.retry();
      if (jobs.status === "error") jobs.retry();
    };
    return (
      <Shell title={fallbackTitle} onClose={onClose}>
        <PaneError
          title={intl.formatMessage(messages.loadFailedTitle)}
          body={intl.formatMessage(messages.loadFailedBody)}
          onRetry={retry}
        />
      </Shell>
    );
  }
  if (tracker.status === "loading" || jobs.status === "loading") {
    return (
      <Shell title={fallbackTitle} onClose={onClose}>
        <SkeletonRegion
          loading
          label={intl.formatMessage(messages.loading)}
          skeleton={
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex flex-col gap-1">
                  <SkeletonText widths={[20]} />
                  <SkeletonBlock className="h-8 w-full rounded-md" />
                </div>
              ))}
              <SkeletonBlock className="h-40 w-full rounded-md" />
            </div>
          }
        >
          {null}
        </SkeletonRegion>
      </Shell>
    );
  }
  const input = findApplyInput(jobId, tracker.data, jobs.data);
  if (!input) {
    return (
      <Shell title={fallbackTitle} onClose={onClose}>
        <EmptyState kind="subArea" body={intl.formatMessage(messages.missingJob)} />
      </Shell>
    );
  }
  return children(input);
}
