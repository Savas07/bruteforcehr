/**
 * Real-app captures of the design build (final critique rounds on macOS and the Windows CI
 * runner): the same screens, states and params as the browser harness (scripts/capture-design.ts),
 * but in WKWebView / WebView2 inside the Tauri shell. Build once with `pnpm build:e2e:design`, then
 * `pnpm capture:app:design`. Narrow it with `BFHR_SCREENS=today,mail-review` and
 * `BFHR_STATES=populated,offline` (comma-separated); `BFHR_LOCALE=tr|de` captures another UI
 * language. `BFHR_UPDATE_STATES=all` (or `ready,notes,…`) adds the update UI states
 * (`updateDesignStates`, each at its own size) as update-<state>-…png; `BFHR_AUTH_STATES=all` (or
 * `email,check-email,…`) adds the sign-in states (`authDesignStates`, 1280×800) as
 * sign-in-<state>-…png; `BFHR_SCREENS=none` skips
 * the screens. Every route pins the locale and time zone (`?locale=&tz=`, CAPTURE_PIN) so macOS,
 * Windows and the browser harness render the same text. Writes
 *   artifacts/screens/desktop/<macos|windows>/design/<screen>-<state>-<theme>-<w>x<h>.png
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  authCaptureFileName,
  authDesignHash,
  type AuthDesignState,
  authDesignStates,
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
  updateCaptureFileName,
  updateCaptureSize,
  updateDesignHash,
  type UpdateDesignState,
  updateDesignStates,
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

const screens =
  process.env["BFHR_SCREENS"] === "none"
    ? []
    : fromEnv("BFHR_SCREENS", Object.keys(designScreenPaths) as DesignScreenName[]);
const updateStates = !process.env["BFHR_UPDATE_STATES"]
  ? []
  : process.env["BFHR_UPDATE_STATES"] === "all"
    ? updateDesignStates
    : fromEnv<UpdateDesignState>("BFHR_UPDATE_STATES", updateDesignStates);
const authStates = !process.env["BFHR_AUTH_STATES"]
  ? []
  : process.env["BFHR_AUTH_STATES"] === "all"
    ? authDesignStates
    : fromEnv<AuthDesignState>("BFHR_AUTH_STATES", authDesignStates);
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
    // The screen clears and re-sets the ready flag itself whenever its route changes. Clearing it
    // here would hang when the route already shows that state (the first capture: `#/today`
    // defaults to populated/ready), so instead wait until React has committed the navigation (two
    // frames) and then for the flag.
    const capture = async (hash: string, file: string) => {
      await browser.execute(async (target) => {
        window.location.hash = target;
        // Executor form: the shared tsconfig targets ES2023 (no Promise.withResolvers).
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
        );
      }, hash);
      await $(`html[${DESIGN_READY_ATTRIBUTE}="true"]`).waitForExist();
      written.push(await saveScreenshot(path.join(outputDir, file)));
    };
    for (const theme of captureThemes) {
      await setTheme(theme);
      for (const size of captureSizes) {
        await setViewport(size.width, size.height);
        for (const screen of screens)
          for (const state of states)
            await capture(designHash(screen, state, pin), captureFileName(screen, state, theme, size));
      }
      for (const state of updateStates) {
        const size = updateCaptureSize(state);
        await setViewport(size.width, size.height);
        await capture(updateDesignHash(state, pin), updateCaptureFileName(state, theme, size));
      }
      if (authStates.length > 0) await setViewport(captureSizes[0].width, captureSizes[0].height);
      for (const state of authStates)
        await capture(authDesignHash(state, pin), authCaptureFileName(state, theme, captureSizes[0]));
    }
    console.log(written.join("\n"));
  });
});
