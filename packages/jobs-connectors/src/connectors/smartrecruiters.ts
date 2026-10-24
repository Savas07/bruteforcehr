import type { EmploymentType } from "@bfhr/core";
import { z } from "zod";
import { parseDate } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE_SIZE = 100;
/** Most postings read per board (two pages); large employers (Bosch: 5,000+) are cut here. */
const MAX_POSTINGS = 200;

const Label = z.object({ label: z.string().nullish() }).nullish();

const PostingListSchema = z.object({
  totalFound: z.number(),
  content: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      releasedDate: z.string().nullish(),
      company: z.object({ name: z.string().nullish() }).nullish(),
      location: z
        .object({
          city: z.string().nullish(),
          region: z.string().nullish(),
          country: z.string().nullish(),
          remote: z.boolean().nullish(),
          hybrid: z.boolean().nullish(),
          fullLocation: z.string().nullish(),
        })
        .nullish(),
      department: Label,
      function: Label,
      typeOfEmployment: Label,
      language: z.object({ code: z.string().nullish() }).nullish(),
    }),
  ),
});

const PostingDetailSchema = z.object({
  postingUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  jobAd: z
    .object({
      sections: z
        .record(z.string(), z.object({ title: z.string().nullish(), text: z.string().nullish() }).nullish())
        .nullish(),
    })
    .nullish(),
});

/** `typeOfEmployment.label`, lower-cased (ids vary per company: `permanent`, `toe_perm`…). */
const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  "full-time": "full_time",
  permanent: "full_time",
  "part-time": "part_time",
  intern: "internship",
  internship: "internship",
  contract: "contract",
  freelance: "contract",
  temporary: "temporary",
};

/** Job-ad sections in display order. */
const SECTIONS = ["companyDescription", "jobDescription", "qualifications", "additionalInformation"] as const;

/**
 * SmartRecruiters Posting API (keyless for public postings).
 * `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?offset&limit` lists postings
 * without their text; `fetchDetail` reads `GET .../postings/{postingId}` (`jobAd.sections`).
 */
export const smartrecruiters: BoardConnector = {
  id: "smartrecruiters",
  ats: "smartrecruiters",
  label: "SmartRecruiters",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "SmartRecruiters", url: "https://www.smartrecruiters.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const company = encodeURIComponent(board.boardToken);
    const listings: Listing[] = [];
    for (let offset = 0; offset < MAX_POSTINGS; offset += PAGE_SIZE) {
      const body = await context.http.getJson(
        `${API}/${company}/postings?offset=${offset}&limit=${PAGE_SIZE}`,
      );
      const parsed = PostingListSchema.safeParse(body);
      if (!parsed.success) throw new SourceError("invalid_response", "unexpected SmartRecruiters payload");
      for (const posting of parsed.data.content) {
        const location = posting.location;
        const place =
          location?.fullLocation ??
          [location?.city, location?.region, location?.country?.toUpperCase()]
            .filter((part) => part !== null && part !== undefined && part !== "")
            .join(", ");
        // Postings are public at jobs.smartrecruiters.com/{company}/{id} (the slug is optional).
        const url = `https://jobs.smartrecruiters.com/${company}/${encodeURIComponent(posting.id)}`;
        listings.push({
          source: "smartrecruiters",
          sourceId: `${board.boardToken}:${posting.id}`,
          url,
          applyUrl: url,
          isDirectFromEmployer: true,
          title: posting.name,
          company: posting.company?.name ?? board.boardToken,
          locations: place === "" ? [] : [place],
          remoteType:
            location?.remote === true
              ? "remote"
              : location?.hybrid === true
                ? "hybrid"
                : location?.remote === false
                  ? "onsite"
                  : null,
          employmentType: EMPLOYMENT_TYPES[(posting.typeOfEmployment?.label ?? "").toLowerCase()] ?? null,
          description: "",
          postedAt: parseDate(posting.releasedDate),
          tags: [posting.function?.label, posting.department?.label].filter(
            (tag): tag is string => typeof tag === "string" && tag !== "",
          ),
          language: posting.language?.code?.slice(0, 2).toLowerCase() ?? null,
        });
      }
      if (parsed.data.content.length === 0 || offset + PAGE_SIZE >= parsed.data.totalFound) break;
    }
    return listings;
  },
  async fetchDetail(listing, context): Promise<Listing> {
    const separator = listing.sourceId?.indexOf(":") ?? -1;
    if (listing.sourceId === null || separator < 1)
      throw new SourceError("invalid_response", "not a SmartRecruiters posting");
    const company = encodeURIComponent(listing.sourceId.slice(0, separator));
    const id = encodeURIComponent(listing.sourceId.slice(separator + 1));
    const parsed = PostingDetailSchema.safeParse(
      await context.http.getJson(`${API}/${company}/postings/${id}`),
    );
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected SmartRecruiters posting");
    const sections = parsed.data.jobAd?.sections ?? {};
    const description = SECTIONS.map((key) => sections[key])
      .filter((section) => (section?.text ?? "").trim() !== "")
      .map((section) => `<h3>${section?.title ?? ""}</h3>${section?.text ?? ""}`)
      .join("\n");
    return {
      ...listing,
      url: parsed.data.postingUrl ?? listing.url,
      applyUrl: parsed.data.applyUrl ?? listing.applyUrl ?? null,
      description,
    };
  },
};
