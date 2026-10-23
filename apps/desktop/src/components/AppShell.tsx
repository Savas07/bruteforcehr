import { Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { chrome, onMenuCommand } from "../lib/desktop";
import { destinations, type DestinationId } from "../lib/destinations";
import { shortcutForKey, shortcutMessage, shortcuts, type MenuCommand } from "../lib/shortcuts";
import { keymap } from "../shared/keyboard/keymap";
import { useKeyBindings } from "../shared/keyboard/useKeyBindings";
import { ConnectionBanner } from "../shared/ui/ConnectionBanner";
import { ToastProvider, ToastViewport } from "../shared/ui/Toast";
import { CommandPalette } from "./CommandPalette";
import { ROUTE_TITLE_ID } from "./RouteContainer";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { Sidebar } from "./Sidebar";
import { UpdatesProvider } from "./updates/context";
import { UpdateCard } from "./updates/UpdateCard";
import { CheckForUpdatesDialog, ReleaseNotesDialog, SaveFirstDialog } from "./updates/UpdateDialogs";
import { UpdateRequired } from "./updates/UpdateRequired";
import { useUpdateController } from "./updates/useUpdateController";

export function AppShell() {
  return (
    <UpdatesProvider>
      <Shell />
    </UpdatesProvider>
  );
}

function Shell() {
  const navigate = useNavigate();
  const intl = useIntl();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const updates = useUpdateController();
  const { checkNow, blocking } = updates;

  /** Keyboard-driven navigation moves focus to the new section's heading. */
  const goTo = useCallback(
    async (id: DestinationId) => {
      const destination = destinations.find((candidate) => candidate.id === id);
      if (!destination) return;
      setPaletteOpen(false);
      setShortcutsOpen(false);
      await navigate({ to: destination.path });
      document.getElementById(ROUTE_TITLE_ID)?.focus({ preventScroll: true });
    },
    [navigate],
  );

  const openShortcuts = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(true);
  }, []);

  const runCommand = useCallback(
    (command: MenuCommand) => {
      // Behind "Update required" only the update check still works.
      if (blocking && command.type !== "check-for-updates") return;
      switch (command.type) {
        case "navigate":
          void goTo(command.destination);
          break;
        case "open-palette":
          setShortcutsOpen(false);
          setPaletteOpen((open) => !open);
          break;
        case "open-shortcuts":
          openShortcuts();
          break;
        case "check-for-updates":
          setPaletteOpen(false);
          setShortcutsOpen(false);
          checkNow();
          break;
      }
    },
    [goTo, openShortcuts, checkNow, blocking],
  );

  // Native menu clicks (src-tauri/src/menu.rs).
  useEffect(() => onMenuCommand(runCommand), [runCommand]);

  // ⌘1–5, ⌘K and ⌘/ (Ctrl on Windows) while the webview has focus. Handling them here, in the
  // capture phase and with preventDefault, makes each press fire exactly once: WebView2 never
  // passes them to the menu (tauri-apps/wry#451) and WebKit skips the menu for handled keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutForKey(event, chrome.platform);
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      runCommand(shortcut.command);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [runCommand]);

  // The alternates of the static shortcuts (`G T` go-to sequences, `?`). Listed on the static
  // rows of the shortcuts sheet already, so hidden here.
  useKeyBindings(
    shortcuts.flatMap((shortcut) =>
      shortcut.alternates.length === 0
        ? []
        : [
            {
              id: `${shortcut.id}.alternates`,
              keys: shortcut.alternates,
              label: intl.formatMessage(shortcutMessage(shortcut)),
              group: shortcut.group,
              hidden: true,
              run: () => runCommand(shortcut.command),
            },
          ],
    ),
  );

  // Every other key goes through the keymap (src/shared/keyboard/keymap.ts), in the bubble phase
  // so menus, comboboxes and dialogs that handle a key themselves (and preventDefault) win.
  useEffect(() => {
    if (blocking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      keymap.dispatch(event, chrome.platform);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [blocking]);

  const isMac = chrome.platform === "macos";
  return (
    <ToastProvider>
      <div className="text-fg-primary flex h-full flex-col">
        <div className="flex min-h-0 flex-1">
          <Sidebar
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenShortcuts={openShortcuts}
            updateCard={<UpdateCard controller={updates} />}
          />
          <main
            className={`bg-surface-base border-line-subtle relative flex min-w-0 flex-1 flex-col border-l ${
              isMac ? "" : "rounded-tl-md border-t"
            }`}
          >
            {/* macOS: the toolbar row under the hidden title bar moves the window. */}
            {isMac && <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />}
            {/* 28 px offline strip across the content (states.md); renders nothing while online. */}
            <ConnectionBanner />
            <Outlet />
            {/* Toasts sit bottom-left of the content area, not the window (D12). */}
            <ToastViewport />
          </main>
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onNavigate={(id) => void goTo(id)}
          onOpenShortcuts={openShortcuts}
          onCheckForUpdates={checkNow}
        />
        <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <CheckForUpdatesDialog controller={updates} />
        <ReleaseNotesDialog controller={updates} />
        <UpdateRequired controller={updates} />
        {/* After the gate, so "Save and restart" opens above it. */}
        <SaveFirstDialog controller={updates} />
      </div>
    </ToastProvider>
  );
}
