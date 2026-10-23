import { z } from "zod";
import { parseDate } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const GreenhouseJobsSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string(),
      updated_at: z.string().nullish(),
      first_published: z.string().nullish(),
      application_deadline: z.string().nullish(),
      company_name: z.string().nullish(),
      language: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      offices: z.array(z.object({ name: z.string().nullish(), location: z.string().nullish() })).nullish(),
      content: z.string().nullish(),
    }),
  ),
});

/**
 * Greenhouse Job Board API (keyless; "Job Board data is publicly available").
 * `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` (EU boards on
 * `boards-api.eu.greenhouse.io`).
 */
export const greenhouse: BoardConnector = {
  id: "greenhouse",
  ats: "greenhouse",
  label: "Greenhouse",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Greenhouse", url: "https://www.greenhouse.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const host = board.region === "eu" ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
    const url = `https://${host}/v1/boards/${encodeURIComponent(board.boardToken)}/jobs?content=true`;
    const response = await context.http.request(url, { acceptStatus: [404], headers: { Accept: "application/json" } });
    if (response.status === 404) throw new SourceError("invalid_response", "board not found");
    const parsed = GreenhouseJobsSchema.safeParse(JSON.parse(response.body));
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Greenhouse payload");
    return parsed.data.jobs.map((job) => {
      // `location.name` is the board's wording; offices only fill in when it is empty.
      const named = (job.location?.name ?? "").split(";");
      const locations = (named.some((value) => value.trim() !== "") ? named : (job.offices ?? []).map((office) => office.location ?? office.name ?? ""))
        .map((value) => value.trim())
        .filter((value) => value !== "");
      return {
        source: "greenhouse",
        sourceId: `${board.boardToken}:${job.id}`,
        url: job.absolute_url,
        applyUrl: job.absolute_url,
        isDirectFromEmployer: true,
        title: job.title,
        company: job.company_name ?? board.boardToken,
        locations: [...new Set(locations)],
        description: job.content ?? "",
        postedAt: parseDate(job.first_published ?? job.updated_at),
        deadline: parseDate(job.application_deadline),
        language: job.language === undefined || job.language === null ? null : job.language.slice(0, 2),
      };
    });
  },
};
