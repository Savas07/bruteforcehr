import type { z } from "zod";
import { DailyCapError, type UsageLedger } from "./budget";
import { ZERO_USAGE } from "./models";
import type { AiProvider, StructuredRequest, StructuredResult } from "./provider";

/** Provider returning canned replies in order (validated against the request schema like the real one). */
export function scriptedProvider(
  replies: unknown[],
): AiProvider & { requests: StructuredRequest<unknown>[] } {
  const requests: StructuredRequest<unknown>[] = [];
  return {
    requests,
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(request as StructuredRequest<unknown>);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no scripted reply left");
      return {
        data: (request.schema as z.ZodType<T>).parse(reply),
        model: request.model,
        usage: { ...ZERO_USAGE, inputTokens: 1_000, outputTokens: 500 },
        attempts: 1,
      };
    },
  };
}

/** In-memory ledger that records reservations and settlements. */
export function memoryLedger(capMicroUsd = Number.POSITIVE_INFINITY) {
  const state = { spent: 0, reserves: [] as number[], settles: [] as [number, number][] };
  const ledger: UsageLedger = {
    async reserve(microUsd) {
      if (state.spent + microUsd > capMicroUsd) throw new DailyCapError();
      state.spent += microUsd;
      state.reserves.push(microUsd);
    },
    async settle(reserved, actual) {
      state.spent += actual - reserved;
      state.settles.push([reserved, actual]);
    },
  };
  return { ledger, state };
}
