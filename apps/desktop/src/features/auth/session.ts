/**
 * The sign-in session: who is signed in, which sign-in step the window shows, and the actions
 * the screens call. One state machine (`useAuthMachine`) runs against an `AuthBackend`: Firebase
 * Authentication in the app (firebaseAuth.ts), a scripted backend in the design build
 * (src/design/auth.tsx), so the harness clicks through the same transitions.
 *
 * While signed in, the same machine runs a re-authentication (Settings › Data & privacy › Delete
 * account needs a sign-in less than 5 minutes old): it sends the normal sign-in link to the
 * signed-in address and completes that link when it comes back, which renews the session's
 * `auth_time` for the same user.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthLinkDelivery } from "../../lib/desktop";
import {
  isPlausibleEmail,
  type LinkError,
  linkErrorOf,
  normalizeEmail,
  PENDING_SIGN_IN_KEY,
  type PendingSignIn,
  readPendingSignIn,
  savePendingSignIn,
  type SendError,
  sendErrorOf,
} from "./emailLink";

/** What the machine needs from an auth provider. */
export interface AuthBackend {
  /** Reports the signed-in address (null: signed out) now and on every change; returns unsubscribe. */
  watch(listener: (user: { readonly email: string | null } | null) => void): () => void;
  sendLink(email: string): Promise<void>;
  isSignInLink(link: string): boolean;
  /** Signs in; rejects with a Firebase error (`code`). */
  completeSignIn(email: string, link: string): Promise<void>;
  signOut(): Promise<void>;
  /** Where the pending request lives (`localStorage` in the app). */
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly now: () => number;
}

/** The sign-in screen's step. `link` is the checked action URL being completed (never shown). */
export type SignInView =
  | {
      readonly step: "email";
      readonly email: string;
      readonly sending: boolean;
      readonly error: SendError | null;
    }
  | {
      readonly step: "check-email";
      readonly email: string;
      readonly sentAt: number;
      readonly resending: boolean;
      /** A resend succeeded: "We sent a new link". */
      readonly resent: boolean;
      readonly error: SendError | null;
    }
  | {
      /** The link arrived but this device doesn't know the address (requested elsewhere). */
      readonly step: "confirm-email";
      readonly email: string;
      readonly link: string;
      readonly completing: boolean;
      readonly error: "invalid-email" | "wrong-email" | null;
    }
  | { readonly step: "completing"; readonly email: string; readonly link: string }
  | {
      readonly step: "link-error";
      readonly error: LinkError;
      /** The address to send a new link to, when known. */
      readonly email: string | null;
      /** Kept for "Try again" after `offline` / `unavailable`. */
      readonly link: string | null;
      readonly sending: boolean;
      readonly sendError: SendError | null;
    };

/** A calm one-time line on the sign-in screen about why the user is signed out. */
export type SignInNotice = "account-deleted";

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "signed-in"; readonly email: string | null }
  | { readonly status: "signed-out"; readonly view: SignInView; readonly notice?: SignInNotice };

/**
 * Re-authentication of the signed-in user. `email` is the normalized address the link goes to.
 * Links that arrive while signed in are completed only after `sent` (or a failed completion).
 */
export type ReauthView =
  | { readonly step: "idle" }
  | { readonly step: "sending"; readonly email: string }
  | { readonly step: "sent"; readonly email: string; readonly sentAt: number }
  | { readonly step: "send-error"; readonly email: string; readonly error: SendError }
  | { readonly step: "completing"; readonly email: string }
  | { readonly step: "link-error"; readonly email: string; readonly error: LinkError }
  /** Signed in again just now: the new session's `auth_time` is fresh. */
  | { readonly step: "done"; readonly email: string };

export const REAUTH_IDLE: ReauthView = { step: "idle" };

export interface AuthValue {
  readonly state: AuthState;
  readonly now: () => number;
  /** Sends a link (email step, Resend, "Send a new link"). */
  readonly sendLink: (email: string) => void;
  /** Back to the email step with the address filled in ("Use a different email"). */
  readonly changeEmail: () => void;
  /** The confirm step's address, for a link requested on another device. */
  readonly confirmEmail: (email: string) => void;
  /** Completes the kept link again (after `offline` / `unavailable`). */
  readonly retry: () => void;
  readonly signOut: () => void;
  /** A link from the deep-link handler. */
  readonly receiveLink: (delivery: AuthLinkDelivery) => void;
  /** The signed-in user's re-authentication (idle unless a screen started one). */
  readonly reauth: ReauthView;
  /** Sends a sign-in link to the signed-in address (again, after an error or a resend). */
  readonly sendReauthLink: () => void;
  /** Forgets the re-authentication (its dialog closed, or the fresh sign-in got too old). */
  readonly endReauth: () => void;
  /** After `accountDelete`: signs out, forgets the address, and the sign-in screen says so once. */
  readonly signOutAfterDeletion: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth needs an AuthProvider (AppShell)");
  return value;
}

