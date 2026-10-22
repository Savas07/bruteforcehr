import type { LucideIcon } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useId } from "react";
import { cx } from "../cx";
import { Hint } from "./Hint";

export interface SegmentedOption<Value extends string> {
  /** Reported to `onValueChange`. */
  value: Value;
  /** Visible label ("Board", "Preview"); segments size to their label, never fixed widths. */
  label: string;
  /** Leading decorative icon. */
  icon?: LucideIcon | undefined;
  /** Makes the segment unselectable and explains why (tooltip + accessible description). */
  disabledReason?: string | null | undefined;
}

export interface SegmentedControlProps<Value extends string> {
  /** Accessible name of the group ("View", "Mode"); not shown. */
  label: string;
  /** 2–5 exclusive options, in display order. */
  options: readonly SegmentedOption<Value>[];
  /** The selected option. One is always selected. */
  value: Value;
  /** Called with the newly selected option (never with the current one). */
  onValueChange: (value: Value) => void;
  /** `sm` (28 px track, 24 px segments) for toolbars and inspectors, `md` (32 px track; default) elsewhere. */
  size?: "sm" | "md";
}

/**
 * Segmented control (components.md `SegmentedControl`): Radix ToggleGroup, single selection, for
 * 2–5 exclusive views or modes (Edit · Preview, Board · Table · Calendar). Tab enters at the
 * selected segment, ← / → move between segments, Space / Enter select. The selected segment is a
 * raised base surface on the sunken track, with medium weight, so selection isn't color alone.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  size = "md",
}: SegmentedControlProps<Value>) {
  const baseId = useId();
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        // An empty `next` is Radix deselecting the current segment: keep it selected.
        if (option && !option.disabledReason) onValueChange(option.value);
      }}
      loop
      className={cx(
        "bg-surface-sunken inline-flex shrink-0 items-center gap-0.5 rounded-md p-0.5",
        size === "sm" ? "h-7" : "h-8",
      )}
    >
      {options.map((option, index) => {
        const Icon = option.icon;
        const disabled = Boolean(option.disabledReason);
        const reasonId = `${baseId}-${index}`;
        const item = (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            aria-disabled={disabled || undefined}
            aria-describedby={disabled ? reasonId : undefined}
            className={cx(
              "text-fg-secondary hover:text-fg-primary data-[state=on]:bg-surface-base data-[state=on]:text-fg-primary data-[state=on]:shadow-raised aria-disabled:text-fg-disabled inline-flex h-full cursor-default items-center justify-center gap-1.5 rounded-sm whitespace-nowrap transition-colors duration-(--bfhr-duration-fast) ease-standard select-none data-[state=on]:font-medium aria-disabled:hover:text-fg-disabled",
              size === "sm" ? "px-2 text-footnote" : "px-3 text-callout",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
            <span>{option.label}</span>
            {option.disabledReason && (
              <span id={reasonId} hidden>
                {option.disabledReason}
              </span>
            )}
          </ToggleGroup.Item>
        );
        return option.disabledReason ? (
          <Hint key={option.value} label={option.disabledReason}>
            {item}
          </Hint>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}
