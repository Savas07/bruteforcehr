/**
 * Mail eval harness shared by the live run (eval/mail/run.ts) and the CI gate (eval/mail/gate.test.ts):
 * turns fixtures into pipeline inputs, runs `analyzeMail`, and scores the results.
 */
import { createHash } from "node:crypto";
import {
  type AlertPosting,
  type InterviewSuggestion,
  interviewSuggestionFromMail,
  interviewSlotInText,
  parseJobAlert,
  foldText,
  MailCategorySchema,
  type MailCategory,
  type MailInput,
  type TrackedApplication,
} from "@bfhr/core";
import type { UsageLedger } from "../../src/budget";
import { analyzeMail, type AnalyzeMailAi, type MailAnalysis } from "../../src/mail-classify";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/provider";
import { APPLICATIONS_DE, CASES_DE } from "./fixtures/de";
import { APPLICATIONS_EN, CASES_EN } from "./fixtures/en";
import { APPLICATIONS_TR, CASES_TR } from "./fixtures/tr";
import { ALERT_CASES } from "./fixtures/alerts";
import { INVITE_CASES } from "./fixtures/invites";
import type { AlertEvalCase, InviteEvalCase, MailEvalApplication, MailEvalCase } from "./types";

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
    ...application.sentMessageIds.slice(application.threadIds.length).map((rfc822MessageId, index) => ({
      accountId: EVAL_ACCOUNT,
      threadId: `sent-${application.id}-${index}`,
      rfc822MessageId,
    })),
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

export async function analyzeCase(testCase: MailEvalCase, ai: AnalyzeMailAi | null): Promise<MailAnalysis> {
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
  return createHash("sha256")
    .update(`${request.model}\n${request.system}\n${request.user}`)
    .digest("hex")
    .slice(0, 16);
}

