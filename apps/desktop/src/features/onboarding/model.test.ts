import { ProfileSchema, SavedSearchSchema } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { planCreateSavedSearch } from "../../data/jobs/writes";
import { firstSearchInput, newProfile, seedLanguage } from "./model";

const NOW = new Date("2026-10-24T09:00:00Z");

describe("newProfile", () => {
  it("is a valid profile with empty preferences and onboarding not finished", () => {
    const profile = newProfile(
      "uid-1",
      { email: "new@example.com", fullName: "New User", timezone: "Europe/Berlin", uiLanguage: "de" },
      NOW,
    );
    expect(ProfileSchema.parse(profile)).toEqual(profile);
    expect(profile.onboardingCompletedAt).toBeNull();
    expect(profile.targetRoles).toEqual([]);
  });

  it("records a supported UI language, else English", () => {
    expect(seedLanguage("tr-TR")).toBe("tr");
    expect(seedLanguage("fr-FR")).toBe("en");
  });
});

describe("firstSearchInput", () => {
  it("searches for the first role in the places' countries, daily, alerting for Good and above", () => {
    const input = firstSearchInput(populatedDataset.profile, "Jobs for you");
    expect(input).toEqual({
      name: "Frontend Engineer",
      query: "Frontend Engineer",
      filters: {
        countryCodes: ["TR", "DE", "NL", "GB", "US"],
        remoteTypes: ["remote", "hybrid"],
        seniority: [],
        salaryMin: null,
        sources: [],
        postedWithinDays: null,
        visaSponsorship: null,
      },
      schedule: "daily",
      alertThreshold: 65,
      dailyDigest: false,
      enabled: true,
    });
    // The saved search it becomes is valid and runs on the scheduler's next pass.
    if (input === null) throw new Error("expected a search");
    const { writes } = planCreateSavedSearch(input, NOW, () => "search-1");
    const created = writes[0];
    expect(created?.op === "create" && SavedSearchSchema.parse(created.entity).nextRunAt).toEqual(NOW);
  });

  it("names a places-only search with the fallback and searches any title", () => {
    const input = firstSearchInput(
      {
        targetRoles: [],
        locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE", relocation: true }],
        remotePreferences: [],
      },
      "Jobs for you",
    );
    expect(input?.name).toBe("Jobs for you");
    expect(input?.query).toBe("");
  });

  it("has nothing to search for without a role or a country", () => {
    expect(
      firstSearchInput({ targetRoles: [], locations: [], remotePreferences: ["remote"] }, "x"),
    ).toBeNull();
  });
});
