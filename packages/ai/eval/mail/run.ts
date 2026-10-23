/**
 * Mail classification eval (docs/adr/0012-mail-sync.md).
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @bfhr/ai eval:mail [--model claude-haiku-5-5] [--budget-usd 2]
 *   pnpm --filter @bfhr/ai eval:mail --rules-only        # no model, no key
 *
 * The live run classifies every fixture with the production pipeline, records the model replies to
 * eval/mail/recordings/<model>.json (replayed by the CI gate) and writes eval/mail/report.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { AnthropicProvider } from "../../src/anthropic";
import { DailyCapError, type UsageLedger } from "../../src/budget";
import { MAIL_CLASSIFY_MODEL } from "../../src/mail-classify";
import { MODELS, type ModelId } from "../../src/models";
import { MAIL_CLASSIFY_PROMPT_VERSION } from "../../src/prompts/mail-classify";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/provider";
import { gatePasses, renderReport } from "./report";
import {
  analyzeCase,
  type CaseResult,
  computeMetrics,
  MAIL_EVAL_CASES,
  promptHash,
  type Metrics,
  type Recording,
  scoreCase,
} from "./score";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    "budget-usd": { type: "string", default: "2" },
    "rules-only": { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
  },
});

const model = (args.model ?? MAIL_CLASSIFY_MODEL) as ModelId;
if (!(model in MODELS)) throw new Error(`unknown model ${model}`);

const rulesResults: CaseResult[] = [];
for (const testCase of MAIL_EVAL_CASES) rulesResults.push(scoreCase(testCase, await analyzeCase(testCase, null)));
const rules = { metrics: computeMetrics(rulesResults), results: rulesResults };

let ai: { metrics: Metrics; results: CaseResult[] } | null = null;
if (!args["rules-only"]) {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    console.error("Set ANTHROPIC_API_KEY (or pass --rules-only).");
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
  const live = new AnthropicProvider({ apiKey });
  const recording: Recording = {
    model,
    promptVersion: MAIL_CLASSIFY_PROMPT_VERSION,
    recordedAt: new Date().toISOString(),
    entries: {},
  };
  const recorder = (caseId: string): AiProvider => ({
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const result = await live.generate(request);
      recording.entries[caseId] = {
        promptHash: promptHash(request as StructuredRequest<unknown>),
        output: result.data,
        usage: result.usage,
      };
      return result;
    },
  });

  const results: CaseResult[] = new Array(MAIL_EVAL_CASES.length);
  let next = 0;
  const worker = async () => {
    while (next < MAIL_EVAL_CASES.length) {
      const index = next++;
      const testCase = MAIL_EVAL_CASES[index];
      if (testCase === undefined) break;
      const analysis = await analyzeCase(testCase, { provider: recorder(testCase.id), ledger, model });
      results[index] = scoreCase(testCase, analysis);
      process.stdout.write(".");
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
  process.stdout.write("\n");
  ai = { metrics: computeMetrics(results), results };
  await mkdir(new URL("recordings/", import.meta.url), { recursive: true });
  // Sorted keys keep the recording diffable between runs.
  const sorted: Recording = { ...recording, entries: Object.fromEntries(Object.entries(recording.entries).sort(([a], [b]) => a.localeCompare(b))) };
  await writeFile(new URL(`recordings/${model}.json`, import.meta.url), `${JSON.stringify(sorted, null, 1)}\n`);
}

const report = renderReport({
  model,
  promptVersion: MAIL_CLASSIFY_PROMPT_VERSION,
  date: new Date().toISOString().slice(0, 10),
  ai,
  rules,
});
const reportName = args["rules-only"] ? "report-rules-only.md" : model === MAIL_CLASSIFY_MODEL ? "report.md" : `report-${model}.md`;
await writeFile(new URL(reportName, import.meta.url), report);

const summary = (label: string, metrics: Metrics) => {
  const gate = gatePasses(metrics);
  console.log(
    `${label}: macro-F1 ${metrics.macroF1.toFixed(3)} (${gate.macroF1 ? "pass" : "FAIL"}), auto precision ${(metrics.autoPrecision * 100).toFixed(1)} % ${metrics.autoCorrect}/${metrics.autoApplied} (${gate.autoPrecision ? "pass" : "FAIL"}), coverage ${(metrics.autoCoverage * 100).toFixed(1)} %, link ${(metrics.linkAccuracy * 100).toFixed(1)} %, cost $${(metrics.costMicroUsd / 1e6).toFixed(4)}`,
  );
};
if (ai !== null) summary("AI on", ai.metrics);
summary("rules only", rules.metrics);
console.log(`wrote eval/mail/${reportName}`);
