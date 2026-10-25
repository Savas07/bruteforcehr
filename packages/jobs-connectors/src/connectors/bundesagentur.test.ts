import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { bundesagentur } from "./bundesagentur";

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
const API = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
// The page size follows the query's limit (20 here), up to the API's 100.
const SEARCH = `${API}/pc/v6/jobs?was=Softwareentwickler&size=20&page=1&angebotsart=1`;
// base64("10001-1003891446-S")
const DETAIL = `${API}/pc/v4/jobdetails/MTAwMDEtMTAwMzg5MTQ0Ni1T`;

describe("bundesagentur", () => {
  it("searches Jobsuche v6 with the public client id and maps postings", async () => {
    const context = testContext([{ url: SEARCH, fixture: "bundesagentur-search.json" }]);
    const listings = await bundesagentur.search(query("Softwareentwickler"), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([SEARCH]);
    expect(context.fake.calls[0]?.headers).toMatchObject({
      "x-api-key": "jobboerse-jobsuche",
      accept: "application/json",
    });
    expect(listings).toHaveLength(3);
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(3);
    expect(listings[0]).toMatchObject({
      source: "bundesagentur",
      sourceId: "10001-1003891446-S",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003891446-S",
      applyUrl: null,
      isDirectFromEmployer: false,
      title: "Softwareentwicklerin (w/m/d)",
      company: "GASAG AG",
      locations: ["Berlin, Deutschland"],
      employmentType: "full_time",
      salary: { min: 72_600, max: 72_600, currency: "EUR", period: "year" },
      postedAt: new Date("2026-10-21"),
      description: "",
    });
    expect(listings[1]).toMatchObject({
      sourceId: "12117-YF-48852-YF-S",
      company: "bayoonet AG",
      applyUrl:
        "https://www.yourfirm.de/job/detail/YF-48852/?utm_source=bundesagentur&utm_medium=unpaid-partner&utm_campaign=000",
      salary: null,
    });
    const one = SEARCH.replace("size=20", "size=1");
    const small = testContext([{ url: one, fixture: "bundesagentur-search.json" }]);
    expect(await bundesagentur.search(query("Softwareentwickler", {}, 1), small)).toHaveLength(1);
    expect(small.fake.calls.map((call) => call.url)).toEqual([one]);
  });

  it("completes a listing from the job-details endpoint", async () => {
    const context = testContext([
      { url: SEARCH, fixture: "bundesagentur-search.json" },
      { url: DETAIL, fixture: "bundesagentur-detail.json" },
    ]);
    const [listing] = await bundesagentur.search(query("Softwareentwickler"), context);
    if (listing === undefined) throw new Error("no listing");
    const detailed = await bundesagentur.fetchDetail?.(listing, context);
    expect(context.fake.calls[1]?.url).toBe(DETAIL);
    expect(context.fake.calls[1]?.headers["x-api-key"]).toBe("jobboerse-jobsuche");
    expect(detailed).toMatchObject({ sourceId: listing.sourceId, url: listing.url, company: "GASAG AG" });
    expect(detailed?.description).toContain("Softwareentwicklerin");
    if (detailed === undefined) throw new Error("no detail");
    const draft = toJobDraft(detailed, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.locations[0]).toMatchObject({ city: "Berlin", countryCode: "DE" });
    expect(draft?.language).toBe("de");
  });

  it("covers Germany only", () => {
    expect(bundesagentur.covers(query("x"))).toBe(true);
    expect(bundesagentur.covers(query("x", { countryCodes: ["DE", "NL"] }))).toBe(true);
    expect(bundesagentur.covers(query("x", { countryCodes: ["NL"], remoteTypes: ["remote"] }))).toBe(false);
    expect(bundesagentur.secrets).toEqual([]);
    expect(bundesagentur.callBudget({})).toBeNull();
  });

  it("maps errors", async () => {
    const invalid = testContext([{ url: SEARCH, body: '{"ergebnisliste":"none"}' }]);
    await expect(bundesagentur.search(query("Softwareentwickler"), invalid)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    const gone = testContext([{ url: DETAIL, status: 404, body: "" }]);
    const listing = {
      source: "bundesagentur",
      sourceId: "10001-1003891446-S",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003891446-S",
      isDirectFromEmployer: false,
      title: "t",
      company: "c",
      locations: [],
      description: "",
    };
    await expect(bundesagentur.fetchDetail?.(listing, gone)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    // The retired v4 search path answers 403: surfaced as blocked, not retried.
    const retired = testContext([{ url: SEARCH, status: 403, body: "" }]);
    await expect(bundesagentur.search(query("Softwareentwickler"), retired)).rejects.toMatchObject({
      reason: "blocked",
    });
  });
});
