// Browser design harness: captures the design build without a Rust build.
//
//   pnpm --filter @bfhr/desktop capture:design <screen…|all> [--states populated,empty,…]
//     [--engines webkit,chromium] [--themes light,dark] [--sizes 1280x800,1920x1080] [--scale 1]
//     [--locale en|tr|de] [--axe] [--update-states ready,notes,…] [--auth-states email,check-email,…]
//     [--csv-states pick,columns,…] [--privacy-states idle,ready,delete-typed,…]
//     [--chrome-states palette,shortcuts,rail,…]
//
// The `update` target captures the update UI states instead (`updateDesignStates`, over Today, each
// at its own size: the rail state is 600 px wide) as update-<state>-<theme>-<w>x<h>.png, all audited.
// The `sign-in` target captures the signed-out window (`authDesignStates`) at 1280×800 as
// sign-in-<state>-<theme>-<w>x<h>.png, all audited.
// The `tracker-csv` target captures the CSV import steps (`csvDesignStates`, over the table) at
// every size as tracker-csv-<state>-<theme>-<w>x<h>.png, audited at the first size.
// The `data-privacy` target captures Settings › Data & privacy (`privacyDesignStates`: export and
// delete dialog) at every size as data-privacy-<state>-<theme>-<w>x<h>.png, audited at the first size.
// The `chrome` target opens the command palette, the shortcuts sheet and the narrow rail with the
// keyboard (`chromeDesignStates`, each at its own size) as chrome-<state>-<theme>-<w>x<h>.png, all
// audited. Each of these starts from a fresh page load, and so does the shot after it, so an
// overlay never leaks into the next capture.
//
// --axe also runs axe-core (WCAG 2.1 A + AA tags) on every screen × state × theme in each engine,
// writes artifacts/a11y/desktop/<screen>-<state>-<theme>-<engine>.json, prints one line per page
// (violating nodes by impact) and exits non-zero on serious or critical violations.
//
// Starts the Vite dev server in `design` mode, opens every screen × state in Playwright WebKit
// (≈ macOS WKWebView, rendered with the macOS chrome) and Chromium (≈ Windows WebView2, rendered
// with the Windows chrome), and writes
//   artifacts/screens/desktop/harness/<engine>/<screen>-<state>-<theme>-<w>x<h>.png
// Final critique rounds use the real app instead (`pnpm capture:app:design`, e2e/).
// Runs on Node 22 type stripping.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserType, chromium, type LaunchOptions, type Page, webkit } from "playwright";
import { createServer } from "vite";
import {
  authCaptureFileName,
  authDesignHash,
  type AuthDesignState,
  authDesignStates,
  CAPTURE_LOCALES,
  CAPTURE_PIN,
  chromeCaptureFileName,
  chromeCaptureSize,
  chromeDesignHash,
  type ChromeDesignState,
  chromeDesignStates,
  type CaptureLanguage,
  captureFileName,
  csvCaptureFileName,
  csvDesignHash,
  type CsvDesignState,
  csvDesignStates,
  captureSizes,
  type CaptureTheme,
  captureThemes,
  DESIGN_READY_ATTRIBUTE,
  designHash,
  type DesignScreenName,
  designScreenPaths,
  type DesignState,
  designStates,
  privacyCaptureFileName,
  privacyDesignHash,
  type PrivacyDesignState,
  privacyDesignStates,
  onboardingCaptureFileName,
  onboardingDesignHash,
  type OnboardingDesignState,
  onboardingDesignStates,
  updateCaptureFileName,
  updateCaptureSize,
  updateDesignHash,
  type UpdateDesignState,
  updateDesignStates,
} from "../src/design/matrix.ts";

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "../..");
const outputRoot = path.join(repoRoot, "artifacts/screens/desktop/harness");

/** Engine → the desktop platform it stands in for. */
const engines = {
  webkit: { type: webkit, platform: "macos", launch: {} },
  // Playwright's headless Chromium hides scrollbars (`--hide-scrollbars`); WebView2 draws them, so
  // the Windows stand-in must too, or captures miss scrollbars taking layout width.
  chromium: { type: chromium, platform: "windows", launch: { ignoreDefaultArgs: ["--hide-scrollbars"] } },
} as const satisfies Record<string, { type: BrowserType; platform: string; launch: LaunchOptions }>;
type EngineName = keyof typeof engines;

