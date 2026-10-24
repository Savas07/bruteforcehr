import type { MailConnectErrorReason, MailSendErrorReason } from "@bfhr/core";
import type { FunctionsErrorCode } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * `HttpsError` with `details.reason` (client copy key) plus, for form errors, `details.field` and,
 * for `attachments_too_large`, `details.limitBytes`.
 */
export class MailCallableError extends HttpsError {
  constructor(
    code: FunctionsErrorCode,
    readonly reason: MailConnectErrorReason | MailSendErrorReason,
    message: string,
    extra: { field?: "password" | "imapHost" | "smtpHost"; limitBytes?: number } = {},
  ) {
    super(code, message, { reason, ...extra });
  }
}
