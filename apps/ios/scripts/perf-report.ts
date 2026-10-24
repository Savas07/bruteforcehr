// Reads `xcresulttool get test-results metrics` output of PerformanceTests (apps/ios/scripts/perf.sh)
// and checks the iOS budgets (docs/runbooks/performance.md):
//   - launch to interactive: median app launch duration < 2 s;
//   - scrolling: median scroll hitch time ratio < 5 ms per s (Apple's "good"; at 60 Hz that is
//     under one dropped frame per 3 s of scrolling), for the dragging and the deceleration phase.
// Both limits are multiplied by the third argument (CI slack). Writes the summary JSON.
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
      const launch =
        /launch/iu.test(`${metric.identifier ?? ""} ${metric.displayName}`) &&
        metric.unitOfMeasurement === "s";
      const hitch = /hitch time ratio/iu.test(metric.displayName);
      const limit = launch ? LAUNCH_BUDGET_S * scale : hitch ? HITCH_BUDGET_MS_PER_S * scale : null;
      const value = median(metric.measurements);
      checks.push({
        test: test.testIdentifier,
        device: run.device.deviceName,
        metric: metric.displayName,
        unit: metric.unitOfMeasurement,
        measurements: metric.measurements.map(round),
        median: round(value),
        limit,
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
const missing = [
  ...(ran("testLaunchToInteractive") && launches.length === 0 ? ["the launch duration"] : []),
  ...(ran("testScroll") && scrolls.length === 0 ? ["a scroll hitch time ratio"] : []),
];
writeFileSync(output, `${JSON.stringify({ budgetScale: scale, checks }, null, 2)}\n`);
if (missing.length > 0) {
  console.error(`The result bundle has no ${missing.join(" or ")}`);
  process.exit(1);
}
if (gated.some((check) => !check.pass)) process.exit(1);