function usage(message: string): never {
  console.error(`${message}

Usage: pnpm --filter @bfhr/desktop capture:design <screen…|all> [--states a,b] [--engines webkit,chromium]
       [--themes light,dark] [--sizes 1280x800,1920x1080] [--scale 1] [--locale en|tr|de] [--axe]
Screens: ${Object.keys(designScreenPaths).join(", ")}
States:  ${designStates.join(", ")}
Update:  update [--update-states ${updateDesignStates.join(",")}]
Sign-in: sign-in [--auth-states ${authDesignStates.join(",")}]
CSV:     tracker-csv [--csv-states ${csvDesignStates.join(",")}]
Privacy: data-privacy [--privacy-states ${privacyDesignStates.join(",")}]
Onboarding: onboarding [--onboarding-states ${onboardingDesignStates.join(",")}]
Chrome:  chrome [--chrome-states ${chromeDesignStates.join(",")}]`);
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
/** Flags without a value. */
const switches: Record<string, true> = { axe: true };
const enabled = new Set<string>();
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index] ?? "";
  if (!arg.startsWith("--")) positional.push(arg);
  else if (switches[arg.slice(2)]) enabled.add(arg.slice(2));
  else {
    const [key, inline] = arg.slice(2).split("=");
    const value = inline ?? argv[(index += 1)];
    if (!key || value === undefined) usage(`Missing value for ${arg}`);
    options[key] = value;
  }
}
const runAxe = enabled.has("axe");
const screenNames = Object.keys(designScreenPaths) as DesignScreenName[];
if (positional.length === 0)
  usage("Name at least one screen (or all, update, sign-in, tracker-csv, data-privacy, onboarding, chrome).");
/** `update` captures the update UI states (over Today) instead of a screen's five states. */
const wantsUpdate = positional.includes("update");
/** `sign-in` captures the signed-out window's states. */
const wantsSignIn = positional.includes("sign-in");
/** `tracker-csv` captures the CSV import steps over the table. */
const wantsCsv = positional.includes("tracker-csv");
/** `data-privacy` captures Settings › Data & privacy. */
const wantsPrivacy = positional.includes("data-privacy");
/** `onboarding` captures the first-run wizard's states. */
const wantsOnboarding = positional.includes("onboarding");
/** `chrome` captures the palette, the shortcuts sheet and the narrow rail. */
const wantsChrome = positional.includes("chrome");
const targets: Readonly<Record<string, true>> = {
  update: true,
  "sign-in": true,
  "tracker-csv": true,
  "data-privacy": true,
  onboarding: true,
  chrome: true,
};
const screens: DesignScreenName[] = positional.includes("all")
  ? screenNames
  : positional
      .filter((name) => !targets[name])
      .map((name) =>
        screenNames.includes(name as DesignScreenName)
          ? (name as DesignScreenName)
          : usage(`Unknown screen: ${name}`),
      );
const states = pick<DesignState>(options["states"], designStates, "state");
const updateStates = wantsUpdate
  ? pick<UpdateDesignState>(options["update-states"], updateDesignStates, "update state")
  : [];
const authStates = wantsSignIn
  ? pick<AuthDesignState>(options["auth-states"], authDesignStates, "sign-in state")
  : [];
const csvStates = wantsCsv ? pick<CsvDesignState>(options["csv-states"], csvDesignStates, "CSV state") : [];
const privacyStates = wantsPrivacy
  ? pick<PrivacyDesignState>(options["privacy-states"], privacyDesignStates, "data & privacy state")
  : [];
const onboardingStates = wantsOnboarding
  ? pick<OnboardingDesignState>(options["onboarding-states"], onboardingDesignStates, "onboarding state")
  : [];
const chromeStates = wantsChrome
  ? pick<ChromeDesignState>(options["chrome-states"], chromeDesignStates, "chrome state")
  : [];
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
const language = options["locale"] ?? "en";
if (!Object.hasOwn(CAPTURE_LOCALES, language)) usage(`Unknown locale: ${language}`);
/** The pinned locale + zone (`?locale=&tz=`, src/design/matrix.ts), same as the real-app capture. */
const browserLocale = CAPTURE_LOCALES[language as CaptureLanguage];
const routeExtras = (platform: string) => ({ platform, locale: browserLocale, tz: CAPTURE_PIN.tz });

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

