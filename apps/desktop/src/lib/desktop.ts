/**
 * The UI's whole surface to the Tauri backend (src-tauri). Capabilities grant exactly these
 * calls: listening for menu commands and the `open_external` command.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { MenuCommand } from "./shortcuts";

export type Platform = "macos" | "windows" | "linux";

/** Native material behind the sidebar: macOS vibrancy, Windows 11 Mica, or none (opaque). */
export type Material = "vibrancy" | "mica" | "none";

export interface ChromeInfo {
  readonly platform: Platform;
  readonly material: Material;
  /** The OS's preferred locale ("tr-TR"), null when unknown (src/i18n/locale.ts picks the UI language). */
  readonly locale: string | null;
}

declare global {
  interface Window {
    /** Defined by the main window's initialization script (src-tauri/src/window.rs). */
    readonly __BFHR_CHROME__?: ChromeInfo;
  }
}

/**
 * Design builds (`__BFHR_DESIGN__`) also run in a plain browser for the capture harness: there
 * is no Tauri shell, so the platform and locale come from the route params (`#/today?platform=
 * windows&locale=tr`) or the browser, and the material is opaque. Production builds compile this
 * out.
 */
function designChrome(): ChromeInfo {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const param = params.get("platform");
  const platform: Platform =
    param === "macos" || param === "windows" || param === "linux"
      ? param
      : navigator.userAgent.includes("Mac OS X")
        ? "macos"
        : "windows";
  return { platform, material: "none", locale: params.get("locale") ?? navigator.language };
}

function readChrome(): ChromeInfo {
  const chrome = window.__BFHR_CHROME__;
  if (chrome) return chrome;
  if (__BFHR_DESIGN__) return designChrome();
  throw new Error("BruteForceHR runs inside its desktop shell only (window chrome info missing).");
}

export const chrome: ChromeInfo = readChrome();

/** False only for design builds opened in a plain browser (the capture harness). */
const inShell = !__BFHR_DESIGN__ || isTauri();

/** Event emitted by the native menu (src-tauri/src/menu.rs). */
const MENU_COMMAND_EVENT = "menu-command";

/** Subscribes to native menu clicks; returns the unsubscribe function. */
export function onMenuCommand(listener: (command: MenuCommand) => void): () => void {
  if (!inShell) return () => undefined;
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
  if (!inShell) {
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  }
  return invoke("open_external", { url });
}
