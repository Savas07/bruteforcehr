import type { z } from "zod";
import type { ModelId, TokenUsage } from "./models";

export type Effort = "low" | "medium" | "high";

/** One structured-output call: the reply must validate against `schema`. */
export interface StructuredRequest<T> {
  model: ModelId;
  effort: Effort;
  /** Stable instructions (cached); never contains user data. */
  system: string;
  /** The user turn: task input wrapped in tags, treated by the prompt as data. */
  user: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
}

export interface StructuredResult<T> {
  data: T;
  model: ModelId;
  /** Summed over every attempt (failed attempts are billed too). */
  usage: TokenUsage;
  attempts: number;
}

export type AiProviderErrorKind =
  /** Retries exhausted on rate limits, overload, server or connection errors. */
  | "unavailable"
  /** Bad API key or permissions; not retried. */
  | "auth"
  /** The request itself was rejected (400/404/422); a bug, not retried. */
  | "bad_request"
  /** The model refused (`stop_reason: refusal`). */
  | "refusal"
  /** The reply hit `max_tokens` or did not validate against the schema, on every attempt. */
  | "invalid_output";

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    /** Tokens billed before the failure, so the cost ledger stays exact. */
    readonly usage: TokenUsage,
    readonly attempts: number,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** The seam between AI features and a model vendor; tests and evals substitute their own. */
export interface AiProvider {
  generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
