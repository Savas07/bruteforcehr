// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_SIGN_IN_KEY } from "./emailLink";
import { type AuthBackend, type AuthValue, useAuthMachine } from "./session";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_800_000_000_000;
const LINK = "https://bruteforcehr.web.app/auth/finish?apiKey=k&oobCode=c&mode=signIn&lang=en";

/** A backend whose calls the test settles by hand. */
function fakeBackend(stored: Record<string, string> = {}) {
  const storage = new Map(Object.entries(stored));
  let listener: ((user: { email: string | null } | null) => void) | null = null;
  let settle: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  const pending = () =>
    new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
  const backend = {
    watch: vi.fn((next: (user: { email: string | null } | null) => void) => {
      listener = next;
      return () => undefined;
    }),
    sendLink: vi.fn(pending),
    isSignInLink: vi.fn((link: string) => link.includes("mode=signIn")),
    completeSignIn: vi.fn(pending),
    signOut: vi.fn(() => Promise.resolve()),
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    now: () => NOW,
  } satisfies AuthBackend;
  return {
    backend,
    storage,
    report: (user: { email: string | null } | null) => act(() => listener?.(user)),
    resolve: () => act(async () => settle?.resolve()),
    reject: (code: string) => act(async () => settle?.reject({ code })),
  };
}

let container: HTMLDivElement;
let root: Root;
let auth: AuthValue;

function Probe({ backend }: { backend: AuthBackend }) {
  const value = useAuthMachine(backend);
  useEffect(() => {
    auth = value;
  });
  return null;
}

function mount(backend: AuthBackend) {
  act(() => root.render(<Probe backend={backend} />));
}

