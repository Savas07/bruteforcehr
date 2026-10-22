import os from "node:os";
import path from "node:path";
import {
  BrowserWindow,
  nativeTheme,
  type BrowserWindowConstructorOptions,
  type TitleBarOverlayOptions,
} from "electron";
import { chromeArgumentPrefix, type ChromeInfo, type Material, type Platform } from "../shared/ipc";
import { rendererUrl } from "./origin";

export const platform: Platform =
  process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux";

/**
 * Snap layouts need a minimum width of at most 500 epx (Microsoft: "Support snap layouts for
 * desktop apps on Windows 11"); 480 fits thirds on 1536-epx screens and quadrants on 1366×768.
 */
const MIN_WIDTH = 480;
const MIN_HEIGHT = 360;

/** Keep in sync with `--chrome-height` in theme.css. */
const MAC_TOOLBAR_HEIGHT = 52;
const WINDOWS_TITLEBAR_HEIGHT = 40;
/** Traffic lights are 14 pt tall: centre them in the toolbar row and align them with the sidebar icons. */
const TRAFFIC_LIGHT_POSITION = { x: 20, y: (MAC_TOOLBAR_HEIGHT - 14) / 2 };

/** Native colours that must match theme.css (window background and Windows caption area). */
const nativeColors = {
  light: { background: "#ffffff", chrome: "#f3f3f3", symbol: "#1a1a1a" },
  dark: { background: "#1f1f1f", chrome: "#181818", symbol: "#f2f2f2" },
} as const;

/** Mica needs Windows 11 22H2 (build 22621); macOS always has vibrancy. */
function resolveMaterial(): Material {
  if (platform === "darwin") return "vibrancy";
  if (platform === "win32" && Number(os.release().split(".")[2]) >= 22621) return "mica";
  return "none";
}

const material = resolveMaterial();

function colors(): (typeof nativeColors)["light" | "dark"] {
  return nativeTheme.shouldUseDarkColors ? nativeColors.dark : nativeColors.light;
}

function titleBarOverlay(): TitleBarOverlayOptions {
  const { chrome, symbol } = colors();
  return {
    color: material === "mica" ? "#00000000" : chrome,
    symbolColor: symbol,
    height: WINDOWS_TITLEBAR_HEIGHT,
  };
}

function platformChrome(): BrowserWindowConstructorOptions {
  switch (platform) {
    case "darwin":
      return {
        titleBarStyle: "hiddenInset",
        trafficLightPosition: TRAFFIC_LIGHT_POSITION,
        vibrancy: "sidebar",
        visualEffectState: "followWindow",
      };
    case "win32":
      return {
        titleBarStyle: "hidden",
        titleBarOverlay: titleBarOverlay(),
        ...(material === "mica" ? { backgroundMaterial: "mica" as const } : {}),
      };
    case "linux":
      return {};
  }
}

/** Re-applies native colours after the OS switches between light and dark. */
export function applyNativeTheme(window: BrowserWindow): void {
  if (material === "none") window.setBackgroundColor(colors().background);
  if (platform === "win32") window.setTitleBarOverlay(titleBarOverlay());
}

/** Opens the main window at a hash route such as `/today`. */
export function createMainWindow(route: string): BrowserWindow {
  const chrome: ChromeInfo = { platform, material };
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: material === "none" ? colors().background : "#00000000",
    ...platformChrome(),
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      additionalArguments: [`${chromeArgumentPrefix}${JSON.stringify(chrome)}`],
    },
  });

  window.once("ready-to-show", () => window.show());

  void window.loadURL(rendererUrl(route));
  return window;
}
