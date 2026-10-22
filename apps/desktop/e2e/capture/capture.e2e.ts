/**
 * Screenshots for design critique (docs/BRIEF.md §5.5), run with `pnpm capture`:
 *   artifacts/screens/desktop/<macos|windows>/<screen>-<light|dark>-<width>x<height>.png
 *
 * Every destination plus the palette and shortcuts overlays (shown over Today), in light and dark,
 * with a CSS viewport of 1280×800 and 1920×1080. When the display can't fit the window at 100 %
 * (a 1440×900 MacBook, a 1024×768 CI runner), the window shrinks and the webview zooms out by the
 * same factor (0.75, then 0.5): the layout is identical, only the pixel density of the image drops.
 * Images are in device pixels. They contain the web contents only: traffic lights, Windows caption
 * buttons and the menu bar are drawn by the OS, and the native material is replaced by its opaque
 * fallback colour.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import { destinations } from "../../src/lib/destinations";
import { appDir } from "../wdio.base";

const sizes = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const;
const themes = ["light", "dark"] as const;
/** Overlays and the key that opens them with ⌘/Ctrl. */
const overlays = [
  { screen: "palette", key: "k" },
  { screen: "shortcuts", key: "/" },
] as const;

const osName = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const outputDir = path.resolve(appDir, "../../artifacts/screens/desktop", osName);
const modifier = process.platform === "darwin" ? Key.Command : Key.Ctrl;
/** Zoom factors that keep both sizes at whole pixels; the first that fits the display wins. */
const zoomFactors = [1, 0.75, 0.5] as const;

/** Sizes the window so the CSS viewport is exactly `width`×`height`; returns the zoom used. */
async function setViewport(width: number, height: number): Promise<number> {
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
  return zoom;
}

async function showRoute(routePath: string): Promise<void> {
  await browser.execute((hash) => {
    window.location.hash = hash;
  }, routePath);
  await expect($("h1")).toBeDisplayed();
}

async function save(name: string): Promise<string> {
  await browser.execute(async () => {
    await document.fonts.ready;
  });
  // Let the dialog's open transition and the hover-free layout settle.
  await browser.pause(200);
  const file = path.join(outputDir, `${name}.png`);
  await browser.saveScreenshot(file);
  return path.relative(path.resolve(appDir, "../.."), file);
}

describe("design-critique screenshots", () => {
  it("captures every destination and overlay in light and dark at both sizes", async () => {
    await mkdir(outputDir, { recursive: true });
    // Screenshots can't show the OS material behind transparent areas; use the opaque fallback.
    await browser.execute(() => {
      document.documentElement.dataset["material"] = "none";
    });

    const written: string[] = [];
    for (const theme of themes) {
      // The window theme drives prefers-color-scheme, exactly like an OS appearance change. The
      // execute bridge exposes `core.invoke` only, so call the window plugin commands directly.
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

      for (const { width, height } of sizes) {
        const zoom = await setViewport(width, height);
        if (zoom !== 1) console.log(`${width}×${height}: window at ${zoom * 100} % (display too small)`);
        const suffix = `${theme}-${width}x${height}`;
        for (const destination of destinations) {
          await showRoute(destination.path);
          written.push(await save(`${destination.id}-${suffix}`));
        }
        for (const overlay of overlays) {
          await showRoute(destinations[0].path);
          await browser.keys([modifier, overlay.key]);
          await expect($('[role="dialog"]')).toBeDisplayed();
          written.push(await save(`${overlay.screen}-${suffix}`));
          await browser.keys(Key.Escape);
          await expect($('[role="dialog"]')).not.toBeExisting();
        }
      }
    }
    console.log(written.join("\n"));
  });
});
