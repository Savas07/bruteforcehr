/**
 * What a failed `accountExport` / `accountDelete` / download means for the pane, read from the
 * callable's `HttpsError` (`details.reason`, @bfhr/core `ACCOUNT_*_ERROR_REASONS`), and the
 * sentence each export failure shows.
 */
import type { AccountDeleteErrorReason, AccountExportErrorReason } from "@bfhr/core";
import type { MessageDescriptor } from "react-intl";
import { exportMessages } from "./messages";

/** Why "Create export" failed. Unknown reasons, `email_unverified` and transport errors are `generic`. */
export type ExportFailure = "too-soon" | "daily-limit" | "too-large" | "generic";

/** Why "Delete everything" didn't finish: a fresh sign-in is needed, or anything else (retry). */
export type DeleteFailure = "reauth" | "generic";

/** `details.reason` of a Firebase `FunctionsError` (null when it has none). */
export function reasonOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("details" in error)) return null;
  const { details } = error;
  if (typeof details !== "object" || details === null || !("reason" in details)) return null;
  return typeof details.reason === "string" ? details.reason : null;
}

const exportFailureByReason: Readonly<Partial<Record<AccountExportErrorReason, ExportFailure>>> = {
  export_too_soon: "too-soon",
  export_daily_limit: "daily-limit",
  export_too_large: "too-large",
};

export function exportFailureOf(error: unknown): ExportFailure {
  const reason = reasonOf(error) as AccountExportErrorReason | null;
  return (reason !== null && exportFailureByReason[reason]) || "generic";
}

const RECENT_SIGN_IN_REQUIRED: AccountDeleteErrorReason = "recent_sign_in_required";

export function deleteFailureOf(error: unknown): DeleteFailure {
  return reasonOf(error) === RECENT_SIGN_IN_REQUIRED ? "reauth" : "generic";
}

/** The alert under "Create export" for each failure. */
export const exportFailureMessages: Readonly<Record<ExportFailure, MessageDescriptor>> = {
  "too-soon": exportMessages.errorTooSoon,
  "daily-limit": exportMessages.errorDailyLimit,
  "too-large": exportMessages.errorTooLarge,
  generic: exportMessages.errorGeneric,
};
