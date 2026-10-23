import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { themuse } from "./themuse";

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
const JOBS = "https://www.themuse.com/api/public/jobs";

describe("themuse", () => {
  it("maps a query naming a Muse category to the category filter", async () => {
    const url = `${JOBS}?page=0&descending=true&category=Software+Engineering`;
    const context = testContext([{ url, fixture: "themuse-category.json" }]);
    const listings = await themuse.search(query("Software Engineer"), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([url]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "themuse",
      sourceId: "19057423",
      url: "https://www.themuse.com/jobs/ansys/spring-2026-intern-electronics-masters-c",
      isDirectFromEmployer: false,
      title: "Spring 2026 Intern - Electronics (Masters), C++",
      company: "Ansys",
      locations: ["Austin, TX", "Canonsburg, PA"],
      remote: null,
      employmentType: "internship",
      postedAt: new Date("2025-07-28T22:44:52Z"),
    });
    for (const listing of listings) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
      expect(draft?.locations[0]?.countryCode).toBe("US");
    }
  });

  it("filters two pages locally when no category matches", async () => {
    const context = testContext([
      { url: `${JOBS}?page=0&descending=true`, fixture: "themuse-page0.json" },
      { url: `${JOBS}?page=1&descending=true`, fixture: "themuse-page1.json" },
    ]);
    const listings = await themuse.search(query("technical product"), context);
    expect(context.fake.calls).toHaveLength(2);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      sourceId: "22229841",
      company: "Atlassian",
      locations: ["Bangalore, India"],
      remote: true,
      url: "https://www.themuse.com/jobs/atlassian/principal-technical-product-manager-commerce-billing-monetization",
    });
  });

  it("asks for remote jobs on remote-only searches and stops at the limit", async () => {
    const url = `${JOBS}?page=0&descending=true&category=Software+Engineering&location=Flexible+%2F+Remote`;
    const context = testContext([{ url, fixture: "themuse-category.json" }]);
    expect(
      await themuse.search(query("software engineering", { remoteTypes: ["remote"] }, 1), context),
    ).toHaveLength(1);
    expect(context.fake.calls[0]?.url).toBe(url);
  });

  it("covers the US, the UK and remote searches", () => {
    expect(themuse.covers(query("x"))).toBe(true);
    expect(themuse.covers(query("x", { countryCodes: ["US"] }))).toBe(true);
    expect(themuse.covers(query("x", { countryCodes: ["DE", "TR"] }))).toBe(false);
    expect(themuse.covers(query("x", { countryCodes: ["DE"], remoteTypes: ["remote"] }))).toBe(true);
    expect(themuse.secrets).toEqual([]);
  });

  it("maps errors", async () => {
    const invalid = testContext([
      { url: `${JOBS}?page=0&descending=true`, body: '{"results":[{"id":"x"}]}' },
    ]);
    await expect(themuse.search(query("anything"), invalid)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    // The Muse answers 403 once the hourly rate limit is used up.
    const limited = testContext([
      { url: `${JOBS}?page=0&descending=true`, status: 403, body: '{"code":403}' },
    ]);
    await expect(themuse.search(query("anything"), limited)).rejects.toMatchObject({ reason: "blocked" });
  });
});
