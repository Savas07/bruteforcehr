import { beforeEach, describe, expect, it } from "vitest";
import { OTP_POLICY, emailKey, issueCode, verifyCode, type OtpDeps } from "../src/otp/service";
import { MemoryOtpStore } from "./memory-store";

const EMAIL = "ada@example.com";
const MINUTE = 60 * 1000;

let store: MemoryOtpStore;
let clock: Date;
let deps: OtpDeps;

beforeEach(() => {
  store = new MemoryOtpStore();
  clock = new Date("2026-10-22T09:00:00.000Z");
  deps = { store, pepper: "test-pepper", now: () => clock };
});

function advance(ms: number): void {
  clock = new Date(clock.getTime() + ms);
}

async function issue(email = EMAIL): Promise<string> {
  const issued = await issueCode(deps, email);
  if (!issued.ok) throw new Error(`expected a code, got ${issued.reason}`);
  return issued.code;
}

/** A six-digit code that differs from `code`. */
function wrong(code: string): string {
  return ((Number(code) + 1) % 10 ** OTP_POLICY.codeLength).toString().padStart(OTP_POLICY.codeLength, "0");
}

describe("issueCode", () => {
  it("returns a zero-padded six-digit code that expires in 10 minutes", async () => {
    const issued = await issueCode(deps, EMAIL);
    expect(issued).toMatchObject({ ok: true, expiresAt: new Date(clock.getTime() + 10 * MINUTE) });
    for (let i = 0; i < 50; i++) {
      advance(13 * MINUTE); // stay under the send limit
      expect(await issue()).toMatch(/^\d{6}$/);
    }
  });

  it("stores only a salted, peppered hash of the code", async () => {
    const code = await issue();
    const challenge = store.states.get(emailKey(EMAIL))?.challenge;
    expect(challenge?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge?.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(challenge)).not.toContain(code);
    expect(JSON.stringify([...store.states.keys()])).not.toContain("ada");
  });

  it("allows 5 sends per email in any hour (sliding window)", async () => {
    for (let i = 0; i < OTP_POLICY.maxSendsPerWindow; i++) {
      await issue();
      advance(10 * MINUTE);
    }
    // First send was 50 minutes ago: blocked for another 10 minutes.
    expect(await issueCode(deps, EMAIL)).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterMs: 10 * MINUTE,
    });
    expect(await issueCode(deps, "grace@example.com")).toMatchObject({ ok: true });

    advance(10 * MINUTE);
    expect(await issueCode(deps, EMAIL)).toMatchObject({ ok: true });
    expect(await issueCode(deps, EMAIL)).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterMs: 10 * MINUTE,
    });
  });

  it("does not replace the outstanding code when rate limited", async () => {
    let code = "";
    for (let i = 0; i < OTP_POLICY.maxSendsPerWindow; i++) code = await issue();
    expect(await issueCode(deps, EMAIL)).toMatchObject({ ok: false });
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: true });
  });

  it("treats addresses case- and whitespace-insensitively", async () => {
    const code = await issue("  Ada@Example.COM ");
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: true });
  });
});

describe("verifyCode", () => {
  it("accepts the code once (no replay)", async () => {
    const code = await issue();
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: true });
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: false, reason: "no_active_code" });
  });

  it("rejects a code that was never requested", async () => {
    expect(await verifyCode(deps, EMAIL, "123456")).toEqual({ ok: false, reason: "no_active_code" });
  });

  it("rejects an expired code and deletes the challenge", async () => {
    const code = await issue();
    advance(10 * MINUTE);
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: false, reason: "no_active_code" });
    expect(store.states.get(emailKey(EMAIL))?.challenge).toBeNull();
  });

  it("accepts a code just before it expires", async () => {
    const code = await issue();
    advance(10 * MINUTE - 1);
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: true });
  });

  it("locks the code after 5 wrong attempts", async () => {
    const code = await issue();
    for (let remaining = OTP_POLICY.maxVerifyAttempts - 1; remaining > 0; remaining--) {
      expect(await verifyCode(deps, EMAIL, wrong(code))).toEqual({
        ok: false,
        reason: "invalid_code",
        attemptsRemaining: remaining,
      });
    }
    expect(await verifyCode(deps, EMAIL, wrong(code))).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(await verifyCode(deps, EMAIL, code)).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("invalidates the previous code when a new one is requested", async () => {
    const first = await issue();
    let second = await issue();
    while (second === first) second = await issue();
    expect(await verifyCode(deps, EMAIL, first)).toMatchObject({ ok: false, reason: "invalid_code" });
    expect(await verifyCode(deps, EMAIL, second)).toEqual({ ok: true });
  });

  it("only accepts the code for the address it was sent to", async () => {
    const code = await issue();
    await issue("grace@example.com");
    expect(await verifyCode(deps, "grace@example.com", code)).toMatchObject({ ok: false });
  });

  it("depends on the server pepper", async () => {
    const code = await issue();
    expect(await verifyCode({ ...deps, pepper: "other-pepper" }, EMAIL, code)).toMatchObject({
      ok: false,
      reason: "invalid_code",
    });
  });
});
