/**
 * `ClosedRail` (components.md "Tracker", tracker.md "Closed rail"): a slim rail pinned to the
 * board's right edge with the per-outcome counts (Basecamp "Not now / Done"). Clicking it shows the
 * five outcome columns; while a card is dragged it opens into five labelled drop zones, so a closed
 * outcome is always one drop away. Outcomes stay neutral grey: "Not selected" is never red.
 */
import { useDroppable } from "@dnd-kit/core";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import type { StatusVM } from "../../shared/model/types";
import { Hint } from "../../shared/ui/Hint";
import { STATUS_DOT } from "./BoardColumn";
import type { ClosedRailVM, TrackerCardVM } from "./model";

const messages = defineMessages({
  show: { id: "tracker-board.closed.show", defaultMessage: "Show closed applications" },
  hide: { id: "tracker-board.closed.hide", defaultMessage: "Hide closed applications" },
  zonesLabel: {
    id: "tracker-board.closed.zonesLabel",
    defaultMessage: "Close as",
    description: "Heading above the five outcome drop zones while dragging a card",
  },
  transition: {
    id: "tracker-board.closed.transition",
    defaultMessage: "{from} → {to}",
    description: "Outcome drop zone while hovered: the move the drop will make",
  },
});

function DropZone({
  status,
  countLabel,
  card,
  over,
}: {
  status: StatusVM;
  countLabel: string;
  card: TrackerCardVM;
  over: boolean;
}) {
  const intl = useIntl();
  const { setNodeRef } = useDroppable({ id: status.key });
  const target = card.moves.find((move) => move.status.key === status.key);
  const reason = target?.disabledReason ?? null;
  const current = target?.current === true;
  return (
    <div
      ref={setNodeRef}
      className={cx(
        "flex min-h-0 flex-1 flex-col justify-center gap-1 rounded-md border px-3 transition-colors duration-(--bfhr-duration-fast) ease-standard",
        reason !== null || current
          ? "border-line-subtle opacity-60"
          : over
            ? "bg-surface-selected border-accent-solid border-2"
            : "border-line-control bg-surface-base border-dashed",
      )}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", STATUS_DOT[status.key])} />
        <span className="text-fg-primary text-callout font-medium">{status.label}</span>
        <span className="text-fg-secondary ms-auto text-footnote tabular-nums">{countLabel}</span>
      </span>
      {reason === null && over && (
        <span className="text-accent-text text-footnote font-medium">
          {intl.formatMessage(messages.transition, { from: card.status.label, to: status.label })}
        </span>
      )}
    </div>
  );
}

export interface ClosedRailProps {
  rail: ClosedRailVM | null;
  /** The outcome columns are shown on the board. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** The card being dragged, when the rail should open into drop zones. */
  dragging: TrackerCardVM | null;
  overId: string | null;
  /** "Closed" label for loading / error, when there's no rail model. */
  fallbackLabel: string;
}

export function ClosedRail({
  rail,
  expanded,
  onExpandedChange,
  dragging,
  overId,
  fallbackLabel,
}: ClosedRailProps) {
  const intl = useIntl();
  const label = rail?.label ?? fallbackLabel;
  // A refused zone's reason sits above the zones: the dragged card covers the zone itself.
  const hoveredReason = rail?.outcomes.some((outcome) => outcome.status.key === overId)
    ? (dragging?.moves.find((move) => move.status.key === overId)?.disabledReason ?? null)
    : null;
  const zones =
    dragging && rail && !expanded ? (
      // Overlays the board's right edge instead of widening the rail, so no column shifts under
      // the pointer mid-drag.
      <section
        aria-label={intl.formatMessage(messages.zonesLabel)}
        className="bg-surface-sunken border-line-subtle shadow-overlay absolute inset-y-0 end-0 z-(--bfhr-layer-sticky) flex w-68 flex-col gap-2 rounded-lg border p-2"
      >
        <h2 className="text-fg-primary px-1 pt-0.5 text-callout font-semibold">
          {intl.formatMessage(messages.zonesLabel)}
        </h2>
        <p className="text-fg-secondary min-h-9 px-1 text-footnote">{hoveredReason}</p>
        {rail.outcomes.map((outcome) => (
          <DropZone
            key={outcome.status.key}
            status={outcome.status}
            countLabel={outcome.countLabel}
            card={dragging}
            over={overId === outcome.status.key}
          />
        ))}
      </section>
    ) : null;

  return (
    <div className="relative flex shrink-0">
      {zones}
      <Hint label={intl.formatMessage(expanded ? messages.hide : messages.show)} side="left">
        <button
          type="button"
          disabled={rail === null}
          aria-expanded={expanded}
          // Named by its content (a spoken sentence), not `aria-label`, so the name contains the
          // visible words (WCAG 2.5.3).
          onClick={() => onExpandedChange(!expanded)}
          className={cx(
            "bg-surface-sunken hover:bg-surface-hover flex w-10 shrink-0 cursor-default flex-col items-center gap-3 overflow-hidden rounded-lg py-3",
            expanded && "bg-surface-selected",
          )}
        >
          <span className="sr-only">{rail?.accessibleLabel ?? label}</span>
          <span aria-hidden="true" className="bg-phase-closed-solid size-2 shrink-0 rounded-full" />
          <span aria-hidden="true" className="text-fg-secondary text-footnote font-medium tabular-nums">
            {rail?.countLabel ?? "–"}
          </span>
          <span
            aria-hidden="true"
            className="text-fg-primary text-callout font-semibold [writing-mode:vertical-rl]"
          >
            {label}
          </span>
          {rail?.outcomes
            .filter((outcome) => outcome.count > 0)
            .map((outcome) => (
              <span
                key={outcome.status.key}
                aria-hidden="true"
                className="text-fg-secondary text-footnote whitespace-nowrap [writing-mode:vertical-rl]"
              >
                {outcome.status.label} <span className="tabular-nums">{outcome.countLabel}</span>
              </span>
            ))}
        </button>
      </Hint>
    </div>
  );
}
