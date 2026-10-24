// OAuth connect: startConnect (mailConnectStart) → `/connect/google` → provider → callback →
// finishConnect (mailConnectFinish), with a fake OAuthProvider and fake Express request/response
// objects; Firestore in the emulator.
import { createHash } from "node:crypto";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import { MailConnectStartRequestSchema } from "@bfhr/core";
import type { Request, Response } from "express";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadBackfillProgress, loadMailSecret } from "../accounts";
import { setOAuthProviderForTests } from "../config";
import { finishConnect, handleConnect, startConnect } from "../connect-oauth";
import type { OAuthProvider } from "../oauth/types";
import { clearFirestore, readAccount, type RecordingSyncEnqueue, recordingSyncEnqueue } from "./helpers";

const UID = "user-connect";
const OTHER_UID = "user-other";
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
  await handleConnect({ method: "GET", path, query } as unknown as Request, res as unknown as Response);
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

/** Callback with a granted code; returns the handoff from the app return link. */
async function grant(state: string, code: string): Promise<string> {
  const query = appReturn(await get("/connect/google/callback", { state, code }));
  expect(query["status"]).toBe("ok");
  expect(query["handoff"]).toMatch(/^[\w-]{43}$/u);
  return query["handoff"] ?? "";
}

/** The `details.reason` of a `MailCallableError` thrown by `run`. */
async function reasonOf(run: Promise<unknown>): Promise<unknown> {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).not.toBeNull();
  return (error as { details?: { reason?: unknown } }).details?.reason;
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
  it("holds the grant encrypted until the starting user finishes, then stores the account and scans", async () => {
    const { nonce, state } = await begin();
    const verifier = (await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get()).get("codeVerifier");

    const res = await get("/connect/google/callback", { state, code: "good-1" });

    const query = appReturn(res);
    const handoff = query["handoff"] ?? "";
    expect(query).toEqual({ nonce, provider: "google", intent: "send", status: "ok", handoff });
    expect(handoff).toMatch(/^[\w-]{43}$/u);
    expect(google.exchanged).toEqual([{ code: "good-1", codeVerifier: verifier, redirectUri: REDIRECT_URI }]);
    // Nothing is saved for anyone before mailConnectFinish; the pending grant is encrypted.
    expect(await accountDocs()).toEqual([]);
    expect(enqueue.calls).toEqual([]);
    const pending = await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get();
    expect(pending.get("stage")).toBe("ready");
    expect(pending.get("state")).toBeNull();
    expect(pending.get("codeVerifier")).toBeNull();
    expect(JSON.stringify(pending.data())).not.toContain("rt-good-1");
    expect(JSON.stringify(pending.data())).not.toContain("at-good-1");
    expect(JSON.stringify(pending.data())).not.toContain(handoff);
    expect((pending.get("expireAt") as Timestamp).toMillis()).toBeLessThanOrEqual(Date.now() + 10 * 60_000);

    const finished = await finishConnect(UID, { nonce, handoff }, enqueue);

    const [doc, ...others] = await accountDocs();
    expect(others).toEqual([]);
    const accountId = doc?.id ?? "";
    expect(finished).toEqual({
      accountId,
      provider: "gmail",
      address: "deniz.arslan@gmail.example",
      displayName: "Deniz Arslan",
      canSend: true,
      reconnect: false,
    });
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
    expect(google.revoked).toEqual([]);

    // The state, the nonce and the handoff are single use.
    expect((await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get()).exists).toBe(false);
    expect(await reasonOf(finishConnect(UID, { nonce, handoff }, enqueue))).toBe("connect_expired");
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

  it("revokes the grant and saves nothing when another user finishes it", async () => {
    // The starter sends the /connect link to someone else, who consents; the app signed in as
    // that other user (the one that received the return link) redeems it.
    const { nonce, state } = await begin();
    const handoff = await grant(state, "good-1");

    expect(await reasonOf(finishConnect(OTHER_UID, { nonce, handoff }, enqueue))).toBe("connect_wrong_user");

    expect(google.revoked).toEqual(["rt-good-1"]);
    expect((await getFirestore().doc(serverOnlyPaths.mailConnect(nonce)).get()).exists).toBe(false);
    expect(await accountDocs()).toEqual([]);
    expect((await getFirestore().collection(firestorePaths.mailAccounts(OTHER_UID)).get()).empty).toBe(true);
    for (const uid of [UID, OTHER_UID]) {
      const tokens = await getFirestore()
        .collection(`${serverOnlyPaths.mailRoot(uid)}/mailTokens`)
        .get();
      expect(tokens.empty).toBe(true);
    }
    expect(enqueue.calls).toEqual([]);
    // The starter can't redeem it afterwards either.
    expect(await reasonOf(finishConnect(UID, { nonce, handoff }, enqueue))).toBe("connect_expired");
  });

  it("refuses the starter without the handoff from the return link", async () => {
    // The starter knows the nonce (it issued the link) but never sees the consenting browser's redirect.
    const { nonce, state } = await begin();
    const handoff = await grant(state, "good-1");
    const guessed = `${handoff.slice(0, -1)}${handoff.endsWith("A") ? "B" : "A"}`;

    expect(await reasonOf(finishConnect(UID, { nonce, handoff: guessed }, enqueue))).toBe("connect_expired");
    expect(await accountDocs()).toEqual([]);
    expect(google.revoked).toEqual([]);

    // Expired grants are refused (and revoked) even with the right handoff.
    await getFirestore()
      .doc(serverOnlyPaths.mailConnect(nonce))
      .update({ expireAt: Timestamp.fromMillis(Date.now() - 1_000) });
    expect(await reasonOf(finishConnect(UID, { nonce, handoff }, enqueue))).toBe("connect_expired");
    expect(google.revoked).toEqual(["rt-good-1"]);
    expect(await accountDocs()).toEqual([]);
  });

  it("reconnecting the same mailbox updates the account without a second scan", async () => {
    const first = await begin();
    const firstFinish = await finishConnect(
      UID,
      { nonce: first.nonce, handoff: await grant(first.state, "good-1") },
      enqueue,
    );
    const [doc] = await accountDocs();
    const accountId = doc?.id ?? "";
    expect(firstFinish.accountId).toBe(accountId);
    await doc?.ref.update({ status: "needs_reauth" });

    const second = await begin("read");
    const query = appReturn(await get("/connect/google/callback", { state: second.state, code: "good-2" }));
    expect(query).toMatchObject({ status: "ok", intent: "read" });
    const finished = await finishConnect(
      UID,
      { nonce: second.nonce, handoff: query["handoff"] ?? "" },
      enqueue,
    );
    expect(finished).toMatchObject({ accountId, reconnect: true });

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
    );
    expect(post.statusCode).toBe(405);
    expect((await get("/connect/yahoo", {})).statusCode).toBe(404);
  });
});
