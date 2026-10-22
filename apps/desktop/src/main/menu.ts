import { app, BrowserWindow, Menu, type BaseWindow, type MenuItemConstructorOptions } from "electron";
import { destinations } from "../shared/destinations";
import type { MenuCommand } from "../shared/ipc";
import { shortcutById, type Shortcut } from "../shared/shortcuts";

export type MenuCommandHandler = (command: MenuCommand, target: BrowserWindow | undefined) => void;

/**
 * Native application menu listing every shortcut (the macOS menu bar; on Windows the menu is
 * hidden by the title bar overlay, so the shortcuts sheet and palette carry them). Key presses
 * themselves are routed by keyboard.ts; menu clicks land here.
 */
export function installApplicationMenu(onCommand: MenuCommandHandler): void {
  const item = (shortcut: Shortcut, label: string): MenuItemConstructorOptions => ({
    id: shortcut.id,
    label,
    accelerator: `CmdOrCtrl+${shortcut.key}`,
    click: (_menuItem, window: BaseWindow | undefined) =>
      onCommand(
        shortcut.command,
        window === undefined ? undefined : (BrowserWindow.fromId(window.id) ?? undefined),
      ),
  });

  const isMac = process.platform === "darwin";
  const developerItems: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [{ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" } as const] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        item(shortcutById("command-palette"), "Command Palette…"),
        { type: "separator" },
        { role: "togglefullscreen" },
        ...developerItems,
      ],
    },
    {
      label: "Go",
      submenu: destinations.map((destination) =>
        item(shortcutById(`go-${destination.id}`), destination.label),
      ),
    },
    ...(isMac ? [{ role: "windowMenu" } as const] : []),
    {
      role: "help",
      submenu: [item(shortcutById("keyboard-shortcuts"), "Keyboard Shortcuts…")],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
