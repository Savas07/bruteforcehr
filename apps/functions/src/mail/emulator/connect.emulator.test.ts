// OAuth connect: startConnect (mailConnectStart) → `/connect/google` → provider → callback, with a
// fake OAuthProvider and fake Express request/response objects; Firestore in the emulator.
import { createHash } from "node:crypto";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import { MailConnectStartRequestSchema } from "@bfhr/core";
import type { Request, Response } from "express";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadBackfillProgress, loadMailSecret } from "../accounts";
import { setOAuthProviderForTests } from "../config";
import { handleConnect, startConnect } from "../connect-oauth";
import type { OAuthProvider } from "../oauth/types";
import { clearFirestore, readAccount, type RecordingSyncEnqueue, recordingSyncEnqueue } from "./helpers";

const UID = "user-connect";
const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REDIRECT_URI = "https://bruteforcehr.test/connect/google/callback";

interface FakeGoogle {
  provider: OAuthProvider;
  exchanged: { code: string; codeVerifier: string; redirectUri: string }[];
  revoked: string[];
}

/** Codes the fake provider understands: `good-*` grants read + send, `no-read` grants neither. */
function fakeGoogle(): FakeGoogle {
  const exchanged: FakeGoogle["exchanged"] = [];
  const revoked: string[] = [];
  const provider: OAuthProvider = {
    id: "google",
    readScope: READ_SCOPE,
    sendScope: SEND_SCOPE,
    scopesFor: (intent) => (intent === "send" ? [READ_SCOPE, SEND_SCOPE] : [READ_SCOPE]),
    authorizeUrl: (params) =>
      `https://accounts.test/o/oauth2/auth?${new URLSearchParams({
        state: params.state,
        code_challenge: params.codeChallenge,
        redirect_uri: params.redirectUri,
        intent: params.intent,
        login_hint: params.loginHint ?? "",
      }).toString()}`,
    async exchangeCode(code, codeVerifier, redirectUri) {
      exchanged.push({ code, codeVerifier, redirectUri });
      return {
        accessToken: `at-${code}`,
        refreshToken: `rt-${code}`,
        expiresAt: new Date(Date.now() + 3_600_000),
        scopes: code === "no-read" ? ["openid", "email"] : ["openid", "email", READ_SCOPE, SEND_SCOPE],
      };
    },
    async refresh() {
      throw new Error("not used");
    },
    async revoke(token) {
      revoked.push(token);
    },
    async profile() {
      return { address: "Deniz.Arslan@Gmail.example", displayName: "Deniz Arslan" };
    },
    callbackError: (error) => (error === "access_denied" ? "cancelled" : "failed"),
  };
  return { provider, exchanged, revoked };
}

class FakeResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  location: string | null = null;
  body: unknown = null;
  set(name: string, value: string) {
    this.headers[name] = value;
    return this;
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  send(body: unknown) {
    this.body = body;
    return this;
  }
  redirect(code: number, location: string) {
    this.statusCode = code;
    this.location = location;
    return this;
  }
}

let google: FakeGoogle;
let enqueue: RecordingSyncEnqueue;

async function get(path: string, query: Record<string, string>): Promise<FakeResponse> {
  const res = new FakeResponse();
  await handleConnect(
    { method: "GET", path, query } as unknown as Request,
    res as unknown as Response,
    enqueue,
  );
  return res;
}

/** The app return URL's query (`bruteforcehr://connected?…`). */
function appReturn(res: FakeResponse): Record<string, string> {
  expect(res.statusCode).toBe(302);
  expect(res.location?.startsWith("bruteforcehr://connected?")).toBe(true);
  return Object.fromEntries(new URL(res.location ?? "").searchParams);
}

