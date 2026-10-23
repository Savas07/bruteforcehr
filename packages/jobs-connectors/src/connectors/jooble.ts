import type { EmploymentType, SalaryPeriod, SalaryRange } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const JoobleSearchSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      title: z.string(),
      link: z.string(),
      location: z.string().nullish(),
      snippet: z.string().nullish(),
      salary: z.string().nullish(),
      source: z.string().nullish(),
      type: z.string().nullish(),
      company: z.string().nullish(),
      updated: z.string().nullish(),
    }),
  ),
});

/** Jooble country (lower-case ISO code) → `location` sent when the search names no place. */
const COUNTRY_NAMES: Record<string, string> = {
  tr: "Turkey",
  de: "Germany",
  nl: "Netherlands",
  gb: "United Kingdom",
  us: "United States",
};
const EMPLOYMENT: Record<string, EmploymentType> = {
  "full-time": "full_time",
  "part-time": "part_time",
  contract: "contract",
  temporary: "temporary",
  internship: "internship",
};
const CURRENCIES: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₺": "TRY" };

/**
 * `JOOBLE_API_KEYS` (`us=…,de=…,uk=…`) → keys by lower-case country code. Each key belongs to one
 * Jooble country domain (jooble.org = US, de.jooble.org = DE, …); `uk` is Jooble's subdomain for GB.
 */
export function parseJoobleKeys(value: string | null | undefined): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const [rawCode, ...rest] = pair.split("=");
    const code = (rawCode ?? "").trim().toLowerCase();
    const key = rest.join("=").trim();
    if (/^[a-z]{2}$/.test(code) && key !== "") keys[code === "uk" ? "gb" : code] = key;
  }
  return keys;
}

/**
 * Jooble's `salary` text ("{min} - {max} {currency}") as a range, only when it is unambiguous: two
 * figures, a known currency, and a stated period (or yearly-sized figures). Otherwise null.
 */
export function parseJoobleSalary(text: string | null | undefined): SalaryRange | null {
  if (!text) return null;
  const match = /([$€£₺])?\s*([\d.,]+)\s*(k)?\s*[-–]\s*([$€£₺])?\s*([\d.,]+)\s*(k)?\s*([A-Z]{3})?/i.exec(
    text,
  );
  if (match === null) return null;
  const currency = match[7]?.toUpperCase() ?? CURRENCIES[match[1] ?? match[4] ?? ""];
  if (currency === undefined) return null;
  const amount = (digits: string | undefined, thousands: string | undefined) =>
    Number((digits ?? "").replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".")) * (thousands ? 1000 : 1);
  const min = amount(match[2], match[3]);
  const max = amount(match[5], match[6]);
  const lower = text.toLowerCase();
  const period: SalaryPeriod | null = /hour|\/h\b|stunde|saat/.test(lower)
    ? "hour"
    : /day|tag\b|gün/.test(lower)
      ? "day"
      : /month|monat|\bay\b|aylık/.test(lower)
        ? "month"
        : /year|annum|jahr|yıl/.test(lower) || min >= 10_000
          ? "year"
          : null;
  return period === null ? null : salaryRange(min, max, currency, period);
}

/**
 * Jooble REST API (keyed per country domain; free plan: 500 requests per key, lifetime). One
 * `POST https://jooble.org/api/{key}` per search with the key of the first filter country that has
 * one (US without a country filter). Saved searches only (`adHoc: false`).
 * Docs: https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation
 */
export const jooble: SearchConnector = {
  id: "jooble",
  label: "Jooble",
  kind: "keyed",
  markets: ["TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Jooble", url: "https://jooble.org", minSize: null },
  secrets: ["JOOBLE_API_KEYS"],
  adHoc: false,
  callBudget(secrets) {
    const count = Object.keys(parseJoobleKeys(secrets["JOOBLE_API_KEYS"])).length;
    return { limit: 450 * count, period: "lifetime" };
  },
  covers(query) {
    const codes = query.filters.countryCodes;
    return codes.length === 0 || codes.some((code) => code.toLowerCase() in COUNTRY_NAMES);
  },
  async search(query, context): Promise<Listing[]> {
    const keys = parseJoobleKeys(context.secrets["JOOBLE_API_KEYS"]);
    if (Object.keys(keys).length === 0) throw new SourceError("no_key", "no Jooble API key configured");
    const codes = query.filters.countryCodes.map((code) => code.toLowerCase());
    // A key only returns its own country's jobs: never answer a DE search with US listings.
    const country = codes.length === 0 ? "us" : codes.find((code) => keys[code] !== undefined);
    const key = country === undefined ? undefined : keys[country];
    if (country === undefined || key === undefined) return [];
    const body = {
      keywords: query.query,
      location: COUNTRY_NAMES[country] ?? "",
      page: 1,
      ResultOnPage: Math.min(Math.max(query.limit, 1), 100),
      ...(query.filters.salaryMin?.period === "year"
        ? { salary: Math.round(query.filters.salaryMin.amount) }
        : {}),
    };
    const parsed = JoobleSearchSchema.safeParse(
      await context.http.postJson(`https://jooble.org/api/${encodeURIComponent(key)}`, body),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Jooble payload");
    return parsed.data.jobs.slice(0, query.limit).map((job) => ({
      source: "jooble",
      sourceId: `${country}:${job.id}`,
      url: job.link,
      isDirectFromEmployer: false,
      title: job.title.trim(),
      company: job.company ?? "",
      locations: job.location ? [job.location] : [],
      employmentType: EMPLOYMENT[(job.type ?? "").toLowerCase()] ?? null,
      salary: parseJoobleSalary(job.salary),
      description: job.snippet ?? "",
      postedAt: parseDate(job.updated),
    }));
  },
};
