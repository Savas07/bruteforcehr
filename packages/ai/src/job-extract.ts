import {
  EMPTY_POSTING,
  type ExtractedPosting,
  type SalaryRange,
  detectSeniority,
  parseLocation,
} from "@bfhr/core";
import { type MeteredResult, type UsageLedger, generateWithinBudget } from "./budget";
import { GroundingSource } from "./grounding/grounding";
import type { ModelId } from "./models";
import {
  JOB_EXTRACT_PROMPT_VERSION,
  JOB_EXTRACT_SYSTEM,
  type JobExtractOutput,
  JobExtractOutputSchema,
  jobExtractUserPrompt,
} from "./prompts/job-extract";
import type { AiProvider, Effort } from "./provider";

/**
 * Model settings for the URL-import fallback (docs/adr/0005-job-sources-scraping.md). A short
 * structured read of a few fields from one page: Haiku is enough, and every value is grounded in
 * the page text afterwards. About $0.002 per page at the 30k-character cap.
 */
export const JOB_EXTRACT_MODEL: ModelId = "claude-haiku-5-5";
export const JOB_EXTRACT_EFFORT: Effort = "low";
export const JOB_EXTRACT_MAX_OUTPUT_TOKENS = 1_500;

/** Page text beyond this is not sent (≈ 8k tokens). */
export const JOB_EXTRACT_MAX_CHARS = 30_000;

/** Currency codes and the symbols/words that ground them on a page. */
const CURRENCY_MARKS: Readonly<Record<string, readonly string[]>> = {
  EUR: ["€", "eur", "euro"],
  USD: ["$", "usd", "us$"],
  GBP: ["£", "gbp"],
  TRY: ["₺", "try", "tl"],
  CHF: ["chf", "fr."],
};

export interface GroundedJobExtraction {
  /** Null when the model says the page holds no single posting, or title/company were not grounded. */
  posting: ExtractedPosting | null;
  /** 0..1 per filled field (`title`, `company`, `locations`, …). */
  confidence: Record<string, number>;
  /** `dropped_ungrounded:<field>`, `description_not_found`, `not_a_job_posting`. */
  warnings: string[];
}

export interface JobExtractResult extends GroundedJobExtraction {
  model: ModelId;
  promptVersion: string;
  metered: MeteredResult<JobExtractOutput>;
}

/**
 * Keeps only what the page text supports: names and places verbatim (confidence 0.9) or with all
 * their words on the page (0.75), salary numbers and currency, written dates and emails. The
 * description is cut out of the page text between the model's start/end anchors, so it is the
 * page's own wording by construction.
 */
