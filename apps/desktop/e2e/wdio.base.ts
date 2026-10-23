/**
 * Shared WebdriverIO setup for the E2E specs and the screenshot capture. Both drive the test
 * build from `pnpm build:e2e` (cargo feature `e2e`, src-tauri/tauri.e2e.conf.json).
 *
 * The app embeds its own WebDriver server (tauri-plugin-wdio-webdriver) on every platform, the
 * provider @wdio/tauri-service recommends: macOS has no WKWebView driver, and on Windows it
 * avoids tauri-driver + msedgedriver, which must match the runner's WebView2 exactly.
 */
import path from "node:path";

export const appDir = path.resolve(import.meta.dirname, "..");

const binaryName = process.platform === "win32" ? "bruteforcehr.exe" : "bruteforcehr";
/**
 * The unbundled test build, or `BFHR_APP_BINARY`: on macOS CI the test build is installed as
 * /Applications/BruteForceHR.app, so `bruteforcehr://` links reach it through LaunchServices
 * (e2e/specs/auth.e2e.ts).
 */
export const appBinaryPath =
  process.env["BFHR_APP_BINARY"] || path.join(appDir, "src-tauri/target/release", binaryName);

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
          driverProvider: "embedded",
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
