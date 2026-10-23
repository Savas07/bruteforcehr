/**
 * Mail eval harness shared by the live run (eval/mail/run.ts) and the CI gate (eval/mail/gate.test.ts):
 * turns fixtures into pipeline inputs, runs `analyzeMail`, and scores the results.
 */
import { createHash } from "node:crypto";
import { foldText, MailCategorySchema, type MailCategory, type MailInput, type TrackedApplication } from "@bfhr/core";
import type { UsageLedger } from "../../src/budget";
import { analyzeMail, type AnalyzeMailAi, type MailAnalysis } from "../../src/mail-classify";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/provider";
import { APPLICATIONS_DE, CASES_DE } from "./fixtures/de";
import { APPLICATIONS_EN, CASES_EN } from "./fixtures/en";
import { APPLICATIONS_TR, CASES_TR } from "./fixtures/tr";
import type { MailEvalApplication, MailEvalCase } from "./types";

/** BRIEF §4.7 acceptance thresholds (ADR 0012). */
export const MACRO_F1_GATE = 0.9;
export const AUTO_PRECISION_GATE = 0.97;
export const AUTO_APPLY_CONFIDENCE = 0.9;
export const EVAL_TIME_ZONE = "Europe/Istanbul";
const EVAL_ACCOUNT = "acc-eval";

export const MAIL_EVAL_CASES: readonly MailEvalCase[] = [...CASES_EN, ...CASES_TR, ...CASES_DE];
export const MAIL_EVAL_APPLICATIONS: readonly MailEvalApplication[] = [
  ...APPLICATIONS_EN,
  ...APPLICATIONS_TR,
  ...APPLICATIONS_DE,
];

export const TRACKER: readonly TrackedApplication[] = MAIL_EVAL_APPLICATIONS.map((application) => ({
  id: application.id,
  company: application.company,
  companyDomain: application.companyDomain,
  role: application.role,
  status: application.status,
  threadRefs: [
    ...application.threadIds.map((threadId, index) => ({
      accountId: EVAL_ACCOUNT,
      threadId,
      rfc822MessageId: application.sentMessageIds[index] ?? null,
    })),
    ...application.sentMessageIds
      .slice(application.threadIds.length)
      .map((rfc822MessageId, index) => ({ accountId: EVAL_ACCOUNT, threadId: `sent-${application.id}-${index}`, rfc822MessageId })),
  ],
}));

export function mailInputOf(testCase: MailEvalCase): MailInput {
  const { message } = testCase;
  return {
    accountId: EVAL_ACCOUNT,
    from: message.from,
    subject: message.subject,
    bodyText: message.bodyText,
    folder: message.folder,
    providerThreadId: message.threadId,
    inReplyTo: message.inReplyTo,
    references: [],
    listUnsubscribe: message.listUnsubscribe,
    bulk: message.bulk,
  };
}

export async function analyzeCase(
  testCase: MailEvalCase,
  ai: AnalyzeMailAi | null,
): Promise<MailAnalysis> {
  return analyzeMail(
    {
      mail: mailInputOf(testCase),
      receivedAt: new Date(testCase.message.receivedAt),
      applications: TRACKER,
      userTimeZone: EVAL_TIME_ZONE,
      autoApplyConfidence: AUTO_APPLY_CONFIDENCE,
    },
    ai,
  );
}

/* ------------------------------------------------------------------------------------------------
 * Recorded model replies (CI replays them; the live run writes them)
 * ---------------------------------------------------------------------------------------------- */

export interface Recording {
  model: string;
  promptVersion: string;
  recordedAt: string;
  /** Case id → prompt hash + validated model output. */
  entries: Record<string, { promptHash: string; output: unknown; usage: StructuredResult<unknown>["usage"] }>;
}

export function promptHash(request: StructuredRequest<unknown>): string {
  return createHash("sha256").update(`${request.model}\n${request.system}\n${request.user}`).digest("hex").slice(0, 16);
}

/** Replays a recording; a prompt that changed since the recording fails loudly (re-run the live eval). */
export function replayProvider(recording: Recording, caseId: () => string): AiProvider {
  return {
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const id = caseId();
      const entry = recording.entries[id];
      if (entry === undefined) throw new Error(`no recorded reply for ${id}: run pnpm --filter @bfhr/ai eval:mail`);
      const hash = promptHash(request as StructuredRequest<unknown>);
      if (entry.promptHash !== hash) {
        throw new Error(`prompt for ${id} changed since the recording (${entry.promptHash} → ${hash}): run pnpm --filter @bfhr/ai eval:mail`);
      }
      return { data: request.schema.parse(entry.output), model: request.model, usage: entry.usage, attempts: 1 };
    },
  };
}

export const unlimitedLedger: UsageLedger = { async reserve() {}, async settle() {} };

/* ------------------------------------------------------------------------------------------------
 * Scoring
 * ---------------------------------------------------------------------------------------------- */

