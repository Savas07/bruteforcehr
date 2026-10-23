import { foldText } from "@bfhr/core";
import { z } from "zod";
import { matchesQuery, parseDate } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const MusePageSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      contents: z.string().nullish(),
      publication_date: z.string().nullish(),
      locations: z.array(z.object({ name: z.string() })).nullish(),
      categories: z.array(z.object({ name: z.string() })).nullish(),
      levels: z.array(z.object({ name: z.string() })).nullish(),
      refs: z.object({ landing_page: z.string() }),
      company: z.object({ name: z.string() }),
    }),
  ),
});

const JOBS_URL = "https://www.themuse.com/api/public/jobs";
const REMOTE_LOCATION = "Flexible / Remote";
const MARKETS = ["US", "GB", "remote"] as const;
/** Pages read (20 jobs each) when the query maps to no category and is filtered locally. */
const FILTER_PAGES = 2;

/**
 * Queries that clearly name one of The Muse's job categories (folded query → category). The API has
 * no free-text search, so only these use `category`; everything else is filtered locally.
 */
const CATEGORIES: Readonly<Record<string, string>> = {
  "software engineer": "Software Engineering",
  "software engineering": "Software Engineering",
  "software developer": "Software Engineering",
  "data science": "Data Science",
  "data scientist": "Data Science",
  "data analyst": "Data and Analytics",
  "data analytics": "Data and Analytics",
  "product manager": "Product Management",
  "product management": "Product Management",
  "project manager": "Project Management",
  "project management": "Project Management",
  "ux designer": "Design and UX",
  "ux design": "Design and UX",
  "product designer": "Design and UX",
  designer: "Design and UX",
  marketing: "Marketing",
  sales: "Sales",
  recruiter: "Recruiting",
  recruiting: "Recruiting",
  accountant: "Accounting",
  accounting: "Accounting",
  "customer service": "Customer Service",
  "customer success": "Account Management/Customer Success",
  "account manager": "Account Management",
  "human resources": "Human Resources and Recruitment",
  "it support": "Computer and IT",
  writer: "Writing and Editing",
  "business operations": "Business Operations",
};

/**
 * The Muse public jobs API (keyless: 500 requests/hour without a key; docs/integrations/themuse.md).
 * Terms: every job links back to themuse.com; no scraping of the site itself.
 */
export const themuse: SearchConnector = {
  id: "themuse",
  label: "The Muse",
  kind: "keyless",
  markets: MARKETS,
  attribution: { label: "The Muse", url: "https://www.themuse.com", minSize: null },
  secrets: [],
  adHoc: true,
  callBudget: () => null,
  covers(query) {
    const { countryCodes, remoteTypes } = query.filters;
    return (
      countryCodes.length === 0 ||
      countryCodes.some((code) => (MARKETS as readonly string[]).includes(code)) ||
      remoteTypes.includes("remote")
    );
  },
  async search(query, context): Promise<Listing[]> {
    const category = CATEGORIES[foldText(query.query).trim()];
    const remoteOnly = query.filters.remoteTypes.length === 1 && query.filters.remoteTypes[0] === "remote";
    const listings: Listing[] = [];
    for (let page = 0; page < (category === undefined ? FILTER_PAGES : 1); page++) {
      const params = new URLSearchParams({ page: String(page), descending: "true" });
      if (category !== undefined) params.set("category", category);
      if (remoteOnly) params.set("location", REMOTE_LOCATION);
      const parsed = MusePageSchema.safeParse(await context.http.getJson(`${JOBS_URL}?${params.toString()}`));
      if (!parsed.success) throw new SourceError("invalid_response", "unexpected The Muse payload");
      for (const job of parsed.data.results) {
        const names = (job.locations ?? []).map((location) => location.name);
        const levels = (job.levels ?? []).map((level) => level.name);
        const listing: Listing = {
          source: "themuse",
          sourceId: String(job.id),
          url: job.refs.landing_page,
          isDirectFromEmployer: false,
          title: job.name,
          company: job.company.name,
          locations: names.filter((name) => name !== REMOTE_LOCATION),
          remote: names.includes(REMOTE_LOCATION) ? true : null,
          employmentType: levels.includes("Internship") ? "internship" : null,
          description: job.contents ?? "",
          postedAt: parseDate(job.publication_date),
          tags: [...(job.categories ?? []).map((entry) => entry.name), ...levels],
        };
        if (category === undefined && !matchesQuery(listing, query)) continue;
        listings.push(listing);
        if (listings.length >= query.limit) return listings;
      }
      if (parsed.data.results.length === 0) break;
    }
    return listings;
  },
};
