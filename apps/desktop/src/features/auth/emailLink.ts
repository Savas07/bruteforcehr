/**
 * Email-link sign-in, the parts that don't need Firebase: the action code settings every request
 * sends, the address remembered between "send" and "open the link", and how Firebase errors map
 * to what the screen says. Shared by the live session (firebaseAuth.ts) and the tests.
 */
import type { ActionCodeSettings } from "firebase/auth";

/**
 * Sent with every `sendSignInLinkToEmail`. The link opens the website's `/auth/finish` page, which
 * hands it to the app (`bruteforcehr://auth/finish?link=…`) on desktop and is a universal link on
 * iOS. No `linkDomain`: Firebase rejects the default Hosting domain there, and the default
 * `firebaseapp.com` link handler already redirects to `url`.
 */
export const actionCodeSettings = {
  url: "https://bruteforcehr.web.app/auth/finish",
  handleCodeInApp: true,
  iOS: { bundleId: "com.savas07.bruteforcehr" },
} as const satisfies ActionCodeSettings;

/** Between two sends to the same address (the "Resend link" countdown). */
export const RESEND_COOLDOWN_MS = 60_000;

/** `localStorage` key of the pending request (Firebase's recommended `emailForSignIn`). */
export const PENDING_SIGN_IN_KEY = "bfhr.emailForSignIn";

/** The address a link was last requested for, and when. */
export interface PendingSignIn {
  readonly email: string;
  /** Epoch ms of the last send; drives the resend countdown across restarts. */
  readonly sentAt: number;
}

/** Trimmed and lower-cased, so "Ada@Example.com " and "ada@example.com" are one address. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * A syntax check before sending, deliberately loose (Firebase validates for real): one `@`, a
 * dot in the domain, no spaces.
 */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(email);
}

export function readPendingSignIn(storage: Pick<Storage, "getItem">): PendingSignIn | null {
  const raw = storage.getItem(PENDING_SIGN_IN_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== "object" || value === null) return null;
    const { email, sentAt } = value as Record<string, unknown>;
    if (typeof email !== "string" || !isPlausibleEmail(email)) return null;
    return { email, sentAt: typeof sentAt === "number" && Number.isFinite(sentAt) ? sentAt : 0 };
  } catch {
    return null;
  }
}

export function savePendingSignIn(storage: Pick<Storage, "setItem">, pending: PendingSignIn): void {
  storage.setItem(PENDING_SIGN_IN_KEY, JSON.stringify(pending));
}

/** Milliseconds until "Resend link" works again (0 when it does). */
export function resendWaitMs(sentAt: number, now: number): number {
  return Math.max(0, sentAt + RESEND_COOLDOWN_MS - now);
}

/** Why sending the link failed. */
export type SendError = "invalid-email" | "offline" | "rate-limited" | "unavailable";

/** Why finishing sign-in with a link failed. */
export type LinkError =
  /** The deep link failed the checks, or it isn't a sign-in link, or Firebase doesn't know the code. */
  | "invalid"
  | "expired"
  /** The link was sent to another address than the one entered. */
  | "wrong-email"
  | "disabled"
  | "offline"
  | "unavailable";

function codeOf(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

/** `sendSignInLinkToEmail` failures. */
export function sendErrorOf(error: unknown): SendError {
  switch (codeOf(error)) {
    case "auth/invalid-email":
    case "auth/missing-email":
      return "invalid-email";
    case "auth/network-request-failed":
      return "offline";
    case "auth/too-many-requests":
    case "auth/quota-exceeded":
      return "rate-limited";
    default:
      return "unavailable";
  }
}

/** `signInWithEmailLink` failures. With a well-formed address, `invalid-email` means "not the address this link was sent to". */
export function linkErrorOf(error: unknown): LinkError {
  switch (codeOf(error)) {
    case "auth/invalid-action-code":
    case "auth/argument-error":
      return "invalid";
    case "auth/expired-action-code":
      return "expired";
    case "auth/invalid-email":
      return "wrong-email";
    case "auth/user-disabled":
      return "disabled";
    case "auth/network-request-failed":
      return "offline";
    default:
      return "unavailable";
  }
}
