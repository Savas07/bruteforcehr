import { Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { destinations, type DestinationId } from "../../../shared/destinations";
import { CommandPalette } from "./CommandPalette";
import { ROUTE_TITLE_ID } from "./RouteContainer";
import { ShortcutsSheet } from "./ShortcutsSheet";
import { Sidebar } from "./Sidebar";

/** Windows: a full-width title bar row; the native caption buttons are overlaid on its right. */
function WindowsTitleBar() {
  return (
    <header
      className="drag-region text-muted flex h-(--chrome-height) shrink-0 items-center px-4 text-xs select-none"
      style={{
        paddingInlineEnd: "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))",
      }}
    >
      BruteForceHR
    </header>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { platform } = window.bfhr;

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

  // ⌘1–5, ⌘K and ⌘/ (Ctrl on Windows) are handled in the main process, which forwards them here.
  useEffect(
    () =>
      window.bfhr.onMenuCommand((command) => {
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
        }
      }),
    [goTo, openShortcuts],
  );

  return (
    <div className="text-text flex h-full flex-col">
      {platform === "win32" && <WindowsTitleBar />}
      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenPalette={() => setPaletteOpen(true)} onOpenShortcuts={openShortcuts} />
        <main
          className={`bg-surface border-border flex min-w-0 flex-1 flex-col border-l ${
            platform === "win32" ? "rounded-tl-lg border-t" : ""
          }`}
        >
          {platform === "darwin" && <div className="drag-region h-(--chrome-height) shrink-0" />}
          <Outlet />
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={(id) => void goTo(id)}
        onOpenShortcuts={openShortcuts}
      />
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
