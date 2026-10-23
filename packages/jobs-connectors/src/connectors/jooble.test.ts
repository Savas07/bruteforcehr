// Fixtures: no Jooble key exists yet. `jooble-us-search.json` holds the official example response
// from https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation
// (first job, verbatim) plus two jobs reconstructed exactly from the documented response schema.
import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { jooble, parseJoobleKeys, parseJoobleSalary } from "./jooble";

const SECRETS = { JOOBLE_API_KEYS: "us=US-KEY, de=DE-KEY ,uk=UK-KEY" };
const query = (filters: Partial<SavedSearchFilters> = {}, limit = 10): SearchQuery => ({
  query: "typescript engineer",
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

describe("jooble", () => {
  it("parses country keys", () => {
    expect(parseJoobleKeys("us=a,DE=b=c, tr = d ,bad,xx=,=e,uk=f")).toEqual({
      us: "a",
      de: "b=c",
      tr: "d",
      gb: "f",
    });
    expect(parseJoobleKeys(null)).toEqual({});
    expect(parseJoobleKeys("")).toEqual({});
  });

  it("budgets 450 lifetime calls per key, saved searches only", () => {
    expect(jooble.callBudget(SECRETS)).toEqual({ limit: 1350, period: "lifetime" });
    expect(jooble.callBudget({ JOOBLE_API_KEYS: null })).toEqual({ limit: 0, period: "lifetime" });
    expect(jooble.adHoc).toBe(false);
    expect(jooble.covers(query({ countryCodes: ["FR"] }))).toBe(false);
    expect(jooble.covers(query({ countryCodes: ["FR", "TR"] }))).toBe(true);
  });

  it("parses only clear salary ranges", () => {
    expect(parseJoobleSalary("$120k - $150k")).toMatchObject({
      min: 120000,
      max: 150000,
      currency: "USD",
      period: "year",
    });
    expect(parseJoobleSalary("45,000 - 55,000 EUR")).toMatchObject({
      min: 45000,
      max: 55000,
      currency: "EUR",
      period: "year",
    });
    expect(parseJoobleSalary("$60 - $75 per hour")).toMatchObject({ min: 60, max: 75, period: "hour" });
    expect(parseJoobleSalary("17,600 UAH")).toBeNull();
    expect(parseJoobleSalary("3,000 - 4,000")).toBeNull();
    expect(parseJoobleSalary("")).toBeNull();
  });

  it("posts one search with the US key and maps the jobs", async () => {
    const context = testContext(
      [{ url: "https://jooble.org/api/US-KEY", method: "POST", fixture: "jooble-us-search.json" }],
      SECRETS,
    );
    const listings = await jooble.search(query(), context);
    expect(context.fake.calls).toHaveLength(1);
    expect(context.fake.calls[0]?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(context.fake.calls[0]?.body ?? "")).toEqual({
      keywords: "typescript engineer",
      location: "United States",
      page: 1,
      ResultOnPage: 10,
    });
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "jooble",
      sourceId: "us:1234567890",
      url: "https://ua.jooble.org/jdp/12345",
      isDirectFromEmployer: false,
      company: "ABC Corp",
      locations: ["Kyiv"],
      employmentType: "full_time",
      salary: null,
      postedAt: new Date("2023-09-15T12:55:35.387"),
    });
    expect(listings[1]).toMatchObject({
      sourceId: "us:-4711093284110239",
      salary: { min: 120000, max: 150000, currency: "USD", period: "year" },
    });
    expect(listings[2]).toMatchObject({ employmentType: "contract", salary: { period: "hour" } });
    for (const listing of listings) {
      expect(JobSchema.safeParse({ id: "j", ...toJobDraft(listing, NOW) }).success).toBe(true);
    }
  });

  it("uses the first filter country that has a key", async () => {
    const context = testContext(
      [{ url: "https://jooble.org/api/UK-KEY", method: "POST", body: '{"totalCount":0,"jobs":[]}' }],
      SECRETS,
    );
    const salaryMin = { amount: 50000, currency: "GBP" as const, period: "year" as const };
    expect(await jooble.search(query({ countryCodes: ["TR", "GB", "DE"], salaryMin }, 5), context)).toEqual(
      [],
    );
    expect(JSON.parse(context.fake.calls[0]?.body ?? "")).toMatchObject({
      location: "United Kingdom",
      ResultOnPage: 5,
      salary: 50000,
    });
  });

  it("skips filter countries without a key instead of answering from another country", async () => {
    const context = testContext([], SECRETS);
    expect(await jooble.search(query({ countryCodes: ["TR"] }), context)).toEqual([]);
    expect(context.fake.calls).toHaveLength(0);
  });

  it("throws no_key before any request", async () => {
    for (const value of [null, "", "garbage"]) {
      const context = testContext([], { JOOBLE_API_KEYS: value });
      await expect(jooble.search(query(), context)).rejects.toMatchObject({ reason: "no_key" });
      expect(context.fake.calls).toHaveLength(0);
    }
  });

  it("maps a bad key and an unexpected payload", async () => {
    const bad = testContext(
      [{ url: "https://jooble.org/api/US-KEY", method: "POST", status: 403, body: "Access Denied" }],
      SECRETS,
    );
    await expect(jooble.search(query(), bad)).rejects.toMatchObject({ reason: "blocked" });
    const odd = testContext(
      [{ url: "https://jooble.org/api/US-KEY", method: "POST", body: '{"totalCount":1}' }],
      SECRETS,
    );
    await expect(jooble.search(query(), odd)).rejects.toMatchObject({ reason: "invalid_response" });
  });
});
