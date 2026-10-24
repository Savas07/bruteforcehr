import {
  type AiLogEvent,
  type AiOutcome,
  AiProviderError,
  AnthropicProvider,
  DailyCapError,
  UnreadableFileError,
} from "@bfhr/ai";
import type { AiErrorReason } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { ReasonedHttpsError } from "../callable";

/** Anthropic API key (Secret Manager, docs/runbooks/accounts.md). */
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

export function aiProvider(): AnthropicProvider {
  return new AnthropicProvider({ apiKey: ANTHROPIC_API_KEY.value() });
}

export class AiCallableError extends ReasonedHttpsError<AiErrorReason> {}

/** Refuses when the user turned AI features off (`profile.aiEnabled === false`; missing = on). */
export async function requireAiEnabled(uid: string): Promise<void> {
  const profile = await getFirestore().doc(`users/${uid}`).get();
  if (profile.get("aiEnabled") === false) {
    throw new AiCallableError(
      "failed-precondition",
      "ai_disabled",
      "AI features are turned off in your settings.",
    );
  }
}

/** Maps a failure to the client-facing error and the log outcome; never includes user content. */
export function toCallableError(error: unknown): { error: HttpsError; outcome: AiOutcome } {
  if (error instanceof AiCallableError) return { error, outcome: error.reason };
  // verifiedUid (../callable) refuses unverified accounts with the same reason as the AI errors.
  if (error instanceof ReasonedHttpsError && error.reason === "email_unverified") {
    return { error, outcome: "email_unverified" };
  }
  if (error instanceof HttpsError) return { error, outcome: "error" };
  if (error instanceof DailyCapError) {
    return {
      error: new AiCallableError(
        "resource-exhausted",
        "daily_cap",
        error.scope === "user"
          ? "You've reached today's AI limit. It resets at midnight UTC."
          : "AI help has reached today's limit for everyone. It resets at midnight UTC; everything else keeps working.",
      ),
      outcome: "daily_cap",
    };
  }
  if (error instanceof UnreadableFileError) {
    const message =
      error.reason === "no_text"
        ? "This file has no selectable text (it may be a scan). Try a PDF exported from your editor, or a DOCX."
        : "This file couldn't be read. Check that it is the type you chose.";
    return {
      error: new AiCallableError("failed-precondition", error.reason, message),
      outcome: error.reason,
    };
  }
  if (error instanceof AiProviderError) {
    if (error.kind === "unavailable") {
      return {
        error: new AiCallableError(
          "unavailable",
          "ai_unavailable",
          "The AI service is busy. Please try again in a minute.",
        ),
        outcome: "ai_unavailable",
      };
    }
    if (error.kind === "auth" || error.kind === "bad_request") {
      logger.error("ai_provider_misconfigured", { kind: error.kind, message: error.message });
    }
    return {
      error: new AiCallableError(
        "internal",
        "ai_invalid_output",
        "The AI couldn't produce a usable result. Please try again.",
      ),
      outcome: "ai_invalid_output",
    };
  }
  logger.error("ai_unexpected_error", { name: error instanceof Error ? error.name : typeof error });
  return { error: new HttpsError("internal", "Something went wrong. Please try again."), outcome: "error" };
}

/** One PII-free log line per request (see AiLogEvent). */
export function logAiEvent(event: AiLogEvent): void {
  logger.info("ai_request", event);
}
