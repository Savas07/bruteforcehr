/**
 * Shared WebdriverIO setup for the E2E specs and the screenshot capture. Both drive the test
 * build from `pnpm build:e2e` (cargo feature `e2e`, src-tauri/tauri.e2e.conf.json).
 *
 * macOS has no WKWebView driver, so the app embeds its own WebDriver server
 * (tauri-plugin-wdio-webdriver). Windows uses tauri-driver with the msedgedriver matching the
 * installed WebView2; @wdio/tauri-service installs and starts both.
 */
import path from "node:path";

export const appDir = path.resolve(import.meta.dirname, "..");

const binaryName = process.platform === "win32" ? "bruteforcehr.exe" : "bruteforcehr";
export const appBinaryPath = path.join(appDir, "src-tauri/target/release", binaryName);

export function baseConfig(specs: string[], timeout: number): WebdriverIO.Config {
  return {
    runner: "local",
    specs,
    maxInstances: 1,
    capabilities: [{ browserName: "tauri" }],
    services: [
      [
        "@wdio/tauri-service",
        {
          appBinaryPath,
          driverProvider: process.platform === "darwin" ? "embedded" : "official",
          autoInstallTauriDriver: true,
          autoDownloadEdgeDriver: true,
        },
      ],
    ],
    framework: "mocha",
    mochaOpts: { ui: "bdd", timeout },
    reporters: ["spec"],
    logLevel: "warn",
    waitforTimeout: 10_000,
  };
}
