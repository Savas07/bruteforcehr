import { z } from "zod";
import { matchesQuery, parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const RemoteOkJobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  url: z.string(),
  apply_url: z.string().nullish(),
  position: z.string(),
  company: z.string(),
  tags: z.array(z.string()).nullish(),
  location: z.string().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  date: z.string().nullish(),
  epoch: z.number().nullish(),
  description: z.string().nullish(),
});
/** The first element is the API's legal notice (`{ last_updated, legal }`), not a job. */
const RemoteOkFeedSchema = z.array(z.unknown()).min(1);

const FEED_URL = "https://remoteok.com/api";
const CACHE_KEY = "remoteok";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Remote OK public API (keyless; docs/integrations/remoteok.md). Terms (in the feed's legal notice):
 * link back to the Remote OK URL (followed link) and name Remote OK as the source; no logo without
 * permission. The whole feed is cached for 6 hours for all users and filtered locally.
 */
export const remoteok: SearchConnector = {
  id: "remoteok",
  label: "Remote OK",
  kind: "keyless",
  markets: ["remote"],
  attribution: { label: "Remote OK", url: "https://remoteok.com", minSize: null },
  secrets: [],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.remoteTypes.length === 0 || query.filters.remoteTypes.includes("remote"),
  async search(query, context): Promise<Listing[]> {
    let body = await context.cache.get(CACHE_KEY, CACHE_MAX_AGE_MS);
    const fresh = body === null;
    if (body === null)
      body = (await context.http.getText(FEED_URL, { headers: { Accept: "application/json" } })).body;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new SourceError("invalid_response", "Remote OK response is not JSON");
    }
    const feed = RemoteOkFeedSchema.safeParse(json);
    const jobs = z.array(RemoteOkJobSchema).safeParse(feed.success ? feed.data.slice(1) : null);
    if (!jobs.success) throw new SourceError("invalid_response", "unexpected Remote OK payload");
    if (fresh) await context.cache.put(CACHE_KEY, body);
    const listings: Listing[] = [];
    for (const job of jobs.data) {
      const location = (job.location ?? "").trim();
      const listing: Listing = {
        source: "remoteok",
        sourceId: String(job.id),
        url: job.url,
        applyUrl: job.apply_url ?? null,
        isDirectFromEmployer: false,
        title: job.position,
        company: job.company,
        locations: [],
        remote: true,
        remoteEligibility: location === "" ? null : location,
        salary: salaryRange(job.salary_min, job.salary_max, "USD", "year"),
        description: job.description ?? "",
        postedAt: parseDate(job.date) ?? parseDate(job.epoch),
        tags: job.tags ?? [],
      };
      if (!matchesQuery(listing, query)) continue;
      listings.push(listing);
      if (listings.length >= query.limit) break;
    }
    return listings;
  },
};
