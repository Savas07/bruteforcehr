// Mail account credentials (encrypted under serverOnly) and the adapter for an account.
import { serverOnlyPaths } from "@bfhr/api";
import { type MailAccount, MailEndpointSchema } from "@bfhr/core";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { mailKeyring, oauthProvider } from "./config";
import { decryptSecret, encryptSecret, needsRewrap, EncryptedSecretSchema } from "./crypto";
import type { OAuthTokens } from "./oauth/types";
import { GmailAdapter } from "./providers/gmail";
import { GraphAdapter } from "./providers/graph";
import { ImapAdapter, type ImapTestOptions } from "./providers/imap";
import { type AccessTokenSource, MailAuthError, type MailProviderAdapter } from "./providers/types";

export const ImapSecretSchema = z.object({
  kind: z.literal("imap"),
  username: z.string(),
  password: z.string(),
  imap: MailEndpointSchema,
  smtp: MailEndpointSchema.nullable(),
  smtpSavesSent: z.boolean(),
  smtpUsername: z.string().nullable().default(null),
});
export const OAuthSecretSchema = z.object({
  kind: z.literal("oauth"),
  provider: z.enum(["google", "microsoft"]),
  refreshToken: z.string(),
  accessToken: z.string().nullable(),
  /** Epoch ms. */
  expiresAt: z.number(),
  scopes: z.array(z.string()),
});
export const MailSecretSchema = z.discriminatedUnion("kind", [ImapSecretSchema, OAuthSecretSchema]);
export type MailSecret = z.infer<typeof MailSecretSchema>;
export type OAuthSecret = z.infer<typeof OAuthSecretSchema>;

/** `mailAccounts.secretRef`: the token document path below `serverOnly/`. */
export function secretRefOf(uid: string, accountId: string): string {
  return serverOnlyPaths.mailToken(uid, accountId).slice("serverOnly/".length);
}

function tokenDoc(uid: string, accountId: string) {
  return getFirestore().doc(serverOnlyPaths.mailToken(uid, accountId));
}

/** Stores the account's credentials, encrypted for exactly this document path. */
export async function saveMailSecret(uid: string, accountId: string, secret: MailSecret): Promise<void> {
  const ref = tokenDoc(uid, accountId);
  await ref.set(
    {
      accountId,
      secret: encryptSecret(mailKeyring(), MailSecretSchema.parse(secret), ref.path),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadMailSecret(uid: string, accountId: string): Promise<MailSecret> {
  const ref = tokenDoc(uid, accountId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new MailAuthError("no stored credentials");
  const stored = EncryptedSecretSchema.parse(snapshot.get("secret"));
  const secret = MailSecretSchema.parse(decryptSecret(mailKeyring(), stored, ref.path));
  // Key rotation: re-encrypt under the current KEK on the next read.
  if (needsRewrap(mailKeyring(), stored)) await saveMailSecret(uid, accountId, secret);
  return secret;
}

export function oauthSecretFrom(
  provider: "google" | "microsoft",
  tokens: OAuthTokens,
  previous: OAuthSecret | null,
): OAuthSecret {
  const refreshToken = tokens.refreshToken ?? previous?.refreshToken;
  if (refreshToken === undefined) throw new MailAuthError("the provider returned no refresh token");
  return {
    kind: "oauth",
    provider,
    refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt.getTime(),
    scopes: tokens.scopes.length > 0 ? tokens.scopes : (previous?.scopes ?? []),
  };
}

/** Access tokens for an OAuth account: cached in the secret, refreshed and persisted when stale. */
export function oauthTokenSource(uid: string, accountId: string, initial: OAuthSecret): AccessTokenSource {
  let secret = initial;
  return {
    async get() {
      if (secret.accessToken !== null && secret.expiresAt - Date.now() > 60_000) return secret.accessToken;
      const provider = oauthProvider(secret.provider);
      if (provider === null) throw new MailAuthError(`${secret.provider} OAuth client is not configured`);
      const refreshed = await provider.refresh(secret.refreshToken);
      secret = oauthSecretFrom(secret.provider, refreshed, secret);
      await saveMailSecret(uid, accountId, secret);
      if (secret.accessToken === null) throw new MailAuthError("refresh returned no access token");
      return secret.accessToken;
    },
    invalidate() {
      secret = { ...secret, accessToken: null, expiresAt: 0 };
    },
  };
}

/** Test seam for in-process IMAP/SMTP servers (never set in production code paths). */
let imapTestOptions: ImapTestOptions = {};
export function setImapTestOptions(options: ImapTestOptions): void {
  imapTestOptions = options;
}

/** Opens the provider adapter for an account (caller closes it). */
export async function openAdapter(
  uid: string,
  account: Pick<MailAccount, "id" | "address">,
): Promise<MailProviderAdapter> {
  const secret = await loadMailSecret(uid, account.id);
  if (secret.kind === "imap") {
    return new ImapAdapter(
      {
        username: secret.username,
        password: secret.password,
        imap: secret.imap,
        smtp: secret.smtp,
        smtpSavesSent: secret.smtpSavesSent,
        smtpUsername: secret.smtpUsername,
      },
      account.address,
      imapTestOptions,
    );
  }
  const tokens = oauthTokenSource(uid, account.id, secret);
  return secret.provider === "google" ? new GmailAdapter({ tokens }) : new GraphAdapter({ tokens });
}

/** Lease so that only one sync runs per account (poll, manual refresh and backfill can overlap). */
export async function acquireSyncLease(uid: string, accountId: string, seconds: number): Promise<boolean> {
  const ref = tokenDoc(uid, accountId);
  return getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return false;
    const until = snapshot.get("leaseUntil") as Timestamp | undefined;
    if (until !== undefined && until.toMillis() > Date.now()) return false;
    tx.update(ref, { leaseUntil: Timestamp.fromMillis(Date.now() + seconds * 1000) });
    return true;
  });
}

export async function releaseSyncLease(uid: string, accountId: string): Promise<void> {
  await tokenDoc(uid, accountId)
    .update({ leaseUntil: FieldValue.delete() })
    .catch(() => undefined);
}

/** Backfill continuation state kept server-side (page token of the provider listing). */
export const BackfillProgressSchema = z.object({
  pageToken: z.string().nullable(),
  since: z.number(),
  lookbackDays: z.number(),
  /** `application key` → counted once (distinct applications in the result). */
  applicationKeys: z.array(z.string()),
});
export type BackfillProgress = z.infer<typeof BackfillProgressSchema>;

export async function loadBackfillProgress(uid: string, accountId: string): Promise<BackfillProgress | null> {
  const snapshot = await tokenDoc(uid, accountId).get();
  const parsed = BackfillProgressSchema.safeParse(snapshot.get("backfill"));
  return parsed.success ? parsed.data : null;
}

export async function saveBackfillProgress(
  uid: string,
  accountId: string,
  progress: BackfillProgress | null,
): Promise<void> {
  await tokenDoc(uid, accountId).update({ backfill: progress === null ? FieldValue.delete() : progress });
}
