import type { JobsSearchResponse, SavedSearch, SavedSearchFilters } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { NO_FILTERS } from "../job-detail/filters";
import {
  ALERT_CADENCES,
  alertCadenceText,
  alertThresholdText,
  buildSavedSearchesModel,
  cadenceOf,
  cadencePatch,
  findSavedSearch,
  newSavedSearchInput,
  runErrorText,
  runResultText,
  savedSearchCriteria,
  savedSearchName,
  savedSearchSummary,
  thresholdOf,
} from "./model";

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const ctx = fixtureContext(populatedDataset);
const filters = (patch: Partial<SavedSearchFilters>): SavedSearchFilters => ({ ...NO_FILTERS, ...patch });
const search = (patch: Partial<SavedSearch>): SavedSearch => ({
  id: "s1",
  name: "react · Remote",
  query: "react",
  filters: NO_FILTERS,
  schedule: "daily",
  alertThreshold: 65,
  dailyDigest: true,
  enabled: true,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  ...patch,
});

describe("savedSearchName", () => {
  it("joins the query with work mode and places", () => {
    expect(savedSearchName("react", filters({ remoteTypes: ["remote"] }), intl)).toBe("react · Remote");
    expect(savedSearchName("  product   designer ", filters({ remoteTypes: ["hybrid"], countryCodes: ["DE", "NL"] }), intl)).toBe(
      "product designer · Hybrid · Germany, Netherlands",
    );
    expect(savedSearchName("go", filters({ countryCodes: ["DE", "NL", "AT"] }), intl)).toBe("go · 3 countries");
    expect(savedSearchName("react", filters({ remoteTypes: ["remote", "hybrid"] }), intl)).toBe("react · Remote or Hybrid");
  });

  it("names a search without query and main filters, and keeps long queries short", () => {
    expect(savedSearchName("", NO_FILTERS, intl)).toBe("All jobs");
    expect(savedSearchName("", filters({ remoteTypes: ["remote"] }), intl)).toBe("Remote");
    const name = savedSearchName("a".repeat(80), NO_FILTERS, intl);
    expect(name).toHaveLength(40);
    expect(name.endsWith("…")).toBe(true);
  });

  it("translates the parts", () => {
    const de = createAppIntl({ language: "de", locale: "de-DE" });
    expect(savedSearchName("react", filters({ countryCodes: ["DE"] }), de)).toBe("react · Deutschland");
  });
});

describe("savedSearchSummary / savedSearchCriteria", () => {
  const fixture = populatedDataset.savedSearches[0];

  it("lists every criterion in filter-bar order", () => {
    expect(fixture && savedSearchSummary(fixture, intl)).toBe(
      "“react typescript frontend” · Remote · Mid-level or Senior · From €55,000 a year · Posted in the last 14 days",
    );
    const relocation = populatedDataset.savedSearches[1];
    expect(relocation && savedSearchSummary(relocation, intl)).toBe(
      "“frontend engineer OR product engineer” · Germany, Netherlands · Hybrid or On-site · Mid-level · Posted in the last 30 days · Visa sponsorship",
    );
  });

  it("labels criteria and says when there is no search text", () => {
    const criteria = savedSearchCriteria(
      { query: " ", filters: filters({ countryCodes: ["DE", "NL", "AT", "CH"], sources: ["remotive"], postedWithinDays: 1 }) },
      intl,
    );
    expect(criteria.map((criterion) => [criterion.key, criterion.label, criterion.value])).toEqual([
      ["query", "Search", "Any job title"],
      ["location", "Location", "Germany, Netherlands +2"],
      ["posted", "Posted", "Posted today or yesterday"],
      ["sources", "Sources", "1 source"],
    ]);
  });
});

