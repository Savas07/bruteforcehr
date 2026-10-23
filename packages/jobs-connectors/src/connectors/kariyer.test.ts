// Fixtures are trimmed excerpts of real kariyer.net responses fetched on 2026-10-24 with the honest
// UA (no challenge was served). The JSON-LD detail page and the challenge page below are constructed
// inline and labelled as such.
import { JobSchema, type SavedSearchFilters } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, fixture, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import type { Listing, SearchQuery } from "../types";
import { kariyer, parseKariyerDetail, parseKariyerSearch } from "./kariyer";

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
const ROBOTS = { url: "https://www.kariyer.net/robots.txt", fixture: "kariyer-robots.txt" };
const SEARCH = "https://www.kariyer.net/is-ilanlari?kw=yaz%C4%B1l%C4%B1m";
const DETAIL = "https://www.kariyer.net/is-ilani/cassas-sirketler-toplulugu-yazilim-muhendisi-4577984";
const DAY_MS = 86_400_000;

describe("kariyer", () => {
  it("parses a search-result page under robots.txt, skipping sponsored cards", async () => {
    const context = testContext([ROBOTS, { url: SEARCH, fixture: "kariyer-search.html" }]);
    const listings = await kariyer.search(query("yazılım"), context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([ROBOTS.url, SEARCH]);
    expect(context.fake.calls[1]?.headers["user-agent"]).toMatch(/^BruteForceHR\//);
    expect(context.fake.calls[1]?.headers.cookie).toBeUndefined();
    expect(listings.map((listing) => listing.sourceId)).toEqual(["4567119", "4577984", "4494914"]);
    expect(listings[1]).toMatchObject({
      source: "kariyer",
      url: DETAIL,
      isDirectFromEmployer: false,
      title: "Yazılım Mühendisi",
      company: "CASSAS ŞİRKETLER TOPLULUĞU",
      locations: ["Ankara, Türkiye"],
      remote: false,
      employmentType: "full_time",
      postedAt: new Date(NOW.getTime() - 11 * DAY_MS),
      language: "tr",
    });
    expect(listings[2]?.company).toBe("İnci Akü San. ve Tic. A.Ş.");
    for (const listing of listings) {
      const draft = toJobDraft(listing, NOW);
      expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
      expect(draft?.locations[0]?.countryCode).toBe("TR");
    }
    expect(await kariyer.search(query("yazılım", {}, 2), context)).toHaveLength(2);
  });

  it("completes a listing from its posting page, ≥ 5 s after the previous request", async () => {
    const context = testContext([
      ROBOTS,
      { url: SEARCH, fixture: "kariyer-search.html" },
      { url: DETAIL, fixture: "kariyer-detail.html" },
    ]);
    const listing = (await kariyer.search(query("yazılım"), context)).find((entry) => entry.url === DETAIL);
    if (listing === undefined) throw new Error("no listing");
    const detailed = await kariyer.fetchDetail?.(listing, context);
    expect(context.fake.calls.at(-1)?.url).toBe(DETAIL);
    expect(context.sleeps).toEqual([5_000]);
    expect(detailed).toMatchObject({
      sourceId: "4577984",
      company: "CASSAS ŞİRKETLER TOPLULUĞU",
      postedAt: new Date("2026-10-13T00:00:00Z"),
      deadline: new Date("2026-11-11T00:00:00Z"),
    });
    expect(detailed?.description).toContain("Java, Go, Python");
    if (detailed === undefined) throw new Error("no detail");
    const draft = toJobDraft(detailed, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.skills).toEqual(expect.arrayContaining(["Python", "SQL"]));
  });

  it("prefers JobPosting JSON-LD when a posting page has it", () => {
    // Constructed page: kariyer.net posting pages had no JobPosting JSON-LD on 2026-10-24.
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      description: "<p>Backend geliştirici arıyoruz.</p>",
      datePosted: "2026-10-20",
      validThrough: "2026-11-20",
      hiringOrganization: { "@type": "Organization", name: "Örnek A.Ş." },
    })}</script></head><body></body></html>`;
    const listing: Listing = {
      source: "kariyer",
      sourceId: "1",
      url: "https://www.kariyer.net/is-ilani/ornek-1",
      isDirectFromEmployer: false,
      title: "Backend Developer",
      company: "Örnek",
      locations: [],
      description: "",
    };
    expect(parseKariyerDetail(html, listing)).toMatchObject({
      company: "Örnek A.Ş.",
      description: "<p>Backend geliştirici arıyoruz.</p>",
      postedAt: new Date("2026-10-20"),
      deadline: new Date("2026-11-20"),
    });
    expect(() => parseKariyerDetail("<html></html>", listing)).toThrow(/description/);
  });

  it("returns nothing for a no-result page and rejects an unknown layout", async () => {
    const empty = testContext([ROBOTS, { url: SEARCH, fixture: "kariyer-no-result.html" }]);
    expect(await kariyer.search(query("yazılım"), empty)).toEqual([]);
    const changed = testContext([ROBOTS, { url: SEARCH, body: "<html><body>Bakım çalışması</body></html>" }]);
    await expect(kariyer.search(query("yazılım"), changed)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("stops on bot challenges and robots.txt disallows", async () => {
    // Constructed challenge page (PerimeterX-style); never solved, surfaced as blocked.
    const challenge = testContext([
      ROBOTS,
      {
        url: SEARCH,
        status: 403,
        body: '<html><div id="px-captcha"></div>Please verify you are human</html>',
      },
    ]);
    await expect(kariyer.search(query("yazılım"), challenge)).rejects.toMatchObject({ reason: "blocked" });
    const disallowed = testContext([
      { url: ROBOTS.url, body: "User-agent: *\nDisallow: /is-ilanlari\n" },
      { url: SEARCH, fixture: "kariyer-search.html" },
    ]);
    await expect(kariyer.search(query("yazılım"), disallowed)).rejects.toMatchObject({ reason: "blocked" });
    expect(disallowed.fake.calls.map((call) => call.url)).toEqual([ROBOTS.url]);
  });

  it("parses the same listings after the markup is reflowed (line breaks, indentation)", () => {
    // Mimics a formatter or a site-side markup change: one attribute per line, text on its own line.
    const reflow = (html: string) =>
      html
        .replace(/" (?=[A-Za-z:-]+=")/g, '"\n        ')
        .replace(/>(?=[^\s<])/g, ">\n          ")
        .replace(/(?<=[^\s>])</g, "\n        <");
    const raw = parseKariyerSearch(fixture("kariyer-search.html"), NOW);
    expect(parseKariyerSearch(reflow(fixture("kariyer-search.html")), NOW)).toEqual(raw);
    const [, listing] = raw;
    if (listing === undefined) throw new Error("no listing");
    const detail = parseKariyerDetail(reflow(fixture("kariyer-detail.html")), listing);
    expect(detail).toMatchObject({
      company: "CASSAS ŞİRKETLER TOPLULUĞU",
      postedAt: new Date("2026-10-13T00:00:00Z"),
      deadline: new Date("2026-11-11T00:00:00Z"),
    });
    expect(detail.description).toContain("Java, Go, Python");
  });

  it("covers Turkey only", () => {
    expect(kariyer.kind).toBe("scrape");
    expect(kariyer.covers(query("x"))).toBe(true);
    expect(kariyer.covers(query("x", { countryCodes: ["TR", "DE"] }))).toBe(true);
    expect(kariyer.covers(query("x", { countryCodes: ["DE"], remoteTypes: ["remote"] }))).toBe(false);
    expect(kariyer.secrets).toEqual([]);
  });
});
