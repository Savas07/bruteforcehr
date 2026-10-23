import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { himalayas } from "./himalayas";

const FILTERS: SavedSearchFilters = {
  countryCodes: [],
  remoteTypes: [],
  seniority: [],
  salaryMin: null,
  sources: [],
  postedWithinDays: null,
  visaSponsorship: null,
};
const query = (text: string, filters: Partial<SavedSearchFilters> = {}, limit = 20): SearchQuery => ({
  query: text,
  filters: { ...FILTERS, ...filters },
  limit,
});
const SEARCH = "https://himalayas.app/jobs/api/search?q=typescript&page=1";

describe("himalayas", () => {
  it("uses the keyword search endpoint and maps postings", async () => {
    const context = testContext([{ url: SEARCH, fixture: "himalayas-search.json" }]);
    const listings = await himalayas.search(query(" typescript "), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([SEARCH]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(3);
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(3);
    expect(listings[0]).toMatchObject({
      source: "himalayas",
      sourceId: "crewfare/jobs/full-stack-typescript-developer",
      url: "https://himalayas.app/companies/crewfare/jobs/full-stack-typescript-developer",
      applyUrl:
        "https://himalayas.app/companies/crewfare/jobs/full-stack-typescript-developer?utm_source=api",
      isDirectFromEmployer: false,
      title: "Full Stack TypeScript Developer",
      company: "Crewfare",
      locations: [],
      remote: true,
      remoteEligibility: "Worldwide",
      employmentType: "full_time",
      salary: null,
      postedAt: new Date(1792006232 * 1000),
    });
    expect(listings[1]).toMatchObject({
      remoteEligibility: "United States",
      salary: { min: 130_000, max: 149_500, currency: "USD", period: "year" },
    });
    expect(listings[2]?.remoteEligibility).toBe("Germany");
    for (const listing of listings) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
      // Apply always goes through Himalayas' applicationLink (API terms).
      expect(draft?.applyUrl).toMatch(/^https:\/\/himalayas\.app\/.+utm_source=api$/);
    }
  });

  it("encodes multi-word queries and honours the limit", async () => {
    const url = "https://himalayas.app/jobs/api/search?q=react+engineer&page=1";
    const context = testContext([{ url, fixture: "himalayas-search.json" }]);
    expect(await himalayas.search(query("react engineer", {}, 2), context)).toHaveLength(2);
    expect(context.fake.calls[0]?.url).toBe(url);
  });

  it("covers remote searches only", () => {
    expect(himalayas.covers(query("x"))).toBe(true);
    expect(himalayas.covers(query("x", { remoteTypes: ["remote"] }))).toBe(true);
    expect(himalayas.covers(query("x", { remoteTypes: ["onsite"] }))).toBe(false);
    expect(himalayas.secrets).toEqual([]);
  });

  it("maps errors", async () => {
    const invalid = testContext([{ url: SEARCH, body: '{"jobs":"none"}' }]);
    await expect(himalayas.search(query("typescript"), invalid)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    const limited = testContext([{ url: SEARCH, status: 429, headers: { "retry-after": "3600" }, body: "" }]);
    await expect(himalayas.search(query("typescript"), limited)).rejects.toMatchObject({
      reason: "rate_limited",
    });
  });
});
