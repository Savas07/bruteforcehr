import { CalendarClock, CalendarDays, Clock, Sunrise, type LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState, type ReactElement } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { MenuContent, MenuItem } from "./Menu";

/** The four snooze presets (decisions.md D19), in menu order. */
export type SnoozePreset = "laterToday" | "tomorrow" | "nextWeek" | "pickDate";

const PRESETS: readonly SnoozePreset[] = ["laterToday", "tomorrow", "nextWeek", "pickDate"];

/** Menu labels for the presets (D19). */
export const SNOOZE_PRESET_MESSAGES: Readonly<Record<SnoozePreset, MessageDescriptor>> = defineMessages({
  laterToday: {
    id: "shared.ui.snoozeMenu.laterToday",
    defaultMessage: "Later today",
    description: "Snooze preset",
  },
  tomorrow: { id: "shared.ui.snoozeMenu.tomorrow", defaultMessage: "Tomorrow", description: "Snooze preset" },
  nextWeek: {
    id: "shared.ui.snoozeMenu.nextWeek",
    defaultMessage: "Next week",
    description: "Snooze preset",
  },
  pickDate: {
    id: "shared.ui.snoozeMenu.pickDate",
    defaultMessage: "Pick a date…",
    description: "Snooze preset that opens a date picker",
  },
});

const messages = defineMessages({
  menu: {
    id: "shared.ui.snoozeMenu.menu",
    defaultMessage: "Snooze until",
    description: "Accessible name of the snooze menu",
  },
});

const presetIcon: Record<SnoozePreset, LucideIcon> = {
  laterToday: Clock,
  tomorrow: Sunrise,
  nextWeek: CalendarDays,
  pickDate: CalendarClock,
};

export interface SnoozeMenuProps {
  /** The button that opens the menu ("Later", a row's clock icon); must accept a ref. */
  trigger: ReactElement;
  /**
   * Called with the chosen preset. The screen turns it into a time; `pickDate` means "open a date
   * picker", not a snooze yet.
   */
  onSnooze: (preset: SnoozePreset) => void;
  /** Menu alignment against the trigger. Default `"start"`. */
  align?: "start" | "end";
  /** Controlled open state, so the screen can open the menu with `H` on the focused row (IA.md). */
  open?: boolean | undefined;
  /** Open state changes (trigger, Esc, a choice, a digit key). */
  onOpenChange?: ((open: boolean) => void) | undefined;
}

/**
 * Snooze menu (components.md `SnoozeMenu`, D19): Later today · Tomorrow · Next week · Pick a date…,
 * numbered 1–4 with keycaps. While open, the digit keys 1–4 pick a preset directly; arrows,
 * Enter and typeahead work as in any menu.
 */
export function SnoozeMenu({ trigger, onSnooze, align = "start", open, onOpenChange }: SnoozeMenuProps) {
  const intl = useIntl();
  const [innerOpen, setInnerOpen] = useState(false);
  // "Pick a date…" opens the screen's dialog only once the menu has closed and given focus back
  // to the trigger: opened earlier, the menu's focus restore lands behind the dialog (WebKit) and
  // the dialog has no opener to return to.
  const pickDateOnClose = useRef(false);
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  const choose = (preset: SnoozePreset) => {
    if (preset === "pickDate") pickDateOnClose.current = true;
    else onSnooze(preset);
  };
  return (
    // Non-modal (APG menu button): Radix's modal mode marks the app aria-hidden while it still
    // holds focusable content (axe aria-hidden-focus); Tab stays blocked inside the menu.
    <DropdownMenu.Root modal={false} open={open ?? innerOpen} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <MenuContent
        align={align}
        aria-label={intl.formatMessage(messages.menu)}
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const preset = PRESETS[Number(event.key) - 1];
          if (preset === undefined) return;
          event.preventDefault();
          setOpen(false);
          choose(preset);
        }}
        onCloseAutoFocus={() => {
          if (!pickDateOnClose.current) return;
          pickDateOnClose.current = false;
          onSnooze("pickDate");
        }}
      >
        {PRESETS.map((preset, index) => (
          <MenuItem
            key={preset}
            icon={presetIcon[preset]}
            shortcut={String(index + 1)}
            onSelect={() => choose(preset)}
          >
            {intl.formatMessage(SNOOZE_PRESET_MESSAGES[preset])}
          </MenuItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  );
}
