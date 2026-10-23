/**
 * Signed out, the window is the sign-in screen; signed in, it's the app. The live session runs on
 * Firebase Authentication and takes sign-in links from the Rust deep-link handler; a design route
 * provides `AuthContext` itself (src/design/auth.tsx), like the update UI.
 */
import { type ReactNode, useContext, useEffect, useMemo } from "react";
import { useIntl } from "react-intl";
import { resolveAppLocale } from "../../i18n/locale";
import { onAuthLink, setSignedIn, takeAuthLink } from "../../lib/desktop";
import { createFirebaseAuthBackend } from "./firebaseAuth";
import { AuthContext, useAuth, useAuthMachine } from "./session";
import { AuthRestoring, SignIn } from "./SignIn";

function LiveAuth({ children }: { children: ReactNode }) {
  const { locale } = useIntl();
  const language = resolveAppLocale([locale]).language;
  const backend = useMemo(() => createFirebaseAuthBackend(language), [language]);
  const value = useAuthMachine(backend);
  const { receiveLink } = value;

  useEffect(() => {
    // Every take is answered once by Rust, so no "still mounted" guard: a link taken during a
    // StrictMode re-mount must still reach the machine.
    const take = () =>
      void takeAuthLink().then(
        (delivery) => {
          if (delivery) receiveLink(delivery);
        },
        (error: unknown) => console.error("Couldn't read the sign-in link", error),
      );
    const stop = onAuthLink(take);
    // A link that launched the app arrived before this listener.
    take();
    return stop;
  }, [receiveLink]);

  const signedIn = value.state.status === "signed-in";
  useEffect(() => {
    void setSignedIn(signedIn).catch((error: unknown) => console.error("Couldn't update the menu", error));
  }, [signedIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Gate({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <AuthRestoring />;
    case "signed-out":
      return <SignIn view={state.view} />;
    case "signed-in":
      return children;
  }
}

/** Renders `children` only for a signed-in user. */
export function AuthGate({ children }: { children: ReactNode }) {
  const forced = useContext(AuthContext);
  const gate = <Gate>{children}</Gate>;
  return forced ? gate : <LiveAuth>{gate}</LiveAuth>;
}
