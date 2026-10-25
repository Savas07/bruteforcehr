/**
 * `BoardColumn` (components.md "Tracker", tracker.md "Board" + "Drag between columns"): header with
 * dot, label, count and "oldest 18 d", a full-height well that is the drop target, and a collapse
 * control that shows on column hover and keyboard focus. Collapsed (empty columns by default) it
 * becomes a 40 px rail that still accepts drops.
 * While a card is dragged over it, the well tints and the header states the transition
 * ("Applied → Screening"); targets the state machine refuses are greyed with the reason.
 */
import type { ApplicationStatus } from "@bfhr/core";
import { useDroppable } from "@dnd-kit/core";
import { ChevronsLeft } from "lucide-react";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import type { StatusVM } from "../../shared/model/types";
import { IconButton } from "../../shared/ui/Button";
import { Hint } from "../../shared/ui/Hint";

const messages = defineMessages({
  collapse: { id: "tracker-board.column.collapse", defaultMessage: "Collapse {status}" },
  expand: {
    id: "tracker-board.column.expand",
    defaultMessage: "Show {column}",
    description: "Collapsed column rail button; {column} is e.g. 'Offer, 0 applications'",
  },
  transition: {
    id: "tracker-board.drag.transition",
    defaultMessage: "{from} → {to}",
    description: "Drop target header while dragging: the move the drop will make",
  },
  dropHere: {
    id: "tracker-board.drag.dropHere",
    defaultMessage: "Drop here to move to {status}",
  },
  countUnknown: {
    id: "tracker-board.column.countUnknown",
    defaultMessage: "Count not loaded yet",
    description: "Screen-reader text for the '–' count while loading or after an error",
  },
});

/** Dot color per status: phase tones, closed outcomes grey (system.md). */
export const STATUS_DOT: Readonly<Record<ApplicationStatus, string>> = {
  saved: "bg-status-saved-solid",
  preparing: "bg-status-preparing-solid",
  applied: "bg-status-applied-solid",
  acknowledged: "bg-status-acknowledged-solid",
  screening: "bg-status-screening-solid",
  interviewing: "bg-status-interviewing-solid",
  offer: "bg-status-offer-solid",
  accepted: "bg-status-accepted-solid",
  declined: "bg-status-declined-solid",
  rejected: "bg-status-rejected-solid",
  withdrawn: "bg-status-withdrawn-solid",
  ghosted: "bg-status-ghosted-solid",
};

/** What the column is to the card being dragged. */
export type DropRole =
  | { readonly kind: "none" }
  | { readonly kind: "source" }
  | { readonly kind: "valid"; readonly over: boolean; readonly from: StatusVM }
  | { readonly kind: "invalid"; readonly over: boolean; readonly reason: string };

export interface BoardColumnProps {
  status: StatusVM;
  /** "3"; null renders "–" (loading, error). */
  countLabel: string | null;
  accessibleLabel: string;
  /** "oldest 18 d" (visible) and its spoken form. */
  oldest: { readonly label: string; readonly accessibleLabel: string } | null;
  collapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  drop: DropRole;
  /** Card list items (and the drop placeholder). */
  children?: ReactNode;
  /** Muted line inside an empty well ("No applications"). */
  emptyLine?: string | null;
  /** Below the list: the first-use "+ Add" row. */
  footer?: ReactNode;
  /**
   * Share the board's width (up to 272 px) instead of the fixed 272 px: for boards with nothing
   * to scroll to (first use, load error), so they never overflow.
   */
  fluid?: boolean;
}

