import { userDataRoots, userStoragePrefix } from "@bfhr/api";
import type { Firestore } from "firebase-admin/firestore";

/** The Storage bucket operations account deletion needs (a seam for tests). */
export interface UserFilesBucket {
  deleteFiles(options: { prefix: string }): Promise<unknown>;
}

/**
 * Deletes everything stored for one user: every Firestore tree in `userDataRoots(uid)` (the user
 * document with all subcollections and each per-user `serverOnly` tree) and every Storage object
 * under `users/{uid}/`. The single implementation behind account deletion (M6) and test-user
 * cleanup; the Auth user is deleted by the caller afterwards.
 *
 * Mail tokens must be revoked at the provider before this runs (MailBackend's
 * `revokeAllMailAccounts(uid)`, wired in when both land on main).
 */
export async function deleteUserData(
  db: Pick<Firestore, "doc" | "recursiveDelete">,
  bucket: UserFilesBucket,
  uid: string,
): Promise<void> {
  for (const root of userDataRoots(uid)) await db.recursiveDelete(db.doc(root));
  await bucket.deleteFiles({ prefix: userStoragePrefix(uid) });
}
