import type { BrowserWindow } from "electron";
import { shortcuts } from "../shared/shortcuts";
import type { MenuCommandHandler } from "./menu";

/**
 * Routes ⌘/Ctrl shortcuts through `before-input-event`, ahead of the page and the menu. Calling
 * preventDefault stops the menu accelerator from firing too, so every shortcut runs exactly once
 * whether it comes from the keyboard, a menu click, or Chromium's input pipeline (Playwright).
 * Digits match the physical key so they work on layouts where 1–5 need Shift (AZERTY).
 */
export function routeShortcutKeys(window: BrowserWindow, onCommand: MenuCommandHandler): void {
  const isMac = process.platform === "darwin";
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat || input.alt) return;
    const primaryModifier = isMac ? input.meta && !input.control : input.control && !input.meta;
    if (!primaryModifier) return;
    const shortcut = shortcuts.find((candidate) =>
      /^\d$/.test(candidate.key)
        ? input.code === `Digit${candidate.key}` || input.code === `Numpad${candidate.key}`
        : input.key.toLowerCase() === candidate.key.toLowerCase(),
    );
    if (!shortcut) return;
    event.preventDefault();
    onCommand(shortcut.command, window);
  });
}