/** axe-core impact levels, most severe first; serious and critical fail the run. */
const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;
type Impact = (typeof IMPACTS)[number];
/** WCAG 2.1 level A and AA rules (axe tags). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const a11yRoot = path.join(repoRoot, "artifacts/a11y/desktop", ...(language === "en" ? [] : [language]));
interface AuditSummary {
  readonly name: string;
  readonly counts: Record<Impact, number>;
  /** "color-contrast×3" per violated rule. */
  readonly rules: readonly string[];
  /** Nodes axe couldn't decide (e.g. contrast over gradients): "needs review", never failing. */
  readonly needsReview: number;
}
const audits: AuditSummary[] = [];

/** Runs axe on the rendered state, writes the full JSON report, returns the per-impact counts. */
async function audit(page: Page, name: string): Promise<AuditSummary> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await mkdir(a11yRoot, { recursive: true });
  await writeFile(path.join(a11yRoot, `${name}.json`), `${JSON.stringify(results, null, 2)}\n`);
  const counts: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const violation of results.violations) counts[violation.impact ?? "minor"] += violation.nodes.length;
  return {
    name,
    counts,
    rules: results.violations.map((violation) => `${violation.id}×${violation.nodes.length}`),
    needsReview: results.incomplete.reduce((sum, result) => sum + result.nodes.length, 0),
  };
}
/**
 * One capture: the route to open, the PNG name, the axe report name (null: no audit) and the
 * keyboard steps that open an overlay after the route renders (chrome states).
 */
interface Shot {
  readonly hash: (platform: string) => string;
  readonly file: (theme: CaptureTheme) => string;
  readonly audit: ((theme: CaptureTheme, engine: EngineName) => string) | null;
  readonly prepare?: (page: Page, platform: string) => Promise<void>;
}

/** Opens a chrome state with the keyboard, like a person would (⌘ on macOS, Ctrl on Windows). */
async function prepareChrome(state: ChromeDesignState, page: Page, platform: string): Promise<void> {
  const mod = platform === "macos" ? "Meta" : "Control";
  switch (state) {
    case "palette":
    case "palette-filtered":
    case "palette-empty": {
      await page.keyboard.press(`${mod}+k`);
      const input = page.locator("[cmdk-input]");
      await input.waitFor();
      if (state === "palette-filtered") await input.pressSequentially("mail");
      if (state === "palette-empty") await input.pressSequentially("salary");
      return;
    }
    case "shortcuts":
    case "shortcuts-panel":
      await page.keyboard.press(`${mod}+/`);
      await page.locator('[role="dialog"]').last().waitFor();
      return;
    case "rail":
      return;
    case "rail-focus":
      // Tab from the document start: "Jump to…", then Today, which shows its tooltip.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.getByRole("tooltip").waitFor();
      return;
  }
}

/** Captures sharing one viewport (one browser context). */
interface Batch {
  readonly size: { readonly width: number; readonly height: number };
  readonly shots: readonly Shot[];
}

const batches: Batch[] = sizes.map((size, sizeIndex) => ({
  size,
  shots: [
    ...screens.flatMap((screen) =>
      states.map((state): Shot => ({
        hash: (platform) => designHash(screen, state, routeExtras(platform)),
        file: (theme) => captureFileName(screen, state, theme, size),
        // One audit per screen × state × theme × engine (the first size; layout-independent rules).
        audit: sizeIndex === 0 ? (theme, engine) => `${screen}-${state}-${theme}-${engine}` : null,
      })),
    ),
    ...csvStates.map((state): Shot => ({
      hash: (platform) => csvDesignHash(state, routeExtras(platform)),
      file: (theme) => csvCaptureFileName(state, theme, size),
      audit: sizeIndex === 0 ? (theme, engine) => `tracker-csv-${state}-${theme}-${engine}` : null,
    })),
    ...privacyStates.map((state): Shot => ({
      hash: (platform) => privacyDesignHash(state, routeExtras(platform)),
      file: (theme) => privacyCaptureFileName(state, theme, size),
      audit: sizeIndex === 0 ? (theme, engine) => `data-privacy-${state}-${theme}-${engine}` : null,
    })),
    ...onboardingStates.map((state): Shot => ({
      hash: (platform) => onboardingDesignHash(state, routeExtras(platform)),
      file: (theme) => onboardingCaptureFileName(state, theme, size),
      audit: sizeIndex === 0 ? (theme, engine) => `onboarding-${state}-${theme}-${engine}` : null,
    })),
  ],
}));
// Update and chrome states pick their own size (the rail states need the narrow window); every
// one is audited.
const ownSizeBatches = new Map<string, { size: Batch["size"]; shots: Shot[] }>();
function addOwnSize(size: Batch["size"], shot: Shot): void {
  const key = `${size.width}x${size.height}`;
  const batch = ownSizeBatches.get(key) ?? { size, shots: [] };
  ownSizeBatches.set(key, batch);
  batch.shots.push(shot);
}
for (const state of updateStates) {
  const size = updateCaptureSize(state);
  addOwnSize(size, {
    hash: (platform) => updateDesignHash(state, routeExtras(platform)),
    file: (theme) => updateCaptureFileName(state, theme, size),
    audit: (theme, engine) => `update-${state}-${theme}-${engine}`,
  });
}
for (const state of chromeStates) {
  const size = chromeCaptureSize(state);
  addOwnSize(size, {
    hash: (platform) => chromeDesignHash(state, routeExtras(platform)),
    file: (theme) => chromeCaptureFileName(state, theme, size),
    audit: (theme, engine) => `chrome-${state}-${theme}-${engine}`,
    prepare: (page, platform) => prepareChrome(state, page, platform),
  });
}
batches.push(...ownSizeBatches.values());
if (authStates.length > 0)
  batches.push({
    size: captureSizes[0],
    shots: authStates.map((state): Shot => ({
      hash: (platform) => authDesignHash(state, routeExtras(platform)),
      file: (theme) => authCaptureFileName(state, theme, captureSizes[0]),
      audit: (theme, engine) => `sign-in-${state}-${theme}-${engine}`,
    })),
  });

