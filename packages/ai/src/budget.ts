import { type TokenUsage, costMicroUsd, worstCaseCostMicroUsd } from "./models";
import { AiProviderError, type AiProvider, type StructuredRequest, type StructuredResult } from "./provider";

/** Per-user daily AI spend limit (docs/adr/0010-ai.md): 0.50 USD, resetting at 00:00 UTC. */
export const DAILY_COST_CAP_MICRO_USD = 500_000;

/**
 * A daily cap would be exceeded by this request: the user's own (`DAILY_COST_CAP_MICRO_USD`) or the
 * project-wide ceiling every user shares (set by the server's ledger).
 */
export class DailyCapError extends Error {
  constructor(readonly scope: "user" | "project" = "user") {
    super(scope === "user" ? "daily AI cost cap reached" : "project-wide daily AI ceiling reached");
    this.name = "DailyCapError";
  }
}

/**
 * Server-side spend ledger for one user and day. `reserve` atomically adds the request's worst
 * case cost (throwing `DailyCapError` if that would pass the cap); `settle` replaces the
 * reservation with the actual cost once the provider reports usage.
 */
export interface UsageLedger {
  reserve(microUsd: number): Promise<void>;
  settle(reservedMicroUsd: number, actualMicroUsd: number): Promise<void>;
}

export interface MeteredResult<T> extends StructuredResult<T> {
  costMicroUsd: number;
}

/**
 * Runs one structured call under the cap: reserve the worst case, call, settle the real cost
 * (also when the call fails, since failed attempts are billed).
 */
export async function generateWithinBudget<T>(
  provider: AiProvider,
  ledger: UsageLedger,
  request: StructuredRequest<T>,
): Promise<MeteredResult<T>> {
  const reserved = worstCaseCostMicroUsd(
    request.model,
    request.system.length + request.user.length,
    request.maxOutputTokens,
  );
  await ledger.reserve(reserved);
  let usage: TokenUsage | undefined;
  try {
    const result = await provider.generate(request);
    usage = result.usage;
    return { ...result, costMicroUsd: costMicroUsd(request.model, result.usage) };
  } catch (error) {
    if (error instanceof AiProviderError) usage = error.usage;
    throw error;
  } finally {
    // Unknown usage (a non-provider exception) keeps the reservation: over-counting is safe.
    await ledger.settle(reserved, usage === undefined ? reserved : costMicroUsd(request.model, usage));
  }
}
