/**
 * What the first-run wizard writes (onboarding-signin.md "Onboarding wizard"; the same values as
 * the iOS app): the profile document when it doesn't exist yet, preference fields, the CV matches
 * are scored against, the first saved search, a match refresh and `onboardingCompletedAt`. The app
 * implements it on Firestore (`firestore.ts`), the design build and tests in memory (`memory.ts`).
 * Writes apply locally at once (Firestore's cache) and their promises settle when the server
 * accepted them, so the wizard never waits on the network except to create the profile.
 */
import type { SavedSearchInput } from "../../data/jobs/writes";
import type { ProfilePatch } from "../settings/store";

/** Fields a new profile starts from (the rest are empty or the documented defaults). */
export interface ProfileSeed {
  readonly email: string;
  readonly fullName: string;
  readonly timezone: string;
  readonly uiLanguage: "en" | "tr" | "de";
}

export interface OnboardingStore {
  readonly uid: string;
  /**
   * Creates `users/{uid}` from `seed` when it is missing, or adds only the fields a partial
   * document lacks; never overwrites a value. Needs the server (a transaction).
   */
  ensureProfile(seed: ProfileSeed): Promise<void>;
  /** Name and preference fields (the Settings store's write). */
  updateProfile(patch: ProfilePatch): Promise<void>;
  /** `defaultCvId`: the CV matching scores against. */
  setMatchingCv(cvId: string): Promise<void>;
  /** Creates the first saved search unless the user has one already; resolves whether it did. */
  createFirstSearch(input: SavedSearchInput): Promise<boolean>;
  /** `jobMatchesRefresh` without job ids: re-scores the jobs nearest the new profile. */
  refreshMatches(): Promise<void>;
  /** Sets `onboardingCompletedAt`; the shell replaces the wizard as soon as it applies locally. */
  complete(): Promise<void>;
}
