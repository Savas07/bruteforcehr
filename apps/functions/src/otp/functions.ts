// Callable functions for email one-time-code sign-in. Both run before the user is signed in.
// Clients branch on `details.reason` of HttpsError; see docs/adr/0003-auth-email-otp.md.
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { sendWithBrevo } from "./brevo";
import { firestoreOtpStore } from "./firestore-store";
import { renderCodeEmail, resolveLocale } from "./messages";
import { OTP_POLICY, emailKey, issueCode, verifyCode } from "./service";
import { getOrCreateVerifiedUser } from "./users";

const otpPepper = defineSecret("OTP_PEPPER");
const brevoApiKey = defineSecret("BREVO_API_KEY");
// Non-secret params: apps/functions/.env.bruteforcehr (copied next to the bundle by scripts/build.ts).
const brevoSenderEmail = defineString("BREVO_SENDER_EMAIL", {
  description: "Sender address for sign-in code emails (a verified sender or domain in Brevo)",
});
const brevoSenderName = defineString("BREVO_SENDER_NAME", {
  description: "Sender display name for sign-in code emails",
  default: "BruteForceHR",
});

const app = getApps()[0] ?? initializeApp();
const auth = getAuth(app);
const store = firestoreOtpStore(getFirestore(app));

const emailInput = z.string().trim().toLowerCase().max(254).pipe(z.email());

const requestCodeInput = z.object({
  email: emailInput,
  /** BCP 47 tag of the app UI language; unsupported languages fall back to English. */
  locale: z.string().max(35).optional(),
});

const verifyCodeInput = z.object({
  email: emailInput,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_POLICY.codeLength}}$`)),
});

function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid request", { reason: "invalid_input" });
  }
  return parsed.data;
}

/**
 * Sends a sign-in code. The response is the same whether or not an account exists for the
 * address (accounts are only looked up after a successful verification).
 */
export const authRequestCode = onCall({ secrets: [otpPepper, brevoApiKey] }, async (request) => {
  const { email, locale } = parseInput(requestCodeInput, request.data);
  const issued = await issueCode({ store, pepper: otpPepper.value(), now: () => new Date() }, email);
  if (!issued.ok) {
    throw new HttpsError("resource-exhausted", "Too many codes requested", {
      reason: issued.reason,
      retryAfterSeconds: Math.ceil(issued.retryAfterMs / 1000),
    });
  }

  const message = renderCodeEmail(resolveLocale(locale), issued.code, OTP_POLICY.codeTtlMs / 60_000);
  try {
    await sendWithBrevo(
      {
        apiKey: brevoApiKey.value(),
        senderEmail: brevoSenderEmail.value(),
        senderName: brevoSenderName.value(),
      },
      { to: email, ...message, tags: ["auth-code"] },
    );
  } catch (error) {
    // Never log the address or the code; the email key is enough to correlate.
    logger.error("Sign-in code email failed", {
      emailKey: emailKey(email),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("unavailable", "Could not send the sign-in code", { reason: "delivery_failed" });
  }
  return { expiresAt: issued.expiresAt.toISOString() };
});

/** Checks a code and returns a Firebase custom token for `signInWithCustomToken`. */
export const authVerifyCode = onCall({ secrets: [otpPepper] }, async (request) => {
  const { email, code } = parseInput(verifyCodeInput, request.data);
  const result = await verifyCode({ store, pepper: otpPepper.value(), now: () => new Date() }, email, code);
  if (!result.ok) {
    switch (result.reason) {
      case "invalid_code":
        throw new HttpsError("permission-denied", "Incorrect code", {
          reason: result.reason,
          attemptsRemaining: result.attemptsRemaining,
        });
      case "too_many_attempts":
        throw new HttpsError("resource-exhausted", "Too many attempts", { reason: result.reason });
      case "no_active_code":
        throw new HttpsError("failed-precondition", "No active code", { reason: result.reason });
    }
  }

  const user = await getOrCreateVerifiedUser(auth, email);
  if (user.disabled) {
    throw new HttpsError("permission-denied", "Account disabled", { reason: "account_disabled" });
  }
  return { token: await auth.createCustomToken(user.uid) };
});
