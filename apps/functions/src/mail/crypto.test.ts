import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, needsRewrap, parseKeyring } from "./crypto";

const key = () => randomBytes(32).toString("base64");
const keyring = parseKeyring(JSON.stringify({ current: "k1", keys: { k1: key() } }));
const path = "serverOnly/mail/users/alice/mailTokens/acc1";

describe("mail credential envelope encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const stored = encryptSecret(keyring, { kind: "imap", password: "abcd-efgh-ijkl-mnop" }, path);
    expect(JSON.stringify(stored)).not.toContain("abcd-efgh");
    expect(stored).toMatchObject({ v: 1, alg: "A256GCM", kid: "k1" });
    expect(decryptSecret(keyring, stored, path)).toEqual({ kind: "imap", password: "abcd-efgh-ijkl-mnop" });
  });

  it("binds the ciphertext to its document path", () => {
    const stored = encryptSecret(keyring, { secret: 1 }, path);
    expect(() => decryptSecret(keyring, stored, "serverOnly/mail/users/mallory/mailTokens/acc1")).toThrow();
  });

  it("detects tampering", () => {
    const stored = encryptSecret(keyring, { secret: 1 }, path);
    const ciphertext = Buffer.from(stored.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    expect(() =>
      decryptSecret(keyring, { ...stored, ciphertext: ciphertext.toString("base64") }, path),
    ).toThrow();
  });

  it("decrypts with an old key after rotation and asks for a rewrap", () => {
    const old = encryptSecret(keyring, { secret: 1 }, path);
    const rotated = parseKeyring(
      JSON.stringify({ current: "k2", keys: { k1: keyring.keys.get("k1")?.toString("base64"), k2: key() } }),
    );
    expect(decryptSecret(rotated, old, path)).toEqual({ secret: 1 });
    expect(needsRewrap(rotated, old)).toBe(true);
    expect(needsRewrap(rotated, encryptSecret(rotated, { secret: 1 }, path))).toBe(false);
  });

  it("rejects malformed keyrings", () => {
    expect(() =>
      parseKeyring(JSON.stringify({ current: "k1", keys: { k1: randomBytes(16).toString("base64") } })),
    ).toThrow("32 bytes");
    expect(() => parseKeyring(JSON.stringify({ current: "k9", keys: { k1: key() } }))).toThrow("current");
  });
});
