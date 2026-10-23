/**
 * Shared menu styling (components.md `Menu` / `ContextMenu`) over Radix DropdownMenu and
 * ContextMenu, so overflow (•••), "Move to…", snooze, export and right-click menus look and behave
 * the same everywhere. Screens keep using Radix for the root and trigger
 * (`DropdownMenu.Root` + `DropdownMenu.Trigger asChild`, `ContextMenu.Root` + `ContextMenu.Trigger`)
 * and fill the content with these parts. Item parts read which menu they're in from
 * `MenuContent` / `ContextMenuContent`, so one item component serves both.
 *
 * Disabled items say why (decisions.md D16): they stay focusable (`aria-disabled`), show the
 * reason in a tooltip on hover and keyboard focus, and expose it as the accessible description.
 */
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import { createContext, useContext, useId, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";
import { Hint } from "./Hint";
import { Keycaps } from "./Keycaps";

type MenuKind = "dropdown" | "context";

const MenuKindContext = createContext<MenuKind>("dropdown");

const contentClass =
  "bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) min-w-48 max-w-80 overflow-y-auto rounded-lg border p-1";

const itemClass =
  "flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1 text-callout select-none data-highlighted:bg-surface-hover aria-disabled:text-fg-disabled";

const iconClass = "size-4 shrink-0";

export interface MenuContentProps {
  /** Menu parts: `MenuItem`, `MenuSub`, `MenuRadioGroup`, `MenuLabel`, `MenuSeparator`. */
  children: ReactNode;
  /** Alignment against the trigger. Default `"start"`. */
  align?: "start" | "center" | "end";
  /** Preferred side of the trigger; Radix flips it when there's no room. Default `"bottom"`. */
  side?: "top" | "right" | "bottom" | "left";
  /** Menu name ("Move to"); replaces Radix's default of naming the menu after its trigger. */
  "aria-label"?: string | undefined;
  /** Runs before Radix's typeahead; call `preventDefault()` to claim a key (digit presets in `SnoozeMenu`). */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Runs as the menu closes; call `preventDefault()` to put focus somewhere other than the trigger. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Content of a dropdown menu (•••, "Move to…", Export…): portalled, elevated surface, 8 px offset
 * from the trigger, arrow keys loop. Place inside `DropdownMenu.Root` after its trigger.
 */
export function MenuContent({
  children,
  align = "start",
  side = "bottom",
  "aria-label": label,
  onKeyDown,
  onCloseAutoFocus,
}: MenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={8}
        loop
        {...(label === undefined ? {} : { "aria-label": label, "aria-labelledby": undefined })}
        onKeyDown={onKeyDown}
        {...(onCloseAutoFocus && { onCloseAutoFocus })}
        className={cx(contentClass, "max-h-(--radix-dropdown-menu-content-available-height)")}
      >
        <MenuKindContext.Provider value="dropdown">{children}</MenuKindContext.Provider>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

/**
 * Content of a right-click / Shift+F10 / Menu-key context menu (IA.md "Context menu"), styled like
 * `MenuContent`. Place inside `ContextMenu.Root` after its `ContextMenu.Trigger`.
 */
export function ContextMenuContent({
  children,
  "aria-label": label,
  onKeyDown,
}: Pick<MenuContentProps, "children" | "aria-label" | "onKeyDown">) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content
        collisionPadding={8}
        loop
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cx(contentClass, "max-h-(--radix-context-menu-content-available-height)")}
      >
        <MenuKindContext.Provider value="context">{children}</MenuKindContext.Provider>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

export interface MenuItemProps {
  /** Visible label in sentence case; it names the item ("Move to…", "Not for me"). */
  children: ReactNode;
  /** Leading lucide icon, decorative (the label carries the meaning). */
  icon?: LucideIcon | undefined;
  /** Keymap syntax shown as keycaps at the trailing edge ("Mod+D", "1"); purely a hint here. */
  shortcut?: string | readonly string[] | undefined;
  /** Danger tone for destructive actions only (Delete, Disconnect), never for closed outcomes. */
  destructive?: boolean;
  /** Disables the item and explains why (tooltip + accessible description). Never disable silently. */
  disabledReason?: string | null | undefined;
  /** Runs when the item is chosen by click, Enter or Space; the menu then closes. */
  onSelect?: (() => void) | undefined;
}

/** One action row: optional icon, label, keycaps; destructive and disabled-with-reason variants. */
export function MenuItem({
  children,
  icon: Icon,
  shortcut,
  destructive = false,
  disabledReason,
  onSelect,
}: MenuItemProps) {
  const kind = useContext(MenuKindContext);
  const Item = kind === "context" ? ContextMenu.Item : DropdownMenu.Item;
  const reasonId = useId();
  const disabled = Boolean(disabledReason);

  const item = (
    <Item
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? reasonId : undefined}
      className={cx(
        itemClass,
        destructive && !disabled && "text-danger-text data-highlighted:bg-danger-subtle",
      )}
      onSelect={(event: Event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onSelect?.();
      }}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          className={cx(iconClass, !destructive && !disabled && "text-fg-secondary")}
          strokeWidth={1.75}
        />
      )}
      <span className="flex-1">{children}</span>
      {shortcut !== undefined && (
        <span className="ml-4">
          <Keycaps keys={shortcut} />
        </span>
      )}
      {disabledReason && (
        // `aria-describedby` reads hidden text; the label alone stays the item's name.
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      )}
    </Item>
  );

  return disabledReason ? (
    <Hint label={disabledReason} side="right">
      {item}
    </Hint>
  ) : (
    item
  );
}

