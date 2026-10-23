import { type EmploymentType, htmlToText } from "@bfhr/core";
import { z } from "zod";
import { parseDate } from "../listing";
import { type Listing, type SearchConnector, SourceError } from "../types";

const ORIGIN = "https://www.kariyer.net";
/** ADR 0005 scraping limits: robots.txt binding, ≤ 1 request per 5 s, honest UA, no cookies. */
const REQUEST = { robots: "binding", minIntervalMs: 5_000 } as const;
const HOUR_MS = 60 * 60 * 1000;

const WORK_TYPES: Readonly<Record<string, EmploymentType>> = {
  FullTime: "full_time",
  PartTime: "part_time",
  Freelance: "contract",
  Internship: "internship",
  Seasonal: "temporary",
};
const WORK_MODELS: Readonly<Record<string, boolean>> = { "İş Yerinde": false, "Uzaktan / Remote": true };

const JobPostingSchema = z.object({
  "@type": z.union([z.string(), z.array(z.string())]),
  description: z.string().nullish(),
  datePosted: z.string().nullish(),
  validThrough: z.string().nullish(),
  hiringOrganization: z.object({ name: z.string().nullish() }).nullish(),
});

/** Text of the first element carrying `data-test="{name}"` (no nested tags), entity-decoded, whitespace collapsed. */
function testIdText(html: string, name: string): string | null {
  const match = new RegExp(`\\bdata-test="${name}"[^>]*>([^<]*)<`).exec(html);
  const text = match?.[1] === undefined ? "" : htmlToText(match[1]).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** "11 gün" / "3 saat" / "Bugün" (card age) → a date; "Son gün" (last day to apply) and others → null. */
function cardAge(text: string | undefined, now: Date): Date | null {
  const match = /^(\d+)\s*(gün|saat|dakika)/.exec(text ?? "");
  if (match === null) return text === "Bugün" ? now : null;
  const unitMs = match[2] === "gün" ? 24 * HOUR_MS : match[2] === "saat" ? HOUR_MS : 60_000;
  return new Date(now.getTime() - Number(match[1]) * unitMs);
}

/** "13.10.2026" → that day (UTC). */
function turkishDate(value: string | undefined): Date | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value ?? "");
  return match === null ? null : parseDate(`${match[3]}-${match[2]}-${match[1]}T00:00:00Z`);
}

/** Job cards of a search-result page (server-rendered Nuxt HTML; sponsored cards are ads and skipped). */
export function parseKariyerSearch(html: string, now: Date): Listing[] {
  const listings: Listing[] = [];
  // Split at every card's opening tag, whatever its attribute order or line breaks.
  for (const card of html.split(/<div\b(?=[^>]*\sdata-test="ad-card")/).slice(1)) {
    const openTag = card.slice(0, card.indexOf(">"));
    const attributes: Record<string, string> = {};
    for (const [, name, value] of openTag.matchAll(/\s([A-Za-z]+)="([^"]*)"/g)) {
      if (name !== undefined && value !== undefined)
        attributes[name] = htmlToText(value).replace(/\s+/g, " ").trim();
    }
    if (attributes.sponsor === "true") continue;
    const href = /<a\b[^>]*?\shref="(\/is-ilani\/[^"?#]+)"/.exec(card)?.[1];
    const title = testIdText(card, "ad-card-title") ?? attributes.positionName ?? null;
    const company = testIdText(card, "subtitle");
    if (href === undefined || title === null || company === null) continue;
    const place = testIdText(card, "location") ?? attributes.cityName ?? null;
    const country = attributes.countryName ?? "Türkiye";
    const workModel = attributes.workModelText ?? testIdText(card, "work-model") ?? "";
    listings.push({
      source: "kariyer",
      sourceId: /-(\d+)$/.exec(href)?.[1] ?? null,
      url: `${ORIGIN}${href}`,
      isDirectFromEmployer: false,
      title,
      company,
      locations: place === null ? [] : [`${place}, ${country}`],
      remote: WORK_MODELS[workModel] ?? null,
      employmentType: WORK_TYPES[attributes.workType ?? ""] ?? null,
      description: "",
      postedAt: cardAge(attributes.time, now),
      tags: attributes.sectorName ? [attributes.sectorName] : [],
      language: "tr",
    });
  }
  return listings;
}

/** Completes a listing from its posting page: JobPosting JSON-LD when present, else the page's description block. */
export function parseKariyerDetail(html: string, listing: Listing): Listing {
  for (const [, json] of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(json ?? "");
    } catch {
      continue;
    }
    const posting = JobPostingSchema.safeParse(data);
    if (!posting.success || ![posting.data["@type"]].flat().includes("JobPosting")) continue;
    return {
      ...listing,
      company: posting.data.hiringOrganization?.name ?? listing.company,
      description: posting.data.description ?? listing.description,
      postedAt: parseDate(posting.data.datePosted) ?? listing.postedAt ?? null,
      deadline: parseDate(posting.data.validThrough) ?? listing.deadline ?? null,
    };
  }
  // The description block holds only <p>/<ul>/<strong>, so its first </div> closes it.
  const block = /data-test="qualifications-and-job-description"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (block === undefined)
    throw new SourceError("invalid_response", "Kariyer.net posting page without a description");
  const container = /<div\b[^>]*\sisActive="[^"]*"[^>]*>/.exec(html)?.[0] ?? "";
  return {
    ...listing,
    company: testIdText(html, "company-name") ?? listing.company,
    description: block,
    postedAt: turkishDate(/lastPublishDate="([^"]*)"/.exec(container)?.[1]) ?? listing.postedAt ?? null,
    deadline: turkishDate(/closingDate="([^"]*)"/.exec(container)?.[1]) ?? listing.deadline ?? null,
  };
}

/**
 * Kariyer.net search-result pages (kind `scrape`; docs/integrations/kariyer-net.md). Turkey has no
 * free job API, so a saved search reads one public result page (`/is-ilanlari?kw=`), obeying
 * robots.txt; bot challenges surface as `blocked` (HttpClient) and are never solved.
 */
export const kariyer: SearchConnector = {
  id: "kariyer",
  label: "Kariyer.net",
  kind: "scrape",
  markets: ["TR"],
  attribution: { label: "Kariyer.net", url: "https://www.kariyer.net", minSize: null },
  secrets: [],
  adHoc: true,
  callBudget: () => null,
  covers: (query) => query.filters.countryCodes.length === 0 || query.filters.countryCodes.includes("TR"),
  async search(query, context): Promise<Listing[]> {
    const keywords = query.query.trim();
    const url =
      keywords === "" ? `${ORIGIN}/is-ilanlari` : `${ORIGIN}/is-ilanlari?kw=${encodeURIComponent(keywords)}`;
    const response = await context.http.getText(url, REQUEST);
    const listings = parseKariyerSearch(response.body, context.now);
    // An empty list is only trusted on a page that still has the result list or the no-result notice.
    if (listings.length === 0 && !/data-test="(list-items|no-result)"/.test(response.body)) {
      throw new SourceError("invalid_response", "Kariyer.net page without job cards");
    }
    return listings.slice(0, query.limit);
  },
  async fetchDetail(listing, context): Promise<Listing> {
    const response = await context.http.getText(listing.url, REQUEST);
    return parseKariyerDetail(response.body, listing);
  },
};
