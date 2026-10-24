/**
 * Apply eval harness shared by the live run (eval/apply/run.ts) and the CI gate
 * (eval/apply/gate.test.ts): builds pipeline inputs from the fixtures, runs `tailorCv` and
 * `draftCoverLetter`, audits the results for fabrications independently of the grounding code
 * path, and computes quality and cost.
 */
import {
  applyTailorEdits,
  type CvContent,
  CvContentSchema,
  type CvAssistLanguage,
  STARTER_COVER_LETTER_TEMPLATES,
} from "@bfhr/core";
import { cvText, entityPolicyFor } from "../../src/apply-grounding";
import type { UsageLedger } from "../../src/budget";
import { type CoverLetterResult, draftCoverLetter } from "../../src/cover-letter";
import { detectLanguage } from "../../src/cv-assist";
import { type CvTailorResult, tailorCv } from "../../src/cv-tailor";
import { GroundingSource, findUngrounded, fold } from "../../src/grounding/grounding";
import type { ModelId } from "../../src/models";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/provider";
import { CV_FIXTURES } from "../fixtures/cvs";
import { promptHash, type Recording, unlimitedLedger } from "../mail/score";
import {
  type ApplyJobFixture,
  LETTER_CASES,
  type LetterCase,
  TAILOR_CASES,
  type TailorCase,
} from "./fixtures";

export { LETTER_CASES, TAILOR_CASES };

/** CI quality gates (besides zero fabrications). */
export const GATES = {
  /** Share of tailoring cases with at least one edit. */
  tailorWithEdits: 0.75,
  /** Share of letters in the requested language (where the language is detectable). */
  letterLanguage: 0.9,
  /** Share of letters naming the company. */
  letterCompany: 1,
};

const META: CvContent["meta"] = {
  template: "classic",
  theme: { accentColor: "#0f766e", fontPair: "inter-source-serif", density: "comfortable", paperSize: "a4" },
  sectionOrder: ["basics", "work", "projects", "education", "skills", "languages", "certificates"],
  customSections: [],
};

export interface EvalCv {
  content: CvContent;
  language: CvAssistLanguage;
  name: string | null;
  email: string | null;
}

