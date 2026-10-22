/**
 * Real-app captures of the design build (final critique rounds on macOS and the Windows CI
 * runner): the same screens, states and params as the browser harness (scripts/capture-design.ts),
 * but in WKWebView / WebView2 inside the Tauri shell. Build once with `pnpm build:e2e:design`, then
 * `pnpm capture:app:design`. Narrow it with `BFHR_SCREENS=today,mail-review` and
 * `BFHR_STATES=populated,offline` (comma-separated); `BFHR_LOCALE=tr|de` captures another UI
 * language. Every route pins the locale and time zone (`?locale=&tz=`, CAPTURE_PIN) so macOS,
 * Windows and the browser harness render the same text. Writes
 *   artifacts/screens/desktop/<macos|windows>/design/<screen>-<state>-<theme>-<w>x<h>.png
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  CAPTURE_LOCALES,
  CAPTURE_PIN,
  type CaptureLanguage,
  captureFileName,
  captureSizes,
  captureThemes,
  DESIGN_READY_ATTRIBUTE,
  designHash,
  type DesignScreenName,
  designScreenPaths,
  type DesignState,
  designStates,
} from "../../src/design/matrix.ts";
import { osName, repoRoot, saveScreenshot, setTheme, setViewport, prepareCapture } from "./helpers";

function fromEnv<T extends string>(name: string, allowed: readonly T[]): readonly T[] {
  const value = process.env[name];
  if (!value) return allowed;
  const picked = value.split(",").map((item) => item.trim());
  for (const item of picked)
    if (!allowed.includes(item as T)) throw new Error(`${name}: unknown value ${item}`);
  return picked as T[];
}

const screens = fromEnv("BFHR_SCREENS", Object.keys(designScreenPaths) as DesignScreenName[]);
const states = fromEnv<DesignState>("BFHR_STATES", designStates);
const languageEnv = process.env["BFHR_LOCALE"] || "en";
if (!Object.hasOwn(CAPTURE_LOCALES, languageEnv))
  throw new Error(`BFHR_LOCALE: unknown value ${languageEnv}`);
const language = languageEnv as CaptureLanguage;
const pin = { locale: CAPTURE_LOCALES[language], tz: CAPTURE_PIN.tz };
// English keeps the flat layout; other languages get their own folder (as in the harness).
const outputDir = path.join(
  repoRoot,
  "artifacts/screens/desktop",
  osName,
  "design",
  ...(language === "en" ? [] : [language]),
);

describe("design-build screenshots", () => {
  it("captures every screen × state in light and dark at both sizes", async () => {
    await mkdir(outputDir, { recursive: true });
    await expect($("#root")).toBeExisting();
    await prepareCapture();

    const written: string[] = [];
    for (const theme of captureThemes) {
      await setTheme(theme);
      for (const size of captureSizes) {
        await setViewport(size.width, size.height);
        for (const screen of screens) {
          for (const state of states) {
            // The screen clears and re-sets the ready flag itself whenever its screen × state
            // changes. Clearing it here would hang when the route already shows that state (the
            // first capture: `#/today` defaults to populated/ready), so instead wait until React
            // has committed the navigation (two frames) and then for the flag.
            await browser.execute(
              async (hash) => {
                window.location.hash = hash;
                // Executor form: the shared tsconfig targets ES2023 (no Promise.withResolvers).
                await new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
                );
              },
              designHash(screen, state, pin),
            );
            await $(`html[${DESIGN_READY_ATTRIBUTE}="true"]`).waitForExist();
            written.push(
              await saveScreenshot(path.join(outputDir, captureFileName(screen, state, theme, size))),
            );
          }
        }
      }
    }
    console.log(written.join("\n"));
  });
});
