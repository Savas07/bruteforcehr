import {
  type CoverLetterTone,
  type CvAssistLanguage,
  type CvContent,
  fillMergeFields,
  type Job,
  MERGE_FIELD_PATTERN,
  type MergeField,
  type MergeValues,
} from "@bfhr/core";
import { cvText, entityPolicyFor, jobOnlyTerms, mentionedTerms } from "./apply-grounding";
import { type UsageLedger, generateWithinBudget } from "./budget";
import { APPLY_JOB_DESCRIPTION_CHARS } from "./cv-tailor";
import { GroundingSource, findUngrounded, repairWithPlaceholders } from "./grounding/grounding";
import { ZERO_USAGE, addUsage, type ModelId, type TokenUsage } from "./models";
import {
  COVER_LETTER_PROMPT_VERSION,
  COVER_LETTER_SYSTEM,
  type CoverLetterOutput,
  CoverLetterOutputSchema,
  coverLetterRetryNote,
  coverLetterUserPrompt,
} from "./prompts/cover-letter";
import type { AiProvider, Effort } from "./provider";

/** Model settings for cover letters (docs/adr/0010-ai.md; chosen by the eval in eval/apply/report.md). */
export const COVER_LETTER_MODEL: ModelId = "claude-sonnet-5-5";
export const COVER_LETTER_EFFORT: Effort = "low";
export const COVER_LETTER_MAX_OUTPUT_TOKENS = 3_000;

/** Gaps the user fills (`[X]`, `[X%]`, `[date]`, template gaps), as cv-render's PLACEHOLDER_PATTERN. */
const PLACEHOLDER = /\[[^[\]\r\n]{1,40}\]/gu;

const DEFAULT_GREETING: Readonly<Record<CvAssistLanguage, string>> = {
  en: "Dear Hiring Team,",
  tr: "Sayın Yetkili,",
  de: "Sehr geehrte Damen und Herren,",
};
const DEFAULT_CLOSING: Readonly<Record<CvAssistLanguage, string>> = {
  en: "Kind regards,",
  tr: "Saygılarımla,",
  de: "Mit freundlichen Grüßen",
};

/**
 * Sentences in the first person are claims about the candidate whatever the model labelled them.
 * Turkish marks the person on the verb (`geliştirdim`, `çalışıyorum`, `katkı sağlayabilirim`).
 */
const FIRST_PERSON: Readonly<Record<CvAssistLanguage, RegExp>> = {
  en: /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|myself)\b/iu,
  de: /(?<![\p{L}])(?:ich|mich|mir|mein|meine|meinen|meinem|meiner|meines)(?![\p{L}])/iu,
  tr: /(?<![\p{L}])(?:ben|benim|bana|beni|bende|benden)(?![\p{L}])|\p{L}{2,}(?:d[ıiuü]m|t[ıiuü]m|yorum|[ae]bilirim|[ae]ce[ğk]im|aca[ğk]ım|m[ıiuü]ş[ıiuü]m|[ıiuü]m[ıiuü]z?)(?![\p{L}])/iu,
};

export type SentenceSide = "candidate" | "company" | "other";

/** Why a sentence was removed (counts for logs; terms for evals and tests). */
export type LetterDropReason = "ungrounded" | "job_term";

export interface CoverLetterInput {
  content: CvContent;
  /** `Cv.language` (BCP 47): the CV's own language, for its grounding policy. */
  cvLanguage: string;
  job: Pick<Job, "title" | "company" | "skills" | "description">;
  tone: CoverLetterTone;
  language: CvAssistLanguage;
  /** Template body with merge fields, or null for a free draft. */
  template: string | null;
  /** Values for `name`, `email`, `phone`, `job_source`, `date`; `role` and `company` come from the job. */
  mergeValues: MergeValues;
}

export interface CoverLetterResult {
  subject: string | null;
  body: string;
  placeholders: string[];
  unresolvedFields: MergeField[];
  droppedSentences: number;
  dropReasons: Record<LetterDropReason, number>;
  /** Terms that got sentences dropped (evals and tests; callables must not log them). */
  droppedTerms: string[];
  /** The kept sentences with their effective side (for the eval's independent audit). */
  sentences: { text: string; side: SentenceSide }[];
  model: ModelId;
  promptVersion: string;
  usage: TokenUsage;
  costMicroUsd: number;
  attempts: number;
}

export interface CoverLetterDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
  model?: ModelId;
  effort?: Effort;
}

/** Whether a sentence speaks in the first person in `language`. */
export function isFirstPerson(text: string, language: CvAssistLanguage): boolean {
  return FIRST_PERSON[language].test(text);
}

interface Checked {
  subject: string | null;
  greeting: string;
  paragraphs: string[];
  closing: string;
  sentences: { text: string; side: SentenceSide }[];
  dropped: number;
  dropReasons: Record<LetterDropReason, number>;
  terms: string[];
}

/**
 * Drafts a cover letter from the CV and the job (BRIEF §4.4.2). Each sentence is checked against
 * the source for its side: claims about the candidate (or anything in the first person) against
 * the CV, the template and the job's company/title, without any job skill the CV lacks; claims
 * about the company against the posting. Unknown numbers and dates become `[X]`/`[date]`; a
 * sentence with an unsupported name, skill or term is removed. When most of the letter is
 * removed, the model gets one more attempt with the offending terms named.
 */