export function evalCv(cvId: string): EvalCv {
  const fixture = CV_FIXTURES.find((candidate) => candidate.id === cvId);
  if (fixture === undefined) throw new Error(`unknown CV fixture ${cvId}`);
  const content = CvContentSchema.parse({ ...fixture.expected, meta: META });
  return {
    content,
    language: fixture.language,
    name: fixture.expected.basics?.name ?? null,
    email: fixture.expected.basics?.email ?? null,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Recording and replay (a case may call the model twice: the cover letter retry)
 * ---------------------------------------------------------------------------------------------- */

/** Records live replies as `<caseId>`, `<caseId>#2`, … */
export function recordingProvider(live: AiProvider, recording: Recording, caseId: string): AiProvider {
  let call = 0;
  return {
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      call++;
      const result = await live.generate(request);
      recording.entries[call === 1 ? caseId : `${caseId}#${call}`] = {
        promptHash: promptHash(request as StructuredRequest<unknown>),
        output: result.data,
        usage: result.usage,
      };
      return result;
    },
  };
}

/** Replays a recording; a changed prompt fails loudly (re-run `pnpm --filter @bfhr/ai eval:apply`). */
export function replayingProvider(recording: Recording, caseId: string): AiProvider {
  let call = 0;
  return {
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      call++;
      const key = call === 1 ? caseId : `${caseId}#${call}`;
      const entry = recording.entries[key];
      if (entry === undefined)
        throw new Error(`no recorded reply for ${key}: run pnpm --filter @bfhr/ai eval:apply`);
      const hash = promptHash(request as StructuredRequest<unknown>);
      if (entry.promptHash !== hash)
        throw new Error(
          `prompt for ${key} changed since the recording: run pnpm --filter @bfhr/ai eval:apply`,
        );
      return {
        data: request.schema.parse(entry.output),
        model: request.model,
        usage: entry.usage,
        attempts: 1,
      };
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Running the cases
 * ---------------------------------------------------------------------------------------------- */

export function runTailorCase(
  testCase: TailorCase,
  provider: AiProvider,
  model: ModelId,
  ledger: UsageLedger = unlimitedLedger,
): Promise<CvTailorResult> {
  const cv = evalCv(testCase.job.cvId);
  return tailorCv(
    {
      content: cv.content,
      cvLanguage: cv.language,
      job: testCase.job,
      locale: testCase.locale,
      intensity: testCase.intensity,
    },
    { provider, ledger, model },
  );
}

function templateBody(testCase: LetterCase): string | null {
  if (testCase.templateId === null) return null;
  const template = STARTER_COVER_LETTER_TEMPLATES.find((candidate) => candidate.id === testCase.templateId);
  if (template === undefined) throw new Error(`unknown template ${testCase.templateId}`);
  return template.body;
}

export function runLetterCase(
  testCase: LetterCase,
  provider: AiProvider,
  model: ModelId,
  ledger: UsageLedger = unlimitedLedger,
): Promise<CoverLetterResult> {
  const cv = evalCv(testCase.job.cvId);
  return draftCoverLetter(
    {
      content: cv.content,
      cvLanguage: cv.language,
      job: testCase.job,
      tone: testCase.tone,
      language: testCase.language,
      template: templateBody(testCase),
      mergeValues: { name: cv.name, email: cv.email },
    },
    { provider, ledger, model },
  );
}

/* ------------------------------------------------------------------------------------------------
 * Independent fabrication audit
 * ---------------------------------------------------------------------------------------------- */

/** First-person markers, written separately from the pipeline's on purpose. */
const AUDIT_FIRST_PERSON: Readonly<Record<CvAssistLanguage, RegExp>> = {
  en: /(?<![\p{L}'])(?:i|i'm|i've|i'd|i'll|my|me)(?![\p{L}])/iu,
  de: /(?<![\p{L}])(?:ich|mir|mich|mein\p{L}*)(?![\p{L}])/iu,
  tr: /(?<![\p{L}])(?:ben|benim|bana)(?![\p{L}])|\p{L}{3,}(?:d[ıiuü]m|t[ıiuü]m|yorum|rim|r[ıiuü]m|ece[ğk]im|aca[ğk]ım)(?![\p{L}])/iu,
};

const loose = (text: string): string =>
  ` ${fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;

/** Bait terms in a text: phrases as written, single words of 5+ letters also as a word prefix (inflection). */
export function baitIn(text: string, bait: readonly string[]): string[] {
  const haystack = loose(text);
  const words = haystack.trim().split(" ");
  return bait.filter((term) => {
    const needle = loose(term).trim();
    if (haystack.includes(` ${needle} `)) return true;
    return !needle.includes(" ") && needle.length >= 5 && words.some((word) => word.startsWith(needle));
  });
}

const digitRuns = (text: string): string[] => text.replace(/\[[^\]]*\]/gu, "").match(/\d+/gu) ?? [];

/** Digit runs of `text` that none of the sources contains. */
function unknownDigits(text: string, sources: string): string[] {
  const known = new Set(digitRuns(sources));
  return digitRuns(text).filter((run) => !known.has(run));
}

function sentencesOf(body: string): string[] {
  return body
    .split(/\n+/u)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
}

export interface TailorCaseScore {
  id: string;
  edits: number;
  dropped: number;
  dropReasons: CvTailorResult["dropReasons"];
  fabrications: string[];
  /** Every edit accepted applies cleanly and the result is a valid CV. */
  appliesCleanly: boolean;
  /** Job keywords in the CV's text before and after accepting every edit. */
  keywordMentionsBefore: number;
  keywordMentionsAfter: number;
  reasonsInLocale: number;
  reasonsChecked: number;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
}

function keywordMentions(text: string, keywords: readonly string[]): number {
  const haystack = loose(text);
  return keywords.reduce((count, keyword) => count + haystack.split(loose(keyword)).length - 1, 0);
}

export function scoreTailorCase(testCase: TailorCase, result: CvTailorResult): TailorCaseScore {
  const cv = evalCv(testCase.job.cvId);
  const sourceText = cvText(cv.content);
  const source = new GroundingSource(sourceText);
  const fabrications: string[] = [];
  for (const edit of result.edits) {
    if (edit.after === null || edit.op === "reorder") continue;
    const issues = findUngrounded(edit.after, source, { entities: entityPolicyFor(cv.language) }).map(
      (issue) => issue.text,
    );
    const problems = [
      ...issues,
      ...baitIn(edit.after, testCase.job.bait).map((term) => `bait:${term}`),
      ...unknownDigits(edit.after, sourceText).map((run) => `digits:${run}`),
    ];
    if (problems.length > 0)
      fabrications.push(`${testCase.id} ${edit.path}: ${problems.join(", ")} — "${edit.after}"`);
  }
  const applied = applyTailorEdits(
    cv.content,
    result.edits,
    result.edits.map((edit) => edit.id),
  );
  const appliesCleanly = applied.skipped.length === 0 && CvContentSchema.safeParse(applied.content).success;
  const reasons = result.edits
    .map((edit) => detectLanguage(edit.reason))
    .filter((language) => language !== undefined);
  return {
    id: testCase.id,
    edits: result.edits.length,
    dropped: result.dropped,
    dropReasons: result.dropReasons,
    fabrications,
    appliesCleanly,
    keywordMentionsBefore: keywordMentions(sourceText, testCase.job.keywords),
    keywordMentionsAfter: keywordMentions(cvText(applied.content), testCase.job.keywords),
    reasonsInLocale: reasons.filter((language) => language === testCase.locale).length,
    reasonsChecked: reasons.length,
    costMicroUsd: result.costMicroUsd,
    inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
    outputTokens: result.usage.outputTokens,
  };
}

export interface LetterCaseScore {
  id: string;
  words: number;
  sentences: number;
  fabrications: string[];
  languageDetected: CvAssistLanguage | undefined;
  languageOk: boolean | null;
  mentionsCompany: boolean;
  mentionsRole: boolean;
  placeholders: number;
  unresolved: number;
  droppedSentences: number;
  attempts: number;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
}

const companyCore = (company: string): string =>
  company.replace(/\b(?:GmbH|AG|A\.Ş\.|Ltd\.?|Inc\.?|Teknoloji|Ödeme Sistemleri)\b/gu, "").trim();

export function scoreLetterCase(testCase: LetterCase, result: CoverLetterResult): LetterCaseScore {
  const cv = evalCv(testCase.job.cvId);
  const job: ApplyJobFixture = testCase.job;
  const cvSource = cvText(cv.content);
  const everything = [
    cvSource,
    job.title,
    job.company,
    job.description,
    templateBody(testCase) ?? "",
    // The app's own greeting and closing formulas (the starter templates hold the same lines).
    ...STARTER_COVER_LETTER_TEMPLATES.filter((template) => template.language === testCase.language).map(
      (template) => template.body,
    ),
    cv.name ?? "",
    cv.email ?? "",
  ].join("\n");
  const source = new GroundingSource(everything);
  const fabrications: string[] = [];
  const sentences = sentencesOf(result.body);
  for (const sentence of sentences) {
    const issues = findUngrounded(sentence, source, { entities: entityPolicyFor(testCase.language) }).map(
      (issue) => issue.text,
    );
    const firstPerson = AUDIT_FIRST_PERSON[testCase.language].test(sentence);
    const problems = [
      ...issues,
      ...(firstPerson ? baitIn(sentence, job.bait).map((term) => `bait:${term}`) : []),
      ...unknownDigits(sentence, everything).map((run) => `digits:${run}`),
    ];
    if (problems.length > 0) fabrications.push(`${testCase.id}: ${problems.join(", ")} — "${sentence}"`);
  }
  const subjectIssues =
    result.subject === null
      ? []
      : findUngrounded(result.subject, source, { entities: entityPolicyFor(testCase.language) });
  if (subjectIssues.length > 0)
    fabrications.push(`${testCase.id} subject: ${subjectIssues.map((issue) => issue.text).join(", ")}`);
  const bodyText = result.body.replace(/\{[a-z_]+\}/gu, "");
  const detected = detectLanguage(bodyText);
  return {
    id: testCase.id,
    words: bodyText.split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length,
    sentences: sentences.length,
    fabrications,
    languageDetected: detected,
    languageOk: detected === undefined ? null : detected === testCase.language,
    mentionsCompany: loose(result.body).includes(loose(companyCore(job.company))),
    mentionsRole: loose(result.body).includes(
      loose(job.title.replace(/\s*\(.*\)$/u, "").split(",")[0] ?? job.title),
    ),
    placeholders: result.placeholders.length,
    unresolved: result.unresolvedFields.length,
    droppedSentences: result.droppedSentences,
    attempts: result.attempts,
    costMicroUsd: result.costMicroUsd,
    inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
    outputTokens: result.usage.outputTokens,
  };
}

export interface ApplyMetrics {
  fabrications: number;
  tailorCases: number;
  tailorWithEdits: number;
  tailorEdits: number;
  tailorDropped: number;
  tailorAppliesCleanly: number;
  keywordMentionsBefore: number;
  keywordMentionsAfter: number;
  reasonsInLocale: number;
  reasonsChecked: number;
  letterCases: number;
  letterLanguageOk: number;
  letterLanguageChecked: number;
  letterCompany: number;
  letterRole: number;
  letterDroppedSentences: number;
  letterRetries: number;
  tailorCostMicroUsd: number;
  letterCostMicroUsd: number;
}

export function computeMetrics(
  tailor: readonly TailorCaseScore[],
  letters: readonly LetterCaseScore[],
): ApplyMetrics {
  const sum = <T>(items: readonly T[], pick: (item: T) => number) =>
    items.reduce((total, item) => total + pick(item), 0);
  return {
    fabrications: sum(tailor, (s) => s.fabrications.length) + sum(letters, (s) => s.fabrications.length),
    tailorCases: tailor.length,
    tailorWithEdits: tailor.filter((s) => s.edits > 0).length,
    tailorEdits: sum(tailor, (s) => s.edits),
    tailorDropped: sum(tailor, (s) => s.dropped),
    tailorAppliesCleanly: tailor.filter((s) => s.appliesCleanly).length,
    keywordMentionsBefore: sum(tailor, (s) => s.keywordMentionsBefore),
    keywordMentionsAfter: sum(tailor, (s) => s.keywordMentionsAfter),
    reasonsInLocale: sum(tailor, (s) => s.reasonsInLocale),
    reasonsChecked: sum(tailor, (s) => s.reasonsChecked),
    letterCases: letters.length,
    letterLanguageOk: letters.filter((s) => s.languageOk === true).length,
    letterLanguageChecked: letters.filter((s) => s.languageOk !== null).length,
    letterCompany: letters.filter((s) => s.mentionsCompany).length,
    letterRole: letters.filter((s) => s.mentionsRole).length,
    letterDroppedSentences: sum(letters, (s) => s.droppedSentences),
    letterRetries: letters.filter((s) => s.attempts > 1).length,
    tailorCostMicroUsd: sum(tailor, (s) => s.costMicroUsd),
    letterCostMicroUsd: sum(letters, (s) => s.costMicroUsd),
  };
}

export function gateFailures(metrics: ApplyMetrics): string[] {
  const failures: string[] = [];
  if (metrics.fabrications > 0) failures.push(`${metrics.fabrications} fabricated item(s)`);
  if (metrics.tailorWithEdits < GATES.tailorWithEdits * metrics.tailorCases)
    failures.push(`only ${metrics.tailorWithEdits}/${metrics.tailorCases} tailoring cases have edits`);
  if (metrics.tailorAppliesCleanly < metrics.tailorCases)
    failures.push("some tailoring edits don't apply cleanly");
  if (metrics.letterLanguageOk < GATES.letterLanguage * metrics.letterLanguageChecked)
    failures.push(
      `letters in the wrong language: ${metrics.letterLanguageChecked - metrics.letterLanguageOk}`,
    );
  if (metrics.letterCompany < GATES.letterCompany * metrics.letterCases)
    failures.push(`letters without the company: ${metrics.letterCases - metrics.letterCompany}`);
  return failures;
}
