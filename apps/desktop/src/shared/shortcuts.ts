import { destinations } from "./destinations";
import type { MenuCommand, Platform } from "./ipc";

export type ShortcutGroup = "Navigation" | "General";

export interface Shortcut {
  readonly id: string;
  readonly group: ShortcutGroup;
  readonly label: string;
  /** Key pressed together with ⌘ (macOS) or Ctrl (Windows). */
  readonly key: string;
  readonly command: MenuCommand;
}

/** Single source for the native menu accelerators, the shortcuts sheet and the palette hints. */
export const shortcuts: readonly Shortcut[] = [
  ...destinations.map((destination, index): Shortcut => ({
    id: `go-${destination.id}`,
    group: "Navigation",
    label: `Go to ${destination.label}`,
    key: String(index + 1),
    command: { type: "navigate", destination: destination.id },
  })),
  {
    id: "command-palette",
    group: "General",
    label: "Open command palette",
    key: "K",
    command: { type: "open-palette" },
  },
  {
    id: "keyboard-shortcuts",
    group: "General",
    label: "Show keyboard shortcuts",
    key: "/",
    command: { type: "open-shortcuts" },
  },
];

export const shortcutGroups: readonly ShortcutGroup[] = ["Navigation", "General"];

export function shortcutById(id: string): Shortcut {
  const shortcut = shortcuts.find((candidate) => candidate.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  return shortcut;
}

/** Keycap labels in platform convention: `["⌘", "K"]` on macOS, `["Ctrl", "K"]` elsewhere. */
export function keycaps(shortcut: Shortcut, platform: Platform): readonly string[] {
  return [platform === "darwin" ? "⌘" : "Ctrl", shortcut.key];
}

/** Spoken form for assistive tech, e.g. "Command K". */
export function spokenShortcut(shortcut: Shortcut, platform: Platform): string {
  const modifier = platform === "darwin" ? "Command" : "Control";
  const key = shortcut.key === "/" ? "Slash" : shortcut.key;
  return `${modifier} ${key}`;
}
