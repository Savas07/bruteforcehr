/**
 * Claude models this package uses, with list prices for cost accounting (docs/adr/0010-ai.md).
 * Ids and prices verified 2026-10-23 against https://platform.claude.com/docs/en/about-claude/models/overview,
 * https://platform.claude.com/docs/en/about-claude/pricing and `GET /v1/models`. Dateless ids from
 * the 4.6 generation on are pinned snapshots, so a prompt version's behaviour is reproducible.
 */
export const MODELS = {
  "claude-sonnet-5-5": {
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    cacheWriteUsdPerMTok: 2.5,
    cacheReadUsdPerMTok: 0.1,
    /** Sonnet 5.5 rejects `thinking: disabled`; `between_tools` turns off up-front thinking. */
    thinkingOff: "between_tools",
  },
  "claude-haiku-5-5": {
    // Prompts up to 100k tokens; requests here are capped far below (MAX_SOURCE_CHARS).
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    cacheWriteUsdPerMTok: 0.125,
    cacheReadUsdPerMTok: 0.01,
    thinkingOff: "disabled",
  },
} as const satisfies Record<string, ModelSpec>;

interface ModelSpec {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheWriteUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
  thinkingOff: "between_tools" | "disabled";
}

export type ModelId = keyof typeof MODELS;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

/** Cost in micro-USD (integer, rounded up), the unit of the daily cap ledger. */
export function costMicroUsd(model: ModelId, usage: TokenUsage): number {
  const price = MODELS[model];
  // USD per MTok equals micro-USD per token.
  return Math.ceil(
    usage.inputTokens * price.inputUsdPerMTok +
      usage.outputTokens * price.outputUsdPerMTok +
      usage.cacheWriteTokens * price.cacheWriteUsdPerMTok +
      usage.cacheReadTokens * price.cacheReadUsdPerMTok,
  );
}

/**
 * Upper bound of a request's cost, reserved against the daily cap before calling the model.
 * Input tokens are over-estimated at one token per 2.5 characters (Turkish and German tokenize
 * denser than English) plus a fixed allowance for the output schema the API injects.
 */
export function worstCaseCostMicroUsd(model: ModelId, promptChars: number, maxOutputTokens: number): number {
  const inputTokens = Math.ceil(promptChars / 2.5) + 2_000;
  return costMicroUsd(model, { ...ZERO_USAGE, inputTokens, outputTokens: maxOutputTokens });
}
