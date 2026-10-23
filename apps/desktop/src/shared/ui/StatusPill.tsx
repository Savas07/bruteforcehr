/**
 * `StatusPill`, `InteractiveStatusPill` and `StatusMenu` (system.md "StatusPill", components.md
 * `StatusPill` / `StatusMenu`). The label is the meaning; the dot only supports it. Closed outcomes
 * use the neutral Closed tone (`rejected` reads "Not selected", never red). Targets and their
 * reasons come from `@bfhr/core` `canTransition`, so every screen offers the same moves (D16).
 */
import {
  ACTIVE_STATUSES,
  type ApplicationStatus,
  canTransition,
  statusPhase,
  type StatusPhase,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Fragment } from "react";
import { defineMessages, type IntlShape, useIntl } from "react-intl";
import { cx } from "../cx";
import { MOVE_DENIAL_MESSAGES, PHASE_MESSAGES, STATUS_MESSAGES } from "../model/vocabulary";
import type { StatusVM } from "../model/types";
import { Hint } from "./Hint";
import { Keycaps } from "./Keycaps";
import { MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator } from "./Menu";
import { SyncGlyph } from "./SyncGlyph";

const messages = defineMessages({
  status: {
    id: "shared.ui.statusPill.status",
    defaultMessage: "Status: {status}",
    description: "Screen-reader name of a status pill",
  },
  interactiveStatus: {
    id: "shared.ui.statusPill.interactiveStatus",
    defaultMessage: "Status: {status}, changes status",
    description: "Screen-reader name of a status pill button that opens the Move to menu",
  },
  changeStatus: {
    id: "shared.ui.statusPill.changeStatus",
    defaultMessage: "Change status",
    description: "Tooltip of the status pill button",
  },
  moveToMenu: {
    id: "shared.ui.statusPill.moveToMenu",
    defaultMessage: "Move to",
    description: "Accessible name of the status menu",
  },
  moveToHeading: {
    id: "shared.ui.statusPill.moveToHeading",
    defaultMessage: "Move to…",
    description: "Visible heading of the status menu",
  },
});

/** Pill background and label color per status (system.md "Status and phase tones"). */
const toneClass: Record<ApplicationStatus, string> = {
  saved: "bg-status-saved-subtle text-status-saved-text",
  preparing: "bg-status-preparing-subtle text-status-preparing-text",
  applied: "bg-status-applied-subtle text-status-applied-text",
  acknowledged: "bg-status-acknowledged-subtle text-status-acknowledged-text",
  screening: "bg-status-screening-subtle text-status-screening-text",
  interviewing: "bg-status-interviewing-subtle text-status-interviewing-text",
  offer: "bg-status-offer-subtle text-status-offer-text",
  accepted: "bg-status-accepted-subtle text-status-accepted-text",
  declined: "bg-status-declined-subtle text-status-declined-text",
  rejected: "bg-status-rejected-subtle text-status-rejected-text",
  withdrawn: "bg-status-withdrawn-subtle text-status-withdrawn-text",
  ghosted: "bg-status-ghosted-subtle text-status-ghosted-text",
};

