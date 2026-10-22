/**
 * Captures the built desktop app for design critique (docs/BRIEF.md §5.5):
 *   artifacts/screens/desktop/<os>/<screen>-<theme>-<width>x<height>.png
 *
 * Usage: pnpm capture [screen ...]
 *   screen = a destination id (today, jobs, tracker, cvs, mail) or an overlay (palette, shortcuts,
 *   shown over Today). Default: all of them, in light and dark, at 1280×800 and 1920×1080.
 *
 * Screenshots contain the web contents only: macOS traffic lights and Windows caption buttons are
 * drawn by the OS outside it, and the native material is replaced by its opaque fallback colour.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { destinations } from "../src/shared/destinations";
import { IpcChannel, type MenuCommand } from "../src/shared/ipc";
import { appDir, launchBuiltApp } from "../tests/launch";

const sizes = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const;
const themes = ["light", "dark"] as const;
const overlays: Record<string, MenuCommand> = {
  palette: { type: "open-palette" },
  shortcuts: { type: "open-shortcuts" },
};

const osNames: Partial<Record<NodeJS.Platform, string>> = { darwin: "macos", win32: "windows" };
const outputDir = path.resolve(
  appDir,
  "../../artifacts/screens/desktop",
  osNames[process.platform] ?? process.platform,
);

const allScreens = [...destinations.map((destination) => destination.id), ...Object.keys(overlays)];
const requested = process.argv.slice(2);
const unknown = requested.filter((screen) => !allScreens.includes(screen));
if (unknown.length > 0) {
  console.error(`Unknown screen(s): ${unknown.join(", ")}. Choose from: ${allScreens.join(", ")}`);
  process.exit(1);
}
const screens = requested.length > 0 ? requested : allScreens;

await mkdir(outputDir, { recursive: true });
const { app, page } = await launchBuiltApp();
const written: string[] = [];

try {
  // Screenshots can't show the OS material behind transparent areas; use the opaque fallback.
  await page.evaluate(() => {
    document.documentElement.dataset["material"] = "none";
  });

  for (const theme of themes) {
    // Native side (window colours) and renderer side (Playwright otherwise pins prefers-color-scheme).
    await app.evaluate(({ nativeTheme }, themeSource) => {
      nativeTheme.themeSource = themeSource;
    }, theme);
    await page.emulateMedia({ colorScheme: theme });

    for (const size of sizes) {
      // The window may be clamped to the display; the viewport is emulated at the exact size.
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
      }, size);
      await page.setViewportSize(size);

      for (const screen of screens) {
        const destination = destinations.find((candidate) => candidate.id === screen);
        await page.evaluate((route) => {
          window.location.hash = route;
        }, destination?.path ?? destinations[0].path);
        await page.getByRole("heading", { level: 1 }).waitFor();

        const overlay = overlays[screen];
        if (overlay) {
          await app.evaluate(
            ({ BrowserWindow }, { channel, command }) => {
              BrowserWindow.getAllWindows()[0]?.webContents.send(channel, command);
            },
            { channel: IpcChannel.menuCommand, command: overlay },
          );
          await page.getByRole("dialog").waitFor();
        }

        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await page.waitForTimeout(150);
        const file = path.join(outputDir, `${screen}-${theme}-${size.width}x${size.height}.png`);
        await page.screenshot({ path: file, scale: "css" });
        written.push(path.relative(path.resolve(appDir, "../.."), file));

        if (overlay) {
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "hidden" });
        }
      }
    }
  }
} finally {
  await app.close();
}

console.log(written.join("\n"));
