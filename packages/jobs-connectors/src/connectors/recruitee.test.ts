import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { recruitee } from "./recruitee";

// Fixture: live response of channable.recruitee.com, 2026-10-24, trimmed to 3 offers (screening
// questions and translations removed).
const URL_CHANNABLE = "https://channable.recruitee.com/api/offers/";

describe("recruitee", () => {
  it("lists a company's offers and normalizes them", async () => {
    const context = testContext([{ url: URL_CHANNABLE, fixture: "recruitee-channable.json" }]);
    const listings = await recruitee.list({ boardToken: "channable", region: "us" }, context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([URL_CHANNABLE]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "recruitee",
      sourceId: "channable:2793226",
      url: "https://jobs.channable.com/o/senior-engineering-manager-core",
      applyUrl: "https://jobs.channable.com/o/senior-engineering-manager-core/c/new",
      isDirectFromEmployer: true,
      title: "Senior Engineering Manager - Core",
      company: "Channable",
      locations: ["Utrecht, Netherlands"],
      remoteType: "hybrid",
      employmentType: "full_time",
      salary: { min: 100000, max: 120000, currency: "EUR", period: "year", estimated: false },
      postedAt: new Date("2026-10-22T12:11:23Z"),
      deadline: null,
      tags: ["Engineering"],
    });
    expect(listings[1]?.salary).toEqual({
      min: 4000,
      max: 5700,
      currency: "EUR",
      period: "month",
      estimated: false,
    });
    expect(listings[2]).toMatchObject({
      sourceId: "channable:396939",
      salary: null,
      employmentType: "full_time",
    });
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.locations[0]?.countryCode).toBe("NL");
    expect(draft?.remoteType).toBe("hybrid");
    expect(draft?.companyDomain).toBe("jobs.channable.com");
    expect(draft?.description).not.toMatch(/<|&lt;/);
  });

  it("reads documented flags and codes", async () => {
    const body = JSON.stringify({
      offers: [
        {
          id: 1,
          title: "Engineer",
          careers_url: "https://acme.recruitee.com/o/engineer",
          location: "Berlin, Germany",
          remote: true,
          employment_type_code: "internship",
          salary: { min: "20", max: "30", period: "hour", currency: "eur" },
          close_at: "2026-11-30 23:59:00 UTC",
        },
        {
          id: 2,
          title: "Ops",
          careers_url: "https://acme.recruitee.com/o/ops",
          salary: { min: "1", period: "week", currency: "EUR" },
        },
      ],
    });
    const context = testContext([{ url: URL_CHANNABLE.replace("channable", "acme"), body }]);
    const listings = await recruitee.list({ boardToken: "acme", region: "us" }, context);
    expect(listings[0]).toMatchObject({
      company: "acme",
      locations: ["Berlin, Germany"],
      applyUrl: "https://acme.recruitee.com/o/engineer",
      remoteType: "remote",
      employmentType: "internship",
      salary: { min: 20, max: 30, currency: "EUR", period: "hour" },
      deadline: new Date("2026-11-30T23:59:00Z"),
    });
    expect(listings[1]).toMatchObject({
      locations: [],
      salary: null,
      remoteType: null,
      employmentType: null,
    });
  });

  it("reports a missing company and an unexpected payload", async () => {
    const context = testContext([
      { url: URL_CHANNABLE.replace("channable", "nope"), status: 404, body: '{"error":"Not Found"}' },
      { url: URL_CHANNABLE.replace("channable", "odd"), body: '{"offers":[{"id":"x"}]}' },
    ]);
    await expect(recruitee.list({ boardToken: "nope", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(recruitee.list({ boardToken: "odd", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
