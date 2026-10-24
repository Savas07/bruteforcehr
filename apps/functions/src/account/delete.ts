import { createHash } from "node:crypto";
import { userDataRoots, userStoragePrefix } from "@bfhr/api";
import type { Firestore } from "firebase-admin/firestore";
import { deleteUserData, type UserFilesBucket } from "./user-data";

/** What account deletion needs from Firebase Auth (a seam for tests). */
export interface AccountAuth {
  deleteUser(uid: string): Promise<void>;
}

/** Short, non-reversible id for logs (the uid itself is never logged). */
export function uidHash(uid: string): string {
  return createHash("sha256").update(uid).digest("hex").slice(0, 16);
}

/** Account deletion is idempotent: a user that is already gone is not an error. */
async function ignoringMissingUser(step: Promise<unknown>): Promise<void> {
  try {
    await step;
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "auth/user-not-found") throw error;
  }
}

/**
 * Deletes an account (docs/runbooks/account.md). Idempotent: a retry after a failure, or a second
 * call after success, finishes the remaining steps and succeeds. The Auth user stays usable until
 * the data is gone, so the user can sign in again and retry when a step fails.
 * 1. `deleteUserData`: revoke every mail grant at the provider, then delete every `userDataRoots`
 *    tree and the Storage prefix.
 * 2. Delete the Auth user (its refresh tokens stop working).
 * 3. Sweep the roots and the Storage prefix once more: another signed-in device holding a
 *    still-valid ID token may have written during step 1.
 */
export async function deleteAccount(
  deps: {
    db: Pick<Firestore, "doc" | "recursiveDelete">;
    bucket: UserFilesBucket;
    auth: AccountAuth;
    revokeMail?: (uid: string) => Promise<void>;
  },
  uid: string,
): Promise<void> {
  const { db, bucket, auth } = deps;
  await deleteUserData(db, bucket, uid, deps.revokeMail);
  await ignoringMissingUser(auth.deleteUser(uid));
  for (const root of userDataRoots(uid)) await db.recursiveDelete(db.doc(root));
  await bucket.deleteFiles({ prefix: userStoragePrefix(uid) });
}
