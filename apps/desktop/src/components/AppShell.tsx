import { Outlet, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome, onMenuCommand } from "../lib/desktop";
import { destinations, type DestinationId } from "../lib/destinations";
import { SETTINGS_START_PANE } from "../lib/settings";
import { shortcutForKey, shortcutMessage, shortcuts, type MenuCommand } from "../lib/shortcuts";
import { AuthGate } from "../features/auth/AuthGate";
import { useAuth } from "../features/auth/session";
import { OnboardingGate } from "../features/onboarding/OnboardingGate";
import { keymap } from "../shared/keyboard/keymap";
import { useKeyBindings } from "../shared/keyboard/useKeyBindings";
import { ConnectionBanner } from "../shared/ui/ConnectionBanner";
import { ToastProvider, ToastViewport, useToast } from "../shared/ui/Toast";
import { saveUnsavedChanges } from "../shared/unsavedChanges";
import { CommandPalette } from "./CommandPalette";
import { ROUTE_TITLE_ID } from "./RouteContainer";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { Sidebar } from "./Sidebar";
import { UpdatesProvider } from "./updates/context";
import { UpdateCard } from "./updates/UpdateCard";
import { CheckForUpdatesDialog, ReleaseNotesDialog, SaveFirstDialog } from "./updates/UpdateDialogs";
import { UpdateRequired } from "./updates/UpdateRequired";
import { UpdateControllerContext, useUpdateController } from "./updates/useUpdateController";

const messages = defineMessages({
  signOutNotSaved: {
    id: "shell.signOut.notSaved",
    defaultMessage: "Couldn’t save your changes, so you’re still signed in. Try again in a moment.",
  },
});

/**
 * Focuses the new section's heading once it has rendered: a section's code loads on its first
 * visit (src/router.tsx), so after navigating it may take a few frames.
 */
async function focusRouteTitle(): Promise<void> {
  for (let frame = 0; frame < 60; frame++) {
    const title = document.getElementById(ROUTE_TITLE_ID);
    if (title) {
      title.focus({ preventScroll: true });
      return;
    }
    // `Promise.withResolvers` needs Safari 17.4; the app supports macOS 13 (Safari 16).
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * The signed-in app; signed out, the sign-in screen (src/features/auth); signed in before
 * onboarding finished, the first-run wizard (src/features/onboarding). `hosts` are app-wide
 * pieces that need the signed-in shell (toasts, keymap) but no route: the Log an application
 * dialog and the interview reminder scheduler (src/router.tsx, src/design/DesignRoot.tsx).
 */
export function AppShell({ hosts }: { readonly hosts?: ReactNode }) {
  return (
    <UpdatesProvider>
      <AuthGate>
        <ToastProvider>
          <OnboardingGate>
            <Shell hosts={hosts} />
          </OnboardingGate>
        </ToastProvider>
      </AuthGate>
    </UpdatesProvider>
  );
}

function Shell({ hosts }: { readonly hosts: ReactNode }) {
  const navigate = useNavigate();
  const intl = useIntl();
  const toast = useToast();
  const { signOut } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const updates = useUpdateController();
  const { checkNow, blocking } = updates;

  /** Saves open edits first; if they can't be saved, nobody is signed out. */
  const requestSignOut = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(false);
    saveUnsavedChanges().then(signOut, (error: unknown) => {
      console.error("Couldn't save before signing out", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.signOutNotSaved) });
    });
  }, [signOut, toast, intl]);

  // The palette and the sheet have no Radix trigger (keys, the native menu, the sidebar and each
  // other open them), so Radix would drop focus on <body> when they close. Focus goes back to
  // whatever had it before the first of them opened.
  const opener = useRef<HTMLElement | null>(null);
  const rememberOpener = useCallback(() => {
    const active = document.activeElement;
    // Opened from the other overlay: keep the first opener.
    if (active instanceof HTMLElement && active.closest('[role="dialog"]')) return;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  const returnFocus = useCallback((event: Event) => {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
  }, []);

  const openSettings = useCallback(
    async (pane: string) => {
      await navigate({ to: "/settings/$pane", params: { pane } });
      await focusRouteTitle();
    },
    [navigate],
  );
  /** Keyboard-driven navigation moves focus to the new section's heading. */
  const goTo = useCallback(
    async (id: DestinationId) => {
      const destination = destinations.find((candidate) => candidate.id === id);
      if (!destination) return;
      setPaletteOpen(false);
      setShortcutsOpen(false);
      await navigate({ to: destination.path });
      await focusRouteTitle();
    },
    [navigate],
  );

  const openShortcuts = useCallback(() => {
    rememberOpener();
    setPaletteOpen(false);
    setShortcutsOpen(true);
  }, [rememberOpener]);

  const runCommand = useCallback(
    (command: MenuCommand) => {
      // Behind "Update required" only the update check and signing out still work.
      if (blocking && command.type !== "check-for-updates" && command.type !== "sign-out") return;
      switch (command.type) {
        case "navigate":
          void goTo(command.destination);
          break;
        case "open-palette":
          rememberOpener();
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
        case "open-settings":
          setPaletteOpen(false);
          setShortcutsOpen(false);
          void openSettings(SETTINGS_START_PANE);
          break;
        case "sign-out":
          requestSignOut();
          break;
      }
    },
    [goTo, openShortcuts, checkNow, requestSignOut, blocking, openSettings, rememberOpener],
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
    <div className="text-fg-primary flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          onOpenPalette={() => {
            rememberOpener();
            setPaletteOpen(true);
          }}
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
          <UpdateControllerContext.Provider value={updates}>
            <Outlet />
          </UpdateControllerContext.Provider>
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
        onOpenSettings={(pane) => void openSettings(pane)}
        onSignOut={requestSignOut}
        onCloseAutoFocus={returnFocus}
      />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} onCloseAutoFocus={returnFocus} />
      <CheckForUpdatesDialog controller={updates} />
      <ReleaseNotesDialog controller={updates} />
      <UpdateRequired controller={updates} />
      {/* After the gate, so "Save and restart" opens above it. */}
      <SaveFirstDialog controller={updates} />
      {hosts}
    </div>
  );
}
