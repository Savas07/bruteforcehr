// OAuth connect for Gmail and Microsoft (ADR 0006 redirect URIs, docs/adr/0012-mail-sync.md):
// `mailConnectStart` (callable) issues a short-lived nonce bound to the caller; the browser opens
// `/connect/{provider}?nonce=…`, which runs authorization code + PKCE. The callback keeps the
// grant encrypted in the pending document (10 minutes) and returns to the app with
// `bruteforcehr://connected?…&handoff=…`; `mailConnectFinish` then saves the account, but only for
// the signed-in user who started the connect (anyone can open a `/connect` link in a browser).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  MAIL_CONNECT_NONCE_PATTERN,
  type MailAccount,
  MailConnectFinishRequestSchema,
  type MailConnectFinishRequest,
  type MailConnectFinishResponse,
  MailConnectFinishResponseSchema,
  MailConnectIntentSchema,
  MailConnectStartRequestSchema,
  type MailConnectStartResponse,
  MailConnectStartResponseSchema,
  MailLookbackDaysSchema,
  type MailOAuthReturnReason,
  OAuthMailProviderSchema,
} from "@bfhr/core";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import type { Request, Response } from "express";
import { z } from "zod";
import { verifiedUid } from "../callable";
import { adminConverters as converters } from "../converters";
import { loadMailSecret, oauthSecretFrom, saveMailSecret, secretRefOf } from "./accounts";
import { MAIL_SECRETS, mailKeyring, oauthProvider, PUBLIC_BASE_URL, redirectUri } from "./config";
import { decryptSecret, EncryptedSecretSchema, encryptSecret } from "./crypto";
import { MailCallableError } from "./errors";
import type { OAuthTokens } from "./oauth/types";
import { startBackfill, type SyncEnqueue, enqueueSync } from "./sync";

/** The nonce (and the provider round trip) must finish within this time. */
const NONCE_TTL_MS = 15 * 60_000;
/** A granted connect waits this long for `mailConnectFinish`; the TTL policy then deletes it. */
const FINISH_TTL_MS = 10 * 60_000;
const APP_RETURN = "bruteforcehr://connected";

/** The provider's answer, held (encrypted) in the pending document until `mailConnectFinish`. */
const GrantSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  /** Epoch ms. */
  expiresAt: z.number(),
  scopes: z.array(z.string()),
  address: z.string(),
  displayName: z.string().nullable(),
});
type Grant = z.infer<typeof GrantSchema>;

/**
 * `serverOnly/mailConnect/mailConnectNonces/{nonce}`: `started` (mailConnectStart) →
 * `authorizing` (`/connect/{provider}` sent the browser to the provider) → `exchanging` (callback
 * took the state) → `ready` (grant held for `mailConnectFinish`).
 */
const PendingSchema = z.object({
  uid: z.string(),
  provider: OAuthMailProviderSchema,
  intent: MailConnectIntentSchema,
  lookbackDays: MailLookbackDaysSchema,
  loginHint: z.string().nullable(),
  stage: z.enum(["started", "authorizing", "exchanging", "ready"]).default("started"),
  state: z.string().nullable(),
  codeVerifier: z.string().nullable(),
  handoffHash: z.string().nullable().default(null),
  grant: EncryptedSecretSchema.nullable().default(null),
  expireAt: z.instanceof(Timestamp),
});

const base64url = (bytes: Buffer) => bytes.toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

export const mailConnectStart = onCall(
  { secrets: MAIL_SECRETS },
  async (request): Promise<MailConnectStartResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailConnectStartRequestSchema.safeParse(request.data);
    if (!parsed.success)
      throw new HttpsError("invalid-argument", "Expected { provider, intent?, lookbackDays?, address? }.");
    return startConnect(uid, parsed.data);
  },
);

