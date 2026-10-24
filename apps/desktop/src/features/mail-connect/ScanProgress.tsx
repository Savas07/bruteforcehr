/**
 * The lookback scan of one account (`MailAccount.backfill`, connect-email.md Screen D/E and
 * "Scanning (desktop)"): the four-stage checklist with a live counter, a determinate bar only when
 * the provider reported a total, then the summary ("We found 14 applications and 3 interview
 * invites") with Review in Mail, or the failure with "Try the scan again". `full` is the dialog's
 * and the account panel's; `compact` one line for Settings rows and Today. Renders nothing before
 * the first scan.
 */
import type { MailAccount, MailBackfill, MailBackfillStage } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { defineMessages, type IntlShape, type MessageDescriptor, useIntl } from "react-intl";
import { useMailRepository } from "../../data/mail/repository";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { lookbackOf } from "./model";

const messages = defineMessages({
  checked: {
    id: "mail-connect.scan.checked",
    defaultMessage: "{count, plural, one {# email checked} other {# emails checked}}",
  },
  checkedOf: {
    id: "mail-connect.scan.checkedOf",
    defaultMessage: "{scanned, number} of {total, plural, one {# email} other {# emails}} checked",
  },
  jobSoFar: {
    id: "mail-connect.scan.jobSoFar",
    defaultMessage: "{count, plural, one {# job email so far} other {# job emails so far}}",
  },
  appsSoFar: {
    id: "mail-connect.scan.appsSoFar",
    defaultMessage: "{count, plural, one {# application found so far} other {# applications found so far}}",
  },
  queued: {
    id: "mail-connect.scan.queued",
    defaultMessage: "Starting soon",
    description: "Caption of the first stage while the scan waits in the queue",
  },
  stageDone: { id: "mail-connect.scan.stageDone", defaultMessage: "Done", description: "Screen-reader state of a stage" },
  stageCurrent: {
    id: "mail-connect.scan.stageCurrent",
    defaultMessage: "In progress",
    description: "Screen-reader state of a stage",
  },
  stagePending: {
    id: "mail-connect.scan.stagePending",
    defaultMessage: "Not started",
    description: "Screen-reader state of a stage",
  },
  stageStopped: {
    id: "mail-connect.scan.stageStopped",
    defaultMessage: "Stopped",
    description: "Screen-reader state of the stage where a failed scan stopped",
  },
  stages: { id: "mail-connect.scan.stages", defaultMessage: "Scan steps", description: "Accessible name of the checklist" },
  progress: {
    id: "mail-connect.scan.progress",
    defaultMessage: "Inbox scan",
    description: "Accessible name of the scan's progress bar",
  },
  leave: {
    id: "mail-connect.scan.leave",
    defaultMessage: "This can take a few minutes. You can keep going, and we'll let you know when it's ready.",
  },
  found: {
    id: "mail-connect.scan.found",
    defaultMessage:
      "We found {apps, plural, one {# application} other {# applications}}{invites, plural, =0 {} one { and # interview invite} other { and # interview invites}}",
    description: "Scan summary; the invites clause is dropped at 0",
  },
  foundInvites: {
    id: "mail-connect.scan.foundInvites",
    defaultMessage: "We found {invites, plural, one {# interview invite} other {# interview invites}}",
    description: "Scan summary when no applications were found but invites were",
  },
  foundNone: {
    id: "mail-connect.scan.foundNone",
    defaultMessage: "No job applications found in the last {days} days",
  },
  from: {
    id: "mail-connect.scan.from",
    defaultMessage: "From the last {days} days in {address}.",
  },
  noneBody: {
    id: "mail-connect.scan.noneBody",
    defaultMessage: "New ones will appear in Mail as they arrive.",
  },
  alerts: {
    id: "mail-connect.scan.alerts",
    defaultMessage:
      "We also found {count, plural, one {# job alert email} other {# job alert emails}}. New postings from them will appear in Jobs.",
  },
  pending: {
    id: "mail-connect.scan.pending",
    defaultMessage: "{count, plural, one {# email is} other {# emails are}} waiting for your review.",
  },
  review: { id: "mail-connect.scan.review", defaultMessage: "Review in Mail" },
  failedTitle: {
    id: "mail-connect.scan.failedTitle",
    defaultMessage: "We couldn't finish scanning {address}.",
  },
  failedBody: {
    id: "mail-connect.scan.failedBody",
    defaultMessage: "Your account is connected and we'll keep checking new mail.",
  },
  retry: { id: "mail-connect.scan.retry", defaultMessage: "Try the scan again" },
  retrying: { id: "mail-connect.scan.retrying", defaultMessage: "Starting the scan…" },
  retryFailed: {
    id: "mail-connect.scan.retryFailed",
    defaultMessage: "The scan didn't start. Check your connection and try again in a moment.",
  },
});

