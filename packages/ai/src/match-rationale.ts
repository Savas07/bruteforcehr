import type { Job, MatchFactor, UiLanguage } from "@bfhr/core";
import { type UsageLedger, generateWithinBudget } from "./budget";
import { GroundingSource, findUngrounded } from "./grounding/grounding";
import type { ModelId, TokenUsage } from "./models";
import {
  MATCH_RATIONALE_PROMPT_VERSION,
  MATCH_RATIONALE_SYSTEM,
  MatchRationaleOutputSchema,
  matchRationaleUserPrompt,
} from "./prompts/match-rationale";
import type { AiProvider, Effort } from "./provider";

/** Small, cheap model: a short grounded summary of factors the rules already computed. */
export const MATCH_RATIONALE_MODEL: ModelId = "claude-haiku-5-5";
export const MATCH_RATIONALE_EFFORT: Effort = "low";
const MAX_OUTPUT_TOKENS = 600;
/** Description excerpt sent to the model (keeps each call well under 1¢). */
const EXCERPT_CHARS = 4_000;

export interface MatchRationaleInput {
  language: UiLanguage;
  job: Pick<Job, "title" | "company" | "locations" | "description">;
  reasons: readonly MatchFactor[];
  gaps: readonly MatchFactor[];
  skills: { matched: readonly string[]; unmatched: readonly string[] };
  targetRoles: readonly string[];
  personSkills: readonly string[];
}

export interface MatchRationaleResult {
  /** Null when the model's text failed the grounding check (nothing is shown rather than a guess). */
  rationale: string | null;
  /** Skills the posting asks for, as the model read them (merged into `jobs.skills`). */
  postingSkills: string[];
  model: ModelId;
  promptVersion: string;
  usage: TokenUsage;
  costMicroUsd: number;
  attempts: number;
}

export interface MatchRationaleDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
}

function describe(factor: MatchFactor): string {
  const what =
    factor.kind === "requirement" ? `${factor.facet}: ${factor.label}` : `${factor.kind}: ${factor.label}`;
  return `${what} — ${factor.status.replace("_", " ")}`;
}

/**
 * "Why it matches" for one of the top matches (ADR 0011): a two-to-three sentence summary of the
 * rule-based factors in the user's UI language, plus the posting's skills. The text must be
 * grounded in the input (no numbers or entities that aren't there); otherwise it is dropped.
 */
export async function explainMatch(
  input: MatchRationaleInput,
  deps: MatchRationaleDependencies,
): Promise<MatchRationaleResult> {
  const posting = {
    title: input.job.title,
    company: input.job.company,
    location: input.job.locations.map((location) => location.label).join("; ") || "not stated",
    excerpt: input.job.description.slice(0, EXCERPT_CHARS),
  };
  const checks = [
    ...input.reasons.map(describe),
    ...input.gaps.map(describe),
    `skills found in CV: ${input.skills.matched.join(", ") || "none"}`,
    `skills not in CV: ${input.skills.unmatched.join(", ") || "none"}`,
  ];
  const user = matchRationaleUserPrompt({
    language: input.language,
    posting,
    checks,
    person: { targetRoles: input.targetRoles, skills: input.personSkills },
  });
  const metered = await generateWithinBudget(deps.provider, deps.ledger, {
    model: MATCH_RATIONALE_MODEL,
    effort: MATCH_RATIONALE_EFFORT,
    system: MATCH_RATIONALE_SYSTEM,
    user,
    schema: MatchRationaleOutputSchema,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  const source = new GroundingSource(user);
  const text = metered.data.rationale.trim().slice(0, 2_000);
  const grounded = text !== "" && findUngrounded(text, source, { entities: "hard" }).length === 0;
  const postingSkills = metered.data.postingSkills
    .map((skill) => skill.trim())
    .filter((skill) => skill !== "" && skill.length <= 60 && source.hasPhrase(skill))
    .slice(0, 15);
  return {
    rationale: grounded ? text : null,
    postingSkills,
    model: MATCH_RATIONALE_MODEL,
    promptVersion: MATCH_RATIONALE_PROMPT_VERSION,
    usage: metered.usage,
    costMicroUsd: metered.costMicroUsd,
    attempts: metered.attempts,
  };
}