/** Replays a recording; a prompt that changed since the recording fails loudly (re-run the live eval). */
export function replayProvider(recording: Recording, caseId: () => string): AiProvider {
  return {
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const id = caseId();
      const entry = recording.entries[id];
      if (entry === undefined)
        throw new Error(`no recorded reply for ${id}: run pnpm --filter @bfhr/ai eval:mail`);
      const hash = promptHash(request as StructuredRequest<unknown>);
      if (entry.promptHash !== hash) {
        throw new Error(
          `prompt for ${id} changed since the recording (${entry.promptHash} → ${hash}): run pnpm --filter @bfhr/ai eval:mail`,
        );
      }
      return {
        data: request.schema.parse(entry.output),
        model: request.model,
        usage: entry.usage,
        attempts: 1,
      };
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
  const a = foldText(expected)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const b = foldText(actual)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
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
    companyOk:
      expected.category === "not_job" ? null : sameText(expected.company, analysis.extracted.company),
    roleOk: expected.category === "not_job" ? null : sameText(expected.role, analysis.extracted.role),
    datesFound,
    datesExpected: expectedDates.length,
    meetingUrlsOk:
      expectedUrls.length === 0
        ? null
        : expectedUrls.every((url) => analysis.extracted.meetingUrls.includes(url)),
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
    const tp = results.filter(
      (r) => r.analysis.category === category && r.testCase.expected.category === category,
    ).length;
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
    autoCoverage:
      eligible.length === 0
        ? 0
        : eligible.filter((r) => r.analysis.decision.autoApply && autoCorrect(r)).length / eligible.length,
    companyAccuracy: ratio(results.map((r) => r.companyOk)),
    roleAccuracy: ratio(results.map((r) => r.roleOk)),
    dateRecall: datesExpected === 0 ? 1 : results.reduce((sum, r) => sum + r.datesFound, 0) / datesExpected,
    candidatesDropped: {
      jobMail: results.filter((r) => !r.analysis.candidate && r.testCase.expected.category !== "not_job")
        .length,
      notJob: results.filter((r) => !r.analysis.candidate && r.testCase.expected.category === "not_job")
        .length,
    },
    costMicroUsd: results.reduce((sum, r) => sum + r.analysis.costMicroUsd, 0),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Job alerts and interview invites (deterministic: no model; ADR 0012)
 * ---------------------------------------------------------------------------------------------- */

export { ALERT_CASES, INVITE_CASES };
export const ALERT_RECALL_GATE = 0.9;
export const ALERT_PRECISION_GATE = 0.95;
export const INTERVIEW_START_GATE = 0.9;

/** Folded, punctuation-insensitive equality for posting fields. */
const sameField = (expected: string | null, actual: string | null): boolean =>
  (expected === null) === (actual === null) &&
  foldText(expected ?? "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim() ===
    foldText(actual ?? "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();

export interface AlertCaseResult {
  testCase: AlertEvalCase;
  postings: AlertPosting[];
  /** Expected postings found with the right URL, title, company and location. */
  correct: number;
  /** Correct postings whose salary and posting date also match (where labelled). */
  detailsCorrect: number;
  wrong: AlertPosting[];
  missed: AlertEvalCase["expected"];
}

export function scoreAlertCase(testCase: AlertEvalCase): AlertCaseResult {
  const { message } = testCase;
  const postings = parseJobAlert({
    fromAddress: message.from.address,
    subject: message.subject,
    text: message.text,
    html: message.html,
    receivedAt: new Date(message.receivedAt),
  });
  const matches = (expected: AlertEvalCase["expected"][number], posting: AlertPosting) =>
    posting.url === expected.url &&
    sameField(expected.title, posting.title) &&
    sameField(expected.company, posting.company) &&
    sameField(expected.location, posting.location);
  const found = testCase.expected.filter((expected) =>
    postings.some((posting) => matches(expected, posting)),
  );
  const detailsCorrect = found.filter((expected) => {
    const posting = postings.find((candidate) => matches(expected, candidate));
    if (posting === undefined) return false;
    const salary = expected.salary;
    const salaryOk =
      salary === undefined
        ? posting.salary === null
        : posting.salary !== null &&
          posting.salary.min === salary.min &&
          posting.salary.max === salary.max &&
          posting.salary.currency === salary.currency &&
          posting.salary.period === salary.period;
    const postedOk =
      expected.postedAt === undefined ||
      (posting.postedAt !== null &&
        Math.abs(posting.postedAt.getTime() - new Date(expected.postedAt).getTime()) <= 3_600_000);
    return salaryOk && postedOk;
  }).length;
  return {
    testCase,
    postings,
    correct: found.length,
    detailsCorrect,
    wrong: postings.filter((posting) => !testCase.expected.some((expected) => matches(expected, posting))),
    missed: testCase.expected.filter((expected) => !found.includes(expected)),
  };
}

export interface AlertMetrics {
  cases: number;
  expected: number;
  extracted: number;
  correct: number;
  precision: number;
  recall: number;
  /** Salary and posting date right among the correct postings. */
  detailAccuracy: number;
}

export function computeAlertMetrics(results: readonly AlertCaseResult[]): AlertMetrics {
  const expected = results.reduce((sum, r) => sum + r.testCase.expected.length, 0);
  const extracted = results.reduce((sum, r) => sum + r.postings.length, 0);
  const correct = results.reduce((sum, r) => sum + r.correct, 0);
  const details = results.reduce((sum, r) => sum + r.detailsCorrect, 0);
  return {
    cases: results.length,
    expected,
    extracted,
    correct,
    precision: extracted === 0 ? 1 : correct / extracted,
    recall: expected === 0 ? 1 : correct / expected,
    detailAccuracy: correct === 0 ? 1 : details / correct,
  };
}

export interface InviteCaseResult {
  testCase: InviteEvalCase;
  suggestion: InterviewSuggestion | null;
  startOk: boolean;
  timezoneOk: boolean;
  durationOk: boolean;
  meetingUrlOk: boolean;
}

export function scoreInviteCase(testCase: InviteEvalCase): InviteCaseResult {
  const { message, expected } = testCase;
  const suggestion = interviewSuggestionFromMail({
    category: "interview_invite",
    subject: message.subject,
    bodyText: message.bodyText,
    calendars: message.calendar === null ? [] : [message.calendar],
    receivedAt: new Date(message.receivedAt),
    userTimeZone: testCase.userTimeZone ?? EVAL_TIME_ZONE,
    extracted: {
      company: null,
      role: null,
      contactName: null,
      contactEmail: null,
      dates: [],
      meetingUrls: [],
    },
  });
  return {
    testCase,
    suggestion,
    startOk:
      suggestion !== null &&
      Math.abs(suggestion.startsAt.getTime() - new Date(expected.startsAt).getTime()) <= 60_000,
    timezoneOk: suggestion !== null && suggestion.timezone === expected.timezone,
    durationOk: suggestion !== null && suggestion.durationMinutes === expected.durationMinutes,
    meetingUrlOk: suggestion !== null && suggestion.meetingUrl === expected.meetingUrl,
  };
}

export interface InviteMetrics {
  cases: number;
  suggested: number;
  startAccuracy: number;
  timezoneAccuracy: number;
  durationAccuracy: number;
  meetingUrlAccuracy: number;
  /** Every field right. */
  exact: number;
}

export function computeInviteMetrics(results: readonly InviteCaseResult[]): InviteMetrics {
  const share = (pick: (result: InviteCaseResult) => boolean) =>
    results.length === 0 ? 1 : results.filter(pick).length / results.length;
  return {
    cases: results.length,
    suggested: results.filter((r) => r.suggestion !== null).length,
    startAccuracy: share((r) => r.startOk),
    timezoneAccuracy: share((r) => r.timezoneOk),
    durationAccuracy: share((r) => r.durationOk),
    meetingUrlAccuracy: share((r) => r.meetingUrlOk),
    exact: share((r) => r.startOk && r.timezoneOk && r.durationOk && r.meetingUrlOk),
  };
}

/**
 * Held-out check of the text reader: interview invites of the classification set with exactly one
 * labelled interview time (written for the classifier, not for this reader). Reported, not gated.
 */
export function heldOutInviteCheck(): { cases: number; correct: number; wrong: string[]; none: string[] } {
  const wrong: string[] = [];
  const none: string[] = [];
  let cases = 0;
  for (const testCase of MAIL_EVAL_CASES) {
    const labelled = (testCase.expected.dates ?? []).filter((date) => date.kind === "interview");
    const [label] = labelled;
    if (testCase.expected.category !== "interview_invite" || labelled.length !== 1 || label === undefined)
      continue;
    cases += 1;
    const slot = interviewSlotInText({
      text: testCase.message.bodyText,
      receivedAt: new Date(testCase.message.receivedAt),
      userTimeZone: EVAL_TIME_ZONE,
    });
    if (slot === null) none.push(testCase.id);
    else if (Math.abs(slot.startsAt.getTime() - new Date(label.at).getTime()) > 60_000)
      wrong.push(testCase.id);
  }
  return { cases, correct: cases - wrong.length - none.length, wrong, none };
}
