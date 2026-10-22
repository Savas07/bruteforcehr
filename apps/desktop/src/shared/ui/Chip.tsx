import { Check, Plus } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import { Hint } from "./Hint";

export interface ChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "disabled" | "onClick" | "aria-pressed"
> {
  /** Visible label in sentence case ("Remote", "Interviewing"); it names the toggle. */
  children: ReactNode;
  /** On / off. Exposed as `aria-pressed` and shown with ✓ (on) or + (off), never color alone. */
  selected: boolean;
  /** Called with the next state when clicked or toggled with Space / Enter. */
  onSelectedChange: (selected: boolean) => void;
  /** Count after the label ("Updates 4"), tabular figures. */
  count?: number | undefined;
  /** Disables the chip and explains why (tooltip + accessible description). */
  disabledReason?: string | null | undefined;
}

/**
 * Filter / choice chip (components.md `Chip`): a toggle button with a ✓ glyph when selected and +
 * when not, selected fill `accent.subtle`. 28 px high. Forwards its ref so it can sit inside
 * `Hint` or a Radix trigger.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { children, selected, onSelectedChange, count, disabledReason, className, type = "button", ...rest },
  ref,
) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason);
  const Glyph = selected ? Check : Plus;
  const chip = (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-pressed={selected}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? reasonId : rest["aria-describedby"]}
      className={cx(
        "inline-flex h-7 shrink-0 cursor-default items-center gap-1 rounded-full border px-2.5 text-footnote font-medium whitespace-nowrap transition-colors duration-(--bfhr-duration-fast) ease-standard select-none",
        selected
          ? "bg-accent-subtle text-accent-text border-transparent"
          : "bg-surface-base text-fg-primary border-line-control hover:bg-surface-hover",
        "aria-disabled:text-fg-disabled aria-disabled:border-line-subtle aria-disabled:bg-transparent",
        className,
      )}
      onClick={() => {
        if (!disabled) onSelectedChange(!selected);
      }}
    >
      <Glyph aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
      {count !== undefined && <span className="font-normal tabular-nums">{count}</span>}
      {disabled && (
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      )}
    </button>
  );
  return disabled ? <Hint label={disabledReason}>{chip}</Hint> : chip;
});
