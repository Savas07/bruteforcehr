/**
 * After sign-in, the window is the first-run wizard until `users/{uid}` has
 * `onboardingCompletedAt` (a missing profile counts as not onboarded), then the app. The gate waits
 * for the first server answer before deciding a profile is missing, so a returning user on a
 * fresh install never sees the wizard flash (offline, the cache is all there is). A failed profile
 * listener lets the app through: its screens show their own load errors.
 *
 * The design build decides instead through `OnboardingOverrideContext` (src/design/onboarding.tsx),
 * like `AuthContext` forces the sign-in states.
 */
import type { Cv, Profile } from "@bfhr/core";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useTrackerData } from "../../data/tracker/live";
import { currentUid } from "../auth/firebaseAuth";
import { useAuth } from "../auth/session";
import { AuthRestoring } from "../auth/SignIn";
import { createFirestoreCvBackend } from "../cv-editor/firestoreBackend";
import { firestoreOnboardingStore } from "./firestore";
import { savedStep } from "./model";
import { OnboardingWizard } from "./OnboardingWizard";

/** Design build: the wizard to show (a forced state), or null to show the app. */
export const OnboardingOverrideContext = createContext<{ readonly wizard: ReactNode } | null>(null);

/** The design build's choice when it makes one, else the live profile's. */
export function OnboardingGate({ children }: { readonly children: ReactNode }) {
  const override = useContext(OnboardingOverrideContext);
  if (override !== null) return override.wizard ?? children;
  return <LiveOnboardingGate>{children}</LiveOnboardingGate>;
}

function LiveOnboardingGate({ children }: { readonly children: ReactNode }) {
  const tracker = useTrackerData();
  if (tracker.status === "loading") return <AuthRestoring />;
  if (tracker.status === "error") return children;
  const { profile, cvs, fromCache } = tracker.data;
  if (profile?.onboardingCompletedAt) return children;
  if (profile === null && fromCache && navigator.onLine) return <AuthRestoring />;
  return <LiveWizard profile={profile} cvs={cvs} />;
}

function LiveWizard({ profile, cvs }: { readonly profile: Profile | null; readonly cvs: readonly Cv[] }) {
  const { state, signOut } = useAuth();
  const uid = currentUid();
  const backends = useMemo(
    () => (uid === null ? null : { store: firestoreOnboardingStore(uid), cv: createFirestoreCvBackend(uid) }),
    [uid],
  );
  if (backends === null || uid === null) return null;
  const email = state.status === "signed-in" ? (state.email ?? "") : "";
  return (
    <OnboardingWizard
      store={backends.store}
      cvBackend={backends.cv}
      email={email}
      profile={profile}
      cvs={cvs}
      initialStep={savedStep(uid)}
      onSignOut={signOut}
    />
  );
}