const view = () => (auth.state.status === "signed-out" ? auth.state.view : null);

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useAuthMachine", () => {
  it("waits for the backend, then shows the email step or the signed-in app", () => {
    const fake = fakeBackend();
    mount(fake.backend);
    expect(auth.state).toEqual({ status: "loading" });
    fake.report(null);
    expect(view()).toEqual({ step: "email", email: "", sending: false, error: null });
    fake.report({ email: "ada@example.com" });
    expect(auth.state).toEqual({ status: "signed-in", email: "ada@example.com" });
  });

  it("returns to Check your email after a restart while a recent link is pending", () => {
    const fake = fakeBackend({
      [PENDING_SIGN_IN_KEY]: JSON.stringify({ email: "ada@example.com", sentAt: NOW - 30_000 }),
    });
    mount(fake.backend);
    fake.report(null);
    expect(view()).toMatchObject({ step: "check-email", email: "ada@example.com", sentAt: NOW - 30_000 });

    const stale = fakeBackend({
      [PENDING_SIGN_IN_KEY]: JSON.stringify({ email: "ada@example.com", sentAt: NOW - 2 * 3_600_000 }),
    });
    // A fresh machine (a later launch), after the link's window has passed.
    act(() => root.unmount());
    root = createRoot(container);
    mount(stale.backend);
    stale.report(null);
    expect(view()).toEqual({ step: "email", email: "ada@example.com", sending: false, error: null });
  });

  it("sends a link, remembers the address and counts down from the send", async () => {
    const fake = fakeBackend();
    mount(fake.backend);
    fake.report(null);

    act(() => auth.sendLink("ada@"));
    expect(view()).toMatchObject({ step: "email", error: "invalid-email" });
    expect(fake.backend.sendLink).not.toHaveBeenCalled();

    act(() => auth.sendLink(" Ada@Example.com "));
    expect(view()).toMatchObject({ step: "email", sending: true });
    expect(fake.backend.sendLink).toHaveBeenCalledWith("ada@example.com");
    await fake.resolve();
    expect(view()).toEqual({
      step: "check-email",
      email: "ada@example.com",
      sentAt: NOW,
      resending: false,
      resent: false,
      error: null,
    });
    expect(JSON.parse(fake.storage.get(PENDING_SIGN_IN_KEY) ?? "")).toEqual({
      email: "ada@example.com",
      sentAt: NOW,
    });

    // Resend: same address, "We sent a new link".
    act(() => auth.sendLink("ada@example.com"));
    await fake.resolve();
    expect(view()).toMatchObject({ step: "check-email", resent: true });

    // A failed resend stays on the screen with the reason.
    act(() => auth.sendLink("ada@example.com"));
    await fake.reject("auth/network-request-failed");
    expect(view()).toMatchObject({ step: "check-email", resending: false, error: "offline" });

    act(() => auth.changeEmail());
    expect(view()).toEqual({ step: "email", email: "ada@example.com", sending: false, error: null });
  });

  it("keeps the email step's reason when sending fails", async () => {
    const fake = fakeBackend();
    mount(fake.backend);
    fake.report(null);
    act(() => auth.sendLink("ada@example.com"));
    await fake.reject("auth/too-many-requests");
    expect(view()).toEqual({
      step: "email",
      email: "ada@example.com",
      sending: false,
      error: "rate-limited",
    });
  });

  it("completes a link with the remembered address and forgets it on success", async () => {
    const fake = fakeBackend({
      [PENDING_SIGN_IN_KEY]: JSON.stringify({ email: "ada@example.com", sentAt: NOW }),
    });
    mount(fake.backend);
    fake.report(null);
    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    expect(view()).toEqual({ step: "completing", email: "ada@example.com", link: LINK });
    expect(fake.backend.completeSignIn).toHaveBeenCalledWith("ada@example.com", LINK);
    await fake.resolve();
    expect(fake.storage.has(PENDING_SIGN_IN_KEY)).toBe(false);
    fake.report({ email: "ada@example.com" });
    expect(auth.state.status).toBe("signed-in");
  });

  it("holds a link that arrives before the session is known", async () => {
    const fake = fakeBackend({
      [PENDING_SIGN_IN_KEY]: JSON.stringify({ email: "ada@example.com", sentAt: NOW }),
    });
    mount(fake.backend);
    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    expect(fake.backend.completeSignIn).not.toHaveBeenCalled();
    fake.report(null);
    expect(fake.backend.completeSignIn).toHaveBeenCalledWith("ada@example.com", LINK);
  });

  it("asks for the address when the link was requested on another device", async () => {
    const fake = fakeBackend();
    mount(fake.backend);
    fake.report(null);
    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    expect(view()).toEqual({ step: "confirm-email", email: "", link: LINK, completing: false, error: null });

    act(() => auth.confirmEmail("nope"));
    expect(view()).toMatchObject({ step: "confirm-email", error: "invalid-email" });

    act(() => auth.confirmEmail("bob@example.com"));
    expect(view()).toMatchObject({ step: "confirm-email", completing: true });
    await fake.reject("auth/invalid-email");
    expect(view()).toEqual({
      step: "confirm-email",
      email: "bob@example.com",
      link: LINK,
      completing: false,
      error: "wrong-email",
    });

    act(() => auth.confirmEmail("ada@example.com"));
    expect(fake.backend.completeSignIn).toHaveBeenLastCalledWith("ada@example.com", LINK);
  });

  it("shows link errors, and offers a retry only when the link may still work", async () => {
    const fake = fakeBackend({
      [PENDING_SIGN_IN_KEY]: JSON.stringify({ email: "ada@example.com", sentAt: NOW }),
    });
    mount(fake.backend);
    fake.report(null);

    act(() => auth.receiveLink({ kind: "invalid" }));
    expect(view()).toEqual({
      step: "link-error",
      error: "invalid",
      email: "ada@example.com",
      link: null,
      sending: false,
      sendError: null,
    });

    act(() =>
      auth.receiveLink({ kind: "link", link: "https://bruteforcehr.web.app/auth/finish?mode=resetPassword" }),
    );
    expect(view()).toMatchObject({ step: "link-error", error: "invalid" });

    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    await fake.reject("auth/expired-action-code");
    expect(view()).toMatchObject({ step: "link-error", error: "expired", link: null });

    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    await fake.reject("auth/network-request-failed");
    expect(view()).toMatchObject({ step: "link-error", error: "offline", link: LINK });
    act(() => auth.retry());
    expect(fake.backend.completeSignIn).toHaveBeenLastCalledWith("ada@example.com", LINK);
    await fake.reject("auth/user-disabled");
    expect(view()).toMatchObject({ step: "link-error", error: "disabled", link: null });

    // "Send a new link" from an error goes to Check your email.
    act(() => auth.sendLink("ada@example.com"));
    expect(view()).toMatchObject({ step: "link-error", sending: true });
    await fake.resolve();
    expect(view()).toMatchObject({ step: "check-email", email: "ada@example.com", resent: false });
  });

  it("ignores links while signed in and signs out through the backend", () => {
    const fake = fakeBackend();
    mount(fake.backend);
    fake.report({ email: "ada@example.com" });
    act(() => auth.receiveLink({ kind: "link", link: LINK }));
    expect(fake.backend.completeSignIn).not.toHaveBeenCalled();
    expect(auth.state.status).toBe("signed-in");

    act(() => auth.signOut());
    expect(fake.backend.signOut).toHaveBeenCalled();
    fake.report(null);
    // The address of the session that just ended is filled in.
    expect(view()).toEqual({ step: "email", email: "ada@example.com", sending: false, error: null });
  });
});
