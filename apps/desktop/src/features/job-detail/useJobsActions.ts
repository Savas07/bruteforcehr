/**
 * Jobs actions with their feedback: each writes through the Jobs repository (applied locally at
 * once, synced later) and shows the Undo toast (D11/D12; "Hidden from your feed · Undo · Why?",
 * D19). Entities are read when an action runs, so Undo from the toast or Mod+Z acts on the data as
 * it is then. A rejected batch says so once; offline writes stay pending and never fail here.
 */
import type { DismissReason, Job, JobsSearchResponse, SavedSearchFilters } from "@bfhr/core";
import { useContext } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { useJobsRepository } from "../../data/jobs/repository";
import { useTrackerSource } from "../../data/tracker/live";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { type PendingWrite, useTrackerRepository } from "../../data/tracker/repository";
import { useTrackerActions } from "../../data/tracker/useTrackerActions";
import { useToast } from "../../shared/ui/Toast";
import type { ApplyRecord } from "../../data/jobs/writes";

/** What "Yes, I applied" pins: the CV version, and the files the kit made when there are any. */
export type AppliedPins = Pick<ApplyRecord, "cvId" | "cvRevisionId" | "cvFileId" | "coverLetterId" | "coverLetterFileId">;

const messages = defineMessages({
  undo: { id: "job-detail.copy.undo", defaultMessage: "Undo" },
  why: { id: "job-detail.view.why", defaultMessage: "Why?" },
  hiddenToast: { id: "job-detail.view.hiddenToast", defaultMessage: "Hidden from your feed: {title}" },
  unhiddenToast: { id: "job-detail.view.unhiddenToast", defaultMessage: "Back in your feed: {title}" },
  companyHiddenToast: {
    id: "job-detail.view.companyHiddenToast",
    defaultMessage: "Hiding all jobs from {company}",
  },
  savedToast: { id: "job-detail.view.savedToast", defaultMessage: "Saved: {title}" },
  unsavedToast: { id: "job-detail.view.unsavedToast", defaultMessage: "Removed from Saved: {title}" },
  reasonsToast: {
    id: "job-detail.view.reasonsToast",
    defaultMessage: "Thanks. We'll use this to tune your matches.",
  },
  haveThisToast: { id: "job-detail.view.haveThisToast", defaultMessage: "Added to your profile: {skill}" },
  cvToast: { id: "job-detail.view.cvToast", defaultMessage: "Matching against “{cv}”" },
  appliedToast: { id: "job-detail.view.appliedToast", defaultMessage: "Marked as applied: {company}" },
  viewInTracker: { id: "job-detail.copy.viewInTracker", defaultMessage: "View in Tracker" },
  writeFailed: {
    id: "job-detail.actions.writeFailed",
    defaultMessage: "We couldn't save that change. Check your connection and try again.",
  },
  rescoreFailed: {
    id: "job-detail.actions.rescoreFailed",
    defaultMessage: "We couldn't update the match yet. It updates on the next search.",
  },
});

export interface JobsActions {
  /** Save / unsave (D02: the Saved application and the match, one batch), with Undo. */
  toggleSave(jobId: string): void;
  /** Not for me; the toast offers Undo and "Why?" (`onWhy`). */
  dismiss(jobId: string, options: { readonly onWhy?: () => void; readonly onUndo?: () => void }): void;
  /** The optional reasons after Not for me. */
  setDismissReasons(jobId: string, reasons: readonly DismissReason[]): void;
  /** Hidden jobs › back in the feed, with Undo. */
  restore(jobId: string): void;
  /** "Hide all jobs from {company}", with Undo; false while the profile doesn't exist yet. */
  hideCompany(jobId: string, onUndo?: () => void): boolean;
  /** "I have this": the skill joins the profile and the job is re-scored, with Undo. */
  haveSkill(jobId: string, skill: string): void;
  /** Re-score the job against another CV (the profile's matching CV). */
  changeCv(jobId: string, cvId: string, cvTitle: string, onUndo: () => void): void;
  /** "Yes, I applied" after an external apply: the application moves to Applied with the documents pinned, with Undo. */
  recordApplied(jobId: string, pins: AppliedPins | null, onViewInTracker: (applicationId: string) => void): void;
  /** `jobsSearch` with the feed's search and filters. */
  search(query: string, filters: SavedSearchFilters): Promise<JobsSearchResponse>;
}