/** Issues the nonce that `/connect/{provider}?nonce=…` redeems. */
export async function startConnect(
  uid: string,
  input: z.output<typeof MailConnectStartRequestSchema>,
): Promise<MailConnectStartResponse> {
  const { provider, intent, lookbackDays, address } = input;
  if (oauthProvider(provider) === null) {
    throw new MailCallableError(
      "failed-precondition",
      "provider_not_configured",
      "Connecting this provider isn't available yet.",
    );
  }
  const nonce = base64url(randomBytes(24));
  const expireAt = Timestamp.fromMillis(Date.now() + NONCE_TTL_MS);
  await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).create({
    uid,
    provider,
    intent,
    lookbackDays,
    loginHint: address,
    stage: "started",
    state: null,
    codeVerifier: null,
    handoffHash: null,
    grant: null,
    expireAt,
  });
  return MailConnectStartResponseSchema.parse({
    url: `${PUBLIC_BASE_URL.value().replace(/\/$/u, "")}/connect/${provider}?nonce=${nonce}`,
    nonce,
    expiresAt: expireAt.toDate().toISOString(),
  });
}

function appReturn(
  params: { nonce: string; provider: string; intent: string } & (
    { status: "ok"; handoff: string } | { status: "error"; reason: MailOAuthReturnReason }
  ),
): string {
  const query = new URLSearchParams({
    nonce: params.nonce,
    provider: params.provider,
    intent: params.intent,
    status: params.status,
  });
  if (params.status === "ok") query.set("handoff", params.handoff);
  else query.set("reason", params.reason);
  return `${APP_RETURN}?${query.toString()}`;
}

function redirect(res: Response, location: string): void {
  res.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").redirect(302, location);
}

/** `/connect/google`, `/connect/google/callback`, … (also without the `/connect` prefix when called directly). */
export const connect = onRequest(
  { secrets: MAIL_SECRETS, timeoutSeconds: 60 },
  (req: Request, res: Response) => handleConnect(req, res),
);

/** Body of `connect`. */
export async function handleConnect(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET") {
    res.set("Allow", "GET").status(405).send("Method not allowed");
    return;
  }
  const match = /^(?:\/connect)?\/(google|microsoft)(\/callback)?\/?$/u.exec(req.path);
  if (match === null || match[1] === undefined) {
    res.status(404).send("Not found");
    return;
  }
  const provider = match[1] as "google" | "microsoft";
  try {
    if (match[2] === undefined) await begin(provider, req, res);
    else await callback(provider, req, res);
  } catch (error) {
    logger.error("mail_oauth_failed", {
      provider,
      name: error instanceof Error ? error.name : typeof error,
    });
    res.status(500).send("We couldn't finish connecting. Nothing was saved. Close this page and try again.");
  }
}

async function begin(provider: "google" | "microsoft", req: Request, res: Response): Promise<void> {
  const nonce = typeof req.query["nonce"] === "string" ? req.query["nonce"] : "";
  const oauth = oauthProvider(provider);
  const db = getFirestore();
  const ref = MAIL_CONNECT_NONCE_PATTERN.test(nonce) ? db.doc(serverOnlyPaths.mailConnect(nonce)) : null;
  const snapshot = ref === null ? null : await ref.get();
  const pending = snapshot?.exists ? PendingSchema.safeParse(snapshot.data()) : null;
  if (
    snapshot === null ||
    pending?.success !== true ||
    pending.data.provider !== provider ||
    pending.data.expireAt.toMillis() < Date.now() ||
    pending.data.stage !== "started" ||
    pending.data.state !== null
  ) {
    redirect(res, appReturn({ nonce, provider, intent: "read", status: "error", reason: "nonce_invalid" }));
    return;
  }
  if (oauth === null) {
    redirect(
      res,
      appReturn({
        nonce,
        provider,
        intent: pending.data.intent,
        status: "error",
        reason: "provider_not_configured",
      }),
    );
    return;
  }
  const state = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(48));
  // Fails if a concurrent request began this nonce first (the nonce is single use).
  await ref?.update(
    { stage: "authorizing", state, codeVerifier },
    snapshot.updateTime === undefined ? {} : { lastUpdateTime: snapshot.updateTime },
  );
  redirect(
    res,
    oauth.authorizeUrl({
      state,
      codeChallenge: base64url(createHash("sha256").update(codeVerifier).digest()),
      redirectUri: redirectUri(provider),
      intent: pending.data.intent,
      loginHint: pending.data.loginHint,
    }),
  );
}

