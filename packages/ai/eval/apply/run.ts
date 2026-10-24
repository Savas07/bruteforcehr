/**
 * Apply eval: "Tailor for this job" and cover letter drafts (docs/adr/0010-ai.md).
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @bfhr/ai eval:apply [--model claude-haiku-5-5] [--budget-usd 2]
 *   pnpm --filter @bfhr/ai eval:apply --replay [--model …]   # re-score the recording, no key
 *
 * Runs every case through the production pipeline against the live API, records the model replies
 * to eval/apply/recordings/<model>.json (replayed by the CI gate) and writes eval/apply/report.md
 * (report-<model>.md for a non-default model). `--replay` rewrites only the report.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { AnthropicProvider } from "../../src/anthropic";
import { DailyCapError, type UsageLedger } from "../../src/budget";
import { CV_TAILOR_MODEL } from "../../src/cv-tailor";
import { MODELS, type ModelId } from "../../src/models";
import { COVER_LETTER_PROMPT_VERSION } from "../../src/prompts/cover-letter";
import { CV_TAILOR_PROMPT_VERSION } from "../../src/prompts/cv-tailor";
import type { AiProvider } from "../../src/provider";
import type { Recording } from "../mail/score";
import { renderApplyReport } from "./report";
import {
  computeMetrics,
  gateFailures,
  LETTER_CASES,
  recordingProvider,
  replayingProvider,
  runLetterCase,
  runTailorCase,
  scoreLetterCase,
  scoreTailorCase,
  TAILOR_CASES,
} from "./score";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    "budget-usd": { type: "string", default: "2" },
    concurrency: { type: "string", default: "4" },
    replay: { type: "boolean", default: false },
  },
});

const model = (args.model ?? CV_TAILOR_MODEL) as ModelId;
if (!(model in MODELS)) throw new Error(`unknown model ${model}`);
const recordingUrl = new URL(`recordings/${model}.json`, import.meta.url);
const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
if (!args.replay && apiKey === "") {
  console.error("Set ANTHROPIC_API_KEY (or pass --replay).");
  process.exit(1);
}

const budgetMicroUsd = Math.round(Number(args["budget-usd"]) * 1e6);
let spent = 0;
const ledger: UsageLedger = {
  async reserve(microUsd) {
    if (spent + microUsd > budgetMicroUsd) throw new DailyCapError();
    spent += microUsd;
  },
  async settle(reserved, actual) {
    spent += actual - reserved;
  },
};
const recording: Recording = args.replay
  ? (JSON.parse(await readFile(recordingUrl, "utf8")) as Recording)
  : {
      model,
      promptVersion: `${CV_TAILOR_PROMPT_VERSION}+${COVER_LETTER_PROMPT_VERSION}`,
      recordedAt: new Date().toISOString(),
      entries: {},
    };
const live = args.replay ? null : new AnthropicProvider({ apiKey });
const providerFor = (caseId: string): AiProvider =>
  live === null ? replayingProvider(recording, caseId) : recordingProvider(live, recording, caseId);

async function pool<T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await work(item);
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
  process.stdout.write("\n");
}

const tailor: Parameters<typeof renderApplyReport>[0]["tailor"] = [];
await pool(TAILOR_CASES, async (testCase) => {
  const result = await runTailorCase(testCase, providerFor(testCase.id), model, ledger);
  tailor.push({ score: scoreTailorCase(testCase, result), result });
});
const letters: Parameters<typeof renderApplyReport>[0]["letters"] = [];
await pool(LETTER_CASES, async (testCase) => {
  const result = await runLetterCase(testCase, providerFor(testCase.id), model, ledger);
  letters.push({ score: scoreLetterCase(testCase, result), result });
});
const byCaseOrder = <T extends { score: { id: string } }>(rows: T[], ids: readonly string[]) =>
  rows.sort((a, b) => ids.indexOf(a.score.id) - ids.indexOf(b.score.id));
byCaseOrder(
  tailor,
  TAILOR_CASES.map((testCase) => testCase.id),
);
byCaseOrder(
  letters,
  LETTER_CASES.map((testCase) => testCase.id),
);

const metrics = computeMetrics(
  tailor.map((row) => row.score),
  letters.map((row) => row.score),
);
if (!args.replay) {
  await mkdir(new URL("recordings/", import.meta.url), { recursive: true });
  // Sorted keys keep the recording diffable between runs.
  const entries = Object.fromEntries(
    Object.entries(recording.entries).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(recordingUrl, `${JSON.stringify({ ...recording, entries }, null, 1)}\n`);
}
const reportName = model === CV_TAILOR_MODEL ? "report.md" : `report-${model}.md`;
await writeFile(
  new URL(reportName, import.meta.url),
  renderApplyReport({
    model,
    tailorPromptVersion: CV_TAILOR_PROMPT_VERSION,
    letterPromptVersion: COVER_LETTER_PROMPT_VERSION,
    recordedAt: recording.recordedAt,
    metrics,
    tailor,
    letters,
  }),
);
const failures = gateFailures(metrics);
console.log(
  `${model}: fabrications ${metrics.fabrications}, edits ${metrics.tailorEdits} (dropped ${metrics.tailorDropped}), letters ${metrics.letterCases}, cost $${((metrics.tailorCostMicroUsd + metrics.letterCostMicroUsd) / 1e6).toFixed(3)}, gate ${failures.length === 0 ? "pass" : failures.join("; ")}`,
);
console.log(`wrote eval/apply/${reportName} and recordings/${model}.json`);
