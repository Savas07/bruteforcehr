import { defineMessages, type MessageDescriptor } from "react-intl";
import type { Platform } from "./desktop";
import { destinations, type DestinationId } from "./destinations";

/** What a shortcut, palette entry or native menu item does (menu payloads: src-tauri/src/menu.rs). */
export type MenuCommand =
  | { readonly type: "navigate"; readonly destination: DestinationId }
  | { readonly type: "open-palette" }
  | { readonly type: "open-shortcuts" }
  /** Settings: the sidebar row, `Mod+,` and "Settings…" in the app menu (macOS) or File (Windows). */
  | { readonly type: "open-settings" }
  /** "Check for Updates…" in the app menu (macOS) or Help (Windows); no shortcut. */
  | { readonly type: "check-for-updates" }
  /** "Sign Out" in the app menu (macOS) or File (Windows), and the palette; no shortcut. */
  | { readonly type: "sign-out" };

export type ShortcutGroup = "Navigation" | "General";

export interface Shortcut {
  readonly id: string;
  readonly group: ShortcutGroup;
  readonly label: string;
  /** Key pressed together with ⌘ (macOS) or Ctrl (Windows). */
  readonly key: string;
  /**
   * Other keys for the same command, in keymap syntax (src/shared/keyboard/keymap.ts): the
   * go-to sequence `G T` and `?` for the shortcuts sheet (IA.md § Keyboard map, D28).
   */
  readonly alternates: readonly string[];
  readonly command: MenuCommand;
}

/** Second key of the `G` go-to sequence per destination (IA.md: Today, Jobs, tRacker, CVs, Mail, Insights). */
const goToLetters: Record<DestinationId, string> = {
  today: "T",
  jobs: "J",
  tracker: "R",
  cvs: "C",
  mail: "M",
  insights: "I",
};

/**
 * Single source for the keyboard handler, the shortcuts sheet and the palette hints. The native
 * menu (src-tauri/src/menu.rs) shows the same accelerators; its tests check the keys below.
 */
export const shortcuts: readonly Shortcut[] = [
  ...destinations.map((destination, index): Shortcut => ({
    id: `go-${destination.id}`,
    group: "Navigation",
    label: `Go to ${destination.label}`,
    key: String(index + 1),
    alternates: [`G ${goToLetters[destination.id]}`],
    command: { type: "navigate", destination: destination.id },
  })),
  {
    id: "command-palette",
    group: "General",
    label: "Open command palette",
    key: "K",
    alternates: [],
    command: { type: "open-palette" },
  },
  {
    id: "keyboard-shortcuts",
    group: "General",
    label: "Show keyboard shortcuts",
    key: "/",
    alternates: ["?"],
    command: { type: "open-shortcuts" },
  },
  {
    id: "open-settings",
    group: "General",
    label: "Open settings",
    key: ",",
    alternates: [],
    command: { type: "open-settings" },
  },
];

/**
 * What the UI shows for each shortcut, by shortcut id. `label` above stays English for the native
 * menu tests; the webview renders these.
 */
export const shortcutMessages: Readonly<Record<string, MessageDescriptor>> = defineMessages({
  "go-today": { id: "shell.shortcut.goToday", defaultMessage: "Go to Today" },
  "go-jobs": { id: "shell.shortcut.goJobs", defaultMessage: "Go to Jobs" },
  "go-tracker": { id: "shell.shortcut.goTracker", defaultMessage: "Go to Tracker" },
  "go-cvs": { id: "shell.shortcut.goCvs", defaultMessage: "Go to CVs" },
  "go-mail": { id: "shell.shortcut.goMail", defaultMessage: "Go to Mail" },
  "go-insights": { id: "shell.shortcut.goInsights", defaultMessage: "Go to Insights" },
  "open-settings": { id: "shell.shortcut.openSettings", defaultMessage: "Open settings" },
  "command-palette": { id: "shell.shortcut.commandPalette", defaultMessage: "Open command palette" },
  "keyboard-shortcuts": { id: "shell.shortcut.keyboardShortcuts", defaultMessage: "Show keyboard shortcuts" },
});

/** The UI label of a shortcut. */
export function shortcutMessage(shortcut: Shortcut): MessageDescriptor {
  const message = shortcutMessages[shortcut.id];
  if (!message) throw new Error(`No message for shortcut: ${shortcut.id}`);
  return message;
}

export const shortcutGroups: readonly ShortcutGroup[] = ["Navigation", "General"];

export function shortcutById(id: string): Shortcut {
  const shortcut = shortcuts.find((candidate) => candidate.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  return shortcut;
}

/** All keys of a shortcut in keymap syntax, for `Keycaps`: `["Mod+/", "?"]`. */
export function shortcutKeys(shortcut: Shortcut): readonly string[] {
  return [`Mod+${shortcut.key}`, ...shortcut.alternates];
}

/**
 * The shortcut a key press triggers, if any: ⌘ on macOS or Ctrl elsewhere, without Shift or
 * Alt/Option. Digits match the physical key (`code`), so ⌘1–5 also work on AZERTY; letters and
 * `/` match the character the layout produces.
 */
export function shortcutForKey(event: KeyboardEvent, platform: Platform): Shortcut | undefined {
  const modifier = platform === "macos" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier || event.altKey || event.shiftKey || event.repeat) return undefined;
  const digit = /^Digit([0-9])$/.exec(event.code)?.[1];
  return shortcuts.find((shortcut) =>
    /^[0-9]$/.test(shortcut.key) ? shortcut.key === digit : shortcut.key === event.key.toUpperCase(),
  );
}
