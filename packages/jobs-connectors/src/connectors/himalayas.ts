import type { EmploymentType, SalaryPeriod } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const HimalayasSearchSchema = z.object({
  jobs: z.array(
    z.object({
      guid: z.string(),
      title: z.string(),
      companyName: z.string(),
      employmentType: z.string().nullish(),
      minSalary: z.number().nullish(),
      maxSalary: z.number().nullish(),
      salaryPeriod: z.string().nullish(),
      currency: z.string().nullish(),
      locationRestrictions: z.array(z.string()).nullish(),
      categories: z.array(z.string()).nullish(),
      description: z.string().nullish(),
      excerpt: z.string().nullish(),
      pubDate: z.number().nullish(),
      expiryDate: z.number().nullish(),
      applicationLink: z.string().nullish(),
    }),
  ),
});

const SEARCH_URL = "https://himalayas.app/jobs/api/search";
const JOB_URL_PREFIX = "https://himalayas.app/companies/";

const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  "full time": "full_time",
  "part time": "part_time",
  contractor: "contract",
  contract: "contract",
  intern: "internship",
  internship: "internship",
  temporary: "temporary",
};
/** Weekly and fortnightly pay have no `SalaryPeriod`; those salaries are dropped. */
const SALARY_PERIODS: Readonly<Record<string, SalaryPeriod>> = {
  annual: "year",
  monthly: "month",
  hourly: "hour",
};

/**
 * Himalayas Remote Jobs API (keyless; docs/integrations/himalayas.md), keyword search endpoint
 * (20 results a page). Terms: Apply must use `applicationLink`, show visible Himalayas credit, never
 * pass the jobs on to other boards or JobPosting structured data.
 */
export const himalayas: SearchConnector = {
  id: "himalayas",
  label: "Himalayas",
  kind: "keyless",
  markets: ["remote"],
  attribution: { label: "Himalayas", url: "https://himalayas.app", minSize: null },
  secrets: [],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.remoteTypes.length === 0 || query.filters.remoteTypes.includes("remote"),
  async search(query, context): Promise<Listing[]> {
    const params = new URLSearchParams();
    if (query.query.trim() !== "") params.set("q", query.query.trim());
    params.set("page", "1");
    const json = await context.http.getJson(`${SEARCH_URL}?${params.toString()}`);
    const parsed = HimalayasSearchSchema.safeParse(json);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Himalayas payload");
    return parsed.data.jobs.slice(0, query.limit).map((job) => {
      const restrictions = job.locationRestrictions ?? [];
      const period = SALARY_PERIODS[job.salaryPeriod ?? "annual"];
      return {
        source: "himalayas",
        sourceId: job.guid.startsWith(JOB_URL_PREFIX) ? job.guid.slice(JOB_URL_PREFIX.length) : job.guid,
        url: job.guid,
        applyUrl: job.applicationLink ?? null,
        isDirectFromEmployer: false,
        title: job.title,
        company: job.companyName,
        locations: [],
        remote: true,
        // An empty list means worldwide.
        remoteEligibility: restrictions.length === 0 ? "Worldwide" : restrictions.join(", "),
        employmentType: EMPLOYMENT_TYPES[(job.employmentType ?? "").toLowerCase()] ?? null,
        salary: period === undefined ? null : salaryRange(job.minSalary, job.maxSalary, job.currency, period),
        description: job.description ?? job.excerpt ?? "",
        postedAt: parseDate(job.pubDate),
        deadline: parseDate(job.expiryDate),
        tags: (job.categories ?? []).map((category) => category.replace(/-/g, " ")),
      };
    });
  },
};
