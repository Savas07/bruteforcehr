import type { EmploymentType, JobMarket } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const AdzunaSearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      title: z.string(),
      redirect_url: z.string(),
      description: z.string().nullish(),
      created: z.string().nullish(),
      company: z.object({ display_name: z.string().nullish() }).nullish(),
      location: z
        .object({ display_name: z.string().nullish(), area: z.array(z.string()).nullish() })
        .nullish(),
      category: z.object({ label: z.string().nullish(), tag: z.string().nullish() }).nullish(),
      salary_min: z.number().nullish(),
      salary_max: z.number().nullish(),
      salary_is_predicted: z.union([z.number(), z.string(), z.boolean()]).nullish(),
      contract_time: z.string().nullish(),
      contract_type: z.string().nullish(),
    }),
  ),
});

/** Adzuna country endpoint → currency of its salaries ("no Turkey"; ADR 0005). */
const COUNTRIES: Record<string, string> = {
  gb: "GBP",
  us: "USD",
  de: "EUR",
  nl: "EUR",
  at: "EUR",
  au: "AUD",
  be: "EUR",
  br: "BRL",
  ca: "CAD",
  ch: "CHF",
  es: "EUR",
  fr: "EUR",
  in: "INR",
  it: "EUR",
  mx: "MXN",
  nz: "NZD",
  pl: "PLN",
  sg: "SGD",
  za: "ZAR",
};
const DEFAULT_COUNTRIES = ["gb", "de", "nl"];
const EMPLOYMENT: Record<string, EmploymentType> = {
  full_time: "full_time",
  part_time: "part_time",
  contract: "contract",
};

/**
 * Adzuna Search API (keyed: `app_id` + `app_key`). One `GET /v1/api/jobs/{country}/search/1` per
 * covered filter country (≤ 3; GB/DE/NL without a country filter). Descriptions are snippets.
 * Docs: https://developer.adzuna.com/docs/search — terms: https://developer.adzuna.com/docs/terms_of_service
 */
export const adzuna: SearchConnector = {
  id: "adzuna",
  label: "Adzuna",
  kind: "keyed",
  markets: Object.keys(COUNTRIES).map((code) => code.toUpperCase() as JobMarket),
  attribution: { label: "Adzuna", url: "https://www.adzuna.co.uk", minSize: { width: 116, height: 23 } },
  secrets: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  adHoc: true,
  callBudget: () => null,
  covers(query) {
    const codes = query.filters.countryCodes;
    return codes.length === 0 || codes.some((code) => code.toLowerCase() in COUNTRIES);
  },
  async search(query, context): Promise<Listing[]> {
    const appId = context.secrets["ADZUNA_APP_ID"];
    const appKey = context.secrets["ADZUNA_APP_KEY"];
    if (!appId || !appKey) throw new SourceError("no_key", "Adzuna app id/key not configured");
    const filtered = query.filters.countryCodes
      .map((code) => code.toLowerCase())
      .filter((code) => code in COUNTRIES);
    const countries = (query.filters.countryCodes.length === 0 ? DEFAULT_COUNTRIES : filtered).slice(0, 3);
    const perCountry = Math.min(50, Math.max(1, Math.ceil(query.limit / Math.max(1, countries.length))));
    const salaryMin = query.filters.salaryMin;
    const listings: Listing[] = [];
    for (const country of countries) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: String(perCountry),
        what: query.query,
      });
      if (salaryMin !== null && salaryMin.period === "year" && salaryMin.currency === COUNTRIES[country]) {
        params.set("salary_min", String(Math.round(salaryMin.amount)));
      }
      if (query.filters.postedWithinDays !== null)
        params.set("max_days_old", String(query.filters.postedWithinDays));
      params.set("content-type", "application/json");
      const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`;
      const parsed = AdzunaSearchSchema.safeParse(await context.http.getJson(url, { minIntervalMs: 2_000 }));
      if (!parsed.success) throw new SourceError("invalid_response", "unexpected Adzuna payload");
      for (const job of parsed.data.results) {
        const area = job.location?.area ?? [];
        const display = job.location?.display_name ?? "";
        // `area` runs country → town ("UK", "London", …); keep the country so parsing knows it.
        const location =
          display !== "" && area[0] !== undefined && !display.includes(area[0])
            ? `${display}, ${area[0]}`
            : display || [...area].reverse().join(", ");
        const predicted = job.salary_is_predicted;
        listings.push({
          source: "adzuna",
          sourceId: `${country}:${job.id}`,
          url: job.redirect_url,
          applyUrl: job.redirect_url,
          isDirectFromEmployer: false,
          title: job.title.trim(),
          company: job.company?.display_name ?? "",
          locations: location === "" ? [] : [location],
          employmentType:
            job.contract_type === "contract" ? "contract" : (EMPLOYMENT[job.contract_time ?? ""] ?? null),
          salary: salaryRange(
            job.salary_min,
            job.salary_max,
            COUNTRIES[country],
            "year",
            predicted === 1 || predicted === "1" || predicted === true,
          ),
          description: job.description ?? "",
          postedAt: parseDate(job.created),
          tags: job.category?.label ? [job.category.label] : [],
        });
      }
    }
    return listings.slice(0, query.limit);
  },
};
