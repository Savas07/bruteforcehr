import type { EmploymentType, SalaryPeriod } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const UsajobsSearchSchema = z.object({
  SearchResult: z.object({
    SearchResultItems: z.array(
      z.object({
        MatchedObjectId: z.union([z.string(), z.number()]),
        MatchedObjectDescriptor: z.object({
          PositionTitle: z.string(),
          PositionURI: z.string(),
          ApplyURI: z.array(z.string()).nullish(),
          PositionLocationDisplay: z.string().nullish(),
          PositionLocation: z.array(z.object({ LocationName: z.string().nullish() })).nullish(),
          OrganizationName: z.string().nullish(),
          DepartmentName: z.string().nullish(),
          JobCategory: z.array(z.object({ Name: z.string().nullish() })).nullish(),
          PositionSchedule: z.array(z.object({ Code: z.string().nullish() })).nullish(),
          QualificationSummary: z.string().nullish(),
          PositionRemuneration: z
            .array(
              z.object({
                MinimumRange: z.union([z.string(), z.number()]).nullish(),
                MaximumRange: z.union([z.string(), z.number()]).nullish(),
                RateIntervalCode: z.string().nullish(),
              }),
            )
            .nullish(),
          PublicationStartDate: z.string().nullish(),
          ApplicationCloseDate: z.string().nullish(),
          UserArea: z.object({ Details: z.object({ JobSummary: z.string().nullish() }).nullish() }).nullish(),
        }),
      }),
    ),
  }),
});

/** `RateIntervalCode` → period (bi-weekly and other codes have no equivalent → no salary). */
const PERIODS: Record<string, SalaryPeriod> = { PA: "year", PM: "month", PD: "day", PH: "hour" };
const SCHEDULES: Record<string, EmploymentType> = { "1": "full_time", "2": "part_time" };

/**
 * USAJOBS Search API (keyed: `Authorization-Key` + registered email as `User-Agent`).
 * `GET https://data.usajobs.gov/api/search?Keyword=…&ResultsPerPage=…` (≤ 500 rows per page).
 * Docs: https://developer.usajobs.gov/api-reference/get-api-search, https://developer.usajobs.gov/guides/authentication
 */
export const usajobs: SearchConnector = {
  id: "usajobs",
  label: "USAJOBS",
  kind: "keyed",
  markets: ["US"],
  attribution: { label: "USAJOBS", url: "https://www.usajobs.gov", minSize: null },
  secrets: ["USAJOBS_API_KEY", "USAJOBS_USER_AGENT"],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.countryCodes.length === 0 || query.filters.countryCodes.includes("US"),
  async search(query, context): Promise<Listing[]> {
    const key = context.secrets["USAJOBS_API_KEY"];
    const email = context.secrets["USAJOBS_USER_AGENT"];
    if (!key || !email) throw new SourceError("no_key", "USAJOBS key/email not configured");
    const params = new URLSearchParams({
      Keyword: query.query,
      ResultsPerPage: String(Math.min(Math.max(query.limit, 1), 500)),
    });
    if (query.filters.postedWithinDays !== null)
      params.set("DatePosted", String(Math.min(query.filters.postedWithinDays, 60)));
    if (query.filters.remoteTypes.length === 1 && query.filters.remoteTypes[0] === "remote")
      params.set("RemoteIndicator", "True");
    const parsed = UsajobsSearchSchema.safeParse(
      await context.http.getJson(`https://data.usajobs.gov/api/search?${params.toString()}`, {
        // USAJOBS identifies callers by their registered email in User-Agent. The Host header the docs
        // mention is set by fetch from the URL (it's a forbidden header for callers).
        headers: { "User-Agent": email, "Authorization-Key": key },
      }),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected USAJOBS payload");
    return parsed.data.SearchResult.SearchResultItems.slice(0, query.limit).map(
      ({ MatchedObjectId, MatchedObjectDescriptor: job }) => {
        const pay = job.PositionRemuneration?.[0];
        const period = PERIODS[pay?.RateIntervalCode ?? ""];
        const locations = (job.PositionLocation ?? [])
          .map((location) => location.LocationName ?? "")
          .filter((name) => name !== "");
        return {
          source: "usajobs",
          sourceId: String(MatchedObjectId),
          url: job.PositionURI,
          applyUrl: job.ApplyURI?.[0] ?? job.PositionURI,
          isDirectFromEmployer: true,
          title: job.PositionTitle,
          company: job.OrganizationName ?? job.DepartmentName ?? "",
          locations:
            locations.length > 0
              ? locations
              : job.PositionLocationDisplay
                ? [job.PositionLocationDisplay]
                : [],
          employmentType: SCHEDULES[job.PositionSchedule?.[0]?.Code ?? ""] ?? null,
          salary:
            period === undefined
              ? null
              : salaryRange(Number(pay?.MinimumRange), Number(pay?.MaximumRange), "USD", period),
          description: [job.UserArea?.Details?.JobSummary, job.QualificationSummary]
            .filter(Boolean)
            .join("\n\n"),
          postedAt: parseDate(job.PublicationStartDate),
          deadline: parseDate(job.ApplicationCloseDate),
          tags: (job.JobCategory ?? []).map((category) => category.Name ?? "").filter((name) => name !== ""),
        };
      },
    );
  },
};
