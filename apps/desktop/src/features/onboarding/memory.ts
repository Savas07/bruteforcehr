/**
 * The onboarding store in memory for the design build and tests: every write is logged, settles
 * after `latencyMs`, and `failSetup` makes creating the profile fail (the "needs a connection"
 * state). A saved search already present (`hasSavedSearch`) is never duplicated.
 */
import type { SavedSearchInput } from "../../data/jobs/writes";
import type { ProfilePatch } from "../settings/store";
import type { OnboardingStore, ProfileSeed } from "./store";

export type OnboardingMemoryLogEntry =
  | { readonly kind: "ensureProfile"; readonly seed: ProfileSeed }
  | { readonly kind: "profile"; readonly patch: ProfilePatch }
  | { readonly kind: "matchingCv"; readonly cvId: string }
  | { readonly kind: "savedSearch"; readonly input: SavedSearchInput }
  | { readonly kind: "refresh" }
  | { readonly kind: "complete" };

export interface MemoryOnboardingStore {
  readonly store: OnboardingStore;
  readonly log: readonly OnboardingMemoryLogEntry[];
}

export interface MemoryOnboardingOptions {
  readonly uid?: string;
  readonly latencyMs?: number;
  readonly failSetup?: boolean;
  readonly hasSavedSearch?: boolean;
}

export function createMemoryOnboardingStore(options: MemoryOnboardingOptions = {}): MemoryOnboardingStore {
  const { latencyMs = 0 } = options;
  const log: OnboardingMemoryLogEntry[] = [];
  let hasSavedSearch = options.hasSavedSearch ?? false;
  const settle = (fail = false): Promise<void> =>
    new Promise((resolve, reject) => {
      setTimeout(() => (fail ? reject(new Error("unavailable")) : resolve()), latencyMs);
    });
  const store: OnboardingStore = {
    uid: options.uid ?? "memory-user",
    ensureProfile(seed) {
      log.push({ kind: "ensureProfile", seed });
      return settle(options.failSetup);
    },
    updateProfile(patch) {
      log.push({ kind: "profile", patch });
      return settle();
    },
    setMatchingCv(cvId) {
      log.push({ kind: "matchingCv", cvId });
      return settle();
    },
    async createFirstSearches(inputs) {
      await settle();
      if (hasSavedSearch) return false;
      hasSavedSearch = true;
      for (const input of inputs) log.push({ kind: "savedSearch", input });
      return true;
    },
    refreshMatches() {
      log.push({ kind: "refresh" });
      return settle();
    },
    complete() {
      log.push({ kind: "complete" });
      return settle();
    },
  };
  return { store, log };
}
