/**
 * `BulkActionBar` (components.md; Hex): floats at the bottom of the table while rows are selected.
 * "3 selected" · Set status (the same "Move to…" menu as a status pill, refused targets greyed with
 * their reason) · Export CSV · Clear (Esc). A move writes one event per application and the toast
 * offers one Undo for all of them (useStatusMoves).
 */
import {
  ACTIVE_STATUSES,
  type ApplicationStatus,
  statusPhase,
  type StatusPhase,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import { ArrowRight, Download, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment } from "react";
import { defineMessages, useIntl } from "react-intl";
import { PHASE_MESSAGES, STATUS_MESSAGES } from "../../shared/model/vocabulary";
import { Button, IconButton } from "../../shared/ui/Button";
import { MenuContent, MenuItem, MenuLabel, MenuSeparator } from "../../shared/ui/Menu";

const messages = defineMessages({
  bar: { id: "tracker-table.bulk.bar", defaultMessage: "Selected applications" },
  count: {
    id: "tracker-table.bulk.count",
    defaultMessage: "{count} selected",
  },
  setStatus: { id: "tracker-table.bulk.setStatus", defaultMessage: "Set status" },
  menu: { id: "tracker-table.bulk.menu", defaultMessage: "Set status for the selected applications" },
  moveCount: {
    id: "tracker-table.bulk.moveCount",
    defaultMessage: "{label} · {count}",
    description: "Bulk status menu item: status label and how many selected applications can move there",
  },
  noneCanMove: {
    id: "tracker-table.bulk.noneCanMove",
    defaultMessage: "None of the selected applications can move here.",
  },
  exportCsv: { id: "tracker-table.bulk.exportCsv", defaultMessage: "Export CSV" },
  clear: { id: "tracker-table.bulk.clear", defaultMessage: "Clear selection" },
});

const PHASES: readonly StatusPhase[] = ["shortlist", "in_progress", "closed"];
const ALL_STATUSES: readonly ApplicationStatus[] = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

export function BulkActionBar({
  count,
  movableCount,
  onMove,
  onExport,
  onClear,
  menuOpen,
  onMenuOpenChange,
}: {
  count: number;
  /** The Set status menu, controlled so `M` opens it while rows are selected. */
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  /** How many selected applications may move to each status (`planBulkMove`). */
  movableCount: (to: ApplicationStatus) => number;
  onMove: (to: ApplicationStatus) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const intl = useIntl();
  return (
    <div
      role="toolbar"
      aria-label={intl.formatMessage(messages.bar)}
      className="bg-surface-elevated border-line-subtle shadow-overlay pointer-events-auto flex items-center gap-2 rounded-lg border py-1.5 ps-4 pe-1.5"
    >
      <span className="text-callout pe-2 font-medium tabular-nums" aria-live="polite">
        {intl.formatMessage(messages.count, { count })}
      </span>
      <DropdownMenu.Root open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenu.Trigger asChild>
          <Button icon={ArrowRight} shortcut="M">
            {intl.formatMessage(messages.setStatus)}
          </Button>
        </DropdownMenu.Trigger>
        <MenuContent aria-label={intl.formatMessage(messages.menu)} side="top">
          {PHASES.map((phase, index) => (
            <Fragment key={phase}>
              {index > 0 && <MenuSeparator />}
              <MenuLabel>{intl.formatMessage(PHASE_MESSAGES[phase])}</MenuLabel>
              {ALL_STATUSES.filter((status) => statusPhase(status) === phase).map((status) => {
                const movable = movableCount(status);
                const label = intl.formatMessage(STATUS_MESSAGES[status]);
                return (
                  <MenuItem
                    key={status}
                    disabledReason={movable === 0 ? intl.formatMessage(messages.noneCanMove) : null}
                    onSelect={() => onMove(status)}
                  >
                    {movable === count
                      ? label
                      : intl.formatMessage(messages.moveCount, { label, count: movable })}
                  </MenuItem>
                );
              })}
            </Fragment>
          ))}
        </MenuContent>
      </DropdownMenu.Root>
      <Button icon={Download} onClick={onExport}>
        {intl.formatMessage(messages.exportCsv)}
      </Button>
      <IconButton icon={X} label={intl.formatMessage(messages.clear)} shortcut="Escape" onClick={onClear} />
    </div>
  );
}
