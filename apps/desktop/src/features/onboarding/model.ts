/**
 * First-run wizard logic without React (onboarding-signin.md "Decision — Desktop" and the shared
 * onboarding contract): the steps, the new profile document, the first saved search built from
 * the preferences, and where the wizard resumes after the app was closed mid-way.
 */
import {
  DEFAULT_AI_ENABLED,
  DEFAULT_PROFILE_SETTINGS,
  type Profile,
  type UiLanguage,
  UiLanguageSchema,
} from "@bfhr/core";
import type { SavedSearchInput } from "../../data/jobs/writes";
import { THRESHOLD_SCORES, DEFAULT_THRESHOLD } from "../saved-searches/model";
import type { JobPreferences } from "../settings/job-preferences/model";
import type { ProfileSeed } from "./store";

export const ONBOARDING_STEPS = ["cv", "preferences", "finish"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** `users/{uid}` for a first sign-in: the seed, empty preferences, the documented defaults. */
export function newProfile(uid: string, seed: ProfileSeed, now: Date): Profile {
  return {
    id: uid,
    fullName: seed.fullName,
    email: seed.email,
    phone: null,
    headline: null,
    links: [],
    targetRoles: [],
    seniority: null,
    locations: [],
    remotePreferences: [],
    salaryFloor: null,
    workAuthorization: [],
    languages: [],
    timezone: seed.timezone,
    uiLanguage: seed.uiLanguage,
    hiddenCompanies: [],
    skills: [],
    defaultCvId: null,
    onboardingCompletedAt: null,
    aiEnabled: DEFAULT_AI_ENABLED,
    settings: DEFAULT_PROFILE_SETTINGS,
    createdAt: now,
    updatedAt: now,
  };
}

/** The UI language a new profile records (pushes to the phone use it). */
export function seedLanguage(locale: string): UiLanguage {
  const parsed = UiLanguageSchema.safeParse(locale.split("-")[0]);
  return parsed.success ? parsed.data : "en";
}

/** Roles beyond this many get no search of their own (each search spends daily run budget). */
export const MAX_FIRST_SEARCHES = 5;

/**
 * The first saved searches (shared with iOS): one per role, up to `MAX_FIRST_SEARCHES` (connectors
 * require every query term, so roles are never OR-joined into one query), all with the places'
 * countries and the workplace types as filters, checked daily with alerts for Good matches and
 * above. One "any title" search when there are places but no role; none when there is neither.
 */
export function firstSearchInputs(
  prefs: Pick<JobPreferences, "targetRoles" | "locations" | "remotePreferences">,
  fallbackName: string,
): SavedSearchInput[] {
  const countryCodes = [
    ...new Set(
      prefs.locations.flatMap((location) => (location.countryCode === null ? [] : [location.countryCode])),
    ),
  ];
  // Case-insensitive de-duplication that keeps the first spelling and the user's order.
  const roles = new Map<string, string>();
  for (const role of prefs.targetRoles) {
    const trimmed = role.trim();
    if (trimmed !== "" && !roles.has(trimmed.toLowerCase())) roles.set(trimmed.toLowerCase(), trimmed);
  }
  const queries = [...roles.values()].slice(0, MAX_FIRST_SEARCHES);
  if (queries.length === 0) {
    if (countryCodes.length === 0) return [];
    queries.push("");
  }
  return queries.map((query) => ({
    name: query === "" ? fallbackName : query,
    query,
    filters: {
      countryCodes,
      remoteTypes: [...prefs.remotePreferences],
      seniority: [],
      salaryMin: null,
      sources: [],
      postedWithinDays: null,
      visaSponsorship: null,
    },
    schedule: "daily",
    alertThreshold: THRESHOLD_SCORES[DEFAULT_THRESHOLD],
    dailyDigest: false,
    enabled: true,
  }));
}

// ─── Resume ────────────────────────────────────────────────────────────────────────────────────

const progressKey = (uid: string) => `bfhr.onboarding.step.${uid}`;

/** The step the user was on when the app closed (this computer), else the first. */
export function savedStep(uid: string): OnboardingStep {
  const stored = localStorage.getItem(progressKey(uid));
  return (ONBOARDING_STEPS as readonly string[]).includes(stored ?? "") ? (stored as OnboardingStep) : "cv";
}

export function saveStep(uid: string, step: OnboardingStep): void {
  localStorage.setItem(progressKey(uid), step);
}

export function clearSavedStep(uid: string): void {
  localStorage.removeItem(progressKey(uid));
}
