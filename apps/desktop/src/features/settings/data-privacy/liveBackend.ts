/**
 * The app's `AccountDataBackend`: the `accountExport` / `accountDelete` callables (Cloud Functions,
 * europe-west1), the ZIP from Cloud Storage (`getBytes`, owner-readable under `users/{uid}/**`)
 * and the native Save dialog of the CV export (`save_export`, kind `zip`).
 */
import {
  type AccountDeleteRequest,
  AccountDeleteResponseSchema,
  type AccountExportRequest,
  AccountExportResponseSchema,
} from "@bfhr/core";
import { httpsCallable } from "firebase/functions";
import { getBytes, ref } from "firebase/storage";
import { MAX_ACCOUNT_EXPORT_BYTES, saveExportFile } from "../../../lib/cvExport";
import { functions, storage } from "../../../lib/firebaseServices";
import { authTimeSeconds, currentUid } from "../../auth/firebaseAuth";
import type { AccountDataBackend } from "./backend";
import { ExportFlow } from "./exportFlow";

/** Building the ZIP reads every document and file; well under a minute for a personal account. */
const EXPORT_TIMEOUT_MS = 5 * 60_000;
/** Deleting revokes mail access at each provider before removing the data. */
const DELETE_TIMEOUT_MS = 9 * 60_000;

export const liveAccountDataBackend: AccountDataBackend = {
  createExport: async () => {
    const callable = httpsCallable<AccountExportRequest, unknown>(functions(), "accountExport", {
      timeout: EXPORT_TIMEOUT_MS,
    });
    return AccountExportResponseSchema.parse((await callable({})).data);
  },
  downloadExport: async (storagePath) =>
    new Uint8Array(await getBytes(ref(storage(), storagePath), MAX_ACCOUNT_EXPORT_BYTES)),
  saveExport: (bytes, fileName) => saveExportFile(bytes, fileName, "zip"),
  authTimeSeconds,
  deleteAccount: async () => {
    const callable = httpsCallable<AccountDeleteRequest, unknown>(functions(), "accountDelete", {
      timeout: DELETE_TIMEOUT_MS,
    });
    AccountDeleteResponseSchema.parse((await callable({ confirm: true })).data);
  },
  now: Date.now,
};

let liveExport: { readonly uid: string | null; readonly flow: ExportFlow } | null = null;

/**
 * The signed-in user's export state, kept while the app runs so a ready (or still preparing)
 * export survives leaving the pane; another user signing in starts fresh.
 */
export function liveExportFlow(): ExportFlow {
  const uid = currentUid();
  if (liveExport?.uid !== uid) liveExport = { uid, flow: new ExportFlow(liveAccountDataBackend) };
  return liveExport.flow;
}
