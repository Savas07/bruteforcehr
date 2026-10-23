import { assistCv } from "@bfhr/ai";
import { type CvAssistResponse, CvAssistRequestSchema, CvAssistResponseSchema } from "@bfhr/core";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifiedUid } from "../callable";
import { ANTHROPIC_API_KEY, aiProvider, logAiEvent, requireAiEnabled, toCallableError } from "./common";
import { firestoreUsageLedger } from "./usage-ledger";

/**
 * `cvAssist({ text, action, targetLanguage?, context })`: up to three rewrites of one piece of CV
 * text (rewrite, shorten, stronger verb, translate en/tr/de). Unknown numbers and dates become
 * placeholders such as `[X%]`; suggestions naming anything not in the input are dropped
 * (docs/adr/0010-ai.md).
 */
export const cvAssist = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90 },
  async (request): Promise<CvAssistResponse> => {
    const started = Date.now();
    const parsed = CvAssistRequestSchema.safeParse(request.data);
    const action = parsed.success ? parsed.data.action : undefined;
    try {
      const uid = verifiedUid(request);
      if (!parsed.success) {
        throw new HttpsError(
          "invalid-argument",
          "Expected { text, action, targetLanguage?, context: { section } }.",
        );
      }
      await requireAiEnabled(uid);
      const result = await assistCv(parsed.data, {
        provider: aiProvider(),
        ledger: firestoreUsageLedger(uid),
      });
      const response = CvAssistResponseSchema.parse({
        suggestions: result.suggestions,
        model: result.model,
        promptVersion: result.promptVersion,
      });
      logAiEvent({
        task: "cvAssist",
        outcome: "ok",
        action: parsed.data.action,
        ...(parsed.data.targetLanguage === undefined ? {} : { targetLanguage: parsed.data.targetLanguage }),
        model: result.model,
        promptVersion: result.promptVersion,
        latencyMs: Date.now() - started,
        attempts: result.attempts,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
        costMicroUsd: result.costMicroUsd,
        sourceChars: parsed.data.text.length,
        suggestions: result.suggestions.length,
        rejectedSuggestions: result.rejectedSuggestions,
        placeholdersInserted: result.placeholdersInserted,
      });
      return response;
    } catch (error) {
      const mapped = toCallableError(error);
      logAiEvent({
        task: "cvAssist",
        outcome: mapped.outcome,
        ...(action === undefined ? {} : { action }),
        latencyMs: Date.now() - started,
      });
      throw mapped.error;
    }
  },
);
