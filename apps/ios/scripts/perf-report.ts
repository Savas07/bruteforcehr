// Reads `xcresulttool get test-results metrics` output of PerformanceTests (apps/ios/scripts/perf.sh)
// and checks the iOS budgets (docs/runbooks/performance.md):
//   - launch to interactive: median of the app's own launch-to-interactive time < 2 s (XCTest's
//     launch duration, which adds the simulator's launch overhead, and the baselines are reported);
//   - scrolling: median scroll hitch time ratio < 5 ms per s (Apple's "good"; at 60 Hz that is
//     under one dropped frame per 3 s of scrolling), for the dragging and the deceleration phase.
// The budget is "< 2 s on a recent iPhone"; a simulator can't measure that directly (on an M1 it
// launches the system Settings app in ~2.5 s, which an iPhone does in well under 1 s). So when the
// run has the system-app baseline (testLaunchBaselineSystemApp, same simulator, same run), the
// launch limit is that baseline: the app must reach interactive no slower than Settings launches.
// Without the baseline it falls back to 2 s. Both limits are multiplied by the third argument.
// Writes the summary JSON.
//
//   node apps/ios/scripts/perf-report.ts <metrics.json> <out.json> [budget-scale]
// Runs on Node 22 type stripping.
import { readFileSync, writeFileSync } from "node:fs";

interface Metric {
  readonly displayName: string;
  readonly unitOfMeasurement: string;
  readonly measurements: readonly number[];
  readonly identifier?: string;
}
interface TestWithMetrics {
  readonly testIdentifier: string;
  readonly testRuns: readonly {
    readonly device: { readonly deviceName: string };
    readonly metrics: readonly Metric[];
  }[];
}

const [input, output, scaleArg = "1"] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: perf-report.ts <metrics.json> <out.json> [budget-scale]");
const scale = Number(scaleArg);
const tests = JSON.parse(readFileSync(input, "utf8")) as TestWithMetrics[];

const LAUNCH_BUDGET_S = 2;
const HITCH_BUDGET_MS_PER_S = 5;

const median = (values: readonly number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};
const round = (value: number) => Math.round(value * 1000) / 1000;

const systemApp = tests
  .filter((test) => test.testIdentifier.includes("testLaunchBaselineSystemApp"))
  .flatMap((test) => test.testRuns.flatMap((run) => run.metrics))
  .find((metric) => metric.unitOfMeasurement === "s");
/** Settings' median launch on this run's simulator: the launch limit when present. */
const baselineS = systemApp === undefined ? null : median(systemApp.measurements);
console.log(
  baselineS === null
    ? `No system-app baseline in this run: launch limit ${LAUNCH_BUDGET_S} s`
    : `Launch limit = Settings' launch on this simulator in the same run: ${round(baselineS)} s`,
);

interface Check {
  readonly test: string;
  readonly device: string;
  readonly metric: string;
  readonly unit: string;
  readonly measurements: readonly number[];
  readonly median: number;
  readonly limit: number | null;
  readonly pass: boolean;
}

const checks: Check[] = [];
for (const test of tests) {
  for (const run of test.testRuns) {
    for (const metric of run.metrics) {
      // The app's own mark (PerformanceTests' InAppLaunchMetric); XCTest's launch durations and
      // the scroll durations are reported, not gated.
      const launch = metric.identifier === "com.savas07.bruteforcehr.launch-to-interactive";
      const hitch = /hitch time ratio/iu.test(metric.displayName);
      const limit = launch
        ? (baselineS ?? LAUNCH_BUDGET_S) * scale
        : hitch
          ? HITCH_BUDGET_MS_PER_S * scale
          : null;
      const value = median(metric.measurements);
      checks.push({
        test: test.testIdentifier,
        device: run.device.deviceName,
        metric: metric.displayName,
        unit: metric.unitOfMeasurement,
        measurements: metric.measurements.map(round),
        median: round(value),
        limit: limit === null ? null : round(limit),
        pass: limit === null || value < limit,
      });
    }
  }
}

for (const check of checks)
  console.log(
    `${check.limit === null ? "    " : check.pass ? "PASS" : "FAIL"} ${check.test} · ${check.metric}: median ${check.median} ${check.unit}` +
      `${check.limit === null ? "" : ` (budget < ${check.limit})`} · [${check.measurements.join(", ")}] · ${check.device}`,
  );

const gated = checks.filter((check) => check.limit !== null);
const launches = gated.filter((check) => check.test.includes("testLaunchToInteractive"));
const scrolls = gated.filter((check) => check.test.includes("testScroll"));
const ran = (name: string) => tests.some((test) => test.testIdentifier.includes(name));
writeFileSync(
  output,
  `${JSON.stringify({ budgetScale: scale, systemAppLaunchS: baselineS === null ? null : round(baselineS), checks }, null, 2)}\n`,
);
if (ran("testLaunchToInteractive") && launches.length === 0) {
  console.error("The result bundle has no launch duration");
  process.exit(1);
}
// On the simulator (locally and on CI) XCTest recorded scroll durations but no hitch metrics, so
// the scroll budget can only be checked when the tests run on an iPhone.
if (ran("testScroll") && scrolls.length === 0)
  console.log(
    "No scroll hitch metrics in this run (a simulator records none; run on an iPhone to check them)",
  );
if (gated.some((check) => !check.pass)) process.exit(1);
