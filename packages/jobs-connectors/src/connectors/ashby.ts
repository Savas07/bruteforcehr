import type { EmploymentType, RemoteType, SalaryPeriod, SalaryRange } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const ComponentSchema = z.object({
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

const AshbyBoardSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.object({ location: z.string().nullish() })).nullish(),
      department: z.string().nullish(),
      team: z.string().nullish(),
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      employmentType: z.string().nullish(),
      descriptionHtml: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      publishedAt: z.string().nullish(),
      jobUrl: z.string(),
      applyUrl: z.string().nullish(),
      compensation: z
        .object({
          compensationTiers: z.array(z.object({ components: z.array(ComponentSchema).nullish() })).nullish(),
          summaryComponents: z.array(ComponentSchema).nullish(),
        })
        .nullish(),
    }),
  ),
});

const WORKPLACES: Readonly<Record<string, RemoteType>> = {
  Remote: "remote",
  Hybrid: "hybrid",
  OnSite: "onsite",
};

const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  FullTime: "full_time",
  PartTime: "part_time",
  Intern: "internship",
  Contract: "contract",
  Temporary: "temporary",
};

const INTERVALS: Readonly<Record<string, SalaryPeriod>> = {
  "1 YEAR": "year",
  "1 MONTH": "month",
  "1 DAY": "day",
  "1 HOUR": "hour",
};

/**
 * The base-salary span across the posting's compensation (summary, else every tier) when all salary
 * components share one currency and interval; equity, bonus and commission are ignored.
 */
function compensationSalary(components: readonly z.infer<typeof ComponentSchema>[]): SalaryRange | null {
  const salaries = components.filter((component) => component.compensationType === "Salary");
  const [first] = salaries;
  const period = INTERVALS[first?.interval ?? ""];
  if (first === undefined || period === undefined) return null;
  if (
    salaries.some((other) => other.currencyCode !== first.currencyCode || other.interval !== first.interval)
  )
    return null;
  const mins = salaries.flatMap((component) =>
    typeof component.minValue === "number" ? [component.minValue] : [],
  );
  const maxes = salaries.flatMap((component) =>
    typeof component.maxValue === "number" ? [component.maxValue] : [],
  );
  return salaryRange(
    mins.length === 0 ? null : Math.min(...mins),
    maxes.length === 0 ? null : Math.max(...maxes),
    first.currencyCode,
    period,
  );
}

/**
 * Ashby Job Postings API (keyless).
 * `GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`.
 */
export const ashby: BoardConnector = {
  id: "ashby",
  ats: "ashby",
  label: "Ashby",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Ashby", url: "https://www.ashbyhq.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const body = await context.http.getJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardToken)}?includeCompensation=true`,
    );
    const parsed = AshbyBoardSchema.safeParse(body);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Ashby payload");
    // Unlisted jobs are reachable by direct link only; the board doesn't show them.
    return parsed.data.jobs
      .filter((job) => job.isListed !== false)
      .map((job) => {
        const locations = [
          job.location,
          ...(job.secondaryLocations ?? []).map((secondary) => secondary.location),
        ]
          .map((value) => (value ?? "").trim())
          .filter((value) => value !== "");
        const compensation = job.compensation;
        const components =
          compensation?.summaryComponents ??
          (compensation?.compensationTiers ?? []).flatMap((tier) => tier.components ?? []);
        return {
          source: "ashby",
          sourceId: `${board.boardToken}:${job.id}`,
          url: job.jobUrl,
          applyUrl: job.applyUrl ?? job.jobUrl,
          isDirectFromEmployer: true,
          title: job.title,
          company: board.boardToken,
          locations: [...new Set(locations)],
          // `isRemote` is also true for hybrid jobs; `workplaceType` tells them apart.
          remoteType: WORKPLACES[job.workplaceType ?? ""] ?? (job.isRemote === true ? "remote" : null),
          employmentType: EMPLOYMENT_TYPES[job.employmentType ?? ""] ?? null,
          salary: compensationSalary(components),
          description: job.descriptionHtml ?? job.descriptionPlain ?? "",
          postedAt: parseDate(job.publishedAt),
          tags: [job.department, job.team].filter(
            (tag): tag is string => typeof tag === "string" && tag !== "",
          ),
        };
      });
  },
};
