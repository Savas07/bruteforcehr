// Account data rights (docs/runbooks/account.md): "Export everything" and "Delete account".
import {
  type AccountDeleteErrorReason,
  AccountDeleteRequestSchema,
  type AccountDeleteResponse,
  type AccountExportErrorReason,
  AccountExportRequestSchema,
  type AccountExportResponse,
  isRecentSignIn,
} from "@bfhr/core";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { type FunctionsErrorCode, HttpsError, onCall } from "firebase-functions/v2/https";
import { ReasonedHttpsError, verifiedUid } from "../callable";
import { MAIL_SECRETS } from "../mail/config";
import { deleteAccount, uidHash } from "./delete";
import { createExport, ExportRefused } from "./export";

const EXPORT_REFUSALS: Record<ExportRefused["reason"], [FunctionsErrorCode, string]> = {
  export_too_soon: ["resource-exhausted", "You just made an export. Try again in a couple of minutes."],
  export_daily_limit: ["resource-exhausted", "Daily export limit reached. Try again tomorrow."],
  export_too_large: ["failed-precondition", "The account holds too much data for one export."],
};

export const accountExport = onCall(
  // Holds the whole ZIP in memory (ACCOUNT_EXPORT_LIMITS.maxBytes).
  { memory: "2GiB", timeoutSeconds: 540, maxInstances: 5 },
  async (request): Promise<AccountExportResponse> => {
    const uid = verifiedUid(request);
    if (!AccountExportRequestSchema.safeParse(request.data ?? {}).success)
      throw new HttpsError("invalid-argument", "Expected {}.");
    const started = Date.now();
    try {
      const result = await createExport(getFirestore(), getStorage().bucket(), uid);
      logger.info("account_export", {
        uidHash: uidHash(uid),
        sizeBytes: result.sizeBytes,
        documents: result.documentCount,
        files: result.fileCount,
        ms: Date.now() - started,
      });
      return result;
    } catch (error) {
      if (!(error instanceof ExportRefused)) throw error;
      logger.info("account_export_refused", { uidHash: uidHash(uid), reason: error.reason });
      const [code, message] = EXPORT_REFUSALS[error.reason];
      throw new ReasonedHttpsError<AccountExportErrorReason>(code, error.reason, message);
    }
  },
);

export const accountDelete = onCall(
  // MAIL_SECRETS: revokeAllMailAccounts decrypts each token to revoke it at Google / Microsoft.
  { secrets: MAIL_SECRETS, memory: "512MiB", timeoutSeconds: 540, maxInstances: 5 },
  async (request): Promise<AccountDeleteResponse> => {
    const uid = verifiedUid(request);
    if (!AccountDeleteRequestSchema.safeParse(request.data).success)
      throw new HttpsError("invalid-argument", "Expected { confirm: true }.");
    const authTime = request.auth?.token.auth_time;
    if (typeof authTime !== "number" || !isRecentSignIn(authTime, Date.now())) {
      throw new ReasonedHttpsError<AccountDeleteErrorReason>(
        "failed-precondition",
        "recent_sign_in_required",
        "Sign in again to delete your account.",
      );
    }
    const started = Date.now();
    await deleteAccount({ db: getFirestore(), bucket: getStorage().bucket(), auth: getAuth() }, uid);
    logger.info("account_deleted", { uidHash: uidHash(uid), ms: Date.now() - started });
    return { deleted: true };
  },
);