async function callback(provider: "google" | "microsoft", req: Request, res: Response): Promise<void> {
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const db = getFirestore();
  // The state is single use: the transaction that reads the pending document clears it.
  const pending =
    state.length < 16
      ? null
      : await db.runTransaction(async (tx) => {
          const found = await tx.get(
            db.collection("serverOnly/mailConnect/mailConnectNonces").where("state", "==", state).limit(1),
          );
          const doc = found.docs[0];
          if (doc === undefined) return null;
          const parsed = PendingSchema.safeParse(doc.data());
          if (!parsed.success || parsed.data.stage !== "authorizing") {
            tx.delete(doc.ref);
            return null;
          }
          tx.update(doc.ref, { state: null, codeVerifier: null, stage: "exchanging" });
          return { nonce: doc.id, ref: doc.ref, ...parsed.data };
        });
  if (
    pending === null ||
    pending.provider !== provider ||
    pending.expireAt.toMillis() < Date.now() ||
    pending.codeVerifier === null
  ) {
    if (pending !== null) await pending.ref.delete();
    redirect(
      res,
      appReturn({ nonce: "", provider, intent: "read", status: "error", reason: "nonce_invalid" }),
    );
    return;
  }
  const back = (
    result: { status: "ok"; handoff: string } | { status: "error"; reason: MailOAuthReturnReason },
  ) => redirect(res, appReturn({ nonce: pending.nonce, provider, intent: pending.intent, ...result }));
  const fail = async (reason: MailOAuthReturnReason) => {
    await pending.ref.delete();
    back({ status: "error", reason });
  };
  const oauth = oauthProvider(provider);
  if (oauth === null) return fail("provider_not_configured");

  const error = typeof req.query["error"] === "string" ? req.query["error"] : null;
  if (error !== null) {
    const description =
      typeof req.query["error_description"] === "string" ? req.query["error_description"] : null;
    return fail(oauth.callbackError(error, description));
  }
  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  if (code === null) return fail("failed");

  const tokens = await oauth.exchangeCode(code, pending.codeVerifier, redirectUri(provider));
  if (!tokens.scopes.includes(oauth.readScope)) {
    await oauth.revoke(tokens.refreshToken ?? tokens.accessToken).catch(() => undefined);
    return fail("scope_missing");
  }
  const profile = await oauth.profile(tokens.accessToken);
  // Nothing is saved for any user yet: the grant waits, encrypted for this document, until the
  // app of the user who started the connect redeems it with `mailConnectFinish`.
  const handoff = base64url(randomBytes(32));
  const grant: Grant = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt.getTime(),
    scopes: tokens.scopes,
    address: profile.address.toLowerCase(),
    displayName: profile.displayName,
  };
  await pending.ref.update({
    stage: "ready",
    handoffHash: sha256(handoff),
    grant: encryptSecret(mailKeyring(), grant, pending.ref.path),
    expireAt: Timestamp.fromMillis(Date.now() + FINISH_TTL_MS),
  });
  logger.info("mail_connect_granted", { provider, intent: pending.intent });
  back({ status: "ok", handoff });
}

export const mailConnectFinish = onCall(
  { secrets: MAIL_SECRETS },
  async (request): Promise<MailConnectFinishResponse> => {
    const uid = verifiedUid(request);
    const parsed = MailConnectFinishRequestSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { nonce, handoff }.");
    return finishConnect(uid, parsed.data);
  },
);

const expired = () =>
  new MailCallableError(
    "failed-precondition",
    "connect_expired",
    "This sign-in expired or was already used. Start connecting again.",
  );

/**
 * Redeems a granted connect for the caller: only the user who started it gets the account; any
 * other caller makes the server revoke the grant. Either way the pending document is gone after.
 */
