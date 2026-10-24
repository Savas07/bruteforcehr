/**
 * Design build: sign-in in a forced state (`?auth=<state>`, `authDesignStates` in matrix.ts)
 * instead of Firebase. The same state machine runs on a scripted backend, so the harness clicks
 * through real transitions: sending succeeds after a moment, a link signs the persona in, and
 * Sign out returns to the email step. The clock is pinned to `FIXTURE_NOW`, so countdowns
 * capture the same everywhere. Without `?auth=` the persona is signed in, optionally with a
 * re-authentication in progress (`reauth`, forced by Settings › Data & privacy design states).
 */
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { type ReactNode, useState } from "react";
import type { LinkError, SendError } from "../features/auth/emailLink";
import {
  type AuthBackend,
  AuthContext,
  type AuthState,
  REAUTH_IDLE,
  type ReauthView,
  type SignInView,
  useAuthMachine,
} from "../features/auth/session";
import { useDesignReady } from "./DesignScreen";
import { type AuthDesignState, authDesignStates } from "./matrix";

const NOW = FIXTURE_NOW.getTime();
const SECOND = 1000;
const WORK_EMAIL = populatedDataset.profile.email;
/** A Gmail address, so "Open Gmail" shows. */
const GMAIL = "deniz.aksoy@gmail.com";
/** Stands in for a checked action URL; the scripted backend accepts any. */
const LINK = "https://bruteforcehr.web.app/auth/finish?mode=signIn&oobCode=design&apiKey=design";

const email = (address: string, error: SendError | null = null, sending = false): SignInView => ({
  step: "email",
  email: address,
  sending,
  error,
});

const check = (
  address: string,
  sentAgo: number,
  extra: Partial<Extract<SignInView, { step: "check-email" }>> = {},
) =>
  ({
    step: "check-email",
    email: address,
    sentAt: NOW - sentAgo,
    resending: false,
    resent: false,
    error: null,
    ...extra,
  }) satisfies SignInView;

const linkError = (error: LinkError, keepLink = false): SignInView => ({
  step: "link-error",
  error,
  email: WORK_EMAIL,
  link: keepLink ? LINK : null,
  sending: false,
  sendError: null,
});

const views: Readonly<Record<AuthDesignState, SignInView>> = {
  email: email(""),
  "email-returning": email(WORK_EMAIL),
  "email-invalid": email("deniz.aksoy@", "invalid-email"),
  "email-sending": email(WORK_EMAIL, null, true),
  "send-offline": email(WORK_EMAIL, "offline"),
  "send-rate-limited": email(WORK_EMAIL, "rate-limited"),
  "check-email": check(GMAIL, 18 * SECOND),
  "check-email-ready": check(WORK_EMAIL, 5 * 60 * SECOND),
  "check-email-resent": check(GMAIL, 3 * SECOND, { resent: true }),
  "check-email-resend-failed": check(WORK_EMAIL, 2 * 60 * SECOND, { error: "offline" }),
  completing: { step: "completing", email: WORK_EMAIL, link: LINK },
  "confirm-email": { step: "confirm-email", email: "", link: LINK, completing: false, error: null },
  "confirm-wrong-email": {
    step: "confirm-email",
    email: "deniz@example.org",
    link: LINK,
    completing: false,
    error: "wrong-email",
  },
  "link-invalid": linkError("invalid"),
  "link-expired": linkError("expired"),
  "link-offline": linkError("offline", true),
  "link-unavailable": linkError("unavailable", true),
  "link-disabled": linkError("disabled"),
  "link-invite-only": linkError("invite-only"),
  /** Right after Settings › Delete account: the email step with the one-time notice. */
  "account-deleted": email(""),
};

function isAuthState(value: string | undefined): value is AuthDesignState {
  return (authDesignStates as readonly (string | undefined)[]).includes(value);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function scriptedBackend(): AuthBackend {
  let listener: ((user: { readonly email: string | null } | null) => void) | null = null;
  const stored = new Map<string, string>();
  return {
    // The state is forced, so nothing is reported until the user acts.
    watch: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    sendLink: () => delay(800),
    isSignInLink: () => true,
    completeSignIn: async (address) => {
      await delay(800);
      listener?.({ email: address });
    },
    signOut: async () => {
      listener?.(null);
    },
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: (key) => void stored.delete(key),
    },
    now: () => NOW,
  };
}

function ForcedAuth({
  initial,
  reauth,
  children,
}: {
  initial: AuthState;
  reauth: ReauthView;
  children: ReactNode;
}) {
  const [backend] = useState(scriptedBackend);
  const value = useAuthMachine(backend, initial, reauth);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Marks sign-in captures ready (the screens' own flag never runs while signed out). */
function SignInReady({ state }: { state: string }) {
  useDesignReady(`auth-${state}`, false);
  return null;
}

export function DesignAuth({
  state,
  reauth = REAUTH_IDLE,
  children,
}: {
  state: string | undefined;
  /** Signed in only: the re-authentication to start in. */
  reauth?: ReauthView;
  children: ReactNode;
}) {
  const forced = isAuthState(state);
  const initial: AuthState = forced
    ? state === "account-deleted"
      ? { status: "signed-out", view: views[state], notice: "account-deleted" }
      : { status: "signed-out", view: views[state] }
    : { status: "signed-in", email: WORK_EMAIL };
  return (
    // A new forced state starts a fresh machine.
    <ForcedAuth key={`${state ?? "signed-in"}:${reauth.step}`} initial={initial} reauth={reauth}>
      {forced && <SignInReady state={state} />}
      {children}
    </ForcedAuth>
  );
}
