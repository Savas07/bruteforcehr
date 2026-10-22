import { Tooltip } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { Keycaps } from "./Keycaps";

/**
 * Tooltip with an optional shortcut (components.md `Tooltip`): label + keycaps on hover and
 * keyboard focus after `timing.tooltipDelay` (the provider in main.tsx). The trigger must carry its
 * own accessible name; the hint repeats it for sighted users and adds the keys.
 */
export function Hint({
  label,
  keys,
  side = "top",
  children,
}: {
  label: ReactNode;
  /** Keymap syntax (`Mod+Enter`, `C`), shown as keycaps after the label. */
  keys?: string | readonly string[] | undefined;
  side?: "top" | "right" | "bottom" | "left";
  /** One element that accepts a ref (Radix `asChild`). */
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="bg-surface-elevated text-fg-primary shadow-overlay z-(--bfhr-layer-tooltip) flex max-w-80 items-center gap-2 rounded-sm px-2 py-1 text-footnote"
        >
          <span>{label}</span>
          {keys !== undefined && <Keycaps keys={keys} />}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
