import { CalendarClock, CalendarDays, Clock, Sunrise, type LucideIcon } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState, type ReactElement } from "react";
import { MenuContent, MenuItem } from "./Menu";

/** The four snooze presets (decisions.md D19), in menu order. */
export type SnoozePreset = "laterToday" | "tomorrow" | "nextWeek" | "pickDate";

const PRESETS: readonly SnoozePreset[] = ["laterToday", "tomorrow", "nextWeek", "pickDate"];

/** Menu labels for the presets (D19). */
export const SNOOZE_PRESET_LABELS: Readonly<Record<SnoozePreset, string>> = {
  laterToday: "Later today",
  tomorrow: "Tomorrow",
  nextWeek: "Next week",
  pickDate: "Pick a date…",
};

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
  const [innerOpen, setInnerOpen] = useState(false);
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  return (
    <DropdownMenu.Root open={open ?? innerOpen} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <MenuContent
        align={align}
        aria-label="Snooze until"
        onKeyDown={(event) => {
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          const preset = PRESETS[Number(event.key) - 1];
          if (preset === undefined) return;
          event.preventDefault();
          setOpen(false);
          onSnooze(preset);
        }}
      >
        {PRESETS.map((preset, index) => (
          <MenuItem
            key={preset}
            icon={presetIcon[preset]}
            shortcut={String(index + 1)}
            onSelect={() => onSnooze(preset)}
          >
            {SNOOZE_PRESET_LABELS[preset]}
          </MenuItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  );
}
