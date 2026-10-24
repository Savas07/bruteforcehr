/**
 * What a failed mail callable means for the user: the callable's `HttpsError` code plus
 * `details.reason` (`MAIL_CONNECT_ERROR_REASONS`) and `details.field` (the form field to mark,
 * connect-email.md field-level errors).
 */
import { MAIL_CONNECT_ERROR_REASONS, type MailConnectErrorReason } from "@bfhr/core";

export type MailFieldName = "password" | "imapHost" | "smtpHost";

export interface MailCallFailure {
  /** A server reason, `offline` (no connection) or `failed` (anything else). */
  readonly kind: MailConnectErrorReason | "offline" | "failed";
  readonly field: MailFieldName | null;
}

function errorField(error: unknown, field: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
}

export function classifyMailError(error: unknown, { online }: { readonly online: boolean }): MailCallFailure {
  if (!online) return { kind: "offline", field: null };
  const details = errorField(error, "details");
  const rawReason = errorField(details, "reason");
  const rawField = errorField(details, "field");
  const field =
    rawField === "password" || rawField === "imapHost" || rawField === "smtpHost" ? rawField : null;
  const reason = MAIL_CONNECT_ERROR_REASONS.find((known) => known === rawReason);
  if (reason !== undefined) return { kind: reason, field };
  const rawCode = errorField(error, "code");
  const code = typeof rawCode === "string" ? rawCode.replace(/^functions\//u, "") : "";
  // The SDK reports a dropped connection or timeout as `unavailable` / `deadline-exceeded` without a reason.
  return { kind: code === "unavailable" || code === "deadline-exceeded" ? "offline" : "failed", field: null };
}