const STAGES: readonly MailBackfillStage[] = ["scanning", "classifying", "matching", "preparing"];

const STAGE_LABELS: Readonly<Record<MailBackfillStage, MessageDescriptor>> = defineMessages({
  scanning: { id: "mail-connect.scan.stage.scanning", defaultMessage: "Checking the last {days} days" },
  classifying: { id: "mail-connect.scan.stage.classifying", defaultMessage: "Finding job-related emails" },
  matching: { id: "mail-connect.scan.stage.matching", defaultMessage: "Matching companies and roles" },
  preparing: { id: "mail-connect.scan.stage.preparing", defaultMessage: "Preparing your review" },
});

type StageState = "done" | "current" | "pending" | "stopped";

function stageState(backfill: MailBackfill, index: number): StageState {
  if (backfill.state === "done") return "done";
  if (backfill.state === "queued") return index === 0 ? "current" : "pending";
  const current = STAGES.indexOf(backfill.stage);
  if (index < current) return "done";
  if (index > current) return "pending";
  return backfill.state === "failed" ? "stopped" : "current";
}

function checkedText(backfill: MailBackfill, intl: IntlShape): string {
  return backfill.total === null
    ? intl.formatMessage(messages.checked, { count: backfill.scanned })
    : intl.formatMessage(messages.checkedOf, { scanned: backfill.scanned, total: backfill.total });
}

/** The summary headline: applications (and invites), invites alone, or none found. */
function foundText(backfill: MailBackfill, intl: IntlShape): string {
  if (backfill.applications > 0)
    return intl.formatMessage(messages.found, { apps: backfill.applications, invites: backfill.interviewInvites });
  if (backfill.interviewInvites > 0)
    return intl.formatMessage(messages.foundInvites, { invites: backfill.interviewInvites });
  return intl.formatMessage(messages.foundNone, { days: backfill.lookbackDays });
}

function StageIcon({ state }: { readonly state: StageState }) {
  const box = "flex size-5 shrink-0 items-center justify-center rounded-full";
  if (state === "done")
    return (
      <span aria-hidden="true" className={cx(box, "bg-accent-solid text-fg-on-accent")}>
        <Check className="size-3" strokeWidth={2.5} />
      </span>
    );
  if (state === "current")
    return (
      <span aria-hidden="true" className={cx(box, "text-accent-text")}>
        <LoaderCircle className="size-4 motion-safe:animate-spin" strokeWidth={2} />
      </span>
    );
  if (state === "stopped")
    return (
      <span aria-hidden="true" className={cx(box, "text-warning-text")}>
        <CircleAlert className="size-4" strokeWidth={2} />
      </span>
    );
  return <span aria-hidden="true" className={cx(box, "border-line-control border-[1.5px]")} />;
}

