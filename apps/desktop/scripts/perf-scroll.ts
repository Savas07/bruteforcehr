// Scrolling budget (docs/BRIEF.md §9: 60 fps with 5,000 jobs and 1,000 applications;
// docs/runbooks/performance.md).
//
//   pnpm --filter @bfhr/desktop perf:scroll [--engines webkit,chromium] [--surfaces jobs,table,board]
//     [--runs 3] [--budget-scale 1] [--reuse-build]
//
// Builds the design build (production React, `vite build --mode design`), serves it, and opens the
// Jobs feed, the Tracker table and the Tracker board on the scaled fixture (`?fixture=scaled`:
// 5,000 jobs, 1,000 applications in the memory stores, src/design/datasets.ts) in Playwright
// WebKit (≈ macOS WKWebView) and Chromium (≈ Windows WebView2) at 1280×800. On each surface it
// scrolls the largest scroll container to its end and back at a steady 3,000 px/s, driven from
// requestAnimationFrame, `--runs` times, and records per frame:
//   - frame time: the delta between consecutive requestAnimationFrame timestamps (what the user
//     sees; it can't go below the display's refresh interval);
//   - frame work: from the frame's start (its requestAnimationFrame timestamp) until a task posted
//     from the callback runs, i.e. scroll handlers (the virtualizers render synchronously there),
//     callbacks, style, layout and paint. It doesn't depend on the refresh rate, so it still shows
//     whether a frame would fit in 16.7 ms when the OS throttles the page (macOS Low Power Mode
//     holds WebKit at 30 Hz). Chromium starts the main-thread frame after its timestamp and
//     overlaps it with the compositor, so there it overstates the cost;
//   - long tasks: Chromium's PerformanceObserver `longtask`; WebKit has no long-task API, so a
//     frame whose work exceeds 50 ms stands in for one there.
// A surface passes when, counted in display refresh intervals (a frame delta of 16–18 ms at 60 Hz
// is one interval with timestamp jitter, a dropped frame makes two), its p95 frame time is one
// interval, i.e. fewer than 5 % of frames dropped, and no long task exceeds 50 ms. The page first
// stands still for 2 s to measure the refresh interval and its jitter (idle p95). Where the page
// refreshes slower than 60 Hz (macOS Low Power Mode holds WebKit at 30 Hz), p95 frame work
// ≤ 16.7 ms replaces the frame-time check. `--budget-scale` multiplies the limits (CI slack,
// docs/runbooks/performance.md). Writes artifacts/perf/desktop-scroll.json and exits non-zero
// when a surface misses the budget. Runs on Node 22 type stripping.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type LaunchOptions, type Page, webkit } from "playwright";
import { build, preview } from "vite";
import { CAPTURE_PIN, DESIGN_READY_ATTRIBUTE } from "../src/design/matrix.ts";

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "../..");

/** One frame at 60 Hz. */
const FRAME_MS = 1000 / 60;
/** rAF timestamps jitter by a fraction of a millisecond; a dropped frame adds a whole interval. */
const JITTER_MS = 0.5;
const LONG_TASK_MS = 50;
const SPEED_PX_PER_S = 3_000;
/** Each direction of a pass stops after this long, whether or not it reached the end. */
const LEG_LIMIT_MS = 8_000;

const engines = {
  webkit: { type: webkit, platform: "macos", launch: {} },
  chromium: { type: chromium, platform: "windows", launch: { ignoreDefaultArgs: ["--hide-scrollbars"] } },
} as const satisfies Record<string, { type: typeof webkit; platform: string; launch: LaunchOptions }>;
type EngineName = keyof typeof engines;

/** Each surface: its route on the scaled fixture. */
const surfaces = {
  jobs: "/jobs",
  table: "/tracker?view=table",
  board: "/tracker?view=board",
} as const;
type SurfaceName = keyof typeof surfaces;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T[] {
  if (value === undefined) return [...allowed];
  const picked = value.split(",").map((item) => item.trim());
  for (const item of picked)
    if (!allowed.includes(item as T)) throw new Error(`Unknown ${label}: ${item} (${allowed.join(", ")})`);
  return picked as T[];
}

