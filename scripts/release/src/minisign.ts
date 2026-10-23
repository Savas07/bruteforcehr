import { createHash, createPublicKey, verify } from "node:crypto";

/**
 * Verifies Tauri updater signatures before they are published.
 *
 * Tauri's updater keys and `.sig` files are minisign (Ed25519) documents, base64-encoded once more
 * (https://v2.tauri.app/plugin/updater/). Format (https://jedisct1.github.io/minisign/):
 * - public key: `untrusted comment: …\n` + base64(`Ed` ‖ keyId[8] ‖ publicKey[32])
 * - signature: `untrusted comment: …\n` + base64(alg[2] ‖ keyId[8] ‖ sig[64]) + `\ntrusted comment: <text>\n`
 *   + base64(globalSig[64]), where alg `ED` signs BLAKE2b-512(file) and `Ed` signs the file itself,
 *   and globalSig signs sig ‖ <text>.
 * The updater accepts an update only if this check passes against the public key embedded in the
 * app, so running the same check in CI catches a wrong key or a mismatched file before release.
 */

export interface PublicKey {
  readonly keyId: Buffer;
  readonly key: Buffer;
}

function decodeTauriBase64(value: string, what: string): string[] {
  const text = Buffer.from(value.trim(), "base64").toString("utf8");
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (!lines[0]?.startsWith("untrusted comment:")) {
    throw new Error(`${what} is not a base64-encoded minisign document`);
  }
  return lines;
}

/** Parses a Tauri updater public key (`plugins.updater.pubkey`). */
export function parsePublicKey(pubkey: string): PublicKey {
  const lines = decodeTauriBase64(pubkey, "Public key");
  const raw = Buffer.from(lines[1] ?? "", "base64");
  if (raw.length !== 42 || raw.subarray(0, 2).toString("latin1") !== "Ed") {
    throw new Error("Public key is not an Ed25519 minisign key");
  }
  return { keyId: raw.subarray(2, 10), key: raw.subarray(10) };
}

/** Hex key id as minisign prints it (little-endian, upper case). */
export function keyIdHex(keyId: Buffer): string {
  return Buffer.from(keyId).reverse().toString("hex").toUpperCase();
}

function ed25519(key: Buffer, message: Buffer, signature: Buffer): boolean {
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: key.toString("base64url") },
    format: "jwk",
  });
  return verify(null, message, publicKey, signature);
}

/**
 * Verifies `signature` (the `.sig` file content) for `file` against `pubkey`.
 * Returns the trusted comment; throws with a specific reason otherwise.
 */
export function verifySignature(pubkey: string, file: Buffer, signature: string): string {
  const key = parsePublicKey(pubkey);
  const lines = decodeTauriBase64(signature, "Signature");
  const sig = Buffer.from(lines[1] ?? "", "base64");
  const trustedLine = lines[2] ?? "";
  const globalSig = Buffer.from(lines[3] ?? "", "base64");
  if (sig.length !== 74 || !trustedLine.startsWith("trusted comment: ") || globalSig.length !== 64) {
    throw new Error("Signature is not a minisign signature");
  }
  const algorithm = sig.subarray(0, 2).toString("latin1");
  const keyId = sig.subarray(2, 10);
  if (!keyId.equals(key.keyId)) {
    throw new Error(`Signed with key ${keyIdHex(keyId)}, expected ${keyIdHex(key.keyId)}`);
  }
  let message: Buffer;
  if (algorithm === "ED") {
    message = createHash("blake2b512").update(file).digest();
  } else if (algorithm === "Ed") {
    message = file;
  } else {
    throw new Error(`Unknown signature algorithm "${algorithm}"`);
  }
  if (!ed25519(key.key, message, sig.subarray(10))) {
    throw new Error("Signature does not match the file");
  }
  const trustedComment = trustedLine.slice("trusted comment: ".length);
  if (!ed25519(key.key, Buffer.concat([sig.subarray(10), Buffer.from(trustedComment, "utf8")]), globalSig)) {
    throw new Error("Trusted comment signature is invalid");
  }
  return trustedComment;
}
