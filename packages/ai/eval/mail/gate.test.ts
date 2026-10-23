// CI gate for mail intelligence (BRIEF §4.7 acceptance, docs/adr/0012-mail-sync.md): replays the
// recorded model replies of the last live run through the current pipeline (rules, grounding,
// linking, decision) and fails below macro-F1 0.90 or below 97 % precision on automatic changes.
// Rules-only mode (the default while the user hasn't allowed AI for mail) must meet the same
// precision gate. A prompt change invalidates the recording: re-run `pnpm --filter @bfhr/ai eval:mail`.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MAIL_CLASSIFY_MODEL } from "../../src/mail-classify";
import { MAIL_CLASSIFY_PROMPT_VERSION } from "../../src/prompts/mail-classify";
import {
  analyzeCase,
  AUTO_PRECISION_GATE,
  computeMetrics,
  MACRO_F1_GATE,
  MAIL_EVAL_CASES,
  type Recording,
  replayProvider,
  scoreCase,
  unlimitedLedger,
} from "./score";

describe("mail eval set", () => {
  it("meets the BRIEF §4.7 size and coverage requirements", () => {
    expect(MAIL_EVAL_CASES.length).toBeGreaterThanOrEqual(150);
    expect(new Set(MAIL_EVAL_CASES.map((c) => c.language)).size).toBeGreaterThanOrEqual(2);
    expect(new Set(MAIL_EVAL_CASES.map((c) => c.id)).size).toBe(MAIL_EVAL_CASES.length);
    for (const category of ["application_received", "rejection", "interview_invite", "assessment", "offer", "recruiter_outreach", "info_request", "job_alert", "other_job", "not_job"])
      expect(MAIL_EVAL_CASES.filter((c) => c.expected.category === category).length, category).toBeGreaterThanOrEqual(10);
  });
});

describe("mail classification gate", () => {
  it("AI on (recorded replies): macro-F1 and automatic-change precision", async () => {
    const recording = JSON.parse(
      await readFile(new URL(`recordings/${MAIL_CLASSIFY_MODEL}.json`, import.meta.url), "utf8"),
    ) as Recording;
    expect(recording.promptVersion, "recording is from another prompt version: re-run eval:mail").toBe(
      MAIL_CLASSIFY_PROMPT_VERSION,
    );
    const results = [];
    for (const testCase of MAIL_EVAL_CASES) {
      const provider = replayProvider(recording, () => testCase.id);
      results.push(scoreCase(testCase, await analyzeCase(testCase, { provider, ledger: unlimitedLedger, model: MAIL_CLASSIFY_MODEL })));
    }
    const metrics = computeMetrics(results);
    expect(metrics.macroF1).toBeGreaterThanOrEqual(MACRO_F1_GATE);
    expect(metrics.autoApplied).toBeGreaterThan(0);
    expect(metrics.autoPrecision).toBeGreaterThanOrEqual(AUTO_PRECISION_GATE);
  });

  it("AI off (rules only): automatic-change precision", async () => {
    const results = [];
    for (const testCase of MAIL_EVAL_CASES) results.push(scoreCase(testCase, await analyzeCase(testCase, null)));
    const metrics = computeMetrics(results);
    expect(metrics.autoApplied).toBeGreaterThan(0);
    expect(metrics.autoPrecision).toBeGreaterThanOrEqual(AUTO_PRECISION_GATE);
  });
});