export function useJobsActions(): JobsActions {
  const intl = useIntl();
  const toast = useToast();
  const repository = useJobsRepository();
  const trackerRepository = useTrackerRepository();
  const trackerSource = useTrackerSource();
  const trackerActions = useTrackerActions();
  const jobsState = useJobsData();
  const environment = useContext(ModelEnvironmentContext);
  const jobsData = jobsState.status === "ready" ? jobsState.data : null;

  const job = (jobId: string): Job | null =>
    jobsData?.jobs.find((candidate) => candidate.id === jobId) ?? null;
  const match = (jobId: string) => jobsData?.jobMatches.find((candidate) => candidate.id === jobId) ?? null;
  const tracker = () => {
    const state = trackerSource.getState();
    return state.status === "ready" ? state.data : null;
  };
  const application = (jobId: string) =>
    tracker()?.applications.find((candidate) => candidate.jobId === jobId) ?? null;
  const undoLabel = intl.formatMessage(messages.undo);

  const watch = <Ids extends object>(write: PendingWrite<Ids>): PendingWrite<Ids> => {
    write.done.catch((error: unknown) => {
      console.error("Jobs write failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.writeFailed) });
    });
    return write;
  };
  const rescore = (jobId: string) =>
    void repository.refreshMatches([jobId]).catch((error: unknown) => {
      console.error("jobMatchesRefresh failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.rescoreFailed) });
    });

  const actions: JobsActions = {
    toggleSave(jobId) {
      const target = job(jobId);
      if (!target) return;
      const current = application(jobId);
      const saved = current ? current.status === "saved" : match(jobId)?.state === "saved";
      if (saved) {
        watch(repository.unsave(match(jobId), current));
        toast.show({
          message: intl.formatMessage(messages.unsavedToast, { title: target.title }),
          action: { label: undoLabel, run: () => void watch(repository.save(target, match(jobId))) },
        });
        return;
      }
      if (current) return; // Tracked past Saved: the status chip replaces the bookmark.
      const write = watch(repository.save(target, match(jobId)));
      toast.show({
        message: intl.formatMessage(messages.savedToast, { title: target.title }),
        action: {
          label: undoLabel,
          run: () => {
            const created =
              tracker()?.applications.find((candidate) => candidate.id === write.ids.applicationId) ?? null;
            watch(repository.unsave(match(jobId), created));
          },
        },
      });
    },
    dismiss(jobId, { onWhy, onUndo }) {
      const target = job(jobId);
      if (!target) return;
      watch(repository.dismiss(jobId, []));
      toast.show({
        message: intl.formatMessage(messages.hiddenToast, { title: target.title }),
        action: {
          label: undoLabel,
          run: () => {
            watch(repository.restore(jobId));
            onUndo?.();
          },
        },
        ...(onWhy && { secondaryAction: { label: intl.formatMessage(messages.why), run: onWhy } }),
      });
    },
    setDismissReasons(jobId, reasons) {
      if (reasons.length === 0) return;
      watch(repository.dismiss(jobId, reasons));
      toast.show({ variant: "info", message: intl.formatMessage(messages.reasonsToast) });
    },
    restore(jobId) {
      const target = job(jobId);
      if (!target) return;
      watch(repository.restore(jobId));
      toast.show({
        message: intl.formatMessage(messages.unhiddenToast, { title: target.title }),
        action: {
          label: undoLabel,
          run: () => void watch(repository.dismiss(jobId, match(jobId)?.dismissReasons ?? [])),
        },
      });
    },
    hideCompany(jobId, onUndo) {
      const target = job(jobId);
      const profile = tracker()?.profile ?? null;
      if (!target || !profile) return false;
      const company = { name: target.company, domain: target.companyDomain, hiddenAt: environment.now() };
      watch(repository.hideCompany(company, true, profile.hiddenCompanies));
      toast.show({
        message: intl.formatMessage(messages.companyHiddenToast, { company: target.company }),
        extended: true,
        action: {
          label: undoLabel,
          run: () => {
            watch(repository.hideCompany(company, false, tracker()?.profile?.hiddenCompanies ?? []));
            onUndo?.();
          },
        },
      });
      return true;
    },
    haveSkill(jobId, skill) {
      const profile = tracker()?.profile ?? null;
      if (!profile) return;
      watch(repository.setProfileSkill(skill, true, profile.skills)).done.then(
        () => rescore(jobId),
        () => undefined,
      );
      toast.show({
        message: intl.formatMessage(messages.haveThisToast, { skill }),
        action: {
          label: undoLabel,
          run: () =>
            void watch(repository.setProfileSkill(skill, false, tracker()?.profile?.skills ?? [])).done.then(
              () => rescore(jobId),
              () => undefined,
            ),
        },
      });
    },
    changeCv(jobId, cvId, cvTitle, onUndo) {
      const before = tracker()?.profile?.defaultCvId ?? null;
      watch(repository.setMatchingCv(cvId)).done.then(
        () => rescore(jobId),
        () => undefined,
      );
      toast.show({
        message: intl.formatMessage(messages.cvToast, { cv: cvTitle }),
        action: {
          label: undoLabel,
          run: () => {
            watch(repository.setMatchingCv(before)).done.then(
              () => rescore(jobId),
              () => undefined,
            );
            onUndo();
          },
        },
      });
    },
    recordApplied(jobId, pins, onViewInTracker) {
      const target = job(jobId);
      if (!target) return;
      const write = watch(
        repository.recordApplied({
          job: target,
          application: application(jobId),
          channel: "external_link",
          cvId: null,
          cvRevisionId: null,
          ...pins,
        }),
      );
      const { applicationId, eventId, created } = write.ids;
      toast.show({
        message: intl.formatMessage(messages.appliedToast, { company: target.company }),
        action: {
          label: undoLabel,
          run: () => {
            if (created)
              void trackerRepository.deleteApplications([applicationId]).done.catch(() => undefined);
            else if (eventId) trackerActions.undoEvent(eventId);
          },
        },
        secondaryAction: {
          label: intl.formatMessage(messages.viewInTracker),
          run: () => onViewInTracker(applicationId),
        },
      });
    },
    search(query, filters) {
      return repository.search({ query, filters });
    },
  };
  return actions;
}
