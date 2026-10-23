/**
 * "Improve with AI" (research/cv-editor.md "AI inline diff"): asks the `cvAssist` callable for
 * alternatives to one bullet or the summary. The answers become tracked changes the user decides
 * one by one (suggestions.ts); nothing here touches the draft.
 */
import { httpsCallable } from "firebase/functions";
import { defineMessages, type IntlShape } from "react-intl";
import { z } from "zod";
import { functions } from "../../lib/firebaseServices";
import type { CvTextTarget } from "./draft";

export type AssistAction = "rewrite" | "shorten" | "strongerVerb" | "translate";

/** Languages a CV can be translated into. */
export type AssistLanguage = "en" | "tr" | "de";

export const ASSIST_LANGUAGES: readonly AssistLanguage[] = ["en", "tr", "de"];

export interface CvAssistRequest {
  readonly text: string;
  readonly action: AssistAction;
  /** Required for `translate`, ignored otherwise. */
  readonly targetLanguage?: AssistLanguage;
  /** Where the text sits, so the wording fits: section key, and the entry's role and company. */
  readonly context: { readonly section: string; readonly role?: string; readonly company?: string };
}

const CvAssistResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string().min(1),
      /** Facts only the user knows ("[X%]"), left for them to fill. */
      placeholders: z.array(z.string()),
    }),
  ),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
});

export type CvAssistResponse = z.infer<typeof CvAssistResponseSchema>;

/** Throws the callable's `FunctionsError`, or a `ZodError` when the answer isn't the expected shape. */
export async function requestCvAssist(input: CvAssistRequest): Promise<CvAssistResponse> {
  const callable = httpsCallable<CvAssistRequest, unknown>(functions(), "cvAssist");
  const result = await callable(input);
  return CvAssistResponseSchema.parse(result.data);
}

/** Identifies one assist target (busy state, open menu): `${sectionKey}:${itemId ?? ''}:${bulletIndex ?? ''}`. */
export function assistKey(target: CvTextTarget): string {
  return `${target.sectionKey}:${target.itemId ?? ""}:${target.bulletIndex ?? ""}`;
}

export type AssistErrorKind = "aiDisabled" | "dailyCap" | "emailUnverified" | "signedOut" | "offline" | "failed";

function errorField(error: unknown, field: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
}

/** Maps a `cvAssist` failure (callable `HttpsError` code + `details.reason`) to what the user sees. */
export function classifyAssistError(error: unknown, { online }: { readonly online: boolean }): AssistErrorKind {
  if (!online) return "offline";
  const rawCode = errorField(error, "code");
  const code = typeof rawCode === "string" ? rawCode.replace(/^functions\//u, "") : "";
  const rawReason = errorField(errorField(error, "details"), "reason");
  const reason = typeof rawReason === "string" ? rawReason : "";
  switch (code) {
    case "failed-precondition":
      return reason === "ai_disabled" ? "aiDisabled" : "failed";
    case "resource-exhausted":
      return "dailyCap";
    case "permission-denied":
      return reason === "email_unverified" ? "emailUnverified" : "signedOut";
    case "unauthenticated":
      return "signedOut";
    case "unavailable":
      return "offline";
    default:
      return "failed";
  }
}

const errorMessages = defineMessages({
  aiDisabled: {
    id: "cv-editor.assist.error.aiDisabled",
    defaultMessage: "AI suggestions are off in Settings. Turn them on there to use Improve with AI.",
  },
  dailyCap: {
    id: "cv-editor.assist.error.dailyCap",
    defaultMessage: "You've reached today's AI limit. It resets tomorrow, and you can keep editing meanwhile.",
  },
  emailUnverified: {
    id: "cv-editor.assist.error.emailUnverified",
    defaultMessage: "Confirm your email address to use AI suggestions, then try again.",
  },
  signedOut: {
    id: "cv-editor.assist.error.signedOut",
    defaultMessage: "Sign in again to use AI suggestions. Your edits are kept.",
  },
  offline: {
    id: "cv-editor.assist.error.offline",
    defaultMessage: "AI suggestions need an internet connection. Your edits are saved on this device.",
  },
  failed: {
    id: "cv-editor.assist.error.failed",
    defaultMessage: "Couldn't get a suggestion right now. Try again in a moment.",
  },
});

/** One calm sentence for a failed `requestCvAssist`; reads the connection from `navigator.onLine`. */
export function assistErrorMessage(error: unknown, intl: IntlShape): string {
  const online = globalThis.navigator?.onLine ?? true;
  return intl.formatMessage(errorMessages[classifyAssistError(error, { online })]);
}
