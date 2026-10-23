/**
 * The app's `AuthBackend`: Firebase Authentication's passwordless email link. The session
 * persists in the webview's IndexedDB (local storage as the fallback); there is no popup or
 * redirect resolver, so the SDK loads no iframes or scripts and talks only to Identity Toolkit
 * and Secure Token (the CSP's `connect-src`). Test builds (`__BFHR_E2E__`) talk to the Auth
 * emulator on 127.0.0.1:9099 instead (src-tauri/tauri.e2e.conf.json allows it).
 */
import {
  type Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import type { UiLanguage } from "../../i18n/locale";
import { firebaseApp } from "../../lib/firebase";
import { actionCodeSettings } from "./emailLink";
import type { AuthBackend } from "./session";

/** The Auth emulator test builds use (firebase.json `emulators.auth`). */
export const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

let auth: Auth | null = null;

function firebaseAuth(): Auth {
  if (auth) return auth;
  auth = initializeAuth(firebaseApp(), {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
  if (__BFHR_E2E__) connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  return auth;
}

/** The signed-in user's uid (null signed out). Data screens render only behind `AuthGate`. */
export function currentUid(): string | null {
  return firebaseAuth().currentUser?.uid ?? null;
}

/** `language` localizes Firebase's sign-in email (its template has EN, TR and DE). */
export function createFirebaseAuthBackend(language: UiLanguage): AuthBackend {
  const instance = firebaseAuth();
  instance.languageCode = language;
  return {
    watch: (listener) =>
      onAuthStateChanged(instance, (user) => listener(user ? { email: user.email } : null)),
    sendLink: (email) => sendSignInLinkToEmail(instance, email, actionCodeSettings),
    isSignInLink: (link) => isSignInWithEmailLink(instance, link),
    completeSignIn: async (email, link) => {
      await signInWithEmailLink(instance, email, link);
    },
    signOut: () => signOut(instance),
    storage: window.localStorage,
    now: Date.now,
  };
}
