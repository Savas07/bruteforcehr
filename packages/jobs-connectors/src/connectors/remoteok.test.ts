import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, memoryCache, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { remoteok } from "./remoteok";

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
const FEED = "https://remoteok.com/api";

describe("remoteok", () => {
  it("skips the legal notice, caches the feed and maps postings", async () => {
    const cache = memoryCache();
    const context = { ...testContext([{ url: FEED, fixture: "remoteok-api.json" }]), cache };
    const listings = await remoteok.search(query(""), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([FEED]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(4);
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(4);
    expect(listings[0]).toMatchObject({
      source: "remoteok",
      sourceId: "1137557",
      url: "https://remoteOK.com/remote-jobs/remote-senior-devops-engineer-lemon-io-1137557",
      applyUrl: "https://remoteOK.com/remote-jobs/remote-senior-devops-engineer-lemon-io-1137557",
      isDirectFromEmployer: false,
      title: "Senior DevOps Engineer",
      company: "Lemon.io",
      locations: [],
      remote: true,
      remoteEligibility: null,
      salary: { min: 50_000, max: 150_000, currency: "USD", period: "year" },
      postedAt: new Date("2026-10-22T12:58:28Z"),
    });
    expect(listings[1]?.salary).toBeNull();
    expect(listings[2]?.remoteEligibility).toBe("Your Remote US Home Office");
    for (const listing of listings) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    }
    expect(cache.entries.has("remoteok")).toBe(true);

    // Within 6 hours searches read the cache.
    const devops = await remoteok.search(query("devops"), context);
    expect(context.fake.calls).toHaveLength(1);
    expect(devops.map((listing) => listing.sourceId)).toEqual(["1137557"]);
    expect(await remoteok.search(query("", {}, 1), context)).toHaveLength(1);
  });

  it("covers remote searches only", () => {
    expect(remoteok.covers(query("x"))).toBe(true);
    expect(remoteok.covers(query("x", { countryCodes: ["DE"], remoteTypes: ["onsite", "hybrid"] }))).toBe(
      false,
    );
    expect(remoteok.secrets).toEqual([]);
    expect(remoteok.callBudget({})).toBeNull();
  });

  it("rejects payloads that are not the job array", async () => {
    for (const body of ["[]", '{"legal":"notice"}', '[{"legal":"notice"},{"id":1}]', "<html></html>"]) {
      const context = testContext([{ url: FEED, body }]);
      await expect(remoteok.search(query("x"), context)).rejects.toMatchObject({
        reason: "invalid_response",
      });
    }
  });
});
