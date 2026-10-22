/**
 * `TimelineRow` (components.md "Tracker" `Timeline`, tracker.md "Timeline"): one event of an
 * application's history on a thin rail with a type icon. Automatic moves name their actor, show
 * the reason and offer durable Undo while they are the latest move (decisions.md D11).
 */
import {
  ArrowRightLeft,
  CalendarClock,
  Inbox,
  Plus,
  Send,
  StickyNote,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import type { TimelineEventKind, TimelineEventVM } from "../model/blocks";
import { cx } from "../cx";
import { Button } from "./Button";
import { ReasonLine } from "./ProposalSentence";
import { RelativeTimeChip } from "./RelativeTimeChip";
import { SourceTag } from "./SourceTag";
import { StatusPill } from "./StatusPill";
import { SyncGlyph } from "./SyncGlyph";

const KIND_ICONS: Readonly<Record<TimelineEventKind, LucideIcon>> = {
  created: Plus,
  status: ArrowRightLeft,
  note: StickyNote,
  mailReceived: Inbox,
  mailSent: Send,
  interview: CalendarClock,
};

export interface TimelineRowProps {
  /** The event (`timelineVMs`, newest first). */
  event: TimelineEventVM;
  /** Reverts an automatic move. Shown only while `event.undo.available` and not yet undone. */
  onUndo?: () => void;
  /** Opens the email behind the event. Shown only when `event.mailMessageId` is set. */
  onViewSource?: () => void;
  /** Hides the rail below the icon (the oldest row). */
  last?: boolean;
  className?: string;
}

/**
 * A list item (render inside an `<ol>`): rail + type icon, title, actor (`SourceTag`), time, the
 * from → to pills of a move, the detail text, the reason of an automatic move, then Undo or the
 * can't-undo line. An undone move is muted and tagged "Undone" (status names are never struck
 * through, so they stay readable).
 */
export function TimelineRow({ event, onUndo, onViewSource, last = false, className }: TimelineRowProps) {
  const titleId = useId();
  const Icon = KIND_ICONS[event.kind];
  const muted = event.reverted;
  const viewSource = event.mailMessageId !== null ? onViewSource : undefined;
  return (
    <li className={cx("relative flex gap-3 pb-4", className)}>
      <div aria-hidden="true" className="relative flex w-6 shrink-0 justify-center">
        {!last && <span className="bg-line-subtle absolute top-7 bottom-0 w-px" />}
        <span
          className={cx(
            "bg-surface-sunken flex size-6 items-center justify-center rounded-full",
            muted ? "text-fg-tertiary" : "text-fg-secondary",
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            id={titleId}
            className={cx("text-callout font-medium", muted ? "text-fg-secondary" : "text-fg-primary")}
          >
            {event.title}
          </p>
          {event.reverted && (
            <span className="border-line-control text-fg-secondary text-caption1 rounded-xs border px-1.5 font-medium">
              Undone
            </span>
          )}
          <SourceTag source={event.source} />
          <RelativeTimeChip time={event.at} />
          {event.pendingSync && <SyncGlyph />}
        </div>

        {event.move && (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={event.move.from} size="sm" />
            <span aria-hidden="true" className="text-fg-tertiary text-footnote">
              →
            </span>
            <span className="sr-only">to</span>
            <StatusPill status={event.move.to} size="sm" />
          </div>
        )}

        {event.detail !== null && (
          <p
            className={cx(
              "text-callout text-pretty whitespace-pre-line",
              muted ? "text-fg-tertiary" : "text-fg-secondary",
            )}
          >
            {event.detail}
          </p>
        )}

        {event.reason !== null && <ReasonLine reason={event.reason} />}

        {(event.undo !== null || viewSource) && (
          <div className="flex flex-wrap items-center gap-2">
            {event.undo !== null &&
              !event.reverted &&
              (event.undo.available ? (
                onUndo && (
                  <Button
                    size="sm"
                    icon={Undo2}
                    hint={event.move ? `Move back to ${event.move.from.label}` : undefined}
                    aria-describedby={titleId}
                    onClick={onUndo}
                  >
                    Undo
                  </Button>
                )
              ) : (
                <p className="text-footnote text-fg-tertiary">{event.undo.reason}</p>
              ))}
            {viewSource && (
              <Button size="sm" variant="plain" aria-describedby={titleId} onClick={viewSource}>
                View source
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