function ProgressBar({ backfill, compact }: { readonly backfill: MailBackfill; readonly compact: boolean }) {
  const intl = useIntl();
  const fraction = backfill.total ? Math.min(backfill.scanned / backfill.total, 1) : null;
  return (
    <div
      role="progressbar"
      aria-label={intl.formatMessage(messages.progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={checkedText(backfill, intl)}
      {...(fraction !== null && { "aria-valuenow": Math.round(fraction * 100) })}
      className={cx("bg-line-subtle overflow-hidden rounded-full", compact ? "h-1" : "h-1.5")}
    >
      <div
        className={
          fraction === null
            ? "bg-accent-solid h-full w-1/3 rounded-full motion-safe:animate-pulse"
            : "bg-accent-solid h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
        }
        style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  );
}

/** "Try the scan again" with its own busy and failed states. */
function useRetry(account: MailAccount) {
  const repository = useMailRepository();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const retry = () => {
    setState("busy");
    repository.backfillStart(account.id, lookbackOf(account)).then(
      () => setState("idle"),
      () => setState("failed"),
    );
  };
  return { state, retry };
}

export function ScanProgress({
  account,
  variant,
  onReview,
}: {
  readonly account: MailAccount;
  readonly variant: "full" | "compact";
  /** Called before "Review in Mail" navigates (the dialog closes itself). */
  readonly onReview?: () => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const retry = useRetry(account);
  const backfill = account.backfill;
  if (backfill === null) return null;
  const days = backfill.lookbackDays;
  const running = backfill.state === "queued" || backfill.state === "running";
  const review = () => {
    onReview?.();
    void navigate({ to: "/mail", search: { folder: "review" } });
  };
  const failedTitle = intl.formatMessage(messages.failedTitle, { address: account.address });
  const failedBody = intl.formatMessage(messages.failedBody);
  const retryButton = (
    <Button
      size={variant === "compact" ? "sm" : "md"}
      loading={retry.state === "busy"}
      loadingLabel={intl.formatMessage(messages.retrying)}
      onClick={retry.retry}
    >
      {intl.formatMessage(messages.retry)}
    </Button>
  );
  const retryFailed = retry.state === "failed" && (
    <p role="alert" className="text-fg-secondary text-footnote">
      {intl.formatMessage(messages.retryFailed)}
    </p>
  );
  // Stage changes and the result are announced; the counter is not (it ticks too often).
  const currentStage = STAGES.findIndex((_, index) => stageState(backfill, index) === "current");
  const announcement =
    backfill.state === "done"
      ? foundText(backfill, intl)
      : backfill.state === "failed"
        ? failedTitle
        : variant === "full" && currentStage !== -1
          ? intl.formatMessage(STAGE_LABELS[STAGES[currentStage] ?? "scanning"], { days })
          : "";
  const live = (
    <p aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (variant === "compact") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        {live}
        {running && (
          <>
            <p className="text-fg-secondary text-footnote flex min-w-0 items-center gap-1.5 tabular-nums">
              <LoaderCircle aria-hidden="true" className="text-accent-text size-3.5 shrink-0 motion-safe:animate-spin" />
              <span className="min-w-0">
                {intl.formatMessage(STAGE_LABELS[backfill.state === "queued" ? "scanning" : backfill.stage], { days })}
                {" · "}
                {checkedText(backfill, intl)}
              </span>
            </p>
            <ProgressBar backfill={backfill} compact />
          </>
        )}
        {backfill.state === "done" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-fg-primary text-footnote">{foundText(backfill, intl)}</p>
            {backfill.pendingReview > 0 && (
              <Button size="sm" onClick={review}>
                {intl.formatMessage(messages.review)}
              </Button>
            )}
          </div>
        )}
        {backfill.state === "failed" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-fg-secondary text-footnote">
              {failedTitle} {failedBody}
            </p>
            {retryButton}
          </div>
        )}
        {retryFailed}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {live}
      {backfill.state === "done" ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-title3 text-fg-primary">{foundText(backfill, intl)}</p>
          <p className="text-fg-secondary text-callout">
            {backfill.applications > 0 || backfill.interviewInvites > 0
              ? intl.formatMessage(messages.from, { days, address: account.address })
              : intl.formatMessage(messages.noneBody)}
          </p>
          {backfill.jobAlerts > 0 && (
            <p className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.alerts, { count: backfill.jobAlerts })}
            </p>
          )}
          {backfill.pendingReview > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-fg-primary text-callout">
                {intl.formatMessage(messages.pending, { count: backfill.pendingReview })}
              </p>
              <Button variant="primary" onClick={review}>
                {intl.formatMessage(messages.review)}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <ol aria-label={intl.formatMessage(messages.stages)} className="flex flex-col gap-3">
            {STAGES.map((stage, index) => {
              const state = stageState(backfill, index);
              const caption =
                index === 0 && backfill.state === "queued"
                  ? intl.formatMessage(messages.queued)
                  : stage === "scanning" && state !== "pending"
                    ? checkedText(backfill, intl)
                    : stage === "classifying" && state !== "pending" && backfill.jobMessages > 0
                      ? intl.formatMessage(messages.jobSoFar, { count: backfill.jobMessages })
                      : null;
              return (
                <li key={stage} className="flex items-start gap-3">
                  <StageIcon state={state} />
                  <div className="min-w-0">
                    <p
                      className={cx(
                        "text-callout",
                        state === "pending" ? "text-fg-tertiary" : "text-fg-primary",
                        state === "current" && "font-medium",
                      )}
                    >
                      {intl.formatMessage(STAGE_LABELS[stage], { days })}
                      <span className="sr-only">
                        {", "}
                        {intl.formatMessage(
                          state === "done"
                            ? messages.stageDone
                            : state === "current"
                              ? messages.stageCurrent
                              : state === "stopped"
                                ? messages.stageStopped
                                : messages.stagePending,
                        )}
                      </span>
                    </p>
                    {caption !== null && (
                      <p className="text-fg-secondary text-footnote tabular-nums">{caption}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {running && (
            <div className="flex flex-col gap-2">
              <ProgressBar backfill={backfill} compact={false} />
              <p className="text-fg-secondary text-footnote tabular-nums">
                {checkedText(backfill, intl)}
                {" · "}
                {intl.formatMessage(messages.appsSoFar, { count: backfill.applications })}
              </p>
              <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.leave)}</p>
            </div>
          )}
          {backfill.state === "failed" && (
            <div className="bg-warning-subtle border-warning-solid/40 flex flex-col items-start gap-3 rounded-md border px-3 py-3">
              <div>
                <p className="text-fg-primary text-callout font-medium">{failedTitle}</p>
                <p className="text-fg-secondary text-callout">{failedBody}</p>
              </div>
              {retryButton}
            </div>
          )}
        </>
      )}
      {retryFailed}
    </div>
  );
}
