/**
 * `RecordHeader` + `StageProgressStrip` (research/tracker.md "Record detail", components table):
 * monogram, role, company and location, the status pill that opens "Move to…" (`M`, D16 reasons
 * on refused targets), how long the application has had that status, one next-action button,
 * "Open posting" when the job has a link, the user's reminder line (the panel; the page has its
 * Reminders section) and the stage strip. The full page passes its `ScreenTitle` as the title;
 * the side panel a plain heading and the compact strip.
 */
import type { ApplicationStatus } from "@bfhr/core";
import { BellRing, Check, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { InteractiveStatusPill } from "../../shared/ui/StatusPill";
import type { HeaderVM, NextActionVM, ReminderVM, StageProgressVM } from "./model";

const messages = defineMessages({
  openPosting: { id: "application-detail.header.openPosting", defaultMessage: "Open posting" },
  openPostingHint: {
    id: "application-detail.header.openPostingHint",
    defaultMessage: "Opens the job posting in your browser",
  },
  reminder: {
    id: "application-detail.header.reminder",
    defaultMessage: "Reminder: <b>{action}</b>",
    description: "Header line with the user's own reminder",
  },
  due: {
    id: "application-detail.header.due",
    defaultMessage: "Due",
    description: "Before a time: 'Due in 6 days'",
  },
  stages: { id: "application-detail.header.stages", defaultMessage: "Stages" },
  done: {
    id: "application-detail.header.stepDone",
    defaultMessage: "done",
    description: "Screen-reader state of a past stage",
  },
  current: {
    id: "application-detail.header.stepCurrent",
    defaultMessage: "current",
    description: "Screen-reader state of the current stage",
  },
});

export interface RecordHeaderProps {
  header: HeaderVM;
  progress: StageProgressVM;
  nextAction: NextActionVM | null;
  /** The user's reminder as a line under the status (the panel); omit where it has a section. */
  reminder?: ReminderVM;
  /** The page's `ScreenTitle`, or the panel's heading. */
  title: ReactNode;
  /** The posting's link (`usePostingUrl`); "Open posting" shows only with one. */
  postingUrl: string | null;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMove: (to: ApplicationStatus) => void;
  onNextAction: (action: NextActionVM) => void;
  onOpenPosting: (url: string) => void;
  /** The side panel: smaller monogram, the segmented strip with its sentence. */
  compact?: boolean;
}

export function RecordHeader({
  header,
  progress,
  nextAction,
  reminder,
  title,
  postingUrl,
  menuOpen,
  onMenuOpenChange,
  onMove,
  onNextAction,
  onOpenPosting,
  compact = false,
}: RecordHeaderProps) {
  const intl = useIntl();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Monogram company={header.company} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          {title}
          <p className="text-fg-secondary text-callout">
            {header.location === null ? header.company.name : `${header.company.name} · ${header.location}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InteractiveStatusPill
          status={header.status}
          pendingSync={header.pendingSync}
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
          onSelect={onMove}
        />
        <span className="text-fg-secondary text-footnote">{header.inStatus}</span>
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {postingUrl !== null && (
            <Button
              size={compact ? "sm" : "md"}
              icon={ExternalLink}
              hint={intl.formatMessage(messages.openPostingHint)}
              onClick={() => onOpenPosting(postingUrl)}
            >
              {intl.formatMessage(messages.openPosting)}
            </Button>
          )}
          {nextAction && !compact && (
            <Button variant="primary" shortcut="Mod+Enter" onClick={() => onNextAction(nextAction)}>
              {nextAction.label}
            </Button>
          )}
        </span>
      </div>

      {reminder !== undefined && reminder.label !== null && (
        <p className="bg-surface-sunken text-fg-secondary text-callout flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2">
          <BellRing aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          <span>
            {intl.formatMessage(messages.reminder, {
              action: reminder.label,
              b: (chunks) => <span className="text-fg-primary font-medium">{chunks}</span>,
            })}
          </span>
          {reminder.due && <RelativeTimeChip time={reminder.due} prefix={intl.formatMessage(messages.due)} />}
        </p>
      )}

      {compact ? <CompactStrip progress={progress} /> : <StageStrip progress={progress} />}
    </header>
  );
}

/** Past ✓ / current / future as labelled steps; a closed application ends with its outcome. */
function StageStrip({ progress }: { progress: StageProgressVM }) {
  const intl = useIntl();
  return (
    <div>
      <p className="sr-only">{progress.summary}</p>
      <ol aria-label={intl.formatMessage(messages.stages)} className="flex items-start">
        {progress.steps.map((step, index) => {
          const first = index === 0;
          const closedEnd = progress.closed && step.state === "current";
          return (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
            >
              <span aria-hidden="true" className="relative flex w-full items-center justify-center">
                {!first && (
                  <span
                    className={cx(
                      "absolute end-1/2 h-px w-full",
                      step.state === "upcoming" ? "bg-line-subtle" : "bg-line-control",
                    )}
                  />
                )}
                <span
                  className={cx(
                    "relative flex size-5 items-center justify-center rounded-full",
                    step.state === "done" && "bg-surface-sunken text-fg-secondary",
                    step.state === "current" &&
                      (closedEnd
                        ? "bg-phase-closed-solid text-fg-on-accent"
                        : "bg-accent-solid text-fg-on-accent"),
                    step.state === "upcoming" && "bg-surface-base border-line-control border",
                  )}
                >
                  {step.state === "done" && <Check className="size-3" strokeWidth={2.25} />}
                  {step.state === "current" && <span className="bg-surface-base size-1.5 rounded-full" />}
                </span>
              </span>
              <span
                className={cx(
                  "text-caption1 px-0.5 text-pretty break-words",
                  step.state === "current" ? "text-fg-primary font-semibold" : "text-fg-secondary",
                )}
              >
                {step.label}
                {step.state !== "upcoming" && (
                  <span className="sr-only">
                    {", "}
                    {intl.formatMessage(step.state === "done" ? messages.done : messages.current)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The panel's strip: one segment per stage and the sentence ("Stage 6 of 7: Interviewing"). */
function CompactStrip({ progress }: { progress: StageProgressVM }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex gap-1">
        {progress.steps.map((step) => (
          <span
            key={step.key}
            className={cx(
              "h-1 flex-1 rounded-full",
              step.state === "upcoming"
                ? "bg-surface-sunken"
                : step.state === "current" && progress.closed
                  ? "bg-phase-closed-solid"
                  : step.state === "current"
                    ? "bg-accent-solid"
                    : "bg-line-control",
            )}
          />
        ))}
      </div>
      <p className="text-fg-secondary text-footnote">{progress.summary}</p>
    </div>
  );
}
