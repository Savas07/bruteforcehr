/**
 * Screenshots for design critique (docs/BRIEF.md §5.5), run with `pnpm capture`:
 *   artifacts/screens/desktop/<macos|windows>/<screen>-<light|dark>-<width>x<height>.png
 *
 * Every destination plus the palette and shortcuts overlays (shown over Today), in light and dark,
 * with a CSS viewport of 1280×800 and 1920×1080 (see helpers.ts for zoom on small displays).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import { captureSizes, captureThemes } from "../../src/design/matrix.ts";
import { destinations } from "../../src/lib/destinations";
import { ensureSignedIn, testEmail } from "../support/auth";
import { osName, repoRoot, saveScreenshot, setTheme, setViewport, prepareCapture } from "./helpers";

/** Overlays and the key that opens them with ⌘/Ctrl. */
const overlays = [
  { screen: "palette", key: "k" },
  { screen: "shortcuts", key: "/" },
] as const;

const outputDir = path.join(repoRoot, "artifacts/screens/desktop", osName);
const modifier = process.platform === "darwin" ? Key.Command : Key.Ctrl;

async function showRoute(routePath: string): Promise<void> {
  await browser.execute((hash) => {
    window.location.hash = hash;
  }, routePath);
  await expect($("h1")).toBeDisplayed();
}

describe("design-critique screenshots", () => {
  it("captures every destination and overlay in light and dark at both sizes", async () => {
    await mkdir(outputDir, { recursive: true });
    // The shell is behind sign-in (Auth emulator, e2e/support/auth.ts).
    await ensureSignedIn(testEmail("capture"));
    await prepareCapture();

    const written: string[] = [];
    for (const theme of captureThemes) {
      await setTheme(theme);
      for (const { width, height } of captureSizes) {
        await setViewport(width, height);
        const suffix = `${theme}-${width}x${height}`;
        for (const destination of destinations) {
          await showRoute(destination.path);
          written.push(await saveScreenshot(path.join(outputDir, `${destination.id}-${suffix}.png`)));
        }
        for (const overlay of overlays) {
          await showRoute(destinations[0].path);
          await browser.keys([modifier, overlay.key]);
          await expect($('[role="dialog"]')).toBeDisplayed();
          written.push(await saveScreenshot(path.join(outputDir, `${overlay.screen}-${suffix}.png`)));
          await browser.keys(Key.Escape);
          await expect($('[role="dialog"]')).not.toBeExisting();
        }
      }
    }
    console.log(written.join("\n"));
  });
});
