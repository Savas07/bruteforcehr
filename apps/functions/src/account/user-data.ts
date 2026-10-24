import { userDataRoots, userStoragePrefix } from "@bfhr/api";
import type { Firestore } from "firebase-admin/firestore";
import { revokeAllMailAccounts } from "../mail/functions";

/** The Storage bucket operations account deletion needs (a seam for tests). */
export interface UserFilesBucket {
  deleteFiles(options: { prefix: string }): Promise<unknown>;
}

/**
 * Deletes everything stored for one user. First every connected mailbox is disconnected
 * (`revokeAllMailAccounts`: the OAuth grant is revoked at the provider while the encrypted token
 * still exists). Then every Firestore tree in `userDataRoots(uid)` goes (the user document with
 * all subcollections and each per-user `serverOnly` tree), and finally every Storage object under
 * `users/{uid}/`. The single implementation behind account deletion (M6) and test-user cleanup;
 * the Auth user is deleted by the caller afterwards. A function calling this needs
 * `secrets: MAIL_SECRETS` (mail/config.ts) so the revocation can decrypt the tokens; a refused
 * provider revocation is logged and doesn't stop the deletion.
 */
export async function deleteUserData(
  db: Pick<Firestore, "doc" | "recursiveDelete">,
  bucket: UserFilesBucket,
  uid: string,
  revokeMail: (uid: string) => Promise<void> = revokeAllMailAccounts,
): Promise<void> {
  await revokeMail(uid);
  for (const root of userDataRoots(uid)) await db.recursiveDelete(db.doc(root));
  await bucket.deleteFiles({ prefix: userStoragePrefix(uid) });
}
