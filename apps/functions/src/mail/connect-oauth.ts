// OAuth connect for Gmail and Microsoft (ADR 0006 redirect URIs, docs/adr/0012-mail-sync.md):
// `mailConnectStart` (callable) issues a short-lived nonce bound to the caller; the browser opens
// `/connect/{provider}?nonce=…`, which runs authorization code + PKCE; the callback stores the
// tokens encrypted and returns to the app with `bruteforcehr://connected?…`.
import { createHash, randomBytes } from "node:crypto";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  type MailAccount,
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
import { converters } from "../converters";
import { loadMailSecret, oauthSecretFrom, saveMailSecret, secretRefOf } from "./accounts";
import { MAIL_SECRETS, oauthProvider, PUBLIC_BASE_URL, redirectUri } from "./config";
import { MailCallableError } from "./errors";
import { startBackfill, type SyncEnqueue, enqueueSync } from "./sync";

/** The nonce (and the provider round trip) must finish within this time. */
const NONCE_TTL_MS = 15 * 60_000;
const APP_RETURN = "bruteforcehr://connected";

const PendingSchema = z.object({
  uid: z.string(),
  provider: OAuthMailProviderSchema,
  intent: MailConnectIntentSchema,
  lookbackDays: MailLookbackDaysSchema,
  loginHint: z.string().nullable(),
  state: z.string().nullable(),
  codeVerifier: z.string().nullable(),
  expireAt: z.instanceof(Timestamp),
});

const base64url = (bytes: Buffer) => bytes.toString("base64url");

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
    state: null,
    codeVerifier: null,
    expireAt,
  });
  return MailConnectStartResponseSchema.parse({
    url: `${PUBLIC_BASE_URL.value().replace(/\/$/u, "")}/connect/${provider}?nonce=${nonce}`,
    nonce,
    expiresAt: expireAt.toDate().toISOString(),
  });
}

function appReturn(params: {
  nonce: string;
  provider: string;
  intent: string;
  status: "ok" | "error";
  reason?: MailOAuthReturnReason;
}): string {
  const query = new URLSearchParams({
    nonce: params.nonce,
    provider: params.provider,
    intent: params.intent,
    status: params.status,
  });
  if (params.reason !== undefined) query.set("reason", params.reason);
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

/** Body of `connect`; `enqueue` starts the lookback scan of a new account. */
export async function handleConnect(
  req: Request,
  res: Response,
  enqueue: SyncEnqueue = enqueueSync,
): Promise<void> {
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
    else await callback(provider, req, res, enqueue);
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
  const ref =
    nonce.length >= 16 && nonce.length <= 100 && /^[\w-]+$/u.test(nonce)
      ? db.doc(serverOnlyPaths.mailConnect(nonce))
      : null;
  const snapshot = ref === null ? null : await ref.get();
  const pending = snapshot?.exists ? PendingSchema.safeParse(snapshot.data()) : null;
  if (
    pending?.success !== true ||
    pending.data.provider !== provider ||
    pending.data.expireAt.toMillis() < Date.now() ||
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
  await ref?.update({ state, codeVerifier });
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

async function callback(
  provider: "google" | "microsoft",
  req: Request,
  res: Response,
  enqueue: SyncEnqueue,
): Promise<void> {
  const state = typeof req.query["state"] === "string" ? req.query["state"] : "";
  const db = getFirestore();
  // The state is single use: the pending document is deleted in the same transaction that reads it.
  const pending =
    state.length < 16
      ? null
      : await db.runTransaction(async (tx) => {
          const found = await tx.get(
            db.collection("serverOnly/mailConnect/mailConnectNonces").where("state", "==", state).limit(1),
          );
          const doc = found.docs[0];
          if (doc === undefined) return null;
          tx.delete(doc.ref);
          const parsed = PendingSchema.safeParse(doc.data());
          return parsed.success ? { nonce: doc.id, ...parsed.data } : null;
        });
  if (
    pending === null ||
    pending.provider !== provider ||
    pending.expireAt.toMillis() < Date.now() ||
    pending.codeVerifier === null
  ) {
    redirect(
      res,
      appReturn({ nonce: "", provider, intent: "read", status: "error", reason: "nonce_invalid" }),
    );
    return;
  }
  const back = (status: "ok" | "error", reason?: MailOAuthReturnReason) =>
    redirect(
      res,
      appReturn({
        nonce: pending.nonce,
        provider,
        intent: pending.intent,
        status,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  const oauth = oauthProvider(provider);
  if (oauth === null) return back("error", "provider_not_configured");

  const error = typeof req.query["error"] === "string" ? req.query["error"] : null;
  if (error !== null) {
    const description =
      typeof req.query["error_description"] === "string" ? req.query["error_description"] : null;
    return back("error", oauth.callbackError(error, description));
  }
  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  if (code === null) return back("error", "failed");

  const tokens = await oauth.exchangeCode(code, pending.codeVerifier, redirectUri(provider));
  if (!tokens.scopes.includes(oauth.readScope)) {
    await oauth.revoke(tokens.refreshToken ?? tokens.accessToken).catch(() => undefined);
    return back("error", "scope_missing");
  }
  const profile = await oauth.profile(tokens.accessToken);
  const address = profile.address.toLowerCase();
  const kind: MailAccount["provider"] = provider === "google" ? "gmail" : "microsoft";
  const accounts = db.collection(firestorePaths.mailAccounts(pending.uid));
  const same = await accounts.where("address", "==", address).where("provider", "==", kind).limit(1).get();
  const existing = same.docs[0];
  const accountId = existing?.id ?? accounts.doc().id;
  const previous =
    existing === undefined ? null : await loadMailSecret(pending.uid, accountId).catch(() => null);
  const secret = oauthSecretFrom(provider, tokens, previous?.kind === "oauth" ? previous : null);
  await saveMailSecret(pending.uid, accountId, secret);

  const now = new Date();
  const canSend = secret.scopes.includes(oauth.sendScope);
  if (existing === undefined) {
    const account: MailAccount = {
      id: accountId,
      provider: kind,
      address,
      displayName: profile.displayName,
      status: "connected",
      syncCursor: null,
      secretRef: secretRefOf(pending.uid, accountId),
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
    await startBackfill(pending.uid, accountId, pending.lookbackDays, enqueue);
  } else {
    await accounts.doc(accountId).update(
      converters.mailAccount.toFirestoreUpdate({
        status: "connected",
        scopes: secret.scopes.slice(0, 30),
        canSend,
        lastError: null,
        displayName: profile.displayName,
        connectedAt: now,
        updatedAt: now,
      }),
    );
    if (existing.get("backfill") == null)
      await startBackfill(pending.uid, accountId, pending.lookbackDays, enqueue);
  }
  logger.info("mail_connected", {
    provider: kind,
    intent: pending.intent,
    canSend,
    reconnect: existing !== undefined,
  });
  back("ok");
}
