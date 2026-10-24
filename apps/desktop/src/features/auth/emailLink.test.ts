// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { firebaseConfig } from "../../lib/firebase";
import {
  actionCodeSettings,
  isPlausibleEmail,
  linkErrorOf,
  normalizeEmail,
  PENDING_SIGN_IN_KEY,
  readPendingSignIn,
  resendWaitMs,
  RESEND_COOLDOWN_MS,
  savePendingSignIn,
  sendErrorOf,
} from "./emailLink";
import { createFirebaseAuthBackend } from "./firebaseAuth";
import { webmailInboxFor } from "./mailProviders";

/**
 * No test reaches the network: the SDK captures `fetch` when it loads, so it is replaced before
 * any import, and each test installs the answer it wants.
 */
const network = vi.hoisted(() => {
  const state: { handler: ((url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null } = {
    handler: null,
  };
  const fetchStub = (url: RequestInfo | URL, init?: RequestInit) =>
    state.handler ? state.handler(url, init) : Promise.reject(new Error("network is disabled in unit tests"));
  globalThis.fetch = fetchStub;
  if (typeof window !== "undefined") window.fetch = fetchStub;
  return state;
});

const FINISH =
  "https://bruteforcehr.web.app/auth/finish?apiKey=AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag&oobCode=abc-DEF_123&mode=signIn&lang=tr";

describe("action code settings", () => {
  it("send the website's finish page, open in the app, and name the iOS app", () => {
    expect(actionCodeSettings).toEqual({
      url: "https://bruteforcehr.web.app/auth/finish",
      handleCodeInApp: true,
      iOS: { bundleId: "com.savas07.bruteforcehr" },
    });
    // Firebase rejects the default Hosting domain as a link domain (INVALID_HOSTING_LINK_DOMAIN).
    expect(actionCodeSettings).not.toHaveProperty("linkDomain");
    expect(actionCodeSettings).not.toHaveProperty("dynamicLinkDomain");
  });
});

describe("Firebase requests", () => {
  /** Captures the SDK's REST calls (Identity Toolkit) and answers them with `response`. */
  function stubFetch(response: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    network.handler = (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    };
    return calls;
  }

  it("sendSignInLinkToEmail asks Identity Toolkit for an in-app email sign-in link in the UI language", async () => {
    const calls = stubFetch({ email: "ada@example.com" });
    const backend = createFirebaseAuthBackend("tr");
    await backend.sendLink("ada@example.com");

    const call = calls.find(({ url }) => url.includes("accounts:sendOobCode"));
    expect(call).toBeDefined();
    const url = new URL(call?.url ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode",
    );
    expect(url.searchParams.get("key")).toBe(firebaseConfig.apiKey);
    expect(call?.init.method).toBe("POST");
    expect(new Headers(call?.init.headers).get("X-Firebase-Locale")).toBe("tr");
    expect(JSON.parse(String(call?.init.body))).toEqual({
      requestType: "EMAIL_SIGNIN",
      email: "ada@example.com",
      continueUrl: "https://bruteforcehr.web.app/auth/finish",
      canHandleCodeInApp: true,
      iOSBundleId: "com.savas07.bruteforcehr",
      clientType: "CLIENT_TYPE_WEB",
    });
  });

  it("accepts the finish page's link and signs in with its code and the address", async () => {
    const calls = stubFetch({ error: { code: 400, message: "INVALID_OOB_CODE" } });
    const backend = createFirebaseAuthBackend("en");
    expect(backend.isSignInLink(FINISH)).toBe(true);
    expect(backend.isSignInLink("https://bruteforcehr.web.app/auth/finish")).toBe(false);
    expect(backend.isSignInLink(FINISH.replace("mode=signIn", "mode=resetPassword"))).toBe(false);

    await backend.completeSignIn("ada@example.com", FINISH).catch(() => undefined);
    const call = calls.find(({ url }) => url.includes("accounts:signInWithEmailLink"));
    expect(JSON.parse(String(call?.init.body))).toMatchObject({
      email: "ada@example.com",
      oobCode: "abc-DEF_123",
    });
  });
});

describe("pending sign-in", () => {
  it("round-trips and ignores anything malformed", () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    expect(readPendingSignIn(store)).toBeNull();
    savePendingSignIn(store, { email: "ada@example.com", sentAt: 42 });
    expect(readPendingSignIn(store)).toEqual({ email: "ada@example.com", sentAt: 42 });
    for (const raw of ["{", "null", '"x"', '{"email":"nope"}', '{"email":7}'])
      expect(readPendingSignIn({ getItem: () => raw }), raw).toBeNull();
    expect(readPendingSignIn({ getItem: () => '{"email":"ada@example.com"}' })).toEqual({
      email: "ada@example.com",
      sentAt: 0,
    });
    expect(PENDING_SIGN_IN_KEY).toBe("bfhr.emailForSignIn");
  });

  it("counts the resend cooldown down from the last send", () => {
    expect(resendWaitMs(1000, 1000)).toBe(RESEND_COOLDOWN_MS);
    expect(resendWaitMs(1000, 1000 + RESEND_COOLDOWN_MS - 1)).toBe(1);
    expect(resendWaitMs(1000, 1000 + RESEND_COOLDOWN_MS + 5)).toBe(0);
  });
});

describe("addresses", () => {
  it("normalizes and checks syntax loosely", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    for (const ok of ["a@b.co", "ada.lovelace+jobs@mail.example.com"])
      expect(isPlausibleEmail(ok), ok).toBe(true);
    for (const bad of ["", "ada", "ada@", "@example.com", "ada@example", "a b@example.com", "ada@example."])
      expect(isPlausibleEmail(bad), bad).toBe(false);
  });

  it("offers the matching webmail inbox only", () => {
    expect(webmailInboxFor("ada@gmail.com")).toEqual({ provider: "gmail", name: "Gmail" });
    expect(webmailInboxFor("ada@Hotmail.de")).toEqual({ provider: "outlook", name: "Outlook" });
    expect(webmailInboxFor("ada@web.de")).toEqual({ provider: "web-de", name: "WEB.DE" });
    expect(webmailInboxFor("ada@example.com")).toBeNull();
    expect(webmailInboxFor("ada@gmail.com.evil.example")).toBeNull();
  });
});

