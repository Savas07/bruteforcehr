import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { SourceError } from "../types";
import { lever } from "./lever";

// Fixtures: live responses of api.lever.co (outreach) and api.eu.lever.co (leverdemo), 2026-10-24, trimmed.
const URL_US = "https://api.lever.co/v0/postings/outreach?mode=json";
const URL_EU = "https://api.eu.lever.co/v0/postings/leverdemo?mode=json";

describe("lever", () => {
  it("lists a board and normalizes its postings", async () => {
    const context = testContext([{ url: URL_US, fixture: "lever-outreach.json" }]);
    const listings = await lever.list({ boardToken: "outreach", region: "us" }, context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([URL_US]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(context.fake.calls[0]?.headers["user-agent"]).toMatch(/^BruteForceHR\//);
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "lever",
      sourceId: "outreach:c9d67492-439a-4f98-b9a2-89bd3853d95d",
      url: "https://jobs.lever.co/outreach/c9d67492-439a-4f98-b9a2-89bd3853d95d",
      applyUrl: "https://jobs.lever.co/outreach/c9d67492-439a-4f98-b9a2-89bd3853d95d/apply",
      isDirectFromEmployer: true,
      title: "Account Executive, Commercial",
      company: "outreach",
      locations: ["Seattle, WA"],
      remoteType: "remote",
      employmentType: "full_time",
      salary: { min: 80000, max: 165000, currency: "USD", period: "year", estimated: false },
      postedAt: new Date(1792442441910),
      tags: ["Account Executives", "Sales"],
    });
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(3);
    expect(listings[1]?.remoteType).toBe("hybrid");
    expect(listings[2]).toMatchObject({ locations: ["London"], salary: null, remoteType: "hybrid" });
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    expect(listings[1]?.description).toContain("<h3>Your Daily Adventures Will Include </h3><ul>");
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.remoteType).toBe("remote");
    expect(draft?.locations[0]?.countryCode).toBe("US");
    expect(draft?.description).not.toMatch(/<|&lt;/);
  });

  it("uses the EU API host for EU boards", async () => {
    const context = testContext([{ url: URL_EU, fixture: "lever-leverdemo-eu.json" }]);
    const listings = await lever.list({ boardToken: "leverdemo", region: "eu" }, context);
    expect(context.fake.calls[0]?.url).toBe(URL_EU);
    expect(listings.map((listing) => [listing.sourceId, listing.employmentType, listing.remoteType])).toEqual(
      [
        ["leverdemo:33538a2f-d27d-4a96-8f05-fa4b0e4d940e", "part_time", null],
        ["leverdemo:dbedd284-e008-4961-b75c-e70d284eab5a", "full_time", null],
      ],
    );
    expect(listings[0]?.url).toBe("https://jobs.eu.lever.co/leverdemo/33538a2f-d27d-4a96-8f05-fa4b0e4d940e");
  });

  it("reports a missing board and an unexpected payload", async () => {
    const context = testContext([
      {
        url: URL_US.replace("outreach", "nope"),
        status: 404,
        body: '{"ok":false,"error":"Document not found"}',
      },
      { url: URL_US.replace("outreach", "odd"), body: '{"ok":true}' },
    ]);
    await expect(lever.list({ boardToken: "nope", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(lever.list({ boardToken: "odd", region: "us" }, context)).rejects.toBeInstanceOf(
      SourceError,
    );
  });
});
