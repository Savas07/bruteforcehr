import type { EmploymentType, SalaryPeriod, SalaryRange } from "@bfhr/core";
import { z } from "zod";
import { matchesQuery, parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const RemotiveFeedSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      title: z.string(),
      company_name: z.string(),
      category: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
      job_type: z.string().nullish(),
      publication_date: z.string().nullish(),
      candidate_required_location: z.string().nullish(),
      salary: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
});

const FEED_URL = "https://remotive.com/api/remote-jobs";
const CACHE_KEY = "remotive";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const JOB_TYPES: Readonly<Record<string, EmploymentType>> = {
  full_time: "full_time",
  part_time: "part_time",
  contract: "contract",
  freelance: "contract",
  internship: "internship",
};
const CURRENCIES: Readonly<Record<string, string>> = {
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
};
const PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  year: "year",
  yr: "year",
  annum: "year",
  annual: "year",
  month: "month",
  hour: "hour",
  hr: "hour",
};
const CURRENCY = String.raw`(\$|€|£|usd|eur|gbp)?\s*`;
const AMOUNT = String.raw`(\d[\d,.]*)\s*(k)?\s*`;
const SALARY_PATTERN = new RegExp(
  String.raw`^\s*${CURRENCY}${AMOUNT}(?:-|–|to)\s*${CURRENCY}${AMOUNT}(?:(?:per|/|a)\s*(year|yr|annum|annual|month|hour|hr))?\s*$`,
  "i",
);

/**
 * Remotive's free-text salary ("$170k - $200k", "$40,000 - $50,000") → a range, only when it is a
 * clear numeric range with a currency; anything else ("$1000 per task", "Competitive") → null.
 */
export function parseRemotiveSalary(text: string | null | undefined): SalaryRange | null {
  const match = SALARY_PATTERN.exec(text ?? "");
  if (match === null) return null;
  const [, currencyLow, low, lowK, currencyHigh, high, highK, periodWord] = match;
  const symbol = (currencyLow ?? currencyHigh ?? "").toLowerCase();
  const currency = CURRENCIES[symbol];
  if (currency === undefined || low === undefined || high === undefined) return null;
  const amount = (digits: string, thousands: string | undefined) =>
    Number(digits.replace(/[,.](?=\d{3}\b)/g, "")) * (thousands === undefined ? 1 : 1000);
  const min = amount(low, lowK ?? highK);
  const max = amount(high, highK);
  const period = periodWord === undefined ? "year" : (PERIODS[periodWord.toLowerCase()] ?? null);
  // Without a stated period, small figures are not a yearly salary: leave them unparsed.
  if (period === null || (periodWord === undefined && max < 1000)) return null;
  return salaryRange(min, max, currency, period);
}

/**
 * Remotive public API (keyless; docs/integrations/remotive.md). Terms: ≤ 4 calls a day (more than
 * 2 a minute are blocked), link back to the Remotive URL and name Remotive, never resubmit the jobs
 * elsewhere. The whole feed is fetched at most every 6 hours, cached for all users, and filtered
 * locally.
 */
export const remotive: SearchConnector = {
  id: "remotive",
  label: "Remotive",
  kind: "keyless",
  markets: ["remote"],
  attribution: { label: "Remotive", url: "https://remotive.com", minSize: null },
  secrets: [],
  adHoc: true,
  callBudget: () => ({ limit: 4, period: "day" }),
  covers: (query) => query.filters.remoteTypes.length === 0 || query.filters.remoteTypes.includes("remote"),
  async search(query, context): Promise<Listing[]> {
    let body = await context.cache.get(CACHE_KEY, CACHE_MAX_AGE_MS);
    const fresh = body === null;
    if (body === null) {
      body = (
        await context.http.getText(FEED_URL, {
          minIntervalMs: 30_000,
          headers: { Accept: "application/json" },
        })
      ).body;
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new SourceError("invalid_response", "Remotive response is not JSON");
    }
    const parsed = RemotiveFeedSchema.safeParse(json);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Remotive payload");
    if (fresh) await context.cache.put(CACHE_KEY, body);
    const listings: Listing[] = [];
    for (const job of parsed.data.jobs) {
      const listing: Listing = {
        source: "remotive",
        sourceId: String(job.id),
        url: job.url,
        isDirectFromEmployer: false,
        title: job.title,
        company: job.company_name,
        locations: [],
        remote: true,
        remoteEligibility: job.candidate_required_location ?? null,
        employmentType: JOB_TYPES[job.job_type ?? ""] ?? null,
        salary: parseRemotiveSalary(job.salary),
        description: job.description ?? "",
        // Remotive publishes UTC times without an offset.
        postedAt: parseDate(job.publication_date ? `${job.publication_date}Z` : null),
        tags: [...(job.category ? [job.category] : []), ...(job.tags ?? [])],
      };
      if (!matchesQuery(listing, query)) continue;
      listings.push(listing);
      if (listings.length >= query.limit) break;
    }
    return listings;
  },
};
