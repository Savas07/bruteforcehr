import { HttpsError, beforeUserCreated } from "firebase-functions/v2/identity";

/**
 * Identity Platform blocking function (docs/adr/0008-auth-email-link.md). Email-link sign-in needs
 * the Email provider, which also accepts password sign-ups through the public API; those would
 * create unverified accounts for addresses the caller doesn't own. New accounts are allowed only
 * from an email link (event type `providers/cloud.auth/eventTypes/user.beforeCreate:emailLink`) or
 * with an already verified email. Security rules additionally require `email_verified`.
 */
export const blockPasswordSignUp = beforeUserCreated((event) => {
  const signInMethod = event.eventType.slice(event.eventType.lastIndexOf(":") + 1);
  if (signInMethod !== "emailLink" && event.data?.emailVerified !== true) {
    throw new HttpsError("permission-denied", "Sign in with the link sent to your email.");
  }
});