export function groundJobExtraction(output: JobExtractOutput, pageText: string): GroundedJobExtraction {
  const warnings: string[] = [];
  const confidence: Record<string, number> = {};
  if (!output.isJobPosting) return { posting: null, confidence, warnings: ["not_a_job_posting"] };
  const source = new GroundingSource(pageText);

  const phrase = (field: string, raw: string | null): string | null => {
    const value = raw?.replace(/\s+/g, " ").trim() ?? "";
    if (value === "") return null;
    if (source.hasPhrase(value)) {
      confidence[field] = Math.min(confidence[field] ?? 1, 0.9);
      return value.slice(0, 200);
    }
    const words = value.match(/[\p{L}\p{N}][\p{L}\p{N}.+#&-]*/gu) ?? [];
    if (words.length > 0 && words.every((word) => source.hasWord(word) || source.hasEntity(word))) {
      confidence[field] = Math.min(confidence[field] ?? 1, 0.75);
      return value.slice(0, 200);
    }
    warnings.push(`dropped_ungrounded:${field}`);
    return null;
  };

  const title = phrase("title", output.title);
  const company = phrase("company", output.company);
  const labels = output.locations
    .slice(0, 10)
    .map((label) => phrase("locations", label))
    .filter((label): label is string => label !== null);

  let salary: SalaryRange | null = null;
  if (output.salary !== null) {
    const { min, max, currency, period } = output.salary;
    const code = currency?.trim().toUpperCase() ?? "";
    const marks = CURRENCY_MARKS[code] ?? [code.toLowerCase()];
    const lower = pageText.toLowerCase();
    const currencyOk =
      code.length === 3 &&
      marks.some((mark) =>
        mark.length === 1 ? lower.includes(mark) : source.hasWord(mark) || lower.includes(mark),
      );
    const numberOk = (value: number | null) => value === null || source.hasNumber([String(value)]);
    if (
      currencyOk &&
      period !== null &&
      (min !== null || max !== null) &&
      numberOk(min) &&
      numberOk(max) &&
      (min === null || max === null || min <= max)
    ) {
      salary = {
        min: min !== null && min > 0 ? min : null,
        max: max !== null && max > 0 ? max : null,
        currency: code,
        period,
        estimated: false,
      };
      if (salary.min === null && salary.max === null) salary = null;
      else confidence.salary = 0.8;
    } else {
      warnings.push("dropped_ungrounded:salary");
    }
  }

  const date = (field: string, value: string | null): Date | null => {
    if (value === null || value.trim() === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !source.hasDate(value)) {
      warnings.push(`dropped_ungrounded:${field}`);
      return null;
    }
    confidence[field] = 0.8;
    return new Date(`${value}T00:00:00Z`);
  };
  const datePosted = date("postedAt", output.datePosted);
  const validThrough = date("expiresAt", output.validThrough);

  let applyEmail: string | null = null;
  if (output.applyEmail !== null && output.applyEmail.trim() !== "") {
    if (source.hasEmail(output.applyEmail.trim())) applyEmail = output.applyEmail.trim().toLowerCase();
    else warnings.push("dropped_ungrounded:applyEmail");
  }

  const description = cutDescription(pageText, output.descriptionStart, output.descriptionEnd);
  if (description === null) warnings.push("description_not_found");
  else confidence.description = 0.8;

  if (output.workplace !== null) confidence.remoteType = 0.7;
  if (output.employmentType !== null) confidence.employmentType = 0.7;
  if (labels.length === 0) delete confidence.locations;
  if (title === null || company === null) return { posting: null, confidence, warnings };
  return {
    posting: {
      ...EMPTY_POSTING,
      title,
      company,
      locations: labels.map((label) => parseLocation(label)),
      remoteType: output.workplace,
      employmentType: output.employmentType,
      seniority: detectSeniority(title),
      // No anchors on the page: no description from the model; the caller decides the fallback.
      description: description ?? "",
      datePosted,
      validThrough,
      salary,
      applyEmail,
    },
    confidence,
    warnings,
  };
}

/** Whitespace-insensitive search: index range of `needle` in `haystack`, or null. */
function locate(haystack: string, needle: string, from: number): { start: number; end: number } | null {
  const words = needle
    .trim()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length === 0) return null;
  const pattern = new RegExp(
    words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"),
    "u",
  );
  const match = pattern.exec(haystack.slice(from));
  return match === null ? null : { start: from + match.index, end: from + match.index + match[0].length };
}

/** The page text from the start anchor through the end anchor; null when either is not on the page. */
export function cutDescription(pageText: string, start: string | null, end: string | null): string | null {
  if (start === null || end === null) return null;
  const first = locate(pageText, start, 0);
  if (first === null) return null;
  const last = locate(pageText, end, first.start);
  if (last === null) return null;
  return pageText.slice(first.start, last.end).trim();
}

export interface JobExtractDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
}

/** One metered model call on the page text, then the grounding check. */
export async function extractJobPosting(
  pageUrl: string,
  pageText: string,
  dependencies: JobExtractDependencies,
): Promise<JobExtractResult> {
  const text = pageText.slice(0, JOB_EXTRACT_MAX_CHARS);
  const metered = await generateWithinBudget(dependencies.provider, dependencies.ledger, {
    model: JOB_EXTRACT_MODEL,
    effort: JOB_EXTRACT_EFFORT,
    system: JOB_EXTRACT_SYSTEM,
    user: jobExtractUserPrompt(pageUrl, text),
    schema: JobExtractOutputSchema,
    maxOutputTokens: JOB_EXTRACT_MAX_OUTPUT_TOKENS,
  });
  return {
    ...groundJobExtraction(metered.data, text),
    model: JOB_EXTRACT_MODEL,
    promptVersion: JOB_EXTRACT_PROMPT_VERSION,
    metered,
  };
}
