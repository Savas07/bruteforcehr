import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { smartrecruiters } from "./smartrecruiters";

// Fixtures: live responses of api.smartrecruiters.com for `BoschGroup` (pages 1–2 and one posting),
// 2026-10-24, trimmed to 3 + 2 postings (`totalFound` kept as recorded: 5087).
const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE_1 = `${API}/BoschGroup/postings?offset=0&limit=100`;
const PAGE_2 = `${API}/BoschGroup/postings?offset=100&limit=100`;
const DETAIL = `${API}/BoschGroup/postings/744000157567254`;

describe("smartrecruiters", () => {
  it("pages through a board up to 200 postings and completes details", async () => {
    const context = testContext([
      { url: PAGE_1, fixture: "smartrecruiters-bosch-p1.json" },
      { url: PAGE_2, fixture: "smartrecruiters-bosch-p2.json" },
      { url: DETAIL, fixture: "smartrecruiters-bosch-detail.json" },
    ]);
    const listings = await smartrecruiters.list({ boardToken: "BoschGroup", region: "us" }, context);
    // 5087 found, but the board is read to offset 200 only.
    expect(context.fake.calls.map((call) => call.url)).toEqual([PAGE_1, PAGE_2]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(5);
    expect(new Set(listings.map((listing) => listing.sourceId)).size).toBe(5);
    expect(listings[0]).toMatchObject({
      source: "smartrecruiters",
      sourceId: "BoschGroup:744000157567254",
      url: "https://jobs.smartrecruiters.com/BoschGroup/744000157567254",
      isDirectFromEmployer: true,
      title: "Coordinador/a Trade Marketing",
      company: "Bosch Group",
      locations: ["Ciudad de México, CDMX, Mexico"],
      remoteType: "onsite",
      employmentType: "full_time",
      description: "",
      postedAt: new Date("2026-10-23T20:49:45.356Z"),
      language: "es",
    });
    expect(listings[2]).toMatchObject({
      locations: ["Norman, OK, United States"],
      remoteType: "remote",
      language: "en",
    });
    expect(listings[4]?.locations).toEqual(["Worcester, England, United Kingdom"]);

    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const detailed = await smartrecruiters.fetchDetail?.(first, context);
    expect(context.fake.calls.at(-1)?.url).toBe(DETAIL);
    expect(detailed).toMatchObject({
      sourceId: "BoschGroup:744000157567254",
      url: "https://jobs.smartrecruiters.com/BoschGroup/744000157567254-coordinador-a-trade-marketing",
      applyUrl:
        "https://jobs.smartrecruiters.com/BoschGroup/744000157567254-coordinador-a-trade-marketing?oga=true",
    });
    // The empty company description section is left out.
    expect(detailed?.description).toMatch(/^<h3>Descripción del empleo<\/h3><p>Responsable/);
    expect(detailed?.description).toContain("<h3>Requisitos</h3>");
    if (detailed === undefined) throw new Error("no detail");
    const draft = toJobDraft(detailed, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.locations[0]?.label).toBe("Ciudad de México, CDMX, Mexico");
    expect(draft?.remoteType).toBe("onsite");
    expect(draft?.description).not.toMatch(/<|&lt;/);
  });

  it("stops after the last page and reads hybrid flags", async () => {
    const body = JSON.stringify({
      offset: 0,
      limit: 100,
      totalFound: 1,
      content: [
        {
          id: "9",
          name: "Engineer",
          location: { city: "Berlin", country: "de", remote: false, hybrid: true },
        },
      ],
    });
    const context = testContext([{ url: `${API}/acme/postings?offset=0&limit=100`, body }]);
    const listings = await smartrecruiters.list({ boardToken: "acme", region: "us" }, context);
    expect(context.fake.calls).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      locations: ["Berlin, DE"],
      remoteType: "hybrid",
      company: "acme",
      employmentType: null,
    });
  });

  it("returns nothing for an unknown company and reports bad payloads", async () => {
    const context = testContext([
      // Unknown companies answer 200 with no postings.
      {
        url: `${API}/nope/postings?offset=0&limit=100`,
        body: '{"offset":0,"limit":100,"totalFound":0,"content":[]}',
      },
      { url: `${API}/odd/postings?offset=0&limit=100`, body: '{"content":"x"}' },
      { url: `${API}/BoschGroup/postings/1`, status: 404, body: '{"message":"Not found"}' },
    ]);
    expect(await smartrecruiters.list({ boardToken: "nope", region: "us" }, context)).toEqual([]);
    await expect(smartrecruiters.list({ boardToken: "odd", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    const gone = {
      source: "smartrecruiters",
      sourceId: "BoschGroup:1",
      url: "https://x.test",
      isDirectFromEmployer: true,
      title: "t",
      company: "c",
      locations: [],
      description: "",
    };
    await expect(smartrecruiters.fetchDetail?.(gone, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