export function BoardColumn({
  status,
  countLabel,
  accessibleLabel,
  oldest,
  collapsed,
  onCollapsedChange,
  drop,
  children,
  emptyLine = null,
  footer,
  fluid = false,
}: BoardColumnProps) {
  const intl = useIntl();
  const { setNodeRef } = useDroppable({ id: status.key });
  const over = (drop.kind === "valid" || drop.kind === "invalid") && drop.over;
  const wellTone = cx(
    "bg-surface-sunken rounded-lg transition-colors duration-(--bfhr-duration-fast) ease-standard",
    drop.kind === "valid" && over && "bg-surface-selected ring-accent-solid ring-2 ring-inset",
    drop.kind === "valid" && !over && "ring-line-control ring-1 ring-inset",
    drop.kind === "invalid" && "opacity-60",
  );
  const count =
    countLabel === null ? (
      <>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{intl.formatMessage(messages.countUnknown)}</span>
      </>
    ) : (
      <span aria-hidden="true">{countLabel}</span>
    );

  if (collapsed) {
    const rail = (
      <button
        type="button"
        aria-expanded={false}
        // Named by its content, not `aria-label`, so the name contains the visible words (WCAG 2.5.3).
        onClick={() => onCollapsedChange?.(false)}
        className="hover:bg-surface-hover flex min-h-0 w-full flex-1 cursor-default flex-col items-center gap-2 rounded-lg py-3"
      >
        <span className="sr-only">{intl.formatMessage(messages.expand, { column: accessibleLabel })}</span>
        <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", STATUS_DOT[status.key])} />
        <span aria-hidden="true" className="text-fg-secondary text-footnote font-medium tabular-nums">
          {countLabel ?? "–"}
        </span>
        <span
          aria-hidden="true"
          className="text-fg-primary text-callout font-medium [writing-mode:vertical-rl]"
        >
          {status.label}
        </span>
      </button>
    );
    return (
      <section
        ref={setNodeRef}
        aria-label={accessibleLabel}
        className={cx("flex w-10 shrink-0 flex-col", wellTone)}
      >
        {drop.kind === "invalid" ? <Hint label={drop.reason}>{rail}</Hint> : rail}
      </section>
    );
  }

  const subLine =
    drop.kind === "valid" && over ? (
      <span className="text-accent-text font-medium">
        {intl.formatMessage(messages.transition, { from: drop.from.label, to: status.label })}
      </span>
    ) : drop.kind === "invalid" ? (
      <span>{drop.reason}</span>
    ) : oldest ? (
      <>
        <span aria-hidden="true">{oldest.label}</span>
        <span className="sr-only">{oldest.accessibleLabel}</span>
      </>
    ) : null;

  return (
    <section
      ref={setNodeRef}
      aria-label={accessibleLabel}
      className={cx(
        "group/column flex min-h-0 flex-col",
        // Fluid columns never shrink below their header's longest word (flex `min-width: auto`), so
        // labels wrap only between words; narrower than that, the board scrolls.
        fluid ? "max-w-68 flex-1 basis-0" : "w-68 shrink-0",
        wellTone,
      )}
    >
      <header className="group/header flex flex-col gap-0.5 px-3 pt-2.5 pb-2">
        <div className="flex min-h-6 items-start gap-2">
          <span
            aria-hidden="true"
            className={cx("mt-1.5 size-2 shrink-0 rounded-full", STATUS_DOT[status.key])}
          />
          <h2 className={cx("text-fg-primary text-callout font-semibold text-balance", !fluid && "min-w-0")}>
            {status.label}
          </h2>
          <span className="text-fg-secondary mt-px text-footnote font-medium tabular-nums">{count}</span>
          {onCollapsedChange && (
            <IconButton
              icon={ChevronsLeft}
              size="sm"
              label={intl.formatMessage(messages.collapse, { status: status.label })}
              aria-expanded={true}
              onClick={() => onCollapsedChange(true)}
              // Shown only on column hover and keyboard focus (checkpoint-m0 decision Q8); opacity, not
              // display, so it stays in the Tab order and the header never shifts.
              className="-me-1 ms-auto opacity-0 group-hover/column:opacity-100 group-has-[:focus-visible]/header:opacity-100 focus-visible:opacity-100"
            />
          )}
        </div>
        <p className="text-fg-secondary min-h-4.5 ps-4 text-footnote">{subLine}</p>
      </header>
      {/* Its own compositing layer: WebKit then scrolls the column without repainting the other
          columns (a column of hundreds of cards held 60 fps only this way; frame work p95 56 → 6 ms
          in Playwright WebKit, docs/runbooks/performance.md). */}
      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-0.5 pb-2 will-change-transform">
        {children}
        {emptyLine !== null && drop.kind !== "valid" && (
          <li className="text-fg-secondary px-1 py-2 text-footnote">{emptyLine}</li>
        )}
        {drop.kind === "valid" && emptyLine !== null && !over && (
          <li className="text-fg-secondary px-1 py-2 text-footnote">
            {intl.formatMessage(messages.dropHere, { status: status.label })}
          </li>
        )}
      </ol>
      {footer}
    </section>
  );
}
