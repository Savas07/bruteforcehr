import { APIConnectionError, APIError, RateLimitError } from "@anthropic-ai/sdk";
import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "./anthropic";
import { AiProviderError, type StructuredRequest } from "./provider";

const schema = z.object({ answer: z.string().min(1) });
const request: StructuredRequest<z.infer<typeof schema>> = {
  model: "claude-sonnet-5-5",
  effort: "low",
  system: "system",
  user: "user",
  schema,
  maxOutputTokens: 100,
};

function message(text: string, stop: Message["stop_reason"] = "end_turn"): Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 50,
    },
  } as unknown as Message;
}

function provider(responses: (Message | Error)[]) {
  const create = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const instance = new AnthropicProvider({
    apiKey: "test",
    client: { messages: { create } } as unknown as Pick<Anthropic, "messages">,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
  });
  return { instance, create, sleeps };
}

const rateLimited = (retryAfter?: string): Error =>
  new RateLimitError(
    429,
    {},
    "rate limited",
    new Headers(retryAfter === undefined ? {} : { "retry-after": retryAfter }),
  );

describe("AnthropicProvider", () => {
  it("sends JSON output config, effort, cached system prompt and no up-front thinking", async () => {
    const { instance, create } = provider([message('{"answer":"ok"}')]);
    const result = await instance.generate(request);
    expect(result).toMatchObject({ data: { answer: "ok" }, attempts: 1 });
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 10,
      cacheWriteTokens: 0,
      cacheReadTokens: 50,
    });
    const params = create.mock.calls[0]?.[0 as never] as unknown as Record<string, unknown>;
    expect(params).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      thinking: { type: "between_tools" },
      system: [{ type: "text", text: "system", cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
  });

  it("retries rate limits and overload with exponential backoff, honouring retry-after", async () => {
    const overloaded = new APIError(529, {}, "overloaded", new Headers());
    const { instance, sleeps } = provider([rateLimited("3"), overloaded, message('{"answer":"ok"}')]);
    const result = await instance.generate(request);
    expect(result.attempts).toBe(3);
    expect(sleeps).toEqual([3_000, 2_000]);
  });

  it("retries a reply that fails schema validation and sums the billed usage", async () => {
    const { instance } = provider([
      message('{"answer":""}'),
      message("not json"),
      message('{"answer":"ok"}'),
    ]);
    const result = await instance.generate(request);
    expect(result.attempts).toBe(3);
    expect(result.usage.inputTokens).toBe(300);
  });

  it("gives up after the attempt budget with the usage spent so far", async () => {
    const { instance } = provider([
      message('{"answer":""}'),
      new APIConnectionError({ message: "reset" }),
      rateLimited(),
    ]);
    const error = await instance.generate(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ kind: "unavailable", usage: { inputTokens: 100 } });
  });

  it("does not retry auth errors, refusals or truncated replies", async () => {
    const auth = provider([new APIError(401, {}, "bad key", new Headers())]);
    await expect(auth.instance.generate(request)).rejects.toMatchObject({ kind: "auth" });
    expect(auth.create).toHaveBeenCalledTimes(1);

    const refusal = provider([message("", "refusal")]);
    await expect(refusal.instance.generate(request)).rejects.toMatchObject({ kind: "refusal", attempts: 1 });

    const truncated = provider([message('{"answer":"o', "max_tokens")]);
    await expect(truncated.instance.generate(request)).rejects.toMatchObject({ kind: "invalid_output" });
    expect(truncated.create).toHaveBeenCalledTimes(1);
  });

  it("does not wait for a retry-after longer than a callable can afford", async () => {
    const { instance, create } = provider([rateLimited("60"), message('{"answer":"ok"}')]);
    await expect(instance.generate(request)).rejects.toMatchObject({ kind: "unavailable" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
