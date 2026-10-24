// Fixtures: no Adzuna key exists yet, so `adzuna-gb-search.json` is the official example response
// from https://developer.adzuna.com/docs/search (both documented ads; the first ad's truncated
// `redirect_url` completed, `salary_is_predicted` of the second set to 1 to cover estimates).
import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { adzuna } from "./adzuna";

const SECRETS = { ADZUNA_APP_ID: "id1", ADZUNA_APP_KEY: "key1" };
const query = (filters: Partial<SavedSearchFilters> = {}, limit = 10): SearchQuery => ({
  query: "javascript developer",
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
const url = (country: string, perPage: number, extra = "") =>
  `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=id1&app_key=key1&results_per_page=${perPage}&what=javascript+developer${extra}&content-type=application%2Fjson`;
const EMPTY = '{"results":[]}';

describe("adzuna", () => {
  it("declares markets without Turkey and the attribution size", () => {
    expect(adzuna.markets).toEqual(expect.arrayContaining(["GB", "US", "DE", "NL"]));
    expect(adzuna.markets).not.toContain("TR");
    expect(adzuna.attribution.minSize).toEqual({ width: 116, height: 23 });
    expect(adzuna.adHoc).toBe(true);
    expect(adzuna.callBudget({})).toBeNull();
    expect(adzuna.covers(query({ countryCodes: ["TR"] }))).toBe(false);
    expect(adzuna.covers(query({ countryCodes: ["TR", "NL"] }))).toBe(true);
    expect(adzuna.covers(query())).toBe(true);
  });

  it("searches a filter country and maps the ads", async () => {
    const context = testContext(
      [{ url: url("gb", 10, "&salary_min=40000&max_days_old=7"), fixture: "adzuna-gb-search.json" }],
      SECRETS,
    );
    const listings = await adzuna.search(
      query({
        countryCodes: ["GB", "TR"],
        salaryMin: { amount: 40000, currency: "GBP", period: "year" },
        postedWithinDays: 7,
      }),
      context,
    );
    expect(context.fake.calls.map((call) => call.url)).toEqual([
      url("gb", 10, "&salary_min=40000&max_days_old=7"),
    ]);
    expect(context.fake.calls[0]?.headers["accept"]).toBe("application/json");
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: "adzuna",
      sourceId: "gb:129698749",
      url: "http://adzuna.co.uk/jobs/land/ad/129698749?v=5A5E1B2C3D4F&utm_medium=api&utm_source=6eda9a47",
      applyUrl:
        "http://adzuna.co.uk/jobs/land/ad/129698749?v=5A5E1B2C3D4F&utm_medium=api&utm_source=6eda9a47",
      isDirectFromEmployer: false,
      title: "Javascript Developer",
      company: "Corporate Project Solutions",
      locations: ["Marlow, Buckinghamshire, UK"],
      salary: { min: 50000, max: 55000, currency: "GBP", period: "year", estimated: false },
      postedAt: new Date("2013-11-08T18:07:39Z"),
      tags: ["IT Jobs"],
    });
    expect(listings[1]).toMatchObject({
      sourceId: "gb:126977586",
      employmentType: "full_time",
      salary: { estimated: true },
    });
    for (const listing of listings) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    }
  });

  it("queries GB, DE and NL without a country filter and respects the limit", async () => {
    const context = testContext(
      [
        { url: url("gb", 1), fixture: "adzuna-gb-search.json" },
        { url: url("de", 1), body: EMPTY },
        { url: url("nl", 1), body: EMPTY },
      ],
      SECRETS,
    );
    const listings = await adzuna.search(query({}, 1), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([url("gb", 1), url("de", 1), url("nl", 1)]);
    expect(listings).toHaveLength(1);
  });

  it("caps a search at three countries", async () => {
    const recorded = ["us", "de", "nl"].map((country) => ({ url: url(country, 4), body: EMPTY }));
    const context = testContext(recorded, SECRETS);
    await adzuna.search(query({ countryCodes: ["US", "DE", "NL", "GB"] }), context);
    expect(context.fake.calls).toHaveLength(3);
  });

  it("throws no_key before any request", async () => {
    const context = testContext([], { ADZUNA_APP_ID: "id1", ADZUNA_APP_KEY: "" });
    await expect(adzuna.search(query(), context)).rejects.toMatchObject({ reason: "no_key" });
    expect(context.fake.calls).toHaveLength(0);
  });

  it("maps a bad key and an unexpected payload", async () => {
    const bad = testContext([{ url: url("gb", 10), status: 401, body: "Unauthorised" }], SECRETS);
    await expect(adzuna.search(query({ countryCodes: ["GB"] }), bad)).rejects.toMatchObject({
      reason: "blocked",
    });
    const odd = testContext([{ url: url("gb", 10), body: '{"results":[{"id":1}]}' }], SECRETS);
    await expect(adzuna.search(query({ countryCodes: ["GB"] }), odd)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