/** mailConnectStart + `/connect/google?nonce=…`; returns the nonce and the state sent to the provider. */
async function begin(intent: "read" | "send" = "send"): Promise<{ nonce: string; state: string }> {
  const start = await startConnect(
    UID,
    MailConnectStartRequestSchema.parse({
      provider: "google",
      intent,
      lookbackDays: 30,
      address: "deniz.arslan@gmail.example",
    }),
  );
  expect(start.url).toBe(`https://bruteforcehr.test/connect/google?nonce=${start.nonce}`);
  const res = await get("/connect/google", { nonce: start.nonce });
  expect(res.statusCode).toBe(302);
  expect(res.headers["Cache-Control"]).toBe("no-store");
  const authorize = new URL(res.location ?? "");
  expect(authorize.origin).toBe("https://accounts.test");
  expect(authorize.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
  expect(authorize.searchParams.get("intent")).toBe(intent);
  expect(authorize.searchParams.get("login_hint")).toBe("deniz.arslan@gmail.example");
  const state = authorize.searchParams.get("state") ?? "";
  // PKCE: the challenge is the S256 of the verifier kept server-side.
  const pending = await getFirestore().doc(serverOnlyPaths.mailConnect(start.nonce)).get();
  expect(pending.get("state")).toBe(state);
  const verifier = pending.get("codeVerifier") as string;
  expect(authorize.searchParams.get("code_challenge")).toBe(
    createHash("sha256").update(verifier).digest("base64url"),
  );
  return { nonce: start.nonce, state };
}

const accountDocs = async () =>
  (await getFirestore().collection(firestorePaths.mailAccounts(UID)).get()).docs;

beforeAll(() => {
  google = fakeGoogle();
  setOAuthProviderForTests("google", google.provider);
});
afterAll(() => {
  setOAuthProviderForTests("google", null);
});
beforeEach(async () => {
  await clearFirestore();
  google.exchanged.splice(0);
  google.revoked.splice(0);
  enqueue = recordingSyncEnqueue();
});

describe("OAuth connect", () => {
  it("stores the account and its encrypted tokens, then starts the lookback scan", async () => {
    const { nonce, state } = await begin();
    const verifier = (await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get()).get("codeVerifier");

    const res = await get("/connect/google/callback", { state, code: "good-1" });

    expect(appReturn(res)).toEqual({ nonce, provider: "google", intent: "send", status: "ok" });
    expect(google.exchanged).toEqual([{ code: "good-1", codeVerifier: verifier, redirectUri: REDIRECT_URI }]);
    const [doc, ...others] = await accountDocs();
    expect(others).toEqual([]);
    const accountId = doc?.id ?? "";
    const account = await readAccount(UID, accountId);
    expect(account).toMatchObject({
      provider: "gmail",
      address: "deniz.arslan@gmail.example",
      displayName: "Deniz Arslan",
      status: "connected",
      canSend: true,
      syncCursor: null,
      secretRef: `mail/users/${UID}/mailTokens/${accountId}`,
      backfill: { state: "queued", lookbackDays: 30, scanned: 0 },
    });
    expect(account.scopes).toContain(READ_SCOPE);

    // Tokens are stored only encrypted, and decrypt for this document.
    const token = await getFirestore().doc(serverOnlyPaths.mailToken(UID, accountId)).get();
    expect(JSON.stringify(token.data())).not.toContain("rt-good-1");
    expect(JSON.stringify(token.data())).not.toContain("at-good-1");
    expect(await loadMailSecret(UID, accountId)).toMatchObject({
      kind: "oauth",
      provider: "google",
      refreshToken: "rt-good-1",
      accessToken: "at-good-1",
    });
    expect(await loadBackfillProgress(UID, accountId)).toMatchObject({ lookbackDays: 30, pageToken: null });
    expect(enqueue.calls).toEqual([{ uid: UID, accountId, mode: "backfill" }]);

    // The state and the nonce are single use.
    expect((await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get()).exists).toBe(false);
    expect(appReturn(await get("/connect/google/callback", { state, code: "good-2" }))).toMatchObject({
      status: "error",
      reason: "nonce_invalid",
    });
    expect(appReturn(await get("/connect/google", { nonce }))).toMatchObject({
      status: "error",
      reason: "nonce_invalid",
    });
    expect(google.exchanged).toHaveLength(1);
    expect(enqueue.calls).toHaveLength(1);
  });

  it("reconnecting the same mailbox updates the account without a second scan", async () => {
    const first = await begin();
    await get("/connect/google/callback", { state: first.state, code: "good-1" });
    const [doc] = await accountDocs();
    const accountId = doc?.id ?? "";
    await doc?.ref.update({ status: "needs_reauth" });

    const second = await begin("read");
    expect(
      appReturn(await get("/connect/google/callback", { state: second.state, code: "good-2" })),
    ).toMatchObject({
      status: "ok",
      intent: "read",
    });

    expect((await accountDocs()).map((item) => item.id)).toEqual([accountId]);
    expect((await readAccount(UID, accountId)).status).toBe("connected");
    expect(await loadMailSecret(UID, accountId)).toMatchObject({ refreshToken: "rt-good-2" });
    expect(enqueue.calls).toHaveLength(1);
  });

  it("refuses a grant without the read scope and revokes it", async () => {
    const { nonce, state } = await begin();

    const res = await get("/connect/google/callback", { state, code: "no-read" });

    expect(appReturn(res)).toEqual({
      nonce,
      provider: "google",
      intent: "send",
      status: "error",
      reason: "scope_missing",
    });
    expect(google.revoked).toEqual(["rt-no-read"]);
    expect(await accountDocs()).toEqual([]);
    const tokens = await getFirestore()
      .collection(`${serverOnlyPaths.mailRoot(UID)}/mailTokens`)
      .get();
    expect(tokens.empty).toBe(true);
    expect(enqueue.calls).toEqual([]);
  });

  it("maps a provider error on the callback", async () => {
    const { state } = await begin();
    expect(appReturn(await get("/connect/google/callback", { state, error: "access_denied" }))).toMatchObject(
      {
        status: "error",
        reason: "cancelled",
      },
    );
    expect(google.exchanged).toEqual([]);
  });

  it("answers nonce_invalid for unknown, expired, reused or mismatched nonces", async () => {
    const invalid = { status: "error", reason: "nonce_invalid" };
    expect(appReturn(await get("/connect/google", { nonce: "n".repeat(32) }))).toMatchObject(invalid);
    expect(appReturn(await get("/connect/google", { nonce: "../../etc" }))).toMatchObject(invalid);
    expect(
      appReturn(await get("/connect/google/callback", { state: "short", code: "good-1" })),
    ).toMatchObject(invalid);
    expect(
      appReturn(await get("/connect/google/callback", { state: "s".repeat(32), code: "good-1" })),
    ).toMatchObject(invalid);

    // Started for Google, opened on the Microsoft path.
    const start = await startConnect(UID, MailConnectStartRequestSchema.parse({ provider: "google" }));
    expect(appReturn(await get("/connect/microsoft", { nonce: start.nonce }))).toMatchObject(invalid);

    // Expired.
    await getFirestore()
      .doc(serverOnlyPaths.mailConnect(start.nonce))
      .update({ expireAt: Timestamp.fromMillis(Date.now() - 1_000) });
    expect(appReturn(await get("/connect/google", { nonce: start.nonce }))).toMatchObject(invalid);

    // Begun once already: a second begin with the same nonce is refused.
    const { nonce } = await begin();
    expect(appReturn(await get("/connect/google", { nonce }))).toMatchObject(invalid);

    expect(google.exchanged).toEqual([]);
    expect(await accountDocs()).toEqual([]);
  });

  it("rejects other methods and paths", async () => {
    const post = new FakeResponse();
    await handleConnect(
      { method: "POST", path: "/connect/google", query: {} } as unknown as Request,
      post as unknown as Response,
      enqueue,
    );
    expect(post.statusCode).toBe(405);
    expect((await get("/connect/yahoo", {})).statusCode).toBe(404);
  });
});
