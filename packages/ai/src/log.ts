import type { CvAssistAction, CvAssistLanguage, CvImportSourceKind } from "@bfhr/core";

export type AiOutcome =
  | "ok"
  | "email_unverified"
  | "ai_disabled"
  | "daily_cap"
  | "file_not_found"
  | "file_too_large"
  | "unreadable_file"
  | "no_text"
  | "ai_unavailable"
  | "ai_invalid_output"
  | "error";

/**
 * One log line per AI request. PII-free by construction: only enums, versions and counts — never
 * CV text, file names, emails, model replies or the uid. Grounding results are counts.
 */
export interface AiLogEvent {
  task: "cvImport" | "cvAssist" | "matchRationale";
  outcome: AiOutcome;
  kind?: CvImportSourceKind;
  action?: CvAssistAction;
  targetLanguage?: CvAssistLanguage;
  model?: string;
  promptVersion?: string;
  latencyMs: number;
  attempts?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costMicroUsd?: number;
  /** Length of the source text in characters. */
  sourceChars?: number;
  /** Import: values removed by the grounding check. */
  droppedValues?: number;
  /** Assist: suggestions returned / rejected by the grounding check / placeholders inserted by it. */
  suggestions?: number;
  rejectedSuggestions?: number;
  placeholdersInserted?: number;
}

export interface AiLogger {
  log(event: AiLogEvent): void;
}
