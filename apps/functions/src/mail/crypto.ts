// AES-256-GCM envelope encryption for mail credentials (docs/adr/0012-mail-sync.md):
// every secret gets a fresh 256-bit data key; the data key is wrapped with the key-encryption key
// (KEK) from Secret Manager (`MAIL_TOKEN_KEYS`); both layers authenticate the document path as
// additional data, so a ciphertext copied to another account's document doesn't decrypt.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/** `MAIL_TOKEN_KEYS` secret: `{ "current": "k1", "keys": { "k1": "<base64 of 32 random bytes>" } }`. */
const KeyringSchema = z.object({
  current: z.string().min(1).max(20),
  keys: z.record(z.string().min(1).max(20), z.base64()),
});

export interface Keyring {
  current: string;
  keys: ReadonlyMap<string, Buffer>;
}

export function parseKeyring(json: string): Keyring {
  const parsed = KeyringSchema.parse(JSON.parse(json));
  const keys = new Map<string, Buffer>();
  for (const [id, value] of Object.entries(parsed.keys)) {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) throw new Error(`MAIL_TOKEN_KEYS key ${id} is not 32 bytes`);
    keys.set(id, key);
  }
  if (!keys.has(parsed.current)) throw new Error("MAIL_TOKEN_KEYS current key is missing");
  return { current: parsed.current, keys };
}

/** Stored form (Firestore map). Binary fields are base64. */
export const EncryptedSecretSchema = z.object({
  v: z.literal(1),
  alg: z.literal("A256GCM"),
  /** KEK id from the keyring. */
  kid: z.string().min(1),
  /** Data key wrapped by the KEK: iv (12) ‖ ciphertext (32) ‖ tag (16). */
  wrappedKey: z.base64(),
  iv: z.base64(),
  ciphertext: z.base64(),
  tag: z.base64(),
});
export type EncryptedSecret = z.infer<typeof EncryptedSecretSchema>;

function seal(key: Buffer, plaintext: Buffer, aad: string): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, tag: cipher.getAuthTag() };
}

function open(key: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypts a JSON value for the document at `aad` (its Firestore path). */
export function encryptSecret(keyring: Keyring, value: unknown, aad: string): EncryptedSecret {
  const kek = keyring.keys.get(keyring.current);
  if (kek === undefined) throw new Error("current KEK missing");
  const dataKey = randomBytes(32);
  try {
    const body = seal(dataKey, Buffer.from(JSON.stringify(value), "utf8"), aad);
    const wrap = seal(kek, dataKey, `${aad}#dek`);
    return {
      v: 1,
      alg: "A256GCM",
      kid: keyring.current,
      wrappedKey: Buffer.concat([wrap.iv, wrap.ciphertext, wrap.tag]).toString("base64"),
      iv: body.iv.toString("base64"),
      ciphertext: body.ciphertext.toString("base64"),
      tag: body.tag.toString("base64"),
    };
  } finally {
    dataKey.fill(0);
  }
}

/** Decrypts and returns the JSON value; throws when the key is unknown or anything was altered. */
export function decryptSecret(keyring: Keyring, stored: unknown, aad: string): unknown {
  const secret = EncryptedSecretSchema.parse(stored);
  const kek = keyring.keys.get(secret.kid);
  if (kek === undefined) throw new Error(`unknown KEK ${secret.kid}`);
  const wrapped = Buffer.from(secret.wrappedKey, "base64");
  const dataKey = open(
    kek,
    wrapped.subarray(0, 12),
    wrapped.subarray(12, 44),
    wrapped.subarray(44),
    `${aad}#dek`,
  );
  try {
    const plaintext = open(
      dataKey,
      Buffer.from(secret.iv, "base64"),
      Buffer.from(secret.ciphertext, "base64"),
      Buffer.from(secret.tag, "base64"),
      aad,
    );
    return JSON.parse(plaintext.toString("utf8"));
  } finally {
    dataKey.fill(0);
  }
}

/** Whether a stored secret should be re-encrypted under the current KEK (rotation). */
export function needsRewrap(keyring: Keyring, stored: EncryptedSecret): boolean {
  return stored.kid !== keyring.current;
}
