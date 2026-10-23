import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { careersPage } from "./careers-page";

// Fixtures: `careers-page-ottonova.html` is a live employer job page (ottonova, served by Personio)
// recorded 2026-10-24 with its body trimmed; `careers-page-graph.html` (multi-posting shapes) and
// `careers-page-challenge.html` (Cloudflare-style interstitial) are constructed.
const OTTONOVA = "https://ottonova.jobs.personio.de/job/2573573";
const NORTHWIND = "https://www.northwind.example/careers";

describe("careersPage", () => {
  it("reads a JobPosting from a live employer page and records robots.txt", async () => {
    const context = testContext([{ url: OTTONOVA, fixture: "careers-page-ottonova.html" }]);
    const listings = await careersPage.list({ boardToken: OTTONOVA, region: "us" }, context);
    // robots.txt is fetched (recorded, not binding) before the page.
    expect(context.fake.calls.map((call) => call.url)).toEqual([
      "https://ottonova.jobs.personio.de/robots.txt",
      OTTONOVA,
    ]);
    expect(context.fake.calls[1]?.headers["accept"]).toContain("text/html");
    expect(context.fake.calls[1]?.headers["cookie"]).toBeUndefined();
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      source: "web",
      sourceId: `${OTTONOVA}#2573573-1421`,
      url: OTTONOVA,
      applyUrl: OTTONOVA,
      isDirectFromEmployer: true,
      title: "(Senior) Aktuar (m/w/d) mit Schwerpunkt Solvency II (20h) (m/w/d)",
      company: "ottonova Holding AG",
      companyDomain: null,
      locations: ["München, Bayern, DE", "Köln, Nordrhein-Westfalen, DE"],
      remoteType: null,
      employmentType: null,
      salary: null,
      postedAt: new Date("2026-09-14"),
      deadline: null,
    });
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    expect(first.description).toMatch(/^<h1>DEIN TEAM<\/h1>/);
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.description).not.toMatch(/<|&nbsp;/);
  });

  it("finds postings in @graph, ItemList and arrays and maps salary, remote and deadline", async () => {
    const context = testContext([{ url: NORTHWIND, fixture: "careers-page-graph.html" }]);
    const listings = await careersPage.list({ boardToken: NORTHWIND, region: "us" }, context);
    expect(listings.map((listing) => listing.title)).toEqual([
      "Senior Backend Engineer (TypeScript)",
      "Data Engineer",
      "Working Student Marketing",
    ]);
    expect(listings[0]).toMatchObject({
      sourceId: "https://www.northwind.example/careers/senior-backend-engineer",
      url: "https://www.northwind.example/careers/senior-backend-engineer",
      company: "Northwind Analytics",
      companyDomain: "northwind.example",
      locations: ["Amsterdam, Netherlands"],
      employmentType: "full_time",
      salary: { min: 70000, max: 90000, currency: "EUR", period: "year", estimated: false },
      postedAt: new Date("2026-10-01"),
      deadline: new Date("2026-12-31T22:59:00Z"),
    });
    expect(listings[1]).toMatchObject({
      sourceId: "https://www.northwind.example/careers/data-engineer",
      company: "Northwind Analytics",
      locations: [],
      remoteType: "remote",
      remoteEligibility: "Germany, Netherlands",
      employmentType: "contract",
      salary: { min: 5500, max: 5500, currency: "EUR", period: "month", estimated: false },
    });
    expect(listings[2]).toMatchObject({
      sourceId: `${NORTHWIND}#NW-305`,
      url: NORTHWIND,
      locations: ["Berlin, Germany"],
      employmentType: null,
      salary: null,
    });
    for (const listing of listings) {
      expect(JobSchema.safeParse({ id: "j", ...toJobDraft(listing, NOW) }).success).toBe(true);
    }
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(draft?.locations[0]?.countryCode).toBe("NL");
    expect(draft?.description).toBe("Build our TypeScript services on Node.js and PostgreSQL.");
  });

  it("returns nothing for a page without postings", async () => {
    const body =
      '<html><head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head></html>';
    const context = testContext([{ url: NORTHWIND, body }]);
    expect(await careersPage.list({ boardToken: NORTHWIND, region: "us" }, context)).toEqual([]);
  });

  it("stops at a bot challenge, a missing page, unreadable postings and non-http URLs", async () => {
    const context = testContext([
      { url: NORTHWIND, status: 403, fixture: "careers-page-challenge.html" },
      { url: `${NORTHWIND}/gone`, status: 404, body: "<html><title>Not found</title></html>" },
      {
        url: `${NORTHWIND}/odd`,
        body: '<script type="application/ld+json">{"@type":"JobPosting","title":{"a":1}}</script>',
      },
    ]);
    await expect(careersPage.list({ boardToken: NORTHWIND, region: "us" }, context)).rejects.toMatchObject({
      reason: "blocked",
    });
    await expect(
      careersPage.list({ boardToken: `${NORTHWIND}/gone`, region: "us" }, context),
    ).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(
      careersPage.list({ boardToken: `${NORTHWIND}/odd`, region: "us" }, context),
    ).rejects.toMatchObject({
      reason: "invalid_response",
    });
    const calls = context.fake.calls.length;
    await expect(
      careersPage.list({ boardToken: "ftp://example.com/jobs", region: "us" }, context),
    ).rejects.toMatchObject({
      reason: "invalid_response",
    });
    expect(context.fake.calls).toHaveLength(calls);
  });
});
