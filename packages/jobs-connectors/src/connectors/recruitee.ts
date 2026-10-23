import { type EmploymentType, SalaryPeriodSchema } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

/** Salary figures arrive as strings ("100000"). */
const Amount = z.union([z.string(), z.number()]).nullish();

const RecruiteeOffersSchema = z.object({
  offers: z.array(
    z.object({
      id: z.number(),
      slug: z.string().nullish(),
      title: z.string(),
      company_name: z.string().nullish(),
      careers_url: z.string(),
      careers_apply_url: z.string().nullish(),
      location: z.string().nullish(),
      city: z.string().nullish(),
      country: z.string().nullish(),
      country_code: z.string().nullish(),
      locations: z
        .array(
          z.object({
            name: z.string().nullish(),
            city: z.string().nullish(),
            country: z.string().nullish(),
            country_code: z.string().nullish(),
          }),
        )
        .nullish(),
      remote: z.boolean().nullish(),
      hybrid: z.boolean().nullish(),
      on_site: z.boolean().nullish(),
      salary: z
        .object({ min: Amount, max: Amount, period: z.string().nullish(), currency: z.string().nullish() })
        .nullish(),
      description: z.string().nullish(),
      requirements: z.string().nullish(),
      published_at: z.string().nullish(),
      created_at: z.string().nullish(),
      close_at: z.string().nullish(),
      employment_type_code: z.string().nullish(),
      department: z.string().nullish(),
      tags: z.array(z.string()).nullish(),
    }),
  ),
});

/** First part of `employment_type_code` (`fulltime_permanent`, `parttime_fixed_term`, `internship`…). */
const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  fulltime: "full_time",
  parttime: "part_time",
  contract: "contract",
  freelance: "contract",
  internship: "internship",
  traineeship: "internship",
  temporary: "temporary",
};

/**
 * Recruitee Careers Site API (keyless).
 * `GET https://{company}.recruitee.com/api/offers/` — every published offer with its description.
 */
export const recruitee: BoardConnector = {
  id: "recruitee",
  ats: "recruitee",
  label: "Recruitee",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Recruitee", url: "https://recruitee.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const body = await context.http.getJson(
      `https://${encodeURIComponent(board.boardToken)}.recruitee.com/api/offers/`,
    );
    const parsed = RecruiteeOffersSchema.safeParse(body);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Recruitee payload");
    return parsed.data.offers.map((offer) => {
      const places = (offer.locations ?? []).map((place) =>
        [place.city ?? place.name, place.country ?? place.country_code]
          .filter((part) => (part ?? "").trim() !== "")
          .join(", "),
      );
      const fallback =
        offer.location ??
        [offer.city, offer.country ?? offer.country_code].filter((part) => (part ?? "") !== "").join(", ");
      const locations = (places.length > 0 ? places : [fallback]).filter((label) => label !== "");
      const salary = offer.salary;
      const period = SalaryPeriodSchema.safeParse(salary?.period);
      return {
        source: "recruitee",
        sourceId: `${board.boardToken}:${offer.id}`,
        url: offer.careers_url,
        applyUrl: offer.careers_apply_url ?? offer.careers_url,
        isDirectFromEmployer: true,
        title: offer.title,
        company: offer.company_name ?? board.boardToken,
        locations: [...new Set(locations)],
        remoteType:
          offer.remote === true
            ? "remote"
            : offer.hybrid === true
              ? "hybrid"
              : offer.on_site === true
                ? "onsite"
                : null,
        employmentType: EMPLOYMENT_TYPES[(offer.employment_type_code ?? "").split("_")[0] ?? ""] ?? null,
        salary: period.success
          ? salaryRange(Number(salary?.min), Number(salary?.max), salary?.currency, period.data)
          : null,
        description: `${offer.description ?? ""}${offer.requirements ?? ""}`,
        postedAt: parseDate(offer.published_at ?? offer.created_at),
        deadline: parseDate(offer.close_at),
        tags: [...(offer.tags ?? []), ...(offer.department ? [offer.department] : [])],
      };
    });
  },
};
