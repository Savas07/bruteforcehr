import { AuthErrorCode, FirebaseAuthError, type Auth, type UserRecord } from "firebase-admin/auth";

/** The slice of the Admin Auth API sign-in needs; a seam for tests. */
export type UserDirectory = Pick<Auth, "getUserByEmail" | "createUser" | "updateUser">;

/**
 * Returns the Auth user for a verified email, creating it on first sign-in. Possession of the code
 * proves ownership of the address, so the account is marked emailVerified.
 */
export async function getOrCreateVerifiedUser(users: UserDirectory, email: string): Promise<UserRecord> {
  try {
    const user = await users.getUserByEmail(email);
    return user.emailVerified ? user : await users.updateUser(user.uid, { emailVerified: true });
  } catch (error) {
    if (!(error instanceof FirebaseAuthError && error.hasCode(AuthErrorCode.USER_NOT_FOUND))) throw error;
  }
  try {
    return await users.createUser({ email, emailVerified: true });
  } catch (error) {
    // A concurrent verification for the same address created the user first.
    if (error instanceof FirebaseAuthError && error.hasCode(AuthErrorCode.EMAIL_ALREADY_EXISTS)) {
      return users.getUserByEmail(email);
    }
    throw error;
  }
}
