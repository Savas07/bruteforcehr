import { serverOnlyPaths } from "@bfhr/api";
import { SIGNUP_NOT_ALLOWED } from "@bfhr/core";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, beforeUserCreated } from "firebase-functions/v2/identity";

if (getApps().length === 0) initializeApp();

/** `serverOnly/signup`: who may create an account (docs/runbooks/accounts.md "Invite-only sign-up"). */
export interface SignupAllowlist {
  allowedEmails: readonly string[];
  allowedDomains: readonly string[];
}

/** Reads the allowlist; a missing document or field allows nobody (fail closed). */
export async function loadSignupAllowlist(): Promise<SignupAllowlist> {
  const snapshot = await getFirestore().doc(serverOnlyPaths.signupConfig()).get();
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    allowedEmails: strings(snapshot.get("allowedEmails")),
    allowedDomains: strings(snapshot.get("allowedDomains")),
  };
}

/** Exact address or exact domain (no subdomains), case-insensitive; surrounding spaces ignored. */
export function signupAllowed(email: string | undefined, allowlist: SignupAllowlist): boolean {
  const address = (email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return false;
  const domain = address.slice(at + 1);
  return (
    allowlist.allowedEmails.some((entry) => entry.trim().toLowerCase() === address) ||
    allowlist.allowedDomains.some((entry) => entry.trim().toLowerCase().replace(/^@/u, "") === domain)
  );
}

/**
 * The project's one `beforeUserCreated` blocking function (Identity Platform allows one per event;
 * docs/adr/0008-auth-email-link.md). It runs only when a **new** account is about to be created,
 * so existing users always sign in again; Admin SDK `createUser` doesn't run it.
 * 1. Email-link sign-in needs the Email provider, which also accepts password sign-ups through the
 *    public API; those would create unverified accounts for addresses the caller doesn't own. New
 *    accounts are allowed only from an email link (event type
 *    `providers/cloud.auth/eventTypes/user.beforeCreate:emailLink`) or with a verified email.
 * 2. Invite-only (owner decision, M6 security review finding 4): the address must be on the
 *    allowlist in `serverOnly/signup`. Refused with `SIGNUP_NOT_ALLOWED` in the message, which the
 *    apps recognise to show their invite-only copy.
 */
export const blockPasswordSignUp = beforeUserCreated((event) => checkNewUser(event));

/** The handler of `blockPasswordSignUp`: throws to refuse the new account. */
export async function checkNewUser(event: {
  eventType: string;
  data?: { email?: string | undefined; emailVerified?: boolean } | undefined;
}): Promise<void> {
  const signInMethod = event.eventType.slice(event.eventType.lastIndexOf(":") + 1);
  if (signInMethod !== "emailLink" && event.data?.emailVerified !== true) {
    throw new HttpsError("permission-denied", "Sign in with the link sent to your email.");
  }
  if (!signupAllowed(event.data?.email, await loadSignupAllowlist())) {
    logger.info("signup_refused", { signInMethod });
    throw new HttpsError(
      "permission-denied",
      `${SIGNUP_NOT_ALLOWED}: BruteForceHR is invite-only for now. Ask the owner to add your email.`,
    );
  }
}