/** 8 px dot color per status. */
const dotClass: Record<ApplicationStatus, string> = {
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

/** `sm` for dense tables (caption1), `md` for rows (callout). Interactive pills stay ≥ 24 px. */
const sizeClass: Record<"sm" | "md", string> = {
  sm: "h-5 gap-1.5 px-2 text-caption1",
  md: "h-6 gap-1.5 px-2.5 text-callout",
};

const pillClass = "inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap";

function StatusDot({ status }: { status: ApplicationStatus }) {
  return <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", dotClass[status])} />;
}

export interface StatusPillProps {
  /** Status key (tone) and its shared label ("Interviewing", "Not selected"). */
  status: StatusVM;
  /** `sm` for dense tables, `md` (default) for rows and headers. */
  size?: "sm" | "md";
  /** A local change not yet on the server: shows `SyncGlyph` after the label. */
  pendingSync?: boolean;
}

/** Static status pill: dot + label in the status tone. Screen readers hear "Status: Interviewing". */
export function StatusPill({ status, size = "md", pendingSync = false }: StatusPillProps) {
  const intl = useIntl();
  return (
    <span className={cx(pillClass, toneClass[status.key], sizeClass[size])}>
      <StatusDot status={status.key} />
      <span>
        <span aria-hidden="true">{status.label}</span>
        <span className="sr-only">{intl.formatMessage(messages.status, { status: status.label })}</span>
      </span>
      {pendingSync && <SyncGlyph />}
    </span>
  );
}

export interface InteractiveStatusPillProps extends StatusPillProps {
  /** Called with the chosen target; the screen performs the move (and offers Undo). */
  onSelect: (to: ApplicationStatus) => void;
  /** Controlled open state, so the screen can open the menu with `M` on the focused row. */
  open?: boolean | undefined;
  /** Open state changes (click, Enter, Esc, selection). */
  onOpenChange?: ((open: boolean) => void) | undefined;
}

/**
 * Status pill that opens `StatusMenu` ("Move to…"). A button named "Status: Interviewing, changes
 * status"; hover shows a ring, the tooltip shows the `M` shortcut. `M` itself is bound by the
 * screen to the focused row (IA.md); pass `open` / `onOpenChange` to drive it.
 */
export function InteractiveStatusPill({
  status,
  size = "md",
  pendingSync = false,
  onSelect,
  open,
  onOpenChange,
}: InteractiveStatusPillProps) {
  const intl = useIntl();
  return (
    // Non-modal like SnoozeMenu: no aria-hidden app behind the open menu (axe aria-hidden-focus).
    <DropdownMenu.Root
      modal={false}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
    >
      <Hint label={intl.formatMessage(messages.changeStatus)} keys="M">
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cx(
              pillClass,
              toneClass[status.key],
              sizeClass[size],
              "hover:ring-surface-hover data-[state=open]:ring-surface-selected min-h-6 cursor-default pr-1.5 transition-shadow duration-(--bfhr-duration-fast) ease-standard hover:ring-2 data-[state=open]:ring-2",
            )}
          >
            <StatusDot status={status.key} />
            <span>
              <span aria-hidden="true">{status.label}</span>
              <span className="sr-only">
                {intl.formatMessage(messages.interactiveStatus, { status: status.label })}
              </span>
            </span>
            {pendingSync && <SyncGlyph />}
            <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
          </button>
        </DropdownMenu.Trigger>
      </Hint>
      <StatusMenu current={status.key} onSelect={onSelect} />
    </DropdownMenu.Root>
  );
}

const PHASES: readonly StatusPhase[] = ["shortlist", "in_progress", "closed"];
const ALL_STATUSES: readonly ApplicationStatus[] = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

/** Why the user can't pick `to` from `current`, or null when they can (or it's the current one). */
function denialReason(current: ApplicationStatus, to: ApplicationStatus, intl: IntlShape): string | null {
  const check = canTransition(current, to, "user");
  return !check.allowed && check.reason === "outcome_requires_offer"
    ? intl.formatMessage(MOVE_DENIAL_MESSAGES[check.reason])
    : null;
}

export interface StatusMenuProps {
  /** The application's status: marked with ✓ (`aria-checked`). */
  current: ApplicationStatus;
  /** Called with the chosen target; choosing the current status does nothing. */
  onSelect: (to: ApplicationStatus) => void;
}

/**
 * "Move to…" menu content for a `DropdownMenu.Root` (used by `InteractiveStatusPill`; screens may
 * mount it under their own trigger). Every status, grouped Shortlist · In progress · Closed, the
 * current one checked; targets `canTransition` refuses stay visible, greyed, with the D16 reason.
 */
export function StatusMenu({ current, onSelect }: StatusMenuProps) {
  const intl = useIntl();
  const choose = (value: string) => {
    const to = ALL_STATUSES.find((status) => status === value);
    if (to !== undefined && to !== current) onSelect(to);
  };
  return (
    <MenuContent aria-label={intl.formatMessage(messages.moveToMenu)}>
      <MenuLabel>
        <span>{intl.formatMessage(messages.moveToHeading)}</span>
        <Keycaps keys="M" />
      </MenuLabel>
      {PHASES.map((phase, index) => (
        <Fragment key={phase}>
          {index > 0 && <MenuSeparator />}
          <MenuRadioGroup
            value={current}
            onValueChange={choose}
            label={intl.formatMessage(PHASE_MESSAGES[phase])}
          >
            {ALL_STATUSES.filter((status) => statusPhase(status) === phase).map((status) => (
              <MenuRadioItem
                key={status}
                value={status}
                leading={<StatusDot status={status} />}
                disabledReason={denialReason(current, status, intl)}
              >
                {intl.formatMessage(STATUS_MESSAGES[status])}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </Fragment>
      ))}
    </MenuContent>
  );
}