export interface CaseResult {
  testCase: MailEvalCase;
  analysis: MailAnalysis;
  categoryOk: boolean;
  linkOk: boolean;
  statusOk: boolean;
  companyOk: boolean | null;
  roleOk: boolean | null;
  datesFound: number;
  datesExpected: number;
  meetingUrlsOk: boolean | null;
}

const sameText = (expected: string | null, actual: string | null): boolean | null => {
  if (expected === null) return null;
  if (actual === null) return false;
  const a = foldText(expected).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const b = foldText(actual).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return a === b || a.includes(b) || b.includes(a);
};

export function scoreCase(testCase: MailEvalCase, analysis: MailAnalysis): CaseResult {
  const { expected } = testCase;
  const expectedDates = expected.dates ?? [];
  const datesFound = expectedDates.filter((date) =>
    analysis.extracted.dates.some(
      (found) => Math.abs(found.at.getTime() - new Date(date.at).getTime()) <= 60_000,
    ),
  ).length;
  const expectedUrls = expected.meetingUrls ?? [];
  return {
    testCase,
    analysis,
    categoryOk: analysis.category === expected.category,
    linkOk: analysis.link.applicationId === expected.applicationId,
    statusOk: analysis.decision.suggestedStatus === expected.suggestedStatus,
    companyOk: expected.category === "not_job" ? null : sameText(expected.company, analysis.extracted.company),
    roleOk: expected.category === "not_job" ? null : sameText(expected.role, analysis.extracted.role),
    datesFound,
    datesExpected: expectedDates.length,
    meetingUrlsOk:
      expectedUrls.length === 0 ? null : expectedUrls.every((url) => analysis.extracted.meetingUrls.includes(url)),
  };
}

/** An automatic change is correct when the category, the application and the new status all are. */
export const autoCorrect = (result: CaseResult): boolean =>
  result.categoryOk && result.linkOk && result.statusOk && result.analysis.decision.suggestedStatus !== null;

export interface Metrics {
  cases: number;
  accuracy: number;
  macroF1: number;
  perCategory: Record<MailCategory, { support: number; precision: number; recall: number; f1: number }>;
  linkAccuracy: number;
  statusAccuracy: number;
  autoApplied: number;
  autoCorrect: number;
  autoPrecision: number;
  /** Automatic changes among the cases whose label proposes a change for a tracked application. */
  autoCoverage: number;
  companyAccuracy: number;
  roleAccuracy: number;
  dateRecall: number;
  candidatesDropped: { jobMail: number; notJob: number };
  costMicroUsd: number;
}

export function computeMetrics(results: readonly CaseResult[]): Metrics {
  const perCategory = {} as Metrics["perCategory"];
  let f1Sum = 0;
  for (const category of MailCategorySchema.options) {
    const tp = results.filter((r) => r.analysis.category === category && r.testCase.expected.category === category).length;
    const predicted = results.filter((r) => r.analysis.category === category).length;
    const support = results.filter((r) => r.testCase.expected.category === category).length;
    const precision = predicted === 0 ? (support === 0 ? 1 : 0) : tp / predicted;
    const recall = support === 0 ? 1 : tp / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perCategory[category] = { support, precision, recall, f1 };
    f1Sum += f1;
  }
  const auto = results.filter((r) => r.analysis.decision.autoApply);
  const eligible = results.filter(
    (r) => r.testCase.expected.applicationId !== null && r.testCase.expected.suggestedStatus !== null,
  );
  const ratio = (values: (boolean | null)[]) => {
    const scored = values.filter((value): value is boolean => value !== null);
    return scored.length === 0 ? 1 : scored.filter(Boolean).length / scored.length;
  };
  const datesExpected = results.reduce((sum, r) => sum + r.datesExpected, 0);
  return {
    cases: results.length,
    accuracy: results.filter((r) => r.categoryOk).length / results.length,
    macroF1: f1Sum / MailCategorySchema.options.length,
    perCategory,
    linkAccuracy: ratio(results.map((r) => r.linkOk)),
    statusAccuracy: ratio(results.map((r) => r.statusOk)),
    autoApplied: auto.length,
    autoCorrect: auto.filter(autoCorrect).length,
    autoPrecision: auto.length === 0 ? 1 : auto.filter(autoCorrect).length / auto.length,
    autoCoverage: eligible.length === 0 ? 0 : eligible.filter((r) => r.analysis.decision.autoApply && autoCorrect(r)).length / eligible.length,
    companyAccuracy: ratio(results.map((r) => r.companyOk)),
    roleAccuracy: ratio(results.map((r) => r.roleOk)),
    dateRecall: datesExpected === 0 ? 1 : results.reduce((sum, r) => sum + r.datesFound, 0) / datesExpected,
    candidatesDropped: {
      jobMail: results.filter((r) => !r.analysis.candidate && r.testCase.expected.category !== "not_job").length,
      notJob: results.filter((r) => !r.analysis.candidate && r.testCase.expected.category === "not_job").length,
    },
    costMicroUsd: results.reduce((sum, r) => sum + r.analysis.costMicroUsd, 0),
  };
}

