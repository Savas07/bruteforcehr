// Cold-start budget (docs/BRIEF.md §9: desktop cold start < 2.5 s; docs/runbooks/performance.md).
//
//   node scripts/perf-cold-start.ts [--runs 5] [--budget-scale 1]
//
// Launches the test build (`pnpm build:e2e`, or `BFHR_APP_BINARY`) once to warm up and then
// `--runs` times, and times each launch from spawning the process until Today is first interactive:
// the app prints `bfhr-perf today-interactive <ms>` once Today's data is painted and the main thread
// is free (src/lib/perf.ts → src-tauri/src/perf.rs) and quits (`BFHR_PERF_EXIT_ON`). The launches
// start from a signed-in session with data (CI: `pnpm perf:cold-start` signs in through
// e2e/perf/session.e2e.ts first, against scripts/with-emulators.sh); the design build
// (`pnpm build:e2e:design`) opens on fixture-backed Today with no sign-in. Passes when the median
// is under 2,500 ms × `--budget-scale` (CI slack, see the runbook). Writes
// artifacts/perf/desktop-cold-start-<platform>.json. Runs on Node 22 type stripping.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { appBinaryPath } from "../e2e/wdio.base.ts";

const BUDGET_MS = 2_500;
const MARK = "today-interactive";
/** A launch that hasn't marked by then has failed. */
const LAUNCH_TIMEOUT_MS = 60_000;

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "../..");

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const runs = Number(option("runs") ?? 5);
const budgetScale = Number(option("budget-scale") ?? 1);
if (!Number.isInteger(runs) || runs < 1 || !(budgetScale >= 1))
  throw new Error("--runs must be a positive integer and --budget-scale ≥ 1");

interface Launch {
  /** Spawn → mark, measured here. */
  readonly ms: number;
  /** main() → mark, measured by the app. */
  readonly inAppMs: number;
}

/** One launch: spawn, wait for the mark, then for the app to quit. */
async function launch(): Promise<Launch> {
  const output: string[] = [];
  const started = performance.now();
  const child = spawn(appBinaryPath, [], {
    env: { ...process.env, BFHR_PERF_EXIT_ON: MARK },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exit = Promise.withResolvers<null>();
  child.once("exit", () => exit.resolve(null));
  const exited = exit.promise;
  const marked = Promise.withResolvers<Launch>();
  let buffered = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    const now = performance.now();
    buffered += chunk;
    const match = new RegExp(`^bfhr-perf ${MARK} (\\d+)$`, "mu").exec(buffered);
    if (match) marked.resolve({ ms: Math.round(now - started), inAppMs: Number(match[1]) });
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => output.push(chunk));
  child.once("error", (error) => marked.reject(error));
  child.once("exit", (code) =>
    marked.reject(new Error(`The app exited (${String(code)}) before Today was interactive`)),
  );
  const timer = setTimeout(
    () => marked.reject(new Error(`Today wasn't interactive within ${LAUNCH_TIMEOUT_MS / 1000} s`)),
    LAUNCH_TIMEOUT_MS,
  );
  try {
    return await marked.promise;
  } catch (error) {
    console.error(output.join("").slice(-4_000));
    throw error;
  } finally {
    clearTimeout(timer);
    // The app quits by itself after the mark; make sure, so the next launch is a cold one.
    const quit = await Promise.race([exited.then(() => true), sleep(10_000).then(() => false)]);
    if (!quit) {
      child.kill();
      await exited;
    }
  }
}

console.log(`Cold start: ${appBinaryPath}`);
const launches: Launch[] = [];
for (let run = 0; run <= runs; run++) {
  // Let the previous instance's webview processes and single-instance lock go away.
  await sleep(2_000);
  const result = await launch();
  if (run === 0) {
    console.log(`  warm-up: ${result.ms} ms (not counted)`);
    continue;
  }
  launches.push(result);
  console.log(`  run ${run}: ${result.ms} ms (in-app ${result.inAppMs} ms)`);
}
const median = launches.map((item) => item.ms).toSorted((a, b) => a - b)[Math.floor(runs / 2)] ?? 0;
const limit = BUDGET_MS * budgetScale;
const pass = median < limit;
const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const output = path.join(repoRoot, `artifacts/perf/desktop-cold-start-${platform}.json`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      budgetMs: BUDGET_MS,
      budgetScale,
      medianMs: median,
      runsMs: launches.map((item) => item.ms),
      inAppMs: launches.map((item) => item.inAppMs),
      binary: path.basename(appBinaryPath),
      platform: `${process.platform}-${process.arch}`,
      pass,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `${pass ? "PASS" : "FAIL"} median ${median} ms of ${runs} launches (budget ${BUDGET_MS} ms` +
    `${budgetScale === 1 ? "" : ` × ${budgetScale} CI slack = ${limit} ms`}); wrote ${path.relative(repoRoot, output)}`,
);
if (!pass) process.exit(1);