export interface MenuSubProps {
  /** Visible label of the row that opens the submenu ("Translate"). */
  label: string;
  /** Menu parts of the submenu. */
  children: ReactNode;
}

/**
 * A row that opens a nested menu ("Translate ▸"): → / Enter opens it, ← closes it, hover opens it
 * after Radix's pointer grace. The submenu is styled like `MenuContent`.
 */
export function MenuSub({ label, children }: MenuSubProps) {
  const kind = useContext(MenuKindContext);
  const Sub = kind === "context" ? ContextMenu.Sub : DropdownMenu.Sub;
  const SubTrigger = kind === "context" ? ContextMenu.SubTrigger : DropdownMenu.SubTrigger;
  const Portal = kind === "context" ? ContextMenu.Portal : DropdownMenu.Portal;
  const SubContent = kind === "context" ? ContextMenu.SubContent : DropdownMenu.SubContent;
  return (
    <Sub>
      <SubTrigger className={cx(itemClass, "data-[state=open]:bg-surface-hover")}>
        <span className="flex-1">{label}</span>
        <ChevronRight aria-hidden="true" className={cx(iconClass, "text-fg-tertiary")} strokeWidth={1.75} />
      </SubTrigger>
      <Portal>
        <SubContent
          sideOffset={4}
          collisionPadding={8}
          loop
          aria-label={label}
          className={cx(
            contentClass,
            kind === "context"
              ? "max-h-(--radix-context-menu-content-available-height)"
              : "max-h-(--radix-dropdown-menu-content-available-height)",
          )}
        >
          {children}
        </SubContent>
      </Portal>
    </Sub>
  );
}

export interface MenuRadioGroupProps {
  /** The checked item's `value` (the current status in "Move to…"). */
  value: string;
  /** Called with the chosen item's `value`; the menu then closes. */
  onValueChange: (value: string) => void;
  /** Visible group heading, also the group's accessible name ("In progress"). */
  label?: string | undefined;
  /** `MenuRadioItem`s. */
  children: ReactNode;
}

/** A single-choice group whose checked item shows ✓ (`menuitemradio`, `aria-checked`). */
export function MenuRadioGroup({ value, onValueChange, label, children }: MenuRadioGroupProps) {
  const kind = useContext(MenuKindContext);
  const Group = kind === "context" ? ContextMenu.RadioGroup : DropdownMenu.RadioGroup;
  const labelId = useId();
  return (
    <Group
      value={value}
      onValueChange={onValueChange}
      aria-labelledby={label === undefined ? undefined : labelId}
    >
      {label !== undefined && <MenuLabel id={labelId}>{label}</MenuLabel>}
      {children}
    </Group>
  );
}

