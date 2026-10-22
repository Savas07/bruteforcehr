/**
 * The UI's whole surface to the Tauri backend (src-tauri). Capabilities grant exactly these
 * calls: listening for menu commands and the `open_external` command.
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { MenuCommand } from "./shortcuts";

export type Platform = "macos" | "windows" | "linux";

/** Native material behind the sidebar: macOS vibrancy, Windows 11 Mica, or none (opaque). */
export type Material = "vibrancy" | "mica" | "none";

export interface ChromeInfo {
  readonly platform: Platform;
  readonly material: Material;
}

declare global {
  interface Window {
    /** Defined by the main window's initialization script (src-tauri/src/window.rs). */
    readonly __BFHR_CHROME__?: ChromeInfo;
  }
}

function readChrome(): ChromeInfo {
  const chrome = window.__BFHR_CHROME__;
  if (!chrome)
    throw new Error("BruteForceHR runs inside its desktop shell only (window chrome info missing).");
  return chrome;
}

export const chrome: ChromeInfo = readChrome();

/** Event emitted by the native menu (src-tauri/src/menu.rs). */
const MENU_COMMAND_EVENT = "menu-command";

/** Subscribes to native menu clicks; returns the unsubscribe function. */
export function onMenuCommand(listener: (command: MenuCommand) => void): () => void {
  const unlisten = getCurrentWebviewWindow().listen<MenuCommand>(MENU_COMMAND_EVENT, (event) =>
    listener(event.payload),
  );
  return () => {
    void unlisten.then((stop) => stop());
  };
}

/**
 * Opens an https URL on bruteforcehr.web.app or github.com in the default browser. The backend
 * validates the URL and rejects anything else.
 */
export function openExternal(url: string): Promise<void> {
  return invoke("open_external", { url });
}
