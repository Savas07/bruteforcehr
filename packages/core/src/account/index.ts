import { z } from "zod";

/**
 * Account data rights (brief §4.9, docs/runbooks/account.md): "Export everything" and "Delete
 * account". Both are callables of the `default` codebase; the apps render the reasons below.
 */

/** `accountDelete` needs a sign-in at most this old (`auth_time` claim); otherwise re-authenticate. */
export const ACCOUNT_RECENT_SIGN_IN_SECONDS = 300;

/** `accountExport` limits per user: spacing between exports and exports per UTC day. */
export const ACCOUNT_EXPORT_LIMITS = {
  minIntervalSeconds: 120,
  perDay: 5,
  /** Total bytes of documents + files; beyond this the export is refused (`export_too_large`). */
  maxBytes: 300 * 1024 * 1024,
  /** How long the ZIP stays downloadable; the Storage lifecycle rule deletes it afterwards. */
  availableHours: 24,
} as const;

/** `accountExport` takes no input. */
export const AccountExportRequestSchema = z.object({}).strict();
export type AccountExportRequest = z.input<typeof AccountExportRequestSchema>;

/**
 * The ZIP is written to `storagePaths.accountExport(uid, exportId)` (owner-readable through the
 * Storage rules); clients download it with the Storage SDK and save it under `fileName`.
 */
export const AccountExportResponseSchema = z.object({
  exportId: z.string().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  /** ISO 8601. */
  createdAt: z.iso.datetime(),
  /** ISO 8601; after this the apps no longer offer the download. */
  expiresAt: z.iso.datetime(),
});
export type AccountExportResponse = z.infer<typeof AccountExportResponseSchema>;

/** `details.reason` of `accountExport` errors. */
export const ACCOUNT_EXPORT_ERROR_REASONS = [
  "email_unverified",
  /** Less than `minIntervalSeconds` since the previous export. */
  "export_too_soon",
  /** `perDay` exports already made today (UTC). */
  "export_daily_limit",
  "export_too_large",
] as const;
export type AccountExportErrorReason = (typeof ACCOUNT_EXPORT_ERROR_REASONS)[number];

/** `accountDelete` request: an explicit confirmation, so a stray call can't delete anything. */
export const AccountDeleteRequestSchema = z.object({ confirm: z.literal(true) }).strict();
export type AccountDeleteRequest = z.input<typeof AccountDeleteRequestSchema>;

export const AccountDeleteResponseSchema = z.object({ deleted: z.literal(true) });
export type AccountDeleteResponse = z.infer<typeof AccountDeleteResponseSchema>;

/** `details.reason` of `accountDelete` errors. */
export const ACCOUNT_DELETE_ERROR_REASONS = [
  "email_unverified",
  /** `auth_time` older than `ACCOUNT_RECENT_SIGN_IN_SECONDS`: sign in again with an email link. */
  "recent_sign_in_required",
] as const;
export type AccountDeleteErrorReason = (typeof ACCOUNT_DELETE_ERROR_REASONS)[number];

/** True when a token's `auth_time` (seconds since epoch) is recent enough for `accountDelete`. */
export function isRecentSignIn(authTimeSeconds: number, nowMs: number): boolean {
  const ageSeconds = nowMs / 1000 - authTimeSeconds;
  return ageSeconds >= -60 && ageSeconds <= ACCOUNT_RECENT_SIGN_IN_SECONDS;
}
