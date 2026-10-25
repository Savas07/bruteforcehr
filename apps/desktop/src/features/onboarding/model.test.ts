import { ProfileSchema, SavedSearchSchema } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { planCreateSavedSearch } from "../../data/jobs/writes";
import { firstSearchInputs, MAX_FIRST_SEARCHES, newProfile, seedLanguage } from "./model";

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

describe("firstSearchInputs", () => {
  it("searches for each role in the places' countries, daily, alerting for Good and above", () => {
    const inputs = firstSearchInputs(populatedDataset.profile, "Jobs for you");
    expect(inputs.map((input) => input.query)).toEqual(populatedDataset.profile.targetRoles);
    expect(inputs[0]).toEqual({
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
    // The saved searches they become are valid and due at once.
    for (const input of inputs) {
      const { writes } = planCreateSavedSearch(input, NOW, () => "search-1");
      const created = writes[0];
      expect(created?.op === "create" && SavedSearchSchema.parse(created.entity).nextRunAt).toEqual(NOW);
    }
  });

  it("drops blank and repeated roles (any case) and stops at MAX_FIRST_SEARCHES", () => {
    const roles = ["DevOps Engineer", " devops engineer ", "", "SRE", "A", "B", "C", "D"];
    const inputs = firstSearchInputs({ targetRoles: roles, locations: [], remotePreferences: [] }, "x");
    expect(inputs.map((input) => input.query)).toEqual(["DevOps Engineer", "SRE", "A", "B", "C"]);
    expect(inputs).toHaveLength(MAX_FIRST_SEARCHES);
  });

  it("names a places-only search with the fallback and searches any title", () => {
    const inputs = firstSearchInputs(
      {
        targetRoles: [],
        locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE", relocation: true }],
        remotePreferences: [],
      },
      "Jobs for you",
    );
    expect(inputs.map((input) => [input.name, input.query])).toEqual([["Jobs for you", ""]]);
  });

  it("has nothing to search for without a role or a country", () => {
    expect(firstSearchInputs({ targetRoles: [], locations: [], remotePreferences: ["remote"] }, "x")).toEqual(
      [],
    );
  });
});
