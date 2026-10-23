/**
 * The UI's whole surface to the Tauri backend (src-tauri). Capabilities grant exactly these
 * calls: listening for menu commands and update-status events, `open_external`,
 * `open_job_url` and the update commands (src-tauri/src/updater.rs).
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
  /** The running app's version ("0.1.0"), for the minimum-version gate and update copy. */
  readonly version: string;
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
  // The design persona runs 0.1.0; the update states offer 0.1.1 (src/design/updates.ts).
  return {
    platform,
    material: "none",
    locale: params.get("locale") ?? navigator.language,
    version: params.get("version") ?? "0.1.0",
  };
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

/**
 * Opens a job-posting link (Open original, Apply on company site / board, "Found on" rows) in the
 * default browser. The backend (`open_job_url`, src-tauri/src/job_url.rs) accepts public https
 * addresses only (no credentials, IP literals, local names or ports) and at most 5 per 10 s. It
 * rejects with `{ kind: "url-not-allowed" | "rate-limited" | "open-failed", message }`; show a
 * toast. M0 can't check the URL against the stored job yet (no data layer in the shell).
 */
export function openJobUrl(url: string): Promise<void> {
  if (!inShell) {
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  }
  return invoke("open_job_url", { url });
}

/** Which release manifest the updater reads; Stable unless the user opts into Beta in Settings. */
export type UpdateChannel = "stable" | "beta";

/** The step of an update that failed. */
export type UpdateFailedStep = "check" | "download" | "install";

/** Mirrors `UpdateStatus` in src-tauri/src/updater.rs. */
export type UpdateStatus =
  | { readonly state: "idle" }
  | { readonly state: "checking" }
  | { readonly state: "up-to-date" }
  | {
      readonly state: "downloading";
      readonly version: string;
      readonly downloaded: number;
      /** Bytes; null when the server doesn't send a size. */
      readonly total: number | null;
    }
  | {
      readonly state: "ready";
      readonly version: string;
      /** Release notes from the manifest (Changesets markdown); null when empty. */
      readonly notes: string | null;
      /** RFC 3339. */
      readonly publishedAt: string | null;
    }
  | { readonly state: "failed"; readonly step: UpdateFailedStep };

export interface UpdateSnapshot {
  readonly status: UpdateStatus;
  readonly channel: UpdateChannel;
}

/** Event emitted by src-tauri/src/updater.rs whenever the status changes. */
const UPDATE_STATUS_EVENT = "update-status";

/** The updater's status now; later changes arrive through `onUpdateStatus`. */
export function updateStatus(): Promise<UpdateSnapshot> {
  return invoke("update_status");
}

/** Subscribes to update-status changes; returns the unsubscribe function. */
export function onUpdateStatus(listener: (snapshot: UpdateSnapshot) => void): () => void {
  const unlisten = getCurrentWebviewWindow().listen<UpdateSnapshot>(UPDATE_STATUS_EVENT, (event) =>
    listener(event.payload),
  );
  return () => {
    void unlisten.then((stop) => stop());
  };
}

/** Starts a check (and the download of a newer version) unless one is already running. */
export function checkForUpdates(): Promise<void> {
  return invoke("check_for_updates");
}

/**
 * Installs the downloaded update and relaunches. Call only after unsaved edits are saved
 * (src/shared/unsavedChanges.ts). Rejects with `{ kind: "no-update-ready" | "install-failed" }`.
 */
export function restartToUpdate(): Promise<void> {
  return invoke("restart_to_update");
}

/** Saves the Stable/Beta preference and checks the new channel right away. */
export function setUpdateChannel(channel: UpdateChannel): Promise<void> {
  return invoke("set_update_channel", { channel });
}
