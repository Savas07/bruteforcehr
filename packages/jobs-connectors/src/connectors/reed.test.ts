// Fixtures: no Reed key exists yet and https://www.reed.co.uk/developers/jobseeker publishes no
// example JSON, so `reed-search.json` / `reed-job.json` are reconstructed from the documented
// return fields (camel-cased JSON names as the API returns them; dates in Reed's dd/MM/yyyy).
import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { SearchQuery } from "../types";
import { parseReedDate, reed } from "./reed";

const SECRETS = { REED_API_KEY: "reed-key" };
const AUTH = `Basic ${btoa("reed-key:")}`;
const query = (filters: Partial<SavedSearchFilters> = {}, limit = 10): SearchQuery => ({
  query: "backend engineer",
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
const URL = "https://www.reed.co.uk/api/1.0/search?keywords=backend+engineer&resultsToTake=10";
const DETAIL = "https://www.reed.co.uk/api/1.0/jobs/55012345";

describe("reed", () => {
  it("parses UK dates", () => {
    expect(parseReedDate("05/12/2026")).toEqual(new Date("2026-12-05T00:00:00Z"));
    expect(parseReedDate("2026-12-05")).toBeNull();
    expect(reed.covers(query({ countryCodes: ["US"] }))).toBe(false);
  });

  it("searches with Basic auth and maps jobs", async () => {
    const context = testContext(
      [{ url: `${URL}&minimumSalary=60000`, fixture: "reed-search.json" }],
      SECRETS,
    );
    const listings = await reed.search(
      query({ salaryMin: { amount: 60000, currency: "GBP", period: "year" } }),
      context,
    );
    expect(context.fake.calls[0]?.url).toBe(`${URL}&minimumSalary=60000`);
    expect(context.fake.calls[0]?.headers["authorization"]).toBe(AUTH);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: "reed",
      sourceId: "55012345",
      url: "https://www.reed.co.uk/jobs/senior-backend-engineer-typescript/55012345",
      applyUrl: "https://www.reed.co.uk/jobs/senior-backend-engineer-typescript/55012345",
      isDirectFromEmployer: false,
      company: "Hays Technology",
      locations: ["Manchester"],
      salary: { min: 65000, max: 80000, currency: "GBP", period: "year" },
      postedAt: new Date("2026-10-21T00:00:00Z"),
      deadline: new Date("2026-12-05T00:00:00Z"),
    });
    expect(listings[1]?.salary).toBeNull();
    for (const listing of listings) {
      expect(JobSchema.safeParse({ id: "j", ...toJobDraft(listing, NOW) }).success).toBe(true);
    }
  });

  it("completes a listing from the job details endpoint", async () => {
    const context = testContext(
      [
        { url: URL, fixture: "reed-search.json" },
        { url: DETAIL, fixture: "reed-job.json" },
      ],
      SECRETS,
    );
    const [first] = await reed.search(query(), context);
    if (first === undefined) throw new Error("no listing");
    const full = await reed.fetchDetail?.(first, context);
    expect(context.fake.calls[1]?.url).toBe(DETAIL);
    expect(context.fake.calls[1]?.headers["authorization"]).toBe(AUTH);
    expect(full).toMatchObject({
      applyUrl: "https://careers.example-fintech.co.uk/jobs/1042",
      employmentType: "full_time",
      salary: { min: 65000, max: 80000 },
    });
    expect(full?.description).toContain("Mentoring two engineers");
    const draft = full === undefined ? null : toJobDraft(full, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.companyDomain).toBe("careers.example-fintech.co.uk");
  });

  it("throws no_key before any request", async () => {
    const context = testContext([], { REED_API_KEY: null });
    await expect(reed.search(query(), context)).rejects.toMatchObject({ reason: "no_key" });
    expect(context.fake.calls).toHaveLength(0);
  });

  it("maps a bad key, a blank job and an unexpected payload", async () => {
    const bad = testContext([{ url: URL, status: 401, body: "" }], SECRETS);
    await expect(reed.search(query(), bad)).rejects.toMatchObject({ reason: "blocked" });
    const odd = testContext([{ url: URL, body: "[]" }], SECRETS);
    await expect(reed.search(query(), odd)).rejects.toMatchObject({ reason: "invalid_response" });
    const blank = testContext([{ url: DETAIL, body: '{"jobId":0}' }], SECRETS);
    const listing = {
      source: "reed",
      sourceId: "55012345",
      url: "https://www.reed.co.uk/jobs/x/55012345",
      isDirectFromEmployer: false,
      title: "X",
      company: "Y",
      locations: [],
      description: "",
    };
    await expect(reed.fetchDetail?.(listing, blank)).rejects.toMatchObject({ reason: "invalid_response" });
  });
});
