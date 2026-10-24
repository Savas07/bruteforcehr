// Fixtures: no USAJOBS key exists yet. `usajobs-search.json` holds the official example response
// from https://developer.usajobs.gov/api-reference/get-api-search (first item, long fields cropped
// as in the docs) plus a second item reconstructed exactly from the documented response schema.
import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { usajobs } from "./usajobs";

const SECRETS = { USAJOBS_API_KEY: "KEY123", USAJOBS_USER_AGENT: "owner@example.com" };
const query = (filters: Partial<SavedSearchFilters> = {}, limit = 10): SearchQuery => ({
  query: "it specialist",
  limit,
  filters: {
    countryCodes: [],
    remoteTypes: [],
    seniority: [],
    salaryMin: null,
    sources: [],
    postedWithinDays: null,
    visaSponsorship: null,
    ...filters,
  },
});
const URL = "https://data.usajobs.gov/api/search?Keyword=it+specialist&ResultsPerPage=10";

describe("usajobs", () => {
  it("covers only US searches", () => {
    expect(usajobs.covers(query({ countryCodes: ["DE"] }))).toBe(false);
    expect(usajobs.covers(query({ countryCodes: ["DE", "US"] }))).toBe(true);
    expect(usajobs.covers(query())).toBe(true);
  });

  it("sends the documented headers and maps announcements", async () => {
    const context = testContext([{ url: URL, fixture: "usajobs-search.json" }], SECRETS);
    const listings = await usajobs.search(query(), context);
    const call = context.fake.calls[0];
    expect(call?.url).toBe(URL);
    expect(call?.headers).toMatchObject({
      "user-agent": "owner@example.com",
      "authorization-key": "KEY123",
    });
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: "usajobs",
      sourceId: "21947200",
      url: "https://www.usajobs.gov/GetJob/ViewDetails/21947200",
      applyUrl: "https://www.usajobs.gov/GetJob/ViewDetails/21947200?PostingChannelID=RESTAPI",
      isDirectFromEmployer: true,
      title: "IT SPECIALIST (INFOSEC/NETWORK)",
      company: "Space and Naval Warfare Systems Command",
      locations: ["Point Loma Complex, San Diego, California"],
      employmentType: "full_time",
      salary: { min: 92108, max: 119746, currency: "USD", period: "year" },
      postedAt: new Date("2016-06-05T00:00:00Z"),
      deadline: new Date("2016-12-01T00:00:00Z"),
    });
    expect(listings[0]?.description).toContain("Network and information security specialist");
    expect(listings[1]).toMatchObject({
      locations: ["Washington, District of Columbia", "Atlanta, Georgia"],
      employmentType: "part_time",
      salary: { min: 38.5, max: 50.05, period: "hour" },
    });
    for (const listing of listings) {
      expect(JobSchema.safeParse({ id: "j", ...toJobDraft(listing, NOW) }).success).toBe(true);
    }
  });

  it("applies date and remote filters and the limit", async () => {
    const url =
      "https://data.usajobs.gov/api/search?Keyword=it+specialist&ResultsPerPage=1&DatePosted=60&RemoteIndicator=True";
    const context = testContext([{ url, fixture: "usajobs-search.json" }], SECRETS);
    const listings = await usajobs.search(
      query({ postedWithinDays: 90, remoteTypes: ["remote"] }, 1),
      context,
    );
    expect(listings).toHaveLength(1);
  });

  it("throws no_key before any request", async () => {
    const context = testContext([], { USAJOBS_API_KEY: "KEY123", USAJOBS_USER_AGENT: null });
    await expect(usajobs.search(query(), context)).rejects.toMatchObject({ reason: "no_key" });
    expect(context.fake.calls).toHaveLength(0);
  });

  it("maps a bad key and an unexpected payload", async () => {
    const bad = testContext([{ url: URL, status: 401, body: "" }], SECRETS);
    await expect(usajobs.search(query(), bad)).rejects.toMatchObject({ reason: "blocked" });
    const odd = testContext([{ url: URL, body: '{"SearchResult":{}}' }], SECRETS);
    await expect(usajobs.search(query(), odd)).rejects.toMatchObject({ reason: "invalid_response" });
  });
});
