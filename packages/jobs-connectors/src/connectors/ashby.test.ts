import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { ashby } from "./ashby";

// Fixture: live response of api.ashbyhq.com for the `ramp` board, 2026-10-24, trimmed to 4 jobs.
const URL_RAMP = "https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true";

const job = (extra: Record<string, unknown>) => ({
  id: "1",
  title: "Engineer",
  jobUrl: "https://jobs.ashbyhq.com/acme/1",
  ...extra,
});

describe("ashby", () => {
  it("lists a board and normalizes its jobs", async () => {
    const context = testContext([{ url: URL_RAMP, fixture: "ashby-ramp.json" }]);
    const listings = await ashby.list({ boardToken: "ramp", region: "us" }, context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([URL_RAMP]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(4);
    expect(listings[0]).toMatchObject({
      source: "ashby",
      sourceId: "ramp:34413f8d-26bf-4bbc-8ade-eb309a0e2245",
      url: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
      applyUrl: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application",
      isDirectFromEmployer: true,
      company: "ramp",
      locations: ["New York, NY (HQ)", "Remote (Canada)", "Remote (US)", "Miami, FL"],
      remoteType: "hybrid",
      employmentType: "full_time",
      salary: { min: 211400, max: 290600, currency: "USD", period: "year", estimated: false },
      postedAt: new Date("2026-04-07T17:12:35.753Z"),
      tags: ["Engineering", "Backend"],
    });
    expect(
      listings.slice(1).map((listing) => [listing.remoteType, listing.employmentType, listing.salary]),
    ).toEqual([
      [
        "remote",
        "full_time",
        { min: 190000, max: 330000, currency: "USD", period: "year", estimated: false },
      ],
      [
        "hybrid",
        "internship",
        { min: 12500, max: 12500, currency: "USD", period: "month", estimated: false },
      ],
      [
        "onsite",
        "temporary",
        { min: 145760, max: 200420, currency: "USD", period: "year", estimated: false },
      ],
    ]);
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(4);
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.title).toBe("Security Engineer, Cloud");
    expect(draft?.remoteType).toBe("hybrid");
    expect(draft?.locations[0]?.countryCode).toBe("US");
    expect(draft?.description).not.toMatch(/<|&lt;/);
  });

  it("reads tiers without a summary, skips unlisted jobs and odd compensation", async () => {
    const salary = (currencyCode: string, minValue: number, maxValue: number) => ({
      compensationType: "Salary",
      interval: "1 YEAR",
      currencyCode,
      minValue,
      maxValue,
    });
    const body = JSON.stringify({
      jobs: [
        job({
          compensation: {
            compensationTiers: [
              { components: [salary("EUR", 60000, 70000)] },
              { components: [salary("EUR", 65000, 80000)] },
            ],
          },
        }),
        job({ id: "2", compensation: { summaryComponents: [salary("EUR", 1, 2), salary("GBP", 1, 2)] } }),
        job({ id: "3", isListed: false }),
        job({ id: "4", isRemote: true, compensation: null, location: null }),
      ],
    });
    const context = testContext([{ url: URL_RAMP.replace("ramp", "acme"), body }]);
    const listings = await ashby.list({ boardToken: "acme", region: "us" }, context);
    expect(listings.map((listing) => [listing.sourceId, listing.salary, listing.remoteType])).toEqual([
      ["acme:1", { min: 60000, max: 80000, currency: "EUR", period: "year", estimated: false }, null],
      ["acme:2", null, null],
      ["acme:4", null, "remote"],
    ]);
    expect(listings[2]?.locations).toEqual([]);
  });

  it("reports a missing board and an unexpected payload", async () => {
    const context = testContext([
      { url: URL_RAMP.replace("ramp", "nope"), status: 404, body: "Not Found" },
      { url: URL_RAMP.replace("ramp", "odd"), body: '{"jobs":[{"title":1}]}' },
    ]);
    await expect(ashby.list({ boardToken: "nope", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(ashby.list({ boardToken: "odd", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
