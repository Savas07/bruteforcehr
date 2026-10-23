import type { EmploymentType } from "@bfhr/core";
import { z } from "zod";
import { parseDate } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const WorkableAccountSchema = z.object({
  name: z.string().nullish(),
  jobs: z.array(
    z.object({
      title: z.string(),
      shortcode: z.string(),
      employment_type: z.string().nullish(),
      telecommuting: z.boolean().nullish(),
      department: z.string().nullish(),
      function: z.string().nullish(),
      url: z.string(),
      application_url: z.string().nullish(),
      published_on: z.string().nullish(),
      created_at: z.string().nullish(),
      country: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      locations: z
        .array(
          z.object({
            country: z.string().nullish(),
            city: z.string().nullish(),
            region: z.string().nullish(),
            hidden: z.boolean().nullish(),
          }),
        )
        .nullish(),
      description: z.string().nullish(),
    }),
  ),
});

/** `employment_type` labels of the job editor, lower-cased. */
const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  "full-time": "full_time",
  "part-time": "part_time",
  contract: "contract",
  temporary: "temporary",
  internship: "internship",
};

/**
 * Workable public jobs widget API (keyless).
 * `GET https://apply.workable.com/api/v1/widget/accounts/{subdomain}?details=true` (the documented
 * `www.workable.com/api/accounts/{subdomain}` redirects here); `details=true` adds descriptions.
 */
export const workable: BoardConnector = {
  id: "workable",
  ats: "workable",
  label: "Workable",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Workable", url: "https://www.workable.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const body = await context.http.getJson(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(board.boardToken)}?details=true`,
    );
    const parsed = WorkableAccountSchema.safeParse(body);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Workable payload");
    const company = parsed.data.name ?? board.boardToken;
    return parsed.data.jobs.map((job) => {
      const places = (job.locations ?? []).filter((place) => place.hidden !== true);
      const locations = (
        places.length > 0 ? places : [{ city: job.city, region: job.state, country: job.country }]
      )
        .map((place) =>
          [place.city, place.region, place.country].filter((part) => (part ?? "").trim() !== "").join(", "),
        )
        .filter((label) => label !== "");
      return {
        source: "workable",
        sourceId: `${board.boardToken}:${job.shortcode}`,
        url: job.url,
        applyUrl: job.application_url ?? job.url,
        isDirectFromEmployer: true,
        title: job.title,
        company,
        locations: [...new Set(locations)],
        remote: job.telecommuting ?? null,
        employmentType: EMPLOYMENT_TYPES[(job.employment_type ?? "").toLowerCase()] ?? null,
        description: job.description ?? "",
        postedAt: parseDate(job.published_on ?? job.created_at),
        tags: [job.department, job.function].filter(
          (tag): tag is string => typeof tag === "string" && tag !== "",
        ),
      };
    });
  },
};
