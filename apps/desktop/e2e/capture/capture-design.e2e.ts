/**
 * Real-app captures of the design build (final critique rounds on macOS and the Windows CI
 * runner): the same screens, states and params as the browser harness (scripts/capture-design.ts),
 * but in WKWebView / WebView2 inside the Tauri shell. Build once with `pnpm build:e2e:design`, then
 * `pnpm capture:app:design`. Narrow it with `BFHR_SCREENS=today,mail-review` and
 * `BFHR_STATES=populated,offline` (comma-separated). Writes
 *   artifacts/screens/desktop/<macos|windows>/design/<screen>-<state>-<theme>-<w>x<h>.png
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
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
import { osName, repoRoot, saveScreenshot, setTheme, setViewport, useOpaqueMaterial } from "./helpers";

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
const outputDir = path.join(repoRoot, "artifacts/screens/desktop", osName, "design");

describe("design-build screenshots", () => {
  it("captures every screen × state in light and dark at both sizes", async () => {
    await mkdir(outputDir, { recursive: true });
    await expect($("#root")).toBeExisting();
    await useOpaqueMaterial();

    const written: string[] = [];
    for (const theme of captureThemes) {
      await setTheme(theme);
      for (const size of captureSizes) {
        await setViewport(size.width, size.height);
        for (const screen of screens) {
          for (const state of states) {
            await browser.execute(
              (attribute, hash) => {
                document.documentElement.removeAttribute(attribute);
                window.location.hash = hash;
              },
              DESIGN_READY_ATTRIBUTE,
              designHash(screen, state),
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
