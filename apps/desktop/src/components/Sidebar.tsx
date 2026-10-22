import { Link, useRouterState } from "@tanstack/react-router";
import { Keyboard, Search, type LucideIcon } from "lucide-react";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome } from "../lib/desktop";
import { destinationMessages, destinations } from "../lib/destinations";
import { shortcutById, shortcutKeys, type Shortcut } from "../lib/shortcuts";
import { Keycaps } from "../shared/ui/Keycaps";
import { SidebarChildrenOutlet } from "../shared/ui/SidebarChildren";
import { SyncStatus } from "../shared/ui/SyncStatus";
import { destinationIcons } from "./icons";

const messages = defineMessages({
  sections: {
    id: "shell.sidebar.sections",
    defaultMessage: "Sections",
    description: "Accessible name of the sidebar navigation",
  },
  jumpTo: {
    id: "shell.sidebar.jumpTo",
    defaultMessage: "Jump to…",
    description: "Opens the command palette",
  },
  keyboardShortcuts: { id: "shell.sidebar.keyboardShortcuts", defaultMessage: "Keyboard shortcuts" },
});

const rowClass =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-callout text-fg-primary outline-offset-0 hover:bg-surface-hover narrow:justify-center narrow:px-0";
const labelClass = "truncate narrow:sr-only";

/** Hover hint with the item's shortcut; in the narrow rail it is also the only visible label. */
function WithHint({ label, shortcut, children }: { label: string; shortcut: Shortcut; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="bg-surface-elevated text-fg-primary shadow-overlay z-(--bfhr-layer-tooltip) flex items-center gap-2 rounded-md px-2 py-1 text-footnote"
        >
          {label}
          <Keycaps keys={shortcutKeys(shortcut)} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ActionRow({
  icon: Icon,
  label,
  shortcut,
  showKeycaps,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut: Shortcut;
  showKeycaps: boolean;
  onClick: () => void;
}) {
  return (
    <WithHint label={label} shortcut={shortcut}>
      <button type="button" className={rowClass} onClick={onClick}>
        <Icon aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
        <span className={labelClass}>{label}</span>
        {showKeycaps && (
          <span className="ml-auto narrow:hidden">
            <Keycaps keys={`Mod+${shortcut.key}`} />
          </span>
        )}
      </button>
    </WithHint>
  );
}

export function Sidebar({
  onOpenPalette,
  onOpenShortcuts,
}: {
  onOpenPalette: () => void;
  onOpenShortcuts: () => void;
}) {
  const intl = useIntl();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isMac = chrome.platform === "macos";
  return (
    <nav
      aria-label={intl.formatMessage(messages.sections)}
      className="bg-(--chrome) flex w-(--sidebar-width) shrink-0 flex-col select-none narrow:w-(--rail-width)"
    >
      {/* macOS: the traffic lights sit in this row, aligned with the sidebar icons below. */}
      {isMac && <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />}

      <div className={isMac ? "px-3" : "px-3 pt-2"}>
        <ActionRow
          icon={Search}
          label={intl.formatMessage(messages.jumpTo)}
          shortcut={shortcutById("command-palette")}
          showKeycaps
          onClick={onOpenPalette}
        />
      </div>

      <ul className="mt-3 flex flex-col gap-0.5 px-3">
        {destinations.map((destination) => {
          const Icon = destinationIcons[destination.id];
          const label = intl.formatMessage(destinationMessages[destination.id]);
          return (
            <li key={destination.id}>
              <WithHint label={label} shortcut={shortcutById(`go-${destination.id}`)}>
                <Link
                  to={destination.path}
                  className={`${rowClass} aria-[current=page]:bg-surface-selected aria-[current=page]:font-medium`}
                  activeProps={{ "aria-current": "page" }}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className={labelClass}>{label}</span>
                </Link>
              </WithHint>
              {/* The active section's nested navigation (src/shared/ui/SidebarChildren.tsx). */}
              {(pathname === destination.path || pathname.startsWith(`${destination.path}/`)) && (
                <SidebarChildrenOutlet destination={destination.id} />
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-auto px-3 pb-3">
        <ActionRow
          icon={Keyboard}
          label={intl.formatMessage(messages.keyboardShortcuts)}
          shortcut={shortcutById("keyboard-shortcuts")}
          showKeycaps={false}
          onClick={onOpenShortcuts}
        />
        {/* The sync line (states.md "Desktop: offline and sync status"); hidden until there's data. */}
        <div className="narrow:hidden">
          <SyncStatus variant="sidebar" />
        </div>
      </div>
    </nav>
  );
}
