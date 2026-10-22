/**
 * Window helpers shared by the real-app captures (capture.e2e.ts, capture-design.e2e.ts).
 *
 * When the display can't fit the window at 100 % (a 1440×900 MacBook, a 1024×768 CI runner), the
 * window shrinks and the webview zooms out by the same factor (0.75, then 0.5): the layout is
 * identical, only the pixel density of the image drops. Images are in device pixels and contain
 * the web contents only: traffic lights, Windows caption buttons and the menu bar are drawn by the
 * OS, and the native material is replaced by its opaque fallback colour.
 */
import path from "node:path";
import { browser } from "@wdio/globals";
import { appDir } from "../wdio.base";

export const repoRoot = path.resolve(appDir, "../..");
export const osName =
  process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

/** Zoom factors that keep both sizes at whole pixels; the first that fits the display wins. */
const zoomFactors = [1, 0.75, 0.5] as const;

/** Sizes the window so the CSS viewport is exactly `width`×`height`; returns the zoom used. */
export async function setViewport(width: number, height: number): Promise<number> {
  // Measure the free screen area minus the window's own chrome (title and menu bar on Windows)
  // at 100 % zoom. WKWebView reports outerWidth/outerHeight as 0; on macOS the webview fills the
  // window (overlay title bar), so there is no chrome to subtract.
  await browser.tauri.execute(({ core }) =>
    core.invoke("plugin:webview|set_webview_zoom", { label: "main", value: 1 }),
  );
  const room = await browser.execute(() => ({
    width: screen.availWidth - Math.max(0, window.outerWidth - window.innerWidth),
    height: screen.availHeight - Math.max(0, window.outerHeight - window.innerHeight),
  }));
  const zoom = zoomFactors.find((factor) => width * factor <= room.width && height * factor <= room.height);
  if (zoom === undefined) throw new Error(`The display (${room.width}×${room.height} free) is too small`);

  await browser.tauri.execute(
    async ({ core }, w: number, h: number, factor: number) => {
      await core.invoke("plugin:window|set_size", {
        label: "main",
        value: { Logical: { width: w * factor, height: h * factor } },
      });
      await core.invoke("plugin:webview|set_webview_zoom", { label: "main", value: factor });
    },
    width,
    height,
    zoom,
  );
  await browser.waitUntil(
    () => browser.execute((w, h) => window.innerWidth === w && window.innerHeight === h, width, height),
    { timeoutMsg: `the webview did not reach ${width}×${height} at zoom ${zoom}` },
  );
  if (zoom !== 1) console.log(`${width}×${height}: window at ${zoom * 100} % (display too small)`);
  return zoom;
}

/**
 * Sets the window theme, which drives prefers-color-scheme exactly like an OS appearance change.
 * The execute bridge exposes `core.invoke` only, so call the window plugin command directly.
 */
export async function setTheme(theme: "light" | "dark"): Promise<void> {
  await browser.tauri.execute(
    ({ core }, value: string) => core.invoke("plugin:window|set_theme", { label: "main", value }),
    theme,
  );
  await browser.waitUntil(
    () =>
      browser.execute(
        (dark) => matchMedia("(prefers-color-scheme: dark)").matches === dark,
        theme === "dark",
      ),
    { timeoutMsg: `prefers-color-scheme did not switch to ${theme}` },
  );
}

/** Screenshots can't show the OS material behind transparent areas; use the opaque fallback. */
export async function useOpaqueMaterial(): Promise<void> {
  await browser.execute(() => {
    document.documentElement.dataset["material"] = "none";
  });
}

/** Waits for fonts and the open transitions, then writes `file`; returns its repo-relative path. */
export async function saveScreenshot(file: string): Promise<string> {
  await browser.execute(async () => {
    await document.fonts.ready;
  });
  await browser.pause(200);
  await browser.saveScreenshot(file);
  return path.relative(repoRoot, file);
}
