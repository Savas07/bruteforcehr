import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, memoryCache, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { type SearchQuery, SourceError } from "../types";
import { arbeitnow } from "./arbeitnow";

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
const PAGE = "https://www.arbeitnow.com/api/job-board-api?page=";
const RECORDED = [1, 2, 3].map((page) => ({ url: `${PAGE}${page}`, fixture: `arbeitnow-page${page}.json` }));

describe("arbeitnow", () => {
  it("reads up to three feed pages, caches them and filters by keywords", async () => {
    const cache = memoryCache();
    const context = { ...testContext(RECORDED), cache };
    const listings = await arbeitnow.search(query("data scientist"), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([`${PAGE}1`, `${PAGE}2`, `${PAGE}3`]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(context.fake.calls[0]?.headers["user-agent"]).toMatch(/^BruteForceHR\//);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      source: "arbeitnow",
      sourceId: "senior-data-scientist-trust-safety-amsterdam-417890",
      url: "https://www.arbeitnow.nl/jobs/companies/vinteden/senior-data-scientist-trust-safety-amsterdam-417890",
      isDirectFromEmployer: false,
      title: "Senior Data Scientist, Trust & Safety",
      company: "Vinteden",
      locations: ["Amsterdam"],
      remote: false,
      postedAt: new Date(1792756513 * 1000),
    });
    expect(JSON.parse(cache.entries.get("arbeitnow") ?? "[]")).toHaveLength(6);

    // Within the hour every search reads the cached feed: no request.
    const all = await arbeitnow.search(query(""), context);
    expect(context.fake.calls).toHaveLength(3);
    expect(all.map((listing) => listing.sourceId)).toHaveLength(6);
    expect(new Set(all.map((listing) => listing.sourceId)).size).toBe(6);
    const intern = all.find((listing) => listing.company === "HOPn UG");
    expect(intern).toMatchObject({
      remote: true,
      employmentType: "internship",
      tags: ["Remote", "Graphic Arts and Communication Design"],
    });
    expect(all.find((listing) => listing.company === "Deeken.Technology GmbH")?.employmentType).toBe(
      "full_time",
    );
    for (const listing of all) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    }
    expect((await arbeitnow.search(query("", {}, 2), context)).length).toBe(2);
  });

  it("covers Germany, its European markets and remote searches", () => {
    expect(arbeitnow.covers(query("x"))).toBe(true);
    expect(arbeitnow.covers(query("x", { countryCodes: ["DE"] }))).toBe(true);
    expect(arbeitnow.covers(query("x", { countryCodes: ["TR"] }))).toBe(false);
    expect(arbeitnow.covers(query("x", { countryCodes: ["TR"], remoteTypes: ["remote"] }))).toBe(true);
    expect(arbeitnow.secrets).toEqual([]);
    expect(arbeitnow.callBudget({})).toBeNull();
  });

  it("rejects an unexpected payload without caching it", async () => {
    const cache = memoryCache();
    const context = { ...testContext([{ url: `${PAGE}1`, body: '{"data":"nope"}' }]), cache };
    await expect(arbeitnow.search(query("x"), context)).rejects.toMatchObject({ reason: "invalid_response" });
    expect(cache.entries.size).toBe(0);
    const html = testContext([{ url: `${PAGE}1`, body: "<html>maintenance</html>" }]);
    await expect(arbeitnow.search(query("x"), html)).rejects.toBeInstanceOf(SourceError);
  });
});