export async function finishConnect(
  uid: string,
  input: MailConnectFinishRequest,
  enqueue: SyncEnqueue = enqueueSync,
): Promise<MailConnectFinishResponse> {
  const db = getFirestore();
  const ref = db.doc(serverOnlyPaths.mailConnect(input.nonce));
  const pending = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const parsed = PendingSchema.safeParse(snapshot.data());
    if (!parsed.success || parsed.data.stage !== "ready" || parsed.data.handoffHash === null) return null;
    // The handoff only reached the browser that finished the provider's consent.
    if (!timingSafeEqual(Buffer.from(parsed.data.handoffHash), Buffer.from(sha256(input.handoff))))
      return null;
    tx.delete(ref);
    return parsed.data;
  });
  if (pending === null || pending.grant === null) throw expired();
  const grant = GrantSchema.parse(decryptSecret(mailKeyring(), pending.grant, ref.path));
  const oauth = oauthProvider(pending.provider);
  if (pending.uid !== uid) {
    await oauth?.revoke(grant.refreshToken ?? grant.accessToken).catch(() => undefined);
    logger.warn("mail_connect_wrong_user", { provider: pending.provider });
    throw new MailCallableError(
      "permission-denied",
      "connect_wrong_user",
      "This sign-in was started from another BruteForceHR account, so nothing was connected.",
    );
  }
  if (pending.expireAt.toMillis() < Date.now()) {
    await oauth?.revoke(grant.refreshToken ?? grant.accessToken).catch(() => undefined);
    throw expired();
  }
  if (oauth === null) {
    throw new MailCallableError(
      "failed-precondition",
      "provider_not_configured",
      "Connecting this provider isn't available yet.",
    );
  }
  const provider = pending.provider;
  const tokens: OAuthTokens = {
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt: new Date(grant.expiresAt),
    scopes: grant.scopes,
  };
  const address = grant.address;
  const kind: MailAccount["provider"] = provider === "google" ? "gmail" : "microsoft";
  const accounts = db.collection(firestorePaths.mailAccounts(uid));
  const same = await accounts.where("address", "==", address).where("provider", "==", kind).limit(1).get();
  const existing = same.docs[0];
  const accountId = existing?.id ?? accounts.doc().id;
  const previous = existing === undefined ? null : await loadMailSecret(uid, accountId).catch(() => null);
  const secret = oauthSecretFrom(provider, tokens, previous?.kind === "oauth" ? previous : null);
  await saveMailSecret(uid, accountId, secret);

  const now = new Date();
  const canSend = secret.scopes.includes(oauth.sendScope);
  if (existing === undefined) {
    const account: MailAccount = {
      id: accountId,
      provider: kind,
      address,
      displayName: grant.displayName,
      status: "connected",
      syncCursor: null,
      secretRef: secretRefOf(uid, accountId),
      scopes: secret.scopes.slice(0, 30),
      canSend,
      lastSyncedAt: null,
      lastError: null,
      server: null,
      backfill: null,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await accounts.doc(accountId).set(converters.mailAccount.toFirestore(account));
    await startBackfill(uid, accountId, pending.lookbackDays, enqueue);
  } else {
    await accounts.doc(accountId).update(
      converters.mailAccount.toFirestoreUpdate({
        status: "connected",
        scopes: secret.scopes.slice(0, 30),
        canSend,
        lastError: null,
        displayName: grant.displayName,
        connectedAt: now,
        updatedAt: now,
      }),
    );
    if (existing.get("backfill") == null) await startBackfill(uid, accountId, pending.lookbackDays, enqueue);
  }
  logger.info("mail_connected", {
    provider: kind,
    intent: pending.intent,
    canSend,
    reconnect: existing !== undefined,
  });
  return MailConnectFinishResponseSchema.parse({
    accountId,
    provider: kind,
    address,
    displayName: grant.displayName,
    canSend,
    reconnect: existing !== undefined,
  });
}