describe("cadence and threshold mapping", () => {
  it("maps every cadence to fields and back", () => {
    for (const cadence of ALERT_CADENCES) {
      const patched = search({ ...cadencePatch(cadence) });
      expect(cadenceOf(patched)).toBe(cadence);
    }
    expect(cadencePatch("asTheyArrive")).toEqual({ enabled: true, schedule: "hourly", dailyDigest: false });
    expect(cadencePatch("daily")).toEqual({ enabled: true, schedule: "daily", dailyDigest: true });
    expect(cadencePatch("weekly")).toEqual({ enabled: true, schedule: "weekly", dailyDigest: false });
    // Off keeps the schedule, so turning alerts back on restores it.
    expect(cadencePatch("off")).toEqual({ enabled: false });
    expect(cadenceOf(search({ enabled: false, schedule: "hourly" }))).toBe("off");
  });

  it("describes the alert truthfully", () => {
    expect(alertCadenceText(search({ schedule: "daily", dailyDigest: true }), intl)).toBe("Daily digest");
    expect(alertCadenceText(search({ schedule: "daily", dailyDigest: false }), intl)).toBe("Daily");
    expect(alertCadenceText(search({ schedule: "hourly", dailyDigest: true }), intl)).toBe("As they arrive · daily digest");
    expect(alertCadenceText(search({ schedule: "weekly", enabled: false }), intl)).toBe("Off");
  });

  it("maps thresholds to the match bands and keeps other scores visible", () => {
    expect(thresholdOf(80)).toBe("strong");
    expect(thresholdOf(65)).toBe("good");
    expect(thresholdOf(0)).toBe("all");
    expect(thresholdOf(75)).toBeNull();
    expect(alertThresholdText(65, intl)).toBe("Good and above");
    expect(alertThresholdText(75, intl)).toBe("Score 75 and above");
  });

  it("saves new searches with the default alert", () => {
    expect(newSavedSearchInput(" react ", filters({ remoteTypes: ["remote"] }), intl)).toEqual({
      name: "react · Remote",
      query: "react",
      filters: filters({ remoteTypes: ["remote"] }),
      schedule: "daily",
      alertThreshold: 65,
      dailyDigest: true,
      enabled: true,
    });
  });
});

describe("findSavedSearch", () => {
  const saved = search({ query: "React  Developer", filters: filters({ remoteTypes: ["remote", "hybrid"], countryCodes: ["DE"] }) });

  it("finds the same search whatever the case, spacing and list order", () => {
    expect(findSavedSearch([saved], "react developer", filters({ remoteTypes: ["hybrid", "remote"], countryCodes: ["DE"] }))).toBe(saved);
  });

  it("treats other filters or text as a new search", () => {
    expect(findSavedSearch([saved], "react developer", filters({ remoteTypes: ["remote"], countryCodes: ["DE"] }))).toBeNull();
    expect(findSavedSearch([saved], "react", saved.filters)).toBeNull();
    expect(findSavedSearch([], "react", NO_FILTERS)).toBeNull();
  });
});

describe("Run now", () => {
  const response: JobsSearchResponse = {
    jobIds: [],
    counts: { found: 40, created: 12, updated: 3, matched: 15 },
    sources: [
      { source: "remotive", status: "ok", reason: null, count: 20 },
      { source: "adzuna", status: "skipped", reason: "no_key", count: 0 },
      { source: "jooble", status: "skipped", reason: "no_key", count: 0 },
      { source: "reed", status: "error", reason: "unavailable", count: 0 },
    ],
  };
  const labels = new Map([
    ["adzuna", "Adzuna"],
    ["jooble", "Jooble"],
    ["reed", "Reed"],
  ]);

  it("summarises new jobs and the sources that were left out, by reason", () => {
    expect(runResultText(response, labels, intl)).toBe(
      "12 new jobs · 3 seen before · Adzuna and Jooble skipped: no key · Reed couldn't be searched: didn't respond",
    );
    expect(
      runResultText({ ...response, counts: { found: 0, created: 0, updated: 0, matched: 0 }, sources: [] }, labels, intl),
    ).toBe("No new jobs");
  });

  it("explains callable failures by reason", () => {
    expect(runErrorText({ code: "functions/resource-exhausted", details: { reason: "search_rate_limited" } }, intl)).toBe(
      "You've run a lot of searches today. Try again in a little while.",
    );
    expect(runErrorText(new Error("boom"), intl)).toBe("We couldn't run this search. Check your connection and try again.");
  });
});

describe("buildSavedSearchesModel", () => {
  const model = buildSavedSearchesModel(populatedDataset, ctx);

  it("lists newest first with cadence, threshold and run times", () => {
    expect(model.rows.map((row) => row.id)).toEqual([
      "search-berlin-amsterdam-relocation",
      "search-react-europe-remote",
      "search-istanbul-hybrid",
    ]);
    const off = model.rows.find((row) => row.id === "search-istanbul-hybrid");
    expect(off?.cadence).toBe("off");
    expect(off?.nextRunText).toBe("Alerts off");
    expect(off?.lastRunText).toMatch(/^Checked /u);
    const react = model.rows.find((row) => row.id === "search-react-europe-remote");
    expect(react?.cadenceText).toBe("Daily digest");
    expect(react?.thresholdText).toBe("Strong matches");
    expect(react?.nextRunText).toBe("Next check: Tomorrow, 08:30");
    expect(react?.nextRun?.absolute).toBeTruthy();
  });

  it("marks rows with local writes", () => {
    const pending = buildSavedSearchesModel(populatedDataset, fixtureContext(populatedDataset, ["search-istanbul-hybrid"]));
    expect(pending.rows.find((row) => row.id === "search-istanbul-hybrid")?.pendingSync).toBe(true);
  });
});
