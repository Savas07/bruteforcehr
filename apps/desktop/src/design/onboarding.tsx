/**
 * Design build: the first-run wizard in a forced state (`?onboarding=<state>`,
 * `onboardingDesignStates` in matrix.ts) on an in-memory onboarding store and CV store, so the
 * harness clicks through real steps (import is the live flow and isn't scripted here). Finishing
 * navigates to Today without `?onboarding=`, which lets the gate through. Without the parameter
 * the persona is onboarded and the app shows as usual.
 */
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import type { Profile } from "@bfhr/core";
import { type ReactNode, useMemo } from "react";
import { useAuth } from "../features/auth/session";
import { createMemoryCvStore } from "../features/cv-editor/memoryBackend";
import type { AddedCv } from "../features/onboarding/CvStep";
import { createMemoryOnboardingStore } from "../features/onboarding/memory";
import { OnboardingOverrideContext } from "../features/onboarding/OnboardingGate";
import { newProfile, type OnboardingStep } from "../features/onboarding/model";
import { OnboardingWizard } from "../features/onboarding/OnboardingWizard";
import type { PreferenceSection } from "../features/settings/job-preferences/model";
import { useDesignReady } from "./DesignScreen";
import { type OnboardingDesignState, onboardingDesignStates } from "./matrix";

const persona = populatedDataset.profile;
const SEED = {
  email: persona.email,
  fullName: "Deniz Aksoy",
  timezone: persona.timezone,
  uiLanguage: "en",
} as const;
const fresh = newProfile(populatedDataset.uid, SEED, FIXTURE_NOW);
const onboardedPersona: Profile = { ...persona, onboardingCompletedAt: null };
/** What the CV import suggests for Deniz: two titles, Istanbul, three languages. */
const fromCvProfile: Profile = {
  ...fresh,
  targetRoles: ["Frontend Engineer", "Product Engineer"],
  locations: [{ label: "Istanbul, Türkiye", city: "Istanbul", countryCode: "TR", relocation: false }],
  languages: persona.languages,
};
const IMPORTED: AddedCv = {
  kind: "import",
  title: "Deniz Aksoy · Frontend",
  fileName: "Deniz-Aksoy-CV-2026.pdf",
  roles: 2,
  languages: 3,
};

interface DesignWizardSetup {
  readonly step: OnboardingStep;
  readonly profile: Profile;
  readonly withCvs: boolean;
  readonly added?: AddedCv;
  readonly fromCv?: readonly PreferenceSection[];
}

const SETUPS: Readonly<Record<OnboardingDesignState, DesignWizardSetup>> = {
  cv: { step: "cv", profile: fresh, withCvs: false },
  "cv-imported": { step: "cv", profile: fresh, withCvs: false, added: IMPORTED },
  "cv-existing": { step: "cv", profile: onboardedPersona, withCvs: true },
  preferences: { step: "preferences", profile: fresh, withCvs: false },
  "preferences-cv": {
    step: "preferences",
    profile: fromCvProfile,
    withCvs: false,
    added: IMPORTED,
    fromCv: ["name", "roles", "where", "languages"],
  },
  "preferences-filled": { step: "preferences", profile: onboardedPersona, withCvs: true },
  finish: { step: "finish", profile: onboardedPersona, withCvs: true },
  "finish-empty": { step: "finish", profile: fresh, withCvs: false },
  "setup-failed": { step: "cv", profile: fresh, withCvs: false },
};

/**
 * Decides the onboarding gate for the design build (`OnboardingOverrideContext`): the wizard in
 * the state `onboarding` names, else the app.
 */
export function DesignOnboarding({
  state,
  children,
}: {
  readonly state: string | undefined;
  readonly children: ReactNode;
}) {
  const forced = (onboardingDesignStates as readonly string[]).includes(state ?? "")
    ? (state as OnboardingDesignState)
    : null;
  const value = useMemo(
    () => ({ wizard: forced === null ? null : <DesignWizard key={forced} state={forced} /> }),
    [forced],
  );
  return <OnboardingOverrideContext.Provider value={value}>{children}</OnboardingOverrideContext.Provider>;
}

function DesignWizard({ state }: { readonly state: OnboardingDesignState }) {
  const setup = SETUPS[state];
  const { signOut } = useAuth();
  const onboarding = useMemo(
    () =>
      createMemoryOnboardingStore({
        uid: populatedDataset.uid,
        // The failed state shows its alert at once, so captures catch it.
        latencyMs: state === "setup-failed" ? 0 : 400,
        failSetup: state === "setup-failed",
      }),
    [state],
  );
  const cvStore = useMemo(
    () =>
      createMemoryCvStore(
        populatedDataset.uid,
        setup.withCvs ? populatedDataset : emptyDataset,
        () => FIXTURE_NOW,
      ),
    [setup.withCvs],
  );
  useDesignReady(`onboarding:${state}`, false);
  return (
    <OnboardingWizard
      store={onboarding.store}
      cvBackend={cvStore.backend}
      email={persona.email}
      profile={setup.profile}
      cvs={setup.withCvs ? populatedDataset.cvs : []}
      initialStep={setup.step}
      initialAdded={setup.added ?? null}
      initialFromCv={setup.fromCv ?? []}
      onSignOut={signOut}
    />
  );
}
