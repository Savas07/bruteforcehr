import type { EmploymentType } from "@bfhr/core";
import { z } from "zod";
import { matchesQuery, parseDate } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const ArbeitnowJobSchema = z.object({
  slug: z.string(),
  company_name: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  remote: z.boolean().nullish(),
  url: z.string(),
  tags: z.array(z.string()).nullish(),
  job_types: z.array(z.string()).nullish(),
  location: z.string().nullish(),
  created_at: z.number().nullish(),
  visa_sponsorship: z.boolean().nullish(),
});
const ArbeitnowPageSchema = z.object({
  data: z.array(ArbeitnowJobSchema),
  links: z.object({ next: z.string().nullish() }).nullish(),
});
const ArbeitnowFeedSchema = z.array(ArbeitnowJobSchema);

const FEED_URL = "https://www.arbeitnow.com/api/job-board-api";
const CACHE_KEY = "arbeitnow";
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_PAGES = 3;
const MARKETS = ["DE", "AT", "CH", "NL", "FR", "GB", "remote"] as const;

/** Arbeitnow's free-text `job_types` ("Full Time", "Unbefristeter arbeitsvertrag", "internship") → our enum. */
function employmentType(jobTypes: readonly string[]): EmploymentType | null {
  const text = jobTypes.join(" ").toLowerCase();
  if (/intern|praktik|werkstudent|student/.test(text)) return "internship";
  if (/part[ -]?time|teilzeit/.test(text)) return "part_time";
  if (/freelance|contract|freiberuf/.test(text)) return "contract";
  if (/full[ -]?time|vollzeit|permanent|unbefristet|cdi/.test(text)) return "full_time";
  if (/temporary|befristet/.test(text)) return "temporary";
  return null;
}

function parseJson<T>(body: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new SourceError("invalid_response", "Arbeitnow response is not JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SourceError("invalid_response", "unexpected Arbeitnow payload");
  return parsed.data;
}

/**
 * Arbeitnow Job Board API (keyless; docs/integrations/arbeitnow.md). The whole feed (300 jobs a
 * page, newest first) is fetched up to three pages, cached for an hour for all users, and filtered
 * locally with `matchesQuery`.
 */
export const arbeitnow: SearchConnector = {
  id: "arbeitnow",
  label: "Arbeitnow",
  kind: "keyless",
  markets: MARKETS,
  attribution: { label: "Arbeitnow", url: "https://www.arbeitnow.com", minSize: null },
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
    const cached = await context.cache.get(CACHE_KEY, CACHE_MAX_AGE_MS);
    let jobs: z.infer<typeof ArbeitnowFeedSchema>;
    if (cached === null) {
      jobs = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const response = await context.http.getText(`${FEED_URL}?page=${page}`, {
          headers: { Accept: "application/json" },
        });
        const parsed = parseJson(response.body, ArbeitnowPageSchema);
        jobs.push(...parsed.data);
        if (parsed.data.length === 0 || (parsed.links?.next ?? null) === null) break;
      }
      await context.cache.put(CACHE_KEY, JSON.stringify(jobs));
    } else {
      jobs = parseJson(cached, ArbeitnowFeedSchema);
    }
    const listings: Listing[] = [];
    for (const job of jobs) {
      const location = (job.location ?? "").trim();
      const listing: Listing = {
        source: "arbeitnow",
        sourceId: job.slug,
        url: job.url,
        isDirectFromEmployer: false,
        title: job.title,
        company: job.company_name,
        locations: location === "" ? [] : [location],
        remote: job.remote ?? null,
        employmentType: employmentType(job.job_types ?? []),
        description: job.description ?? "",
        postedAt: parseDate(job.created_at),
        tags: job.tags ?? [],
        visaSponsorship: job.visa_sponsorship ?? null,
      };
      if (!matchesQuery(listing, query)) continue;
      listings.push(listing);
      if (listings.length >= query.limit) break;
    }
    return listings;
  },
};
