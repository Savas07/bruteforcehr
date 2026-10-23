import type { MailConnectErrorReason, MailSendErrorReason } from "@bfhr/core";
import type { FunctionsErrorCode } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

/** `HttpsError` with `details.reason` (client copy key) and, for form errors, `details.field`. */
export class MailCallableError extends HttpsError {
  constructor(
    code: FunctionsErrorCode,
    readonly reason: MailConnectErrorReason | MailSendErrorReason,
    message: string,
    field?: "password" | "imapHost" | "smtpHost",
  ) {
    super(code, message, field === undefined ? { reason } : { reason, field });
  }
}
