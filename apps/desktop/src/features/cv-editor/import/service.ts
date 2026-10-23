/**
 * Firebase side of the CV import: the resumable upload to `users/{uid}/cv-imports/{fileId}` and
 * the `cvImport` callable. Both are thin; the checks around them live in ./model.ts.
 */
import { storagePaths } from "@bfhr/api";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { functions, storage } from "../../../lib/firebaseServices";
import { newImportFileId } from "./model";
import type { CvImportRequest, CvImportRequestKind } from "./schema";

/** Reading a long PDF with Claude can take a while; the SDK default is 70 s. */
const CV_IMPORT_TIMEOUT_MS = 180_000;

export interface ImportUpload {
  readonly storagePath: string;
  /** Resolves when the bytes are stored; rejects with a `storage/…` error (`storage/canceled` after `cancel`). */
  readonly done: Promise<void>;
  readonly cancel: () => void;
}

/** Starts uploading `file` under a fresh id; `onProgress` gets bytes sent and total. */
export function startImportUpload(
  uid: string,
  file: Blob,
  contentType: string,
  onProgress: (transferred: number, total: number) => void,
): ImportUpload {
  const storagePath = storagePaths.cvImport(uid, newImportFileId());
  const task = uploadBytesResumable(ref(storage(), storagePath), file, { contentType });
  const done = new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => onProgress(snapshot.bytesTransferred, snapshot.totalBytes),
      reject,
      () => resolve(),
    );
  });
  return { storagePath, done, cancel: () => task.cancel() };
}

/** Asks the server to read the stored file; the answer is unchecked (see `parseCvImportResponse`). */
export async function requestCvImport(storagePath: string, kind: CvImportRequestKind): Promise<unknown> {
  const callable = httpsCallable<CvImportRequest, unknown>(functions(), "cvImport", {
    timeout: CV_IMPORT_TIMEOUT_MS,
  });
  const result = await callable({ storagePath, kind });
  return result.data;
}
