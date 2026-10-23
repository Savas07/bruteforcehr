import type { EmploymentType, RemoteType, SalaryPeriod } from "@bfhr/core";
import { z } from "zod";
import { parseDate, salaryRange } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const LeverPostingsSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    applyUrl: z.string().nullish(),
    createdAt: z.number().nullish(),
    workplaceType: z.string().nullish(),
    categories: z
      .object({
        location: z.string().nullish(),
        allLocations: z.array(z.string()).nullish(),
        commitment: z.string().nullish(),
        team: z.string().nullish(),
        department: z.string().nullish(),
      })
      .nullish(),
    description: z.string().nullish(),
    descriptionPlain: z.string().nullish(),
    lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
    additional: z.string().nullish(),
    salaryRange: z
      .object({
        min: z.number().nullish(),
        max: z.number().nullish(),
        currency: z.string().nullish(),
        interval: z.string().nullish(),
      })
      .nullish(),
  }),
);

/** `salaryRange.interval` values; `per-week-salary` and `one-time` have no matching period. */
const INTERVALS: Readonly<Record<string, SalaryPeriod>> = {
  "per-year-salary": "year",
  "per-month-salary": "month",
  "per-day-wage": "day",
  "per-hour-wage": "hour",
};

/** `categories.commitment` is free text per company ("Full-time", "Permanent", "Part time", "Intern"). */
const COMMITMENTS: readonly (readonly [EmploymentType, RegExp])[] = [
  ["internship", /intern|praktik|apprentice|trainee/i],
  ["part_time", /part[\s-]?time|teilzeit/i],
  ["contract", /contract|freelance/i],
  ["temporary", /temporary|fixed[\s-]?term|befristet/i],
  ["full_time", /full[\s-]?time|permanent|vollzeit|regular/i],
];

/** `workplaceType` (documented as `on-site`, served as `onsite`; `unspecified` → wording decides). */
const WORKPLACES: Readonly<Record<string, RemoteType>> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
  "on-site": "onsite",
};

/**
 * Lever Postings API (keyless; published postings are public).
 * `GET https://api.lever.co/v0/postings/{site}?mode=json` (EU instance: `api.eu.lever.co`).
 */
export const lever: BoardConnector = {
  id: "lever",
  ats: "lever",
  label: "Lever",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Lever", url: "https://www.lever.co", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const host = board.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const body = await context.http.getJson(
      `https://${host}/v0/postings/${encodeURIComponent(board.boardToken)}?mode=json`,
    );
    const parsed = LeverPostingsSchema.safeParse(body);
    if (!parsed.success) throw new SourceError("invalid_response", "unexpected Lever payload");
    return parsed.data.map((posting) => {
      const categories = posting.categories;
      const locations = categories?.allLocations ?? (categories?.location ? [categories.location] : []);
      const lists = (posting.lists ?? [])
        .map((list) => `<h3>${list.text ?? ""}</h3><ul>${list.content ?? ""}</ul>`)
        .join("");
      const salary = posting.salaryRange;
      const period = INTERVALS[salary?.interval ?? ""];
      const commitment = categories?.commitment ?? "";
      return {
        source: "lever",
        sourceId: `${board.boardToken}:${posting.id}`,
        url: posting.hostedUrl,
        applyUrl: posting.applyUrl ?? posting.hostedUrl,
        isDirectFromEmployer: true,
        title: posting.text,
        company: board.boardToken,
        locations: [...new Set(locations.map((value) => value.trim()).filter((value) => value !== ""))],
        remoteType: WORKPLACES[posting.workplaceType ?? ""] ?? null,
        employmentType: COMMITMENTS.find(([, pattern]) => pattern.test(commitment))?.[0] ?? null,
        salary: period === undefined ? null : salaryRange(salary?.min, salary?.max, salary?.currency, period),
        description: `${posting.description ?? posting.descriptionPlain ?? ""}${lists}${posting.additional ?? ""}`,
        postedAt: parseDate(posting.createdAt),
        tags: [categories?.team, categories?.department].filter(
          (tag): tag is string => typeof tag === "string" && tag !== "",
        ),
      };
    });
  },
};
