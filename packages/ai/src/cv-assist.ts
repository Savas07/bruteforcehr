import {
  CV_PLACEHOLDER_PATTERN,
  type CvAssistLanguage,
  type CvAssistRequest,
  type CvAssistSuggestion,
} from "@bfhr/core";
import { type UsageLedger, generateWithinBudget } from "./budget";
import { type EntityPolicy, GroundingSource, fold, repairWithPlaceholders } from "./grounding/grounding";
import { ZERO_USAGE, addUsage, type ModelId, type TokenUsage } from "./models";
import {
  CV_ASSIST_PROMPT_VERSION,
  CV_ASSIST_SYSTEM,
  CvAssistOutputSchema,
  cvAssistRetryNote,
  cvAssistUserPrompt,
} from "./prompts/cv-assist";
import type { AiProvider, Effort } from "./provider";

/** Model settings for CV assists (docs/adr/0010-ai.md; chosen by the eval in eval/report.md). */
export const CV_ASSIST_MODEL: ModelId = "claude-sonnet-5-5";
export const CV_ASSIST_EFFORT: Effort = "low";
export const CV_ASSIST_MAX_OUTPUT_TOKENS = 3_000;
const MAX_SUGGESTIONS = 3;

const STOPWORDS: Readonly<Record<CvAssistLanguage, readonly string[]>> = {
  en: ["the", "and", "of", "to", "with", "for", "in", "on", "by", "a", "an", "our", "from"],
  de: ["und", "der", "die", "das", "mit", "fur", "von", "zu", "im", "ein", "eine", "den", "bei", "sowie"],
  tr: ["ve", "ile", "bir", "icin", "olarak", "bu", "da", "de", "en", "cok", "olan", "gibi"],
};

/**
 * The language of a CV text from its function words and letters, or undefined when unclear. It
 * only picks the grounding policy: German capitalizes every noun, so capitalized words count as
 * entities only in English and Turkish text.
 */
export function detectLanguage(text: string): CvAssistLanguage | undefined {
  const words = fold(text).match(/\p{L}+/gu) ?? [];
  const scores: Record<CvAssistLanguage, number> = { en: 0, de: 0, tr: 0 };
  for (const word of words) {
    for (const language of ["en", "de", "tr"] as const)
      if (STOPWORDS[language].includes(word)) scores[language]++;
  }
  if (/[ğşıİ]/u.test(text)) scores.tr += 3;
  if (/[äß]/u.test(text)) scores.de += 3;
  const ranked = (Object.entries(scores) as [CvAssistLanguage, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best === undefined || best[1] === 0 || (second !== undefined && best[1] === second[1]))
    return undefined;
  return best[0];
}

export interface CvAssistResult {
  suggestions: CvAssistSuggestion[];
  model: string;
  promptVersion: string;
  usage: TokenUsage;
  costMicroUsd: number;
  attempts: number;
  rejectedSuggestions: number;
  placeholdersInserted: number;
  /** Terms that got suggestions rejected (for evals and tests; callables must not log them). */
  rejectedTerms: string[];
}

export interface CvAssistDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
  model?: ModelId;
  effort?: Effort;
}

/**
 * Rewrites, shortens, strengthens or translates CV text. Every suggestion passes the grounding
 * check against the input (+ role/company): unknown numbers and dates become placeholders,
 * suggestions with an unknown entity are dropped. If all are dropped, the model gets one more
 * attempt with the offending terms named.
 */
export async function assistCv(
  request: CvAssistRequest,
  deps: CvAssistDependencies,
): Promise<CvAssistResult> {
  const { text, action, targetLanguage, context } = request;
  const source = new GroundingSource([text, context.role ?? "", context.company ?? ""].join("\n"));
  const outputLanguage = action === "translate" ? targetLanguage : detectLanguage(text);
  const entities: EntityPolicy =
    action !== "translate" && (outputLanguage === "en" || outputLanguage === "tr")
      ? "hard+capitalized"
      : "hard";
  const model = deps.model ?? CV_ASSIST_MODEL;
  const baseUser = cvAssistUserPrompt({
    action,
    text,
    section: context.section,
    ...(targetLanguage === undefined ? {} : { targetLanguage }),
    ...(context.role === undefined ? {} : { role: context.role }),
    ...(context.company === undefined ? {} : { company: context.company }),
  });

  let usage = ZERO_USAGE;
  let costMicroUsd = 0;
  let attempts = 0;
  let rejectedSuggestions = 0;
  let placeholdersInserted = 0;
  const rejectedTerms: string[] = [];
  const dedupeKey = (value: string): string =>
    fold(value)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const inputKey = dedupeKey(text);

  const run = async (user: string): Promise<{ suggestions: CvAssistSuggestion[]; ungrounded: string[] }> => {
    const metered = await generateWithinBudget(deps.provider, deps.ledger, {
      model,
      effort: deps.effort ?? CV_ASSIST_EFFORT,
      system: CV_ASSIST_SYSTEM,
      user,
      schema: CvAssistOutputSchema,
      maxOutputTokens: CV_ASSIST_MAX_OUTPUT_TOKENS,
    });
    usage = addUsage(usage, metered.usage);
    costMicroUsd += metered.costMicroUsd;
    attempts += metered.attempts;

    const suggestions: CvAssistSuggestion[] = [];
    const seen = new Set<string>();
    const ungrounded: string[] = [];
    for (const candidate of metered.data.suggestions) {
      const trimmed = candidate.trim().replace(/^["“„]|["”]$/gu, "");
      if (trimmed === "") continue;
      const repair = repairWithPlaceholders(trimmed, source, { entities });
      if (repair.rejected.length > 0) {
        rejectedSuggestions++;
        ungrounded.push(...repair.rejected.map((issue) => issue.text));
        rejectedTerms.push(...repair.rejected.map((issue) => issue.text));
        continue;
      }
      const key = dedupeKey(repair.text);
      if (seen.has(key) || (key === inputKey && action !== "translate")) continue;
      seen.add(key);
      placeholdersInserted += repair.replaced.length;
      suggestions.push({ text: repair.text, placeholders: repair.text.match(CV_PLACEHOLDER_PATTERN) ?? [] });
      if (suggestions.length === MAX_SUGGESTIONS) break;
    }
    return { suggestions, ungrounded };
  };

  let outcome = await run(baseUser);
  if (outcome.suggestions.length === 0 && outcome.ungrounded.length > 0) {
    outcome = await run(baseUser + cvAssistRetryNote([...new Set(outcome.ungrounded)]));
  }
  return {
    suggestions: outcome.suggestions,
    model,
    promptVersion: CV_ASSIST_PROMPT_VERSION,
    usage,
    costMicroUsd,
    attempts,
    rejectedSuggestions,
    placeholdersInserted,
    rejectedTerms,
  };
}
