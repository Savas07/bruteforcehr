// Shared by every callable of the `default` codebase: the Admin SDK app and the caller check.
import { getApps, initializeApp } from "firebase-admin/app";
import { type CallableRequest, type FunctionsErrorCode, HttpsError } from "firebase-functions/v2/https";

if (getApps().length === 0) initializeApp();

/** An `HttpsError` whose `details.reason` tells the client which copy to show. */
export class ReasonedHttpsError<TReason extends string> extends HttpsError {
  constructor(
    code: FunctionsErrorCode,
    readonly reason: TReason,
    message: string,
  ) {
    super(code, message, { reason });
  }
}

/** The caller's uid; signed in with a verified email (same rule as firestore.rules). */
export function verifiedUid(request: CallableRequest): string {
  if (request.auth === undefined) throw new HttpsError("unauthenticated", "Sign in to use this feature.");
  if (request.auth.token.email_verified !== true) {
    throw new ReasonedHttpsError(
      "permission-denied",
      "email_unverified",
      "Confirm your email address first.",
    );
  }
  return request.auth.uid;
}