describe("errors", () => {
  it("map Firebase codes to what the screen says", () => {
    const error = (code: string) => ({ code });
    expect(sendErrorOf(error("auth/invalid-email"))).toBe("invalid-email");
    expect(sendErrorOf(error("auth/network-request-failed"))).toBe("offline");
    expect(sendErrorOf(error("auth/too-many-requests"))).toBe("rate-limited");
    expect(sendErrorOf(error("auth/quota-exceeded"))).toBe("rate-limited");
    expect(sendErrorOf(error("auth/operation-not-allowed"))).toBe("unavailable");
    expect(sendErrorOf(new Error("boom"))).toBe("unavailable");

    expect(linkErrorOf(error("auth/invalid-action-code"))).toBe("invalid");
    expect(linkErrorOf(error("auth/expired-action-code"))).toBe("expired");
    expect(linkErrorOf(error("auth/invalid-email"))).toBe("wrong-email");
    expect(linkErrorOf(error("auth/user-disabled"))).toBe("disabled");
    // The invite-only blocking function: a generic internal error carrying our token.
    expect(
      linkErrorOf(
        Object.assign(
          new Error(
            'Firebase: HTTP Cloud Function returned an error: {"error":{"message":"SIGNUP_NOT_ALLOWED: BruteForceHR is invite-only for now.","status":"PERMISSION_DENIED"}} (auth/internal-error).',
          ),
          { code: "auth/internal-error" },
        ),
      ),
    ).toBe("invite-only");
    expect(linkErrorOf(error("auth/internal-error"))).toBe("unavailable");
    expect(linkErrorOf(error("auth/network-request-failed"))).toBe("offline");
    expect(linkErrorOf(undefined)).toBe("unavailable");
  });
});