try {
  for (const engineName of engineNames) {
    const engine = engines[engineName];
    // English captures keep the flat layout; other languages get their own folder.
    const outputDir = path.join(outputRoot, engineName, ...(language === "en" ? [] : [language]));
    await mkdir(outputDir, { recursive: true });
    const browser = await engine.type.launch(engine.launch);
    try {
      for (const theme of themes) {
        for (const { size, shots } of batches) {
          const [first] = shots;
          if (!first) continue;
          const context = await browser.newContext({
            viewport: size,
            colorScheme: theme,
            deviceScaleFactor: scale,
            locale: browserLocale,
            timezoneId: CAPTURE_PIN.tz,
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => failures.push(`${engineName}: ${error.message}`));
          page.on("console", (message) => {
            if (message.type() === "error") failures.push(`${engineName} console: ${message.text()}`);
          });
          // The platform is read once at load, so load the app per context with its platform.
          await page.goto(`${baseUrl}${first.hash(engine.platform)}`);
          // Overlays opened with the keyboard stay open across a hash change, so a prepared shot
          // and the shot after it start from a fresh page load.
          let overlayOpen = false;
          for (const shot of shots) {
            const hash = shot.hash(engine.platform);
            if (overlayOpen || (shot.prepare !== undefined && shot !== first)) {
              await page.goto("about:blank");
              await page.goto(`${baseUrl}${hash}`);
            } else {
              await page.evaluate(
                ({ attribute, hash }) => {
                  document.documentElement.removeAttribute(attribute);
                  window.location.hash = hash;
                },
                { attribute: DESIGN_READY_ATTRIBUTE, hash },
              );
            }
            await page.waitForSelector(`html[${DESIGN_READY_ATTRIBUTE}="true"]`, { state: "attached" });
            await page.mouse.move(size.width - 1, size.height - 1);
            await shot.prepare?.(page, engine.platform);
            overlayOpen = shot.prepare !== undefined;
            const file = path.join(outputDir, shot.file(theme));
            await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
            written.push(path.relative(repoRoot, file));
            if (runAxe && shot.audit) audits.push(await audit(page, shot.audit(theme, engineName)));
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
let blocking = 0;
if (runAxe) {
  for (const { name, counts, rules, needsReview } of audits) {
    const line = IMPACTS.map((impact) => `${counts[impact]} ${impact}`).join(" · ");
    const details = rules.length > 0 ? ` (${rules.join(", ")})` : "";
    console.log(`a11y ${name}: ${line} · ${needsReview} needs review${details}`);
    blocking += counts.critical + counts.serious;
  }
  console.log(`${audits.length} axe reports in ${path.relative(repoRoot, a11yRoot)}`);
}
if (failures.length > 0) console.error(`Page errors:\n${[...new Set(failures)].join("\n")}`);
if (blocking > 0) console.error(`✗ ${blocking} serious or critical accessibility violations`);
if (failures.length > 0 || blocking > 0) process.exit(1);
