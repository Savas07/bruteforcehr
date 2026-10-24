import { blankContent } from "../../cv-editor/content";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import {
  addLanguage,
  addLocation,
  addRole,
  applyCvPrefill,
  authorizationAnswer,
  authorizationRegions,
  defaultCurrency,
  draftFromProfile,
  formatAmount,
  MAX_ROLES,
  nameFromEmail,
  newLocation,
  parseAmount,
  preferencesFromDraft,
  prefillFromCv,
  roleSuggestions,
  sectionPatch,
  setAuthorizationAnswer,
  validName,
} from "./model";

const countryName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

describe("draft ↔ profile", () => {
  it("round-trips the persona's preferences", () => {
    const profile = populatedDataset.profile;
    const draft = draftFromProfile(profile, "en-GB");
    expect(draft.salary).toEqual({ amount: "55000", currency: "EUR", period: "year" });
    expect(preferencesFromDraft(draft)).toEqual({
      targetRoles: profile.targetRoles,
      seniority: profile.seniority,
      locations: profile.locations,
      remotePreferences: profile.remotePreferences,
      salaryFloor: profile.salaryFloor,
      workAuthorization: profile.workAuthorization,
      languages: profile.languages,
    });
  });

  it("starts a new salary floor in the locale's currency, Turkish lira per month", () => {
    expect(defaultCurrency("tr-TR")).toBe("TRY");
    expect(defaultCurrency("de-DE")).toBe("EUR");
    expect(defaultCurrency("en-GB")).toBe("GBP");
    expect(draftFromProfile(null, "tr-TR").salary).toEqual({ amount: "", currency: "TRY", period: "month" });
    expect(draftFromProfile(null, "en-US").salary.period).toBe("year");
  });

  it("reads typed amounts with any grouping and treats empty or zero as no floor", () => {
    expect(parseAmount("55.000")).toBe(55_000);
    expect(parseAmount("55,000 ")).toBe(55_000);
    expect(parseAmount("")).toBeNull();
    expect(formatAmount("55000", "de-DE")).toBe("55.000");
    const draft = draftFromProfile(null, "en-GB");
    expect(
      preferencesFromDraft({ ...draft, salary: { ...draft.salary, amount: "0" } }).salaryFloor,
    ).toBeNull();
    expect(
      preferencesFromDraft({ ...draft, salary: { ...draft.salary, amount: "4.500" } }).salaryFloor,
    ).toEqual({
      amount: 4_500,
      currency: "GBP",
      period: "year",
    });
  });

  it("writes only the fields of the section that changed", () => {
    const draft = draftFromProfile(populatedDataset.profile, "en-GB");
    expect(sectionPatch("where", draft)).toEqual({
      locations: populatedDataset.profile.locations,
      remotePreferences: populatedDataset.profile.remotePreferences,
    });
    expect(Object.keys(sectionPatch("salary", draft))).toEqual(["salaryFloor"]);
  });
});

describe("names", () => {
  it("guesses a readable name from the address", () => {
    expect(nameFromEmail("deniz.aksoy@example.com")).toBe("Deniz Aksoy");
    expect(nameFromEmail("e2e-flow-4242@example.com")).toBe("E2e Flow");
    expect(nameFromEmail("1234@example.com")).toBe("1234");
  });

  it("rejects an empty name", () => {
    expect(validName("  ")).toBeNull();
    expect(validName("  Deniz   Aksoy ")).toBe("Deniz Aksoy");
  });
});

describe("roles", () => {
  it("adds trimmed, case-insensitively unique roles up to the limit", () => {
    let roles = addRole([], "  Frontend   Engineer ");
    expect(roles).toEqual(["Frontend Engineer"]);
    expect(addRole(roles, "frontend engineer")).toBe(roles);
    for (const role of ["A", "B", "C", "D", "E"]) roles = addRole(roles, role);
    expect(roles).toHaveLength(MAX_ROLES);
  });

  it("suggests the user's own titles first, never one already picked", () => {
    expect(roleSuggestions("", ["Frontend Engineer"], ["Design Systems Engineer"]).slice(0, 2)).toEqual([
      "Design Systems Engineer",
      "Software Engineer",
    ]);
    expect(roleSuggestions("back", [], [])).toEqual(["Backend Engineer"]);
  });
});

describe("places and work authorization", () => {
  it("adds a place once", () => {
    const berlin = newLocation("DE", "Berlin", true, countryName);
    expect(berlin).toEqual({ label: "Berlin, Germany", city: "Berlin", countryCode: "DE", relocation: true });
    const once = addLocation([], berlin);
    expect(addLocation(once, newLocation("DE", "berlin", false, countryName))).toBe(once);
  });

  it("asks once for the EU and once per other country, keeping answered regions", () => {
    const locations = [
      newLocation("DE", "Berlin", true, countryName),
      newLocation("NL", "", true, countryName),
      newLocation("TR", "Istanbul", false, countryName),
    ];
    expect(authorizationRegions(locations, [{ region: "US", status: "needs_sponsorship" }])).toEqual([
      "EU",
      "TR",
      "US",
    ]);
  });

  it("maps Yes / No / Not sure onto the stored statuses", () => {
    const citizen = [{ region: "TR", status: "citizen" } as const];
    expect(authorizationAnswer(citizen, "TR")).toBe("yes");
    expect(setAuthorizationAnswer(citizen, "TR", "yes")).toEqual(citizen);
    expect(setAuthorizationAnswer([], "EU", "yes")).toEqual([{ region: "EU", status: "work_permit" }]);
    expect(setAuthorizationAnswer(citizen, "TR", "no")).toEqual([
      { region: "TR", status: "needs_sponsorship" },
    ]);
    expect(setAuthorizationAnswer(citizen, "TR", "unsure")).toEqual([]);
    expect(authorizationAnswer([], "GB")).toBe("unsure");
  });
});

describe("from the CV", () => {
  const content = {
    ...blankContent("a4"),
    basics: {
      name: "Deniz Aksoy",
      label: "Frontend Engineer · React",
      location: { city: "Istanbul", countryCode: "tr" },
    },
    work: [{ position: "Product Engineer" }, { position: "Frontend Engineer" }],
    languages: [
      { language: "Turkish", fluency: "Native speaker" },
      { language: "English", fluency: "C1" },
      { language: "Deutsch", fluency: "Grundkenntnisse" },
      { language: "Klingon", fluency: "Fluent" },
    ],
  };

  it("suggests titles, the home place and the languages it names", () => {
    expect(prefillFromCv(content)).toEqual({
      fullName: "Deniz Aksoy",
      roles: ["Frontend Engineer", "Product Engineer"],
      location: { countryCode: "TR", city: "Istanbul" },
      languages: [
        { language: "tr", level: "native" },
        { language: "en", level: "C1" },
        { language: "de", level: "A2" },
      ],
    });
  });

  it("fills only empty sections and reports which", () => {
    const draft = { ...draftFromProfile(null, "en-GB"), fullName: "Deniz", targetRoles: ["Designer"] };
    const { draft: next, filled } = applyCvPrefill(draft, prefillFromCv(content), countryName, true);
    expect(filled).toEqual(["name", "where", "languages"]);
    expect(next.targetRoles).toEqual(["Designer"]);
    expect(next.locations).toEqual([
      { label: "Istanbul, Türkiye", city: "Istanbul", countryCode: "TR", relocation: false },
    ]);
    expect(applyCvPrefill(draft, prefillFromCv(content), countryName, false).filled).not.toContain("name");
  });

  it("adds a language once", () => {
    const one = addLanguage([], "en");
    expect(addLanguage(one, "en")).toBe(one);
  });
});
