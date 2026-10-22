// Email one-time-code challenge logic, independent of Firestore and Cloud Functions so it can be
// unit-tested against an in-memory store. Design and threat model: docs/adr/0003-auth-email-otp.md.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_POLICY = {
  codeLength: 6,
  codeTtlMs: 10 * 60 * 1000,
  maxVerifyAttempts: 5,
  maxSendsPerWindow: 5,
  sendWindowMs: 60 * 60 * 1000,
} as const;

/** One outstanding code per email. Requesting a new code replaces (invalidates) the previous one. */
export interface OtpChallenge {
  /** HMAC-SHA256(pepper, `${emailKey}:${salt}:${code}`), hex. The code itself is never stored. */
  codeHash: string;
  /** Random per challenge, so equal codes never produce equal hashes. Hex. */
  salt: string;
  createdAt: Date;
  /** Code expiry. Also the Firestore TTL field, so stale challenges are purged. */
  expiresAt: Date;
  failedAttempts: number;
}

/** Sliding-window send log: the send times of the last hour. */
export interface OtpSendLog {
  sentAt: Date[];
  /** Newest send + window length; the Firestore TTL field. */
  expiresAt: Date;
}

export interface OtpState {
  challenge: OtpChallenge | null;
  sendLog: OtpSendLog | null;
}

/** Atomic read-modify-write of the OTP state of one email. */
export interface OtpStore {
  /**
   * Reads the state for `emailKey`, runs `update`, and atomically persists the returned state
   * (a `null` part is deleted; a part returned by reference unchanged is not rewritten).
   * `update` may run more than once (transaction retries), so it must not have side effects.
   */
  transact<T>(emailKey: string, update: (current: OtpState) => { state: OtpState; result: T }): Promise<T>;
}

export interface OtpDeps {
  store: OtpStore;
  /** Server-side secret mixed into every code hash (Secret Manager `OTP_PEPPER`). */
  pepper: string;
  now: () => Date;
}

export type IssueResult =
  { ok: true; code: string; expiresAt: Date } | { ok: false; reason: "rate_limited"; retryAfterMs: number };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_active_code" }
  | { ok: false; reason: "invalid_code"; attemptsRemaining: number }
  | { ok: false; reason: "too_many_attempts" };

/**
 * Document id for an email: SHA-256 of the trimmed, lowercased address (Auth emails are
 * case-insensitive), so there is one challenge per address and ids never contain the address.
 */
export function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function hashCode(pepper: string, key: string, salt: string, code: string): Buffer {
  return createHmac("sha256", pepper).update(`${key}:${salt}:${code}`).digest();
}

export async function issueCode(deps: OtpDeps, email: string): Promise<IssueResult> {
  const key = emailKey(email);
  // Generated outside the transaction so retries store the same code that is returned.
  const code = randomInt(0, 10 ** OTP_POLICY.codeLength)
    .toString()
    .padStart(OTP_POLICY.codeLength, "0");
  const salt = randomBytes(16).toString("hex");
  const codeHash = hashCode(deps.pepper, key, salt, code).toString("hex");

  return deps.store.transact<IssueResult>(key, (current) => {
    const now = deps.now();
    const windowStart = now.getTime() - OTP_POLICY.sendWindowMs;
    const recentSends = (current.sendLog?.sentAt ?? []).filter((sentAt) => sentAt.getTime() > windowStart);
    const oldestRecent = recentSends[0];
    if (oldestRecent && recentSends.length >= OTP_POLICY.maxSendsPerWindow) {
      return {
        state: current,
        result: {
          ok: false,
          reason: "rate_limited",
          retryAfterMs: oldestRecent.getTime() + OTP_POLICY.sendWindowMs - now.getTime(),
        },
      };
    }
    const expiresAt = new Date(now.getTime() + OTP_POLICY.codeTtlMs);
    return {
      state: {
        challenge: { codeHash, salt, createdAt: now, expiresAt, failedAttempts: 0 },
        sendLog: {
          sentAt: [...recentSends, now],
          expiresAt: new Date(now.getTime() + OTP_POLICY.sendWindowMs),
        },
      },
      result: { ok: true, code, expiresAt },
    };
  });
}

export async function verifyCode(deps: OtpDeps, email: string, code: string): Promise<VerifyResult> {
  const key = emailKey(email);
  return deps.store.transact<VerifyResult>(key, (current) => {
    const { challenge } = current;
    if (!challenge || challenge.expiresAt.getTime() <= deps.now().getTime()) {
      return { state: { ...current, challenge: null }, result: { ok: false, reason: "no_active_code" } };
    }
    if (challenge.failedAttempts >= OTP_POLICY.maxVerifyAttempts) {
      return { state: current, result: { ok: false, reason: "too_many_attempts" } };
    }
    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = hashCode(deps.pepper, key, challenge.salt, code);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      // Single use: the challenge is consumed by the successful attempt.
      return { state: { ...current, challenge: null }, result: { ok: true } };
    }
    const failedAttempts = challenge.failedAttempts + 1;
    const attemptsRemaining = OTP_POLICY.maxVerifyAttempts - failedAttempts;
    return {
      state: { ...current, challenge: { ...challenge, failedAttempts } },
      result:
        attemptsRemaining > 0
          ? { ok: false, reason: "invalid_code", attemptsRemaining }
          : { ok: false, reason: "too_many_attempts" },
    };
  });
}
