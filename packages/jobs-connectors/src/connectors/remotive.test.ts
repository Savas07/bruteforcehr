import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, memoryCache, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { parseRemotiveSalary, remotive } from "./remotive";

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
const FEED = "https://remotive.com/api/remote-jobs";

describe("remotive", () => {
  it("fetches the whole feed once, caches it and filters by keywords", async () => {
    const cache = memoryCache();
    const context = { ...testContext([{ url: FEED, fixture: "remotive-jobs.json" }]), cache };
    const listings = await remotive.search(query("tech lead rails"), context);
    expect(context.fake.calls).toHaveLength(1);
    expect(context.fake.calls[0]?.url).toBe(FEED);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      source: "remotive",
      sourceId: "2069746",
      url: "https://remotive.com/remote-jobs/software-development/tech-lead-full-stack-rails-engineer-2069746",
      isDirectFromEmployer: false,
      title: "Tech Lead Full-Stack Rails Engineer",
      company: "Mitre Media",
      locations: [],
      remote: true,
      remoteEligibility: "USA, Canada, USA timezones",
      employmentType: "full_time",
      salary: { min: 170_000, max: 200_000, currency: "USD", period: "year" },
      postedAt: new Date("2026-10-14T20:33:44Z"),
    });
    expect(cache.entries.has("remotive")).toBe(true);

    // A second search within 6 hours is served from the cache.
    const all = await remotive.search(query(""), context);
    expect(context.fake.calls).toHaveLength(1);
    expect(new Set(all.map((listing) => listing.sourceId)).size).toBe(4);
    const perTask = all.find((listing) => listing.sourceId === "2091158");
    expect(perTask?.salary).toBeNull();
    expect(perTask?.employmentType).toBe("contract");
    expect(perTask?.tags?.[0]).toBe("Software Development");
    for (const listing of all) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
      expect(draft?.remoteType).toBe("remote");
    }
    expect(await remotive.search(query("", {}, 2), context)).toHaveLength(2);

    // After the cache expires the next fetch keeps ≥ 30 s from the previous one (> 2/min is blocked).
    cache.entries.clear();
    await remotive.search(query(""), context);
    expect(context.fake.calls).toHaveLength(2);
    expect(context.sleeps).toEqual([30_000]);
  });

  it("allows 4 calls a day, remote searches only", () => {
    expect(remotive.callBudget({})).toEqual({ limit: 4, period: "day" });
    expect(remotive.secrets).toEqual([]);
    expect(remotive.covers(query("x"))).toBe(true);
    expect(remotive.covers(query("x", { remoteTypes: ["remote", "hybrid"] }))).toBe(true);
    expect(remotive.covers(query("x", { remoteTypes: ["onsite"] }))).toBe(false);
  });

  it("parses only clear salary ranges", () => {
    expect(parseRemotiveSalary("$40,000 - $50,000")).toMatchObject({
      min: 40_000,
      max: 50_000,
      currency: "USD",
    });
    expect(parseRemotiveSalary("€60k–80k")).toMatchObject({
      min: 60_000,
      max: 80_000,
      currency: "EUR",
      period: "year",
    });
    expect(parseRemotiveSalary("$30 - $50 per hour")).toMatchObject({ min: 30, max: 50, period: "hour" });
    expect(parseRemotiveSalary("$30 - $50")).toBeNull();
    expect(parseRemotiveSalary("60,000 - 80,000")).toBeNull();
    expect(parseRemotiveSalary("Competitive")).toBeNull();
    expect(parseRemotiveSalary("$1000 per task")).toBeNull();
    expect(parseRemotiveSalary(null)).toBeNull();
  });

  it("rejects an unexpected payload without caching it", async () => {
    const cache = memoryCache();
    const context = { ...testContext([{ url: FEED, body: '{"jobs":[{"id":"x"}]}' }]), cache };
    await expect(remotive.search(query("x"), context)).rejects.toMatchObject({ reason: "invalid_response" });
    expect(cache.entries.size).toBe(0);
    const blocked = testContext([{ url: FEED, status: 403, body: "Forbidden" }]);
    await expect(remotive.search(query("x"), blocked)).rejects.toMatchObject({ reason: "blocked" });
  });
});
