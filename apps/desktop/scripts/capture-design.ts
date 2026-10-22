// Browser design harness: captures the design build without a Rust build.
//
//   pnpm --filter @bfhr/desktop capture:design <screen…|all> [--states populated,empty,…]
//     [--engines webkit,chromium] [--themes light,dark] [--sizes 1280x800,1920x1080] [--scale 1]
//
// Starts the Vite dev server in `design` mode, opens every screen × state in Playwright WebKit
// (≈ macOS WKWebView, rendered with the macOS chrome) and Chromium (≈ Windows WebView2, rendered
// with the Windows chrome), and writes
//   artifacts/screens/desktop/harness/<engine>/<screen>-<state>-<theme>-<w>x<h>.png
// Final critique rounds use the real app instead (`pnpm capture:app:design`, e2e/).
// Runs on Node 22 type stripping.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type BrowserType, chromium, webkit } from "playwright";
import { createServer } from "vite";
import {
  captureFileName,
  captureSizes,
  type CaptureTheme,
  captureThemes,
  DESIGN_READY_ATTRIBUTE,
  designHash,
  type DesignScreenName,
  designScreenPaths,
  type DesignState,
  designStates,
} from "../src/design/matrix.ts";

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "../..");
const outputRoot = path.join(repoRoot, "artifacts/screens/desktop/harness");

/** Engine → the desktop platform it stands in for. */
const engines = {
  webkit: { type: webkit, platform: "macos" },
  chromium: { type: chromium, platform: "windows" },
} as const satisfies Record<string, { type: BrowserType; platform: string }>;
type EngineName = keyof typeof engines;

function usage(message: string): never {
  console.error(`${message}

Usage: pnpm --filter @bfhr/desktop capture:design <screen…|all> [--states a,b] [--engines webkit,chromium]
       [--themes light,dark] [--sizes 1280x800,1920x1080] [--scale 1]
Screens: ${Object.keys(designScreenPaths).join(", ")}
States:  ${designStates.join(", ")}`);
  process.exit(2);
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T[] {
  if (value === undefined) return [...allowed];
  const picked = value.split(",").map((item) => item.trim());
  for (const item of picked) if (!allowed.includes(item as T)) usage(`Unknown ${label}: ${item}`);
  return picked as T[];
}

const positional: string[] = [];
const options: Record<string, string> = {};
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index] ?? "";
  if (!arg.startsWith("--")) positional.push(arg);
  else {
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? argv[(index += 1)];
    if (!key || value === undefined) usage(`Missing value for ${arg}`);
    options[key] = value;
  }
}
const screenNames = Object.keys(designScreenPaths) as DesignScreenName[];
if (positional.length === 0) usage("Name at least one screen (or all).");
const screens: DesignScreenName[] = positional.includes("all")
  ? screenNames
  : positional.map((name) =>
      screenNames.includes(name as DesignScreenName)
        ? (name as DesignScreenName)
        : usage(`Unknown screen: ${name}`),
    );
const states = pick<DesignState>(options["states"], designStates, "state");
const themes = pick<CaptureTheme>(options["themes"], captureThemes, "theme");
const engineNames = pick<EngineName>(options["engines"], Object.keys(engines) as EngineName[], "engine");
const sizes =
  options["sizes"] === undefined
    ? captureSizes.map((size) => ({ ...size }))
    : options["sizes"].split(",").map((size) => {
        const [width, height] = size.split("x").map(Number);
        if (!width || !height) usage(`Bad size: ${size} (use 1280x800)`);
        return { width, height };
      });
const scale = Number(options["scale"] ?? 1);

// The design build imports the tokens' generated CSS.
if (!existsSync(path.join(repoRoot, "packages/ui-tokens/dist/tailwind.css")))
  execFileSync("pnpm", ["--filter", "@bfhr/ui-tokens", "build"], { cwd: repoRoot, stdio: "inherit" });

const server = await createServer({
  root: appDir,
  configFile: path.join(appDir, "vite.config.ts"),
  mode: "design",
  logLevel: "warn",
  server: { port: 5199, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0];
if (!baseUrl) throw new Error("The Vite dev server has no local URL");

const written: string[] = [];
const failures: string[] = [];
try {
  for (const engineName of engineNames) {
    const engine = engines[engineName];
    const outputDir = path.join(outputRoot, engineName);
    await mkdir(outputDir, { recursive: true });
    const browser = await engine.type.launch();
    try {
      for (const theme of themes) {
        for (const size of sizes) {
          const context = await browser.newContext({
            viewport: size,
            colorScheme: theme,
            deviceScaleFactor: scale,
            locale: "en-GB",
            timezoneId: "Europe/Istanbul",
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => failures.push(`${engineName}: ${error.message}`));
          page.on("console", (message) => {
            if (message.type() === "error") failures.push(`${engineName} console: ${message.text()}`);
          });
          // The platform is read once at load, so load the app per context with its platform.
          await page.goto(
            `${baseUrl}${designHash(screens[0] ?? "demo", "populated", { platform: engine.platform })}`,
          );
          for (const screen of screens) {
            for (const state of states) {
              await page.evaluate(
                ({ attribute, hash }) => {
                  document.documentElement.removeAttribute(attribute);
                  window.location.hash = hash;
                },
                {
                  attribute: DESIGN_READY_ATTRIBUTE,
                  hash: designHash(screen, state, { platform: engine.platform }),
                },
              );
              await page.waitForSelector(`html[${DESIGN_READY_ATTRIBUTE}="true"]`, { state: "attached" });
              await page.mouse.move(size.width - 1, size.height - 1);
              const file = path.join(outputDir, captureFileName(screen, state, theme, size));
              await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
              written.push(path.relative(repoRoot, file));
            }
          }
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

console.log(written.join("\n"));
console.log(`${written.length} screenshots in ${path.relative(repoRoot, outputRoot)}`);
if (failures.length > 0) {
  console.error(`Page errors:\n${[...new Set(failures)].join("\n")}`);
  process.exit(1);
}
