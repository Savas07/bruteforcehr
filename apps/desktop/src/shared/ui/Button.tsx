/**
 * `Button` and `IconButton` (system.md "Button", components.md). One primary (accent fill) per
 * view; disabled buttons say why (`disabledReason` → tooltip + accessible description).
 */
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { forwardRef, useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { cx } from "../cx";
import { Hint } from "./Hint";

export type ButtonVariant = "primary" | "secondary" | "plain" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-solid text-fg-on-accent hover:bg-accent-hover active:bg-accent-pressed aria-disabled:bg-surface-sunken aria-disabled:text-fg-disabled",
  secondary:
    "bg-surface-base text-fg-primary border border-line-control hover:bg-surface-hover active:bg-surface-selected aria-disabled:text-fg-disabled aria-disabled:border-line-subtle",
  plain: "text-accent-text hover:bg-surface-hover active:bg-surface-selected aria-disabled:text-fg-disabled",
  destructive:
    "bg-danger-subtle text-danger-text hover:bg-danger-subtle/80 aria-disabled:bg-surface-sunken aria-disabled:text-fg-disabled",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-6 gap-1 rounded-sm px-2 text-footnote",
  md: "h-8 gap-1.5 rounded-md px-3 text-callout",
  lg: "h-10 gap-2 rounded-md px-4 text-body",
};

const iconSize: Record<ButtonSize, string> = { sm: "size-3.5", md: "size-4", lg: "size-4" };

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading lucide icon (decorative; the label names the action). */
  icon?: LucideIcon;
  /** Keeps the width, shows a spinner and `loadingLabel` ("Sending…"); repeat presses are ignored. */
  loading?: boolean;
  loadingLabel?: string;
  /** Disables the button and explains why (tooltip + accessible description). Never disable silently. */
  disabledReason?: string | null | undefined;
  /** Keymap syntax shown as keycaps in the tooltip ("Mod+Enter", "C"). */
  shortcut?: string;
  /** Tooltip text for enabled buttons (defaults to none, or the shortcut alone). */
  hint?: ReactNode;
  /** Render the child element (e.g. a router `Link`) with button styling. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon: Icon,
    loading = false,
    loadingLabel,
    disabledReason,
    shortcut,
    hint,
    asChild = false,
    className,
    children,
    onClick,
    type = "button",
    ...rest
  },
  ref,
) {
  const reasonId = useId();
  const disabled = Boolean(disabledReason);
  const inert = disabled || loading;
  const Component = asChild ? Slot.Root : "button";

  const button = (
    <Component
      {...rest}
      ref={ref}
      type={asChild ? undefined : type}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      aria-describedby={disabled ? reasonId : rest["aria-describedby"]}
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-(--bfhr-duration-fast) ease-standard select-none aria-disabled:cursor-default",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (inert) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className={cx(iconSize[size], "animate-spin")}
              strokeWidth={1.75}
            />
          ) : (
            Icon && <Icon aria-hidden="true" className={iconSize[size]} strokeWidth={1.75} />
          )}
          <span>{loading && loadingLabel ? loadingLabel : children}</span>
          {disabled && (
            <span id={reasonId} className="sr-only">
              {disabledReason}
            </span>
          )}
        </>
      )}
    </Component>
  );

  if (disabled) return <Hint label={disabledReason}>{button}</Hint>;
  if (hint !== undefined || shortcut !== undefined)
    return (
      <Hint label={hint ?? children} keys={shortcut}>
        {button}
      </Hint>
    );
  return button;
});

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "children"
> {
  icon: LucideIcon;
  /** Accessible name and tooltip ("More actions", "Close"). */
  label: string;
  size?: "sm" | "md";
  /** Keymap syntax shown in the tooltip. */
  shortcut?: string;
  disabledReason?: string | null | undefined;
  /** `aria-pressed` for toggles (Show details). */
  pressed?: boolean;
}

/** Icon-only action with a tooltip and an accessible name; 24 px (`sm`, dense rows) or 32 px. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: Icon,
    label,
    size = "md",
    shortcut,
    disabledReason,
    pressed,
    className,
    onClick,
    type = "button",
    ...rest
  },
  ref,
) {
  const disabled = Boolean(disabledReason);
  return (
    <Hint label={disabledReason ?? label} keys={disabled ? undefined : shortcut}>
      <button
        {...rest}
        ref={ref}
        type={type}
        aria-label={disabled ? `${label}. ${disabledReason}` : label}
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        className={cx(
          "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary active:bg-surface-selected aria-pressed:bg-surface-selected aria-pressed:text-fg-primary aria-disabled:text-fg-disabled inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-(--bfhr-duration-fast) ease-standard aria-disabled:cursor-default aria-disabled:hover:bg-transparent",
          size === "sm" ? "size-6" : "size-8",
          className,
        )}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
    </Hint>
  );
});