/** After this long, a restart shows the email step again instead of "Check your email". */
const PENDING_VIEW_MS = 60 * 60_000;

const emailStep = (email: string): SignInView => ({ step: "email", email, sending: false, error: null });

function signedOutView(pending: PendingSignIn | null, lastEmail: string, now: number): SignInView {
  if (pending && now - pending.sentAt < PENDING_VIEW_MS)
    return {
      step: "check-email",
      email: pending.email,
      sentAt: pending.sentAt,
      resending: false,
      resent: false,
      error: null,
    };
  return emailStep(pending?.email ?? lastEmail);
}

/**
 * Runs sign-in against `backend`. `initial` is `loading` in the app (the backend's first `watch`
 * report decides); the design build starts in a forced state, `initialReauth` included.
 */
export function useAuthMachine(
  backend: AuthBackend,
  initial: AuthState = { status: "loading" },
  initialReauth: ReauthView = REAUTH_IDLE,
): AuthValue {
  const [state, setState] = useState<AuthState>(initial);
  /** The latest state for the actions (updated with every commit, so repeated clicks see it). */
  const stateRef = useRef(state);
  const commit = useCallback((next: AuthState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  /** The address of the last session, prefilled after Sign out. */
  const lastEmail = useRef("");
  /** A link that arrived before the first `watch` report. */
  const queuedLink = useRef<AuthLinkDelivery | null>(null);
  /** Shown on the next email step only (`signOutAfterDeletion`). */
  const notice = useRef<SignInNotice | null>(null);

  const [reauth, setReauth] = useState<ReauthView>(initialReauth);
  const reauthRef = useRef(reauth);
  /** Bumped when a re-authentication ends, so a late answer from the previous one is dropped. */
  const reauthRun = useRef(0);
  const commitReauth = useCallback((next: ReauthView) => {
    reauthRef.current = next;
    setReauth(next);
  }, []);
  const endReauth = useCallback(() => {
    reauthRun.current += 1;
    commitReauth(REAUTH_IDLE);
  }, [commitReauth]);

  const setView = useCallback(
    (view: SignInView) => {
      const shown = notice.current;
      if (view.step !== "email") notice.current = null;
      commit(
        shown !== null && view.step === "email"
          ? { status: "signed-out", view, notice: shown }
          : { status: "signed-out", view },
      );
    },
    [commit],
  );

  const complete = useCallback(
    (email: string, link: string, from: "link" | "confirm") => {
      setView(
        from === "confirm"
          ? { step: "confirm-email", email, link, completing: true, error: null }
          : { step: "completing", email, link },
      );
      backend.completeSignIn(email, link).then(
        () => {
          backend.storage.removeItem(PENDING_SIGN_IN_KEY);
          // `watch` reports the user; the shell replaces this screen.
        },
        (error: unknown) => {
          const reason = linkErrorOf(error);
          if (reason === "wrong-email")
            setView({
              step: "confirm-email",
              email: from === "confirm" ? email : "",
              link,
              completing: false,
              error: "wrong-email",
            });
          else
            setView({
              step: "link-error",
              error: reason,
              email,
              link: reason === "offline" || reason === "unavailable" ? link : null,
              sending: false,
              sendError: null,
            });
        },
      );
    },
    [backend, setView],
  );

  const handleLink = useCallback(
    (delivery: AuthLinkDelivery) => {
      const pending = readPendingSignIn(backend.storage);
      if (delivery.kind === "invalid" || !backend.isSignInLink(delivery.link)) {
        setView({
          step: "link-error",
          error: "invalid",
          email: pending?.email ?? null,
          link: null,
          sending: false,
          sendError: null,
        });
        return;
      }
      if (pending) complete(pending.email, delivery.link, "link");
      else setView({ step: "confirm-email", email: "", link: delivery.link, completing: false, error: null });
    },
    [backend, complete, setView],
  );

  /** Signed in with a re-authentication waiting: the link renews the same user's session. */
  const completeReauth = useCallback(
    (delivery: AuthLinkDelivery) => {
      const pending = reauthRef.current;
      if (pending.step !== "sent" && pending.step !== "link-error") return;
      const { email } = pending;
      if (delivery.kind === "invalid" || !backend.isSignInLink(delivery.link)) {
        commitReauth({ step: "link-error", email, error: "invalid" });
        return;
      }
      const run = reauthRun.current;
      commitReauth({ step: "completing", email });
      backend.completeSignIn(email, delivery.link).then(
        () => {
          if (run === reauthRun.current) commitReauth({ step: "done", email });
        },
        (error: unknown) => {
          if (run === reauthRun.current) commitReauth({ step: "link-error", email, error: linkErrorOf(error) });
        },
      );
    },
    [backend, commitReauth],
  );

  const receiveLink = useCallback(
    (delivery: AuthLinkDelivery) => {
      const current = stateRef.current;
      // Signed in, the link only matters to a re-authentication; otherwise it has nothing left to do.
      if (current.status === "signed-in") completeReauth(delivery);
      else if (current.status === "loading") queuedLink.current = delivery;
      else handleLink(delivery);
    },
    [handleLink, completeReauth],
  );

  useEffect(
    () =>
      backend.watch((user) => {
        const previous = stateRef.current;
        // Another account (or none): its re-authentication doesn't carry over.
        if (!user || previous.status !== "signed-in" || previous.email !== user.email) endReauth();
        if (user) {
          lastEmail.current = user.email ?? "";
          queuedLink.current = null;
          commit({ status: "signed-in", email: user.email });
          return;
        }
        const queued = queuedLink.current;
        queuedLink.current = null;
        setView(signedOutView(readPendingSignIn(backend.storage), lastEmail.current, backend.now()));
        if (queued) handleLink(queued);
      }),
    [backend, commit, handleLink, setView, endReauth],
  );

  const sendReauthLink = useCallback(() => {
    const current = stateRef.current;
    const step = reauthRef.current.step;
    if (current.status !== "signed-in" || current.email === null) return;
    if (step === "sending" || step === "completing") return;
    const email = normalizeEmail(current.email);
    const run = reauthRun.current;
    commitReauth({ step: "sending", email });
    backend.sendLink(email).then(
      () => {
        if (run === reauthRun.current) commitReauth({ step: "sent", email, sentAt: backend.now() });
      },
      (error: unknown) => {
        if (run === reauthRun.current) commitReauth({ step: "send-error", email, error: sendErrorOf(error) });
      },
    );
  }, [backend, commitReauth]);

  const sendLink = useCallback(
    (input: string) => {
      const current = stateRef.current;
      if (current.status !== "signed-out") return;
      const email = normalizeEmail(input);
      const view = current.view;
      const sendingView: SignInView | null =
        view.step === "email"
          ? { ...view, email: input, sending: true, error: null }
          : view.step === "check-email"
            ? { ...view, resending: true, resent: false, error: null }
            : view.step === "link-error"
              ? { ...view, sending: true, sendError: null }
              : null;
      if (!sendingView) return;
      if (!isPlausibleEmail(email)) {
        if (view.step === "email") setView({ ...view, email: input, error: "invalid-email" });
        else setView(emailStep(input));
        return;
      }
      setView(sendingView);
      backend.sendLink(email).then(
        () => {
          const sentAt = backend.now();
          savePendingSignIn(backend.storage, { email, sentAt });
          setView({
            step: "check-email",
            email,
            sentAt,
            resending: false,
            resent: view.step === "check-email",
            error: null,
          });
        },
        (error: unknown) => {
          const reason = sendErrorOf(error);
          if (sendingView.step === "email") setView({ ...sendingView, sending: false, error: reason });
          else if (sendingView.step === "check-email")
            setView({ ...sendingView, resending: false, error: reason });
          else if (sendingView.step === "link-error")
            setView({ ...sendingView, sending: false, sendError: reason });
        },
      );
    },
    [backend, setView],
  );

  const changeEmail = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "signed-out") return;
    const view = current.view;
    setView(emailStep(view.step === "link-error" ? (view.email ?? "") : view.email));
  }, [setView]);

  const confirmEmail = useCallback(
    (input: string) => {
      const current = stateRef.current;
      if (current.status !== "signed-out" || current.view.step !== "confirm-email") return;
      const email = normalizeEmail(input);
      if (!isPlausibleEmail(email)) {
        setView({ ...current.view, email: input, error: "invalid-email" });
        return;
      }
      complete(email, current.view.link, "confirm");
    },
    [complete, setView],
  );

  const retry = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "signed-out" || current.view.step !== "link-error") return;
    const { email, link } = current.view;
    if (link === null) return;
    if (email === null) setView({ step: "confirm-email", email: "", link, completing: false, error: null });
    else complete(email, link, "link");
  }, [complete, setView]);

  const signOut = useCallback(() => {
    void backend.signOut().catch((error: unknown) => console.error("Couldn't sign out", error));
  }, [backend]);

  const signOutAfterDeletion = useCallback(() => {
    // The account is gone: don't prefill its address or resume its sign-in.
    notice.current = "account-deleted";
    lastEmail.current = "";
    backend.storage.removeItem(PENDING_SIGN_IN_KEY);
    signOut();
  }, [backend, signOut]);

  return useMemo(
    () => ({
      state,
      now: backend.now,
      sendLink,
      changeEmail,
      confirmEmail,
      retry,
      signOut,
      receiveLink,
      reauth,
      sendReauthLink,
      endReauth,
      signOutAfterDeletion,
    }),
    [
      state,
      backend.now,
      sendLink,
      changeEmail,
      confirmEmail,
      retry,
      signOut,
      receiveLink,
      reauth,
      sendReauthLink,
      endReauth,
      signOutAfterDeletion,
    ],
  );
}
