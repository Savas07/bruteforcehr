import { setTimeout as delay } from "node:timers/promises";
import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { MODELS, type TokenUsage, ZERO_USAGE, addUsage } from "./models";
import {
  type AiProvider,
  AiProviderError,
  type AiProviderErrorKind,
  type StructuredRequest,
  type StructuredResult,
} from "./provider";

export interface RetryPolicy {
  /** Total attempts, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 };

/** A `retry-after` above this is not worth waiting for inside a callable; the attempt fails instead. */
const MAX_RETRY_AFTER_MS = 20_000;

export interface AnthropicProviderOptions {
  apiKey: string;
  retry?: RetryPolicy;
  /** Per-attempt HTTP timeout. */
  timeoutMs?: number;
  /** Test seams. */
  client?: Pick<Anthropic, "messages">;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

type AttemptFailure = {
  retryable: boolean;
  kind: AiProviderErrorKind;
  message: string;
  retryAfterMs?: number;
};

function usageOf(message: Message): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

/** Classifies an SDK exception: transport-level trouble is retried, request bugs and auth are not. */
function classify(error: unknown): AttemptFailure {
  if (error instanceof APIConnectionError) {
    return { retryable: true, kind: "unavailable", message: "connection error" };
  }
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    const retryAfterSeconds = Number(error.headers?.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : undefined;
    if (status === 408 || status === 409 || status === 429 || status >= 500) {
      return {
        retryable: true,
        kind: "unavailable",
        message: `HTTP ${status} ${error.type ?? ""}`.trim(),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      };
    }
    if (status === 401 || status === 403)
      return { retryable: false, kind: "auth", message: `HTTP ${status}` };
    return { retryable: false, kind: "bad_request", message: `HTTP ${status} ${error.type ?? ""}`.trim() };
  }
  throw error;
}

/**
 * Claude via the Messages API with JSON outputs (`output_config.format`, a zod schema compiled by
 * the SDK). Every reply is validated against the original zod schema, including constraints the
 * API cannot enforce. Retries: transport errors (429/5xx/529/connection) and invalid replies, with
 * exponential backoff + full jitter, honouring `retry-after`; the SDK's own retries are off so the
 * attempts and their billed usage are counted here.
 */
export class AnthropicProvider implements AiProvider {
  private readonly client: Pick<Anthropic, "messages">;
  private readonly retry: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: AnthropicProviderOptions) {
    this.client =
      options.client ??
      new Anthropic({ apiKey: options.apiKey, maxRetries: 0, timeout: options.timeoutMs ?? 90_000 });
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
    this.sleep = options.sleep ?? ((ms) => delay(ms));
    this.random = options.random ?? Math.random;
  }

  async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const format = zodOutputFormat(request.schema);
    let usage = ZERO_USAGE;
    let last: AttemptFailure = { retryable: false, kind: "unavailable", message: "no attempt" };

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      if (attempt > 1) {
        const backoff = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** (attempt - 2));
        const jittered = Math.round(this.random() * backoff);
        await this.sleep(Math.max(jittered, last.retryAfterMs ?? 0));
      }

      let message: Message;
      try {
        message = await this.client.messages.create({
          model: request.model,
          max_tokens: request.maxOutputTokens,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: request.user }],
          thinking: { type: MODELS[request.model].thinkingOff },
          output_config: { effort: request.effort, format: { type: format.type, schema: format.schema } },
        });
      } catch (error) {
        last = classify(error);
        if (!last.retryable || (last.retryAfterMs ?? 0) > MAX_RETRY_AFTER_MS) break;
        continue;
      }

      usage = addUsage(usage, usageOf(message));
      if (message.stop_reason === "refusal") {
        throw new AiProviderError("refusal", usage, attempt, "model refused");
      }
      if (message.stop_reason === "max_tokens") {
        // A longer reply would not fit next time either; retrying only burns budget.
        throw new AiProviderError("invalid_output", usage, attempt, "reply hit max_tokens");
      }
      const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        last = { retryable: true, kind: "invalid_output", message: "reply is not JSON" };
        continue;
      }
      const parsed = request.schema.safeParse(json);
      if (parsed.success) {
        return { data: parsed.data, model: request.model, usage, attempts: attempt };
      }
      last = { retryable: true, kind: "invalid_output", message: "reply does not match the schema" };
    }
    throw new AiProviderError(last.kind, usage, this.retry.maxAttempts, last.message);
  }
}
