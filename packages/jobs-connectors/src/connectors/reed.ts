import type { EmploymentType } from "@bfhr/core";
import { z } from "zod";
import { salaryRange } from "../listing";
import { type ConnectorSecrets, type Listing, type SearchConnector, SourceError } from "../types";

const ReedJobSchema = z.object({
  jobId: z.number(),
  employerName: z.string().nullish(),
  jobTitle: z.string(),
  locationName: z.string().nullish(),
  minimumSalary: z.number().nullish(),
  maximumSalary: z.number().nullish(),
  currency: z.string().nullish(),
  date: z.string().nullish(),
  expirationDate: z.string().nullish(),
  jobUrl: z.string(),
  jobDescription: z.string().nullish(),
});
const ReedSearchSchema = z.object({ results: z.array(ReedJobSchema) });
const ReedDetailSchema = z.object({
  jobId: z.number(),
  jobDescription: z.string().nullish(),
  externalUrl: z.string().nullish(),
  datePosted: z.string().nullish(),
  expirationDate: z.string().nullish(),
  yearlyMinimumSalary: z.number().nullish(),
  yearlyMaximumSalary: z.number().nullish(),
  currency: z.string().nullish(),
  contractType: z.string().nullish(),
  partTime: z.boolean().nullish(),
  fullTime: z.boolean().nullish(),
});

const CONTRACTS: Record<string, EmploymentType> = { contract: "contract", temporary: "temporary" };

/** Reed's `dd/MM/yyyy` dates (UK order; `Date.parse` would read them as US). */
export function parseReedDate(value: string | null | undefined): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value?.trim() ?? "");
  if (match === null) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function authHeaders(secrets: ConnectorSecrets): Record<string, string> {
  const key = secrets["REED_API_KEY"];
  if (!key) throw new SourceError("no_key", "Reed API key not configured");
  // Basic auth: the key is the username, the password is empty.
  return { Authorization: `Basic ${btoa(`${key}:`)}` };
}

/**
 * Reed Jobseeker API (keyed, HTTP Basic). `GET https://www.reed.co.uk/api/1.0/search` (≤ 100
 * results, truncated descriptions) and `GET /api/1.0/jobs/{jobId}` for the full posting.
 * Docs: https://www.reed.co.uk/developers/jobseeker
 */
export const reed: SearchConnector = {
  id: "reed",
  label: "Reed",
  kind: "keyed",
  markets: ["GB"],
  attribution: { label: "Reed", url: "https://www.reed.co.uk", minSize: null },
  secrets: ["REED_API_KEY"],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.countryCodes.length === 0 || query.filters.countryCodes.includes("GB"),
  async search(query, context): Promise<Listing[]> {
    const headers = authHeaders(context.secrets);
    const params = new URLSearchParams({
      keywords: query.query,
      resultsToTake: String(Math.min(Math.max(query.limit, 1), 100)),
    });
    const salaryMin = query.filters.salaryMin;
    if (salaryMin !== null && salaryMin.currency === "GBP" && salaryMin.period === "year") {
      params.set("minimumSalary", String(Math.round(salaryMin.amount)));
    }
    const parsed = ReedSearchSchema.safeParse(
      await context.http.getJson(`https://www.reed.co.uk/api/1.0/search?${params.toString()}`, { headers }),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Reed payload");
    return parsed.data.results.slice(0, query.limit).map((job) => ({
      source: "reed",
      sourceId: String(job.jobId),
      url: job.jobUrl,
      applyUrl: job.jobUrl,
      isDirectFromEmployer: false,
      title: job.jobTitle,
      company: job.employerName ?? "",
      locations: job.locationName ? [job.locationName] : [],
      // Search results carry no salary type; only yearly-sized figures are read as annual.
      salary:
        (job.minimumSalary ?? job.maximumSalary ?? 0) >= 1_000
          ? salaryRange(job.minimumSalary, job.maximumSalary, job.currency ?? "GBP", "year")
          : null,
      description: job.jobDescription ?? "",
      postedAt: parseReedDate(job.date),
      deadline: parseReedDate(job.expirationDate),
    }));
  },
  async fetchDetail(listing, context): Promise<Listing> {
    const headers = authHeaders(context.secrets);
    if (listing.sourceId === null) return listing;
    const parsed = ReedDetailSchema.safeParse(
      await context.http.getJson(
        `https://www.reed.co.uk/api/1.0/jobs/${encodeURIComponent(listing.sourceId)}`,
        { headers },
      ),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Reed job payload");
    const job = parsed.data;
    // An unknown id returns a blank job rather than 404.
    if (job.jobId === 0) throw new SourceError("invalid_response", "Reed job not found");
    const yearly = salaryRange(
      job.yearlyMinimumSalary,
      job.yearlyMaximumSalary,
      job.currency ?? "GBP",
      "year",
    );
    return {
      ...listing,
      applyUrl: job.externalUrl || listing.applyUrl || listing.url,
      description: job.jobDescription || listing.description,
      salary: yearly ?? listing.salary ?? null,
      employmentType:
        CONTRACTS[(job.contractType ?? "").toLowerCase()] ??
        (job.partTime === true
          ? "part_time"
          : job.fullTime === true
            ? "full_time"
            : (listing.employmentType ?? null)),
      postedAt: parseReedDate(job.datePosted) ?? listing.postedAt ?? null,
      deadline: parseReedDate(job.expirationDate) ?? listing.deadline ?? null,
    };
  },
};