export async function draftCoverLetter(
  input: CoverLetterInput,
  deps: CoverLetterDependencies,
): Promise<CoverLetterResult> {
  const { language } = input;
  const model = deps.model ?? COVER_LETTER_MODEL;
  const values: MergeValues = { ...input.mergeValues, role: input.job.title, company: input.job.company };
  const knownValues = Object.values(values).filter((value): value is string => typeof value === "string");
  const cv = cvText(input.content);
  const description = input.job.description.slice(0, APPLY_JOB_DESCRIPTION_CHARS);
  const jobHeader = `${input.job.title}\n${input.job.company}`;
  const candidateSource = new GroundingSource(
    [cv, jobHeader, ...knownValues, input.template ?? ""].join("\n"),
  );
  const companySource = new GroundingSource([jobHeader, description, ...knownValues].join("\n"));
  const anySource = new GroundingSource(
    [cv, jobHeader, description, ...knownValues, input.template ?? ""].join("\n"),
  );
  // The company's name and the job title may appear in candidate sentences ("I'd like to join …").
  const jobTerms = jobOnlyTerms(
    { skills: input.job.skills, description },
    new GroundingSource(`${cv}\n${jobHeader}`),
    entityPolicyFor(language),
  );
  const policy = { entities: entityPolicyFor(language) };
  /** Merge fields filled; tokens without a value removed, so they are never mistaken for entities. */
  const forCheck = (text: string) => fillMergeFields(text, values).text.replace(MERGE_FIELD_PATTERN, "");

  const check = (output: CoverLetterOutput): Checked => {
    const dropReasons: Record<LetterDropReason, number> = { ungrounded: 0, job_term: 0 };
    const terms: string[] = [];
    const sentences: Checked["sentences"] = [];
    let dropped = 0;
    const paragraphs: string[] = [];
    for (const paragraph of output.paragraphs) {
      const kept: string[] = [];
      for (const sentence of paragraph.sentences) {
        const text = sentence.text.trim();
        if (text === "") continue;
        const firstPerson = isFirstPerson(forCheck(text), language);
        const side: SentenceSide =
          firstPerson || sentence.about === "candidate" ? "candidate" : sentence.about;
        const source =
          side === "candidate" ? candidateSource : side === "company" ? companySource : anySource;
        // Repair in the filled text unless an unresolved token remains (then it must pass as is).
        const filled = fillMergeFields(text, values);
        const hasTokens = filled.unresolved.length > 0;
        const repair = repairWithPlaceholders(hasTokens ? forCheck(text) : filled.text, source, policy);
        const borrowed = side === "candidate" ? mentionedTerms(forCheck(text), jobTerms) : [];
        if (repair.rejected.length > 0 || borrowed.length > 0 || (hasTokens && repair.replaced.length > 0)) {
          dropped++;
          if (borrowed.length > 0) dropReasons.job_term++;
          else dropReasons.ungrounded++;
          terms.push(...repair.rejected.map((issue) => issue.text), ...borrowed);
          continue;
        }
        const final = hasTokens ? text : repair.text;
        kept.push(final);
        sentences.push({ text: final, side });
      }
      if (kept.length > 0) paragraphs.push(kept.join(" "));
    }
    const line = (text: string, fallback: string) => {
      const trimmed = text.trim();
      return trimmed !== "" && findUngrounded(forCheck(trimmed), anySource, policy).length === 0
        ? trimmed
        : fallback;
    };
    const subject = output.subject.trim();
    return {
      subject:
        subject !== "" && findUngrounded(forCheck(subject), anySource, policy).length === 0
          ? fillMergeFields(subject, values).text.slice(0, 200)
          : null,
      greeting: line(output.greeting, DEFAULT_GREETING[language]),
      paragraphs,
      closing: line(output.closing, DEFAULT_CLOSING[language]),
      sentences,
      dropped,
      dropReasons,
      terms,
    };
  };

  const baseUser = coverLetterUserPrompt({
    tone: input.tone,
    language,
    cvText: cv,
    job: { title: input.job.title, company: input.job.company, description },
    template: input.template,
  });
  let usage = ZERO_USAGE;
  let costMicroUsd = 0;
  let attempts = 0;
  const run = async (user: string): Promise<Checked> => {
    const metered = await generateWithinBudget(deps.provider, deps.ledger, {
      model,
      effort: deps.effort ?? COVER_LETTER_EFFORT,
      system: COVER_LETTER_SYSTEM,
      user,
      schema: CoverLetterOutputSchema,
      maxOutputTokens: COVER_LETTER_MAX_OUTPUT_TOKENS,
    });
    usage = addUsage(usage, metered.usage);
    costMicroUsd += metered.costMicroUsd;
    attempts += metered.attempts;
    return check(metered.data);
  };

  let result = await run(baseUser);
  let droppedSentences = result.dropped;
  const dropReasons = { ...result.dropReasons };
  const droppedTerms = [...result.terms];
  if (result.dropped > 0 && (result.sentences.length < 3 || result.dropped * 2 > result.sentences.length)) {
    result = await run(baseUser + coverLetterRetryNote([...new Set(result.terms)]));
    droppedSentences += result.dropped;
    dropReasons.ungrounded += result.dropReasons.ungrounded;
    dropReasons.job_term += result.dropReasons.job_term;
    droppedTerms.push(...result.terms);
  }

  const letter = [result.greeting, ...result.paragraphs, `${result.closing}\n{name}`].join("\n\n");
  const filled = fillMergeFields(letter, values);
  return {
    subject: result.subject,
    body: filled.text,
    placeholders: filled.text.match(PLACEHOLDER) ?? [],
    unresolvedFields: filled.unresolved,
    droppedSentences,
    dropReasons,
    droppedTerms,
    sentences: result.sentences.map((sentence) => ({
      ...sentence,
      text: fillMergeFields(sentence.text, values).text,
    })),
    model,
    promptVersion: COVER_LETTER_PROMPT_VERSION,
    usage,
    costMicroUsd,
    attempts,
  };
}
