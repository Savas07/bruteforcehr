/**
 * The right detail panel's content (tracker.md "Record detail"): `RecordHeader` (monogram, role,
 * company, status pill that opens "Move to…", the next action), Up next (follow-up / no-response
 * nudge), the timeline with automatic changes (source, reason, Undo) and the application summary.
 */
import type { ApplicationStatus } from "@bfhr/core";
import { CalendarClock } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";
import type { TimelineEventVM } from "../../shared/model/blocks";
import { ApplicationSummaryBlock } from "../../shared/ui/ApplicationSummaryBlock";
import { Monogram } from "../../shared/ui/Company";
import { NudgeCard } from "../../shared/ui/NudgeCard";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { InteractiveStatusPill } from "../../shared/ui/StatusPill";
import { TimelineRow } from "../../shared/ui/TimelineRow";
import type { TrackerSelectionVM } from "./model";

const messages = defineMessages({
  nextAction: {
    id: "tracker-board.detail.nextAction",
    defaultMessage: "Next: <b>{action}</b>",
    description: "Detail header: the application's next to-do",
  },
  timeline: { id: "tracker-board.detail.timeline", defaultMessage: "Timeline" },
});

export interface RecordDetailProps {
  selected: TrackerSelectionVM;
  /** Hidden locally after "Not needed" / "Keep waiting". */
  nudgeHidden: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMove: (to: ApplicationStatus) => void;
  onUndoEvent: (event: TimelineEventVM) => void;
  onViewSource: (mailMessageId: string) => void;
  onNudgePrimary: () => void;
  onNudgeSecondary: () => void;
  onOpenCv: (cvId: string) => void;
}

export function RecordDetail({
  selected,
  nudgeHidden,
  menuOpen,
  onMenuOpenChange,
  onMove,
  onUndoEvent,
  onViewSource,
  onNudgePrimary,
  onNudgeSecondary,
  onOpenCv,
}: RecordDetailProps) {
  const intl = useIntl();
  const nudge = nudgeHidden ? null : selected.nudge;
  return (
    <div className="flex flex-col gap-6 px-5 pt-4 pb-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Monogram company={selected.company} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-fg-primary text-title3 font-semibold text-pretty">{selected.role}</h2>
            <p className="text-fg-secondary text-callout">
              {selected.location === null
                ? selected.company.name
                : `${selected.company.name} · ${selected.location}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InteractiveStatusPill
            status={selected.status}
            pendingSync={selected.pendingSync}
            open={menuOpen}
            onOpenChange={onMenuOpenChange}
            onSelect={onMove}
          />
        </div>
        {selected.nextAction && (
          <div className="bg-surface-sunken flex items-start gap-2 rounded-md px-3 py-2">
            <CalendarClock
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <p className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.nextAction, {
                action: selected.nextAction.label,
                b: (chunks) => <span className="text-fg-primary font-medium">{chunks}</span>,
              })}
              {selected.nextAction.due && (
                <>
                  {" · "}
                  <RelativeTimeChip time={selected.nextAction.due} />
                </>
              )}
            </p>
          </div>
        )}
      </header>

      {nudge && (
        <section className="flex flex-col gap-2" aria-labelledby="tracker-up-next">
          <h3 id="tracker-up-next" className="text-fg-primary text-headline font-semibold">
            {intl.formatMessage(messages.upNext)}
          </h3>
          <NudgeCard nudge={nudge} onPrimary={onNudgePrimary} onSecondary={onNudgeSecondary} />
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="tracker-timeline">
        <h3 id="tracker-timeline" className="text-fg-primary text-headline font-semibold">
          {intl.formatMessage(messages.timeline)}
        </h3>
        <ol>
          {selected.timeline.map((event, index) => (
            <TimelineRow
              key={event.id}
              event={event}
              last={index === selected.timeline.length - 1}
              {...(event.undo?.available && event.move ? { onUndo: () => onUndoEvent(event) } : {})}
              {...(event.mailMessageId !== null
                ? { onViewSource: () => onViewSource(event.mailMessageId ?? "") }
                : {})}
            />
          ))}
        </ol>
      </section>

      <ApplicationSummaryBlock summary={selected.summary} headingLevel={3} onOpenCv={onOpenCv} />
    </div>
  );
}