const engineNames = pick(option("engines"), Object.keys(engines) as EngineName[], "engine");
const surfaceNames = pick(option("surfaces"), Object.keys(surfaces) as SurfaceName[], "surface");
const runs = Number(option("runs") ?? 3);
const budgetScale = Number(option("budget-scale") ?? 1);
const reuseBuild = process.argv.includes("--reuse-build");
if (!(runs >= 1) || !(budgetScale >= 1)) throw new Error("--runs and --budget-scale must be ≥ 1");

interface PassResult {
  /** requestAnimationFrame deltas on the same page before scrolling (ms): the machine's cadence. */
  readonly idle: number[];
  /** requestAnimationFrame deltas while scrolling (ms). */
  readonly frames: number[];
  /** Frame work (ms), see the file comment. */
  readonly work: number[];
  /** Long-task durations (ms); null where the engine has no long-task API. */
  readonly longTasks: number[] | null;
  /** The container's scroll range (px) and a name for it. */
  readonly range: number;
  readonly label: string;
}

/**
 * Runs in the page: scrolls the largest vertical scroll container to its end and back at `speed`
 * px/s from requestAnimationFrame and records every frame's time and work, and the long tasks.
 */
async function scrollPass({ speed, legLimitMs }: { speed: number; legLimitMs: number }): Promise<PassResult> {
  const nextFrame = () => {
    const { promise, resolve } = Promise.withResolvers<number>();
    requestAnimationFrame(resolve);
    return promise;
  };
  const scroller = [...document.querySelectorAll<HTMLElement>("*")]
    .filter((element) => {
      const { overflowY } = getComputedStyle(element);
      return (
        (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 100
      );
    })
    .toSorted((a, b) => b.scrollHeight - a.scrollHeight)[0];
  if (!scroller) throw new Error("No scroll container overflows on this screen");
  const range = scroller.scrollHeight - scroller.clientHeight;
  const label =
    scroller.getAttribute("aria-label") ?? scroller.dataset["testid"] ?? scroller.tagName.toLowerCase();

  scroller.scrollTop = 0;
  // Two seconds without scrolling: the machine's own frame cadence and jitter.
  const idle: number[] = [];
  let last = await nextFrame();
  for (let index = 0; index < 120; index++) {
    const now = await nextFrame();
    idle.push(now - last);
    last = now;
  }

  let longTasks: number[] | null = null;
  let observer: PerformanceObserver | null = null;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    const durations: number[] = [];
    longTasks = durations;
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ type: "longtask" });
  }

  const frames: number[] = [];
  const work: number[] = [];
  // A message posted from the callback runs as the next task, once the frame is rendered.
  const channel = new MessageChannel();
  const frameStarts: number[] = [];
  channel.port1.onmessage = () => {
    const start = frameStarts.shift();
    if (start !== undefined) work.push(performance.now() - start);
  };
  const done = Promise.withResolvers<null>();
  let previous: number | null = null;
  let direction = 1;
  let legStarted = 0;
  const tick = (now: number) => {
    if (previous === null) legStarted = now;
    else {
      frames.push(now - previous);
      frameStarts.push(now);
      channel.port2.postMessage(null);
    }
    const step = previous === null ? 0 : ((now - previous) / 1000) * speed;
    previous = now;
    scroller.scrollTop += direction * step;
    const legOver = now - legStarted > legLimitMs;
    if (direction === 1 && (scroller.scrollTop >= range - 1 || legOver)) {
      direction = -1;
      legStarted = now;
    } else if (direction === -1 && (scroller.scrollTop <= 0 || legOver)) {
      done.resolve(null);
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await done.promise;
  // The last frame's message and long-task entries arrive after it.
  await nextFrame();
  await nextFrame();
  observer?.disconnect();
  channel.port1.close();
  return { idle, frames, work, longTasks, range, label };
}

function percentile(values: readonly number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const round = (value: number) => Math.round(value * 10) / 10;

interface SurfaceResult {
  readonly engine: EngineName;
  readonly surface: SurfaceName;
  readonly container: string;
  readonly range: number;
  /** The idle requestAnimationFrame interval: 16.7 at 60 Hz, 33.3 when the OS throttles to 30 Hz. */
  readonly refreshMs: number;
  /** p95 of the idle frames: how much the machine's own frame timing varies with nothing to do. */
  readonly idleP95Ms: number;
  readonly frames: number;
  readonly frameTime: { readonly p50: number; readonly p95: number; readonly max: number };
  readonly frameWork: { readonly p50: number; readonly p95: number; readonly max: number };
  /** Frames longer than 1.5 refresh intervals. */
  readonly dropped: number;
  /** Long tasks over 50 ms (WebKit: frames whose work exceeds 50 ms). */
  readonly longTasks: number;
  readonly longestTask: number;
  readonly longTaskSource: "longtask" | "frame work";
  readonly pass: boolean;
}

async function measure(page: Page, engine: EngineName, surface: SurfaceName): Promise<SurfaceResult> {
  const passes: PassResult[] = [];
  for (let run = 0; run < runs; run++)
    passes.push(await page.evaluate(scrollPass, { speed: SPEED_PX_PER_S, legLimitMs: LEG_LIMIT_MS }));
  const first = passes[0];
  if (!first) throw new Error("no runs");
  const frames = passes.flatMap((pass) => pass.frames);
  const work = passes.flatMap((pass) => pass.work);
  const idle = passes.flatMap((pass) => pass.idle);
  const refresh = percentile(idle, 50);
  const idleP95 = percentile(idle, 95);
  const hasLongTasks = first.longTasks !== null;
  const blocking = hasLongTasks
    ? passes.flatMap((pass) => pass.longTasks ?? [])
    : work.filter((duration) => duration > LONG_TASK_MS);
  const frameP95 = percentile(frames, 95);
  const workP95 = percentile(work, 95);
  const throttled = refresh > FRAME_MS + JITTER_MS;
  // Frames are shown on display refreshes: a delta is one interval give or take timestamp jitter
  // (the idle p95 shows how much on this machine), or two or more when a frame was dropped.
  // Counted in whole intervals, p95 must be one interval: fewer than 5 % of frames dropped.
  const intervals = frames.map((frame) => Math.max(1, Math.round(frame / refresh)));
  const pass =
    (throttled ? workP95 <= FRAME_MS * budgetScale : percentile(intervals, 95) <= budgetScale) &&
    blocking.every((duration) => duration <= LONG_TASK_MS * budgetScale);
  return {
    engine,
    surface,
    container: first.label,
    range: first.range,
    refreshMs: round(refresh),
    idleP95Ms: round(idleP95),
    frames: frames.length,
    frameTime: { p50: round(percentile(frames, 50)), p95: round(frameP95), max: round(Math.max(...frames)) },
    frameWork: { p50: round(percentile(work, 50)), p95: round(workP95), max: round(Math.max(...work)) },
    dropped: frames.filter((frame) => frame > refresh * 1.5).length,
    longTasks: blocking.filter((duration) => duration > LONG_TASK_MS).length,
    longestTask: round(Math.max(0, ...blocking)),
    longTaskSource: hasLongTasks ? "longtask" : "frame work",
    pass,
  };
}

// The design build imports the tokens' generated CSS.
if (!existsSync(path.join(repoRoot, "packages/ui-tokens/dist/tailwind.css")))
  execFileSync("pnpm", ["--filter", "@bfhr/ui-tokens", "build"], { cwd: repoRoot, stdio: "inherit" });

/** Kept between runs, so `--reuse-build` can skip the build while iterating on the harness. */
const outDir = path.join(appDir, "node_modules/.cache/bfhr-perf-design");
const results: SurfaceResult[] = [];
const failures: string[] = [];
if (!reuseBuild || !existsSync(path.join(outDir, "index.html")))
  await build({
    root: appDir,
    configFile: path.join(appDir, "vite.config.ts"),
    mode: "design",
    logLevel: "warn",
    build: { outDir, emptyOutDir: true, chunkSizeWarningLimit: 5_000 },
  });
const server = await preview({
  root: appDir,
  configFile: path.join(appDir, "vite.config.ts"),
  mode: "design",
  logLevel: "warn",
  build: { outDir },
  preview: { port: 5198, strictPort: false },
});
const baseUrl = server.resolvedUrls?.local[0];
try {
  if (!baseUrl) throw new Error("The preview server has no local URL");
  for (const engineName of engineNames) {
    const engine = engines[engineName];
    const browser = await engine.type.launch(engine.launch);
    try {
      for (const surface of surfaceNames) {
        // A fresh page per surface: one surface's garbage doesn't land in the next one's frames.
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          locale: CAPTURE_PIN.locale,
          timezoneId: CAPTURE_PIN.tz,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => failures.push(`${engineName} ${surface}: ${error.message}`));
        const [route, own = ""] = surfaces[surface].split("?");
        const params = new URLSearchParams({
          ...Object.fromEntries(new URLSearchParams(own)),
          fixture: "scaled",
          platform: engine.platform,
          locale: CAPTURE_PIN.locale,
          tz: CAPTURE_PIN.tz,
        });
        await page.goto(`${baseUrl}#${route}?${params.toString()}`);
        await page.waitForSelector(`html[${DESIGN_READY_ATTRIBUTE}="true"]`, {
          state: "attached",
          timeout: 60_000,
        });
        // Let the first render's idle work (fonts, effects) finish before measuring.
        await page.waitForTimeout(1_000);
        const result = await measure(page, engineName, surface);
        results.push(result);
        const { frameTime, frameWork } = result;
        console.log(
          `${result.pass ? "PASS" : "FAIL"} ${engineName.padEnd(8)} ${surface.padEnd(5)} ` +
            `frame time p50 ${frameTime.p50} / p95 ${frameTime.p95} / max ${frameTime.max} ms ` +
            `(refresh ${result.refreshMs} ms, idle p95 ${result.idleP95Ms} ms, ${result.dropped}/${result.frames} dropped) · ` +
            `frame work p50 ${frameWork.p50} / p95 ${frameWork.p95} / max ${frameWork.max} ms · ` +
            `${result.longTasks} long tasks (${result.longTaskSource}, longest ${result.longestTask} ms) · ` +
            `${result.container} ${result.range} px`,
        );
        if (result.refreshMs > FRAME_MS + JITTER_MS)
          console.warn(
            `  ${engineName} refreshes every ${result.refreshMs} ms here (macOS Low Power Mode holds WebKit at 30 Hz): frame work is the 60 fps check`,
          );
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}

const output = path.join(repoRoot, "artifacts/perf/desktop-scroll.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      budget: { frameWorkP95Ms: FRAME_MS, jitterMs: JITTER_MS, longTaskMs: LONG_TASK_MS, scale: budgetScale },
      speedPxPerS: SPEED_PX_PER_S,
      runs,
      platform: `${process.platform}-${process.arch}`,
      results,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${path.relative(repoRoot, output)}`);
for (const failure of failures) console.error(failure);
const missed = results.filter((result) => !result.pass);
if (missed.length > 0 || failures.length > 0) {
  console.error(
    `${missed.length} surface(s) missed the scrolling budget: ${missed.map((r) => `${r.engine} ${r.surface}`).join(", ")}`,
  );
  process.exit(1);
}
