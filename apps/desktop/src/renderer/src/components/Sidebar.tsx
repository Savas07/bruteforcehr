import { Link } from "@tanstack/react-router";
import { Keyboard, Search, type LucideIcon } from "lucide-react";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { destinations } from "../../../shared/destinations";
import { shortcutById, type Shortcut } from "../../../shared/shortcuts";
import { destinationIcons } from "./icons";
import { Keycaps } from "./Keycaps";

const rowClass =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-text outline-offset-0 hover:bg-fill-hover narrow:justify-center narrow:px-0";
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
          className="bg-elevated text-text shadow-dialog z-50 flex items-center gap-2 rounded-md px-2 py-1 text-xs"
        >
          {label}
          <Keycaps shortcut={shortcut} />
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
        <Icon aria-hidden="true" className="text-muted size-4 shrink-0" strokeWidth={1.75} />
        <span className={labelClass}>{label}</span>
        {showKeycaps && (
          <span className="ml-auto narrow:hidden">
            <Keycaps shortcut={shortcut} />
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
  const isMac = window.bfhr.platform === "darwin";
  return (
    <nav
      aria-label="Sections"
      className="bg-chrome flex w-(--sidebar-width) shrink-0 flex-col select-none narrow:w-(--rail-width)"
    >
      {/* macOS: the traffic lights sit in this row, aligned with the sidebar icons below. */}
      {isMac && <div className="drag-region h-(--chrome-height) shrink-0" />}

      <div className={isMac ? "px-3" : "px-3 pt-2"}>
        <ActionRow
          icon={Search}
          label="Jump to…"
          shortcut={shortcutById("command-palette")}
          showKeycaps
          onClick={onOpenPalette}
        />
      </div>

      <ul className="mt-3 flex flex-col gap-0.5 px-3">
        {destinations.map((destination) => {
          const Icon = destinationIcons[destination.id];
          return (
            <li key={destination.id}>
              <WithHint label={destination.label} shortcut={shortcutById(`go-${destination.id}`)}>
                <Link
                  to={destination.path}
                  className={`${rowClass} aria-[current=page]:bg-fill-selected aria-[current=page]:font-medium`}
                  activeProps={{ "aria-current": "page" }}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className={labelClass}>{destination.label}</span>
                </Link>
              </WithHint>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto px-3 pb-3">
        <ActionRow
          icon={Keyboard}
          label="Keyboard shortcuts"
          shortcut={shortcutById("keyboard-shortcuts")}
          showKeycaps={false}
          onClick={onOpenShortcuts}
        />
      </div>
    </nav>
  );
}