export interface MenuRadioItemProps {
  /** Value reported to the group's `onValueChange`. */
  value: string;
  /** Visible label; it names the item. */
  children: ReactNode;
  /** Decorative content between the ✓ column and the label (a status dot). */
  leading?: ReactNode;
  /** Disables the item and explains why (tooltip + accessible description), e.g. decisions.md D16. */
  disabledReason?: string | null | undefined;
}

/** One choice in a `MenuRadioGroup`: ✓ column, optional leading decoration, label. */
export function MenuRadioItem({ value, children, leading, disabledReason }: MenuRadioItemProps) {
  const kind = useContext(MenuKindContext);
  const Item = kind === "context" ? ContextMenu.RadioItem : DropdownMenu.RadioItem;
  const Indicator = kind === "context" ? ContextMenu.ItemIndicator : DropdownMenu.ItemIndicator;
  const reasonId = useId();
  const disabled = Boolean(disabledReason);

  const item = (
    <Item
      value={value}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled ? reasonId : undefined}
      className={itemClass}
      onSelect={(event: Event) => {
        // Preventing the default also stops the group's value change (Radix composes the handlers).
        if (disabled) event.preventDefault();
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Indicator>
          <Check aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        </Indicator>
      </span>
      {leading}
      <span className="flex-1">{children}</span>
      {disabledReason && (
        <span id={reasonId} hidden>
          {disabledReason}
        </span>
      )}
    </Item>
  );

  return disabledReason ? (
    <Hint label={disabledReason} side="right">
      {item}
    </Hint>
  ) : (
    item
  );
}

export interface MenuCheckboxItemProps {
  checked: boolean;
  /** Called with the new state; the menu stays open so several items can be toggled. */
  onCheckedChange: (checked: boolean) => void;
  /** Visible label; it names the item. */
  children: ReactNode;
  /** Decorative content between the ✓ column and the label (a status dot). */
  leading?: ReactNode;
}

/** A toggle in a multi-select menu (filters): ✓ column (`menuitemcheckbox`, `aria-checked`), label. */
export function MenuCheckboxItem({ checked, onCheckedChange, children, leading }: MenuCheckboxItemProps) {
  const kind = useContext(MenuKindContext);
  const Item = kind === "context" ? ContextMenu.CheckboxItem : DropdownMenu.CheckboxItem;
  const Indicator = kind === "context" ? ContextMenu.ItemIndicator : DropdownMenu.ItemIndicator;
  return (
    <Item
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={itemClass}
      onSelect={(event: Event) => event.preventDefault()}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Indicator>
          <Check aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        </Indicator>
      </span>
      {leading}
      <span className="flex-1">{children}</span>
    </Item>
  );
}

/** Non-interactive heading inside a menu; may hold trailing keycaps ("Move to…  M"). */
export function MenuLabel({
  children,
  id,
}: {
  /** Heading text (sentence case), optionally followed by `Keycaps`. */
  children: ReactNode;
  /** Lets a group reference the heading as its name. */
  id?: string | undefined;
}) {
  const kind = useContext(MenuKindContext);
  const Label = kind === "context" ? ContextMenu.Label : DropdownMenu.Label;
  return (
    <Label
      id={id}
      className="text-fg-secondary flex items-center justify-between gap-4 px-2 pt-2 pb-1 text-footnote font-medium"
    >
      {children}
    </Label>
  );
}

/** Hairline between groups of items. */
export function MenuSeparator() {
  const kind = useContext(MenuKindContext);
  const Separator = kind === "context" ? ContextMenu.Separator : DropdownMenu.Separator;
  return <Separator className="bg-line-subtle -mx-1 my-1 h-px" />;
}
