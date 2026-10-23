import {
  type Job,
  JobSchema,
  type JobSourceLink,
  type SalaryPeriod,
  type SalaryRange,
  SalaryRangeSchema,
  detectPostingLanguage,
  detectRelocationSupport,
  detectRemoteType,
  detectSeniority,
  detectVisaSponsorship,
  extractSkills,
  foldText,
  hostOf,
  htmlToText,
  jobExpiry,
  jobFingerprint,
  jobSourceKey,
  normalizeSkill,
  parseLocation,
} from "@bfhr/core";
import type { Listing, SearchQuery } from "./types";

const AGGREGATOR_HOSTS: readonly string[] = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "recruitee.com",
  "personio.de",
  "personio.com",
  "arbeitnow.com",
  "remotive.com",
  "remoteok.com",
  "himalayas.app",
  "themuse.com",
  "adzuna.com",
  "adzuna.co.uk",
  "adzuna.de",
  "jooble.org",
  "reed.co.uk",
  "usajobs.gov",
  "arbeitsagentur.de",
  "kariyer.net",
  "linkedin.com",
  "indeed.com",
];

/** The employer's own domain from a URL, unless it is a job board or ATS host. */
export function employerDomain(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  const host = hostOf(url);
  if (host === null) return null;
  return AGGREGATOR_HOSTS.some((board) => host === board || host.endsWith(`.${board}`)) ? null : host;
}

/** A salary range when the figures are valid, else null (never throws on odd source data). */
export function salaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  period: SalaryPeriod,
  estimated = false,
): SalaryRange | null {
  const clean = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  let low = clean(min);
  let high = clean(max);
  if (low !== null && high !== null && low > high) [low, high] = [high, low];
  const parsed = SalaryRangeSchema.safeParse({
    min: low,
    max: high,
    currency: (currency ?? "").toUpperCase(),
    period,
    estimated,
  });
  return parsed.success ? parsed.data : null;
}

/** A Date from an ISO string, epoch seconds/milliseconds or Date; null when invalid. */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time);
  }
  return null;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Normalizes a connector listing into a job document draft (`users/{uid}/jobs` minus `id`): plain
 * text description, parsed locations, inferred remote type, seniority, visa/relocation flags,
 * language and skills, fingerprint and expiry. Returns null when the listing can't form a valid
 * job (e.g. no title or a non-http URL); connectors drop those.
 */
export function toJobDraft(listing: Listing, now: Date): Omit<Job, "id"> | null {
  const description = clip(htmlToText(listing.description), 100_000);
  const title = clip(htmlToText(listing.title).replace(/\s+/g, " "), 200);
  const company = clip(htmlToText(listing.company).replace(/\s+/g, " "), 200);
  if (title === "" || company === "") return null;
  const locationTexts = listing.locations.map((text) => text.trim()).filter((text) => text !== "");
  const locations = [...new Map(locationTexts.map((text) => [foldText(text), parseLocation(text)])).values()]
    .filter((location) => !/^(remote|anywhere|worldwide)$/i.test(location.label))
    .slice(0, 20);
  const wording = `${title} ${locationTexts.join(" ")} ${listing.remoteEligibility ?? ""}`;
  const remoteType =
    listing.remoteType ??
    detectRemoteType(wording, listing.remote ?? null) ??
    detectRemoteType(description.slice(0, 600));
  const postedAt = listing.postedAt ?? null;
  const link: JobSourceLink = {
    source: listing.source,
    sourceId: listing.sourceId === null ? null : clip(listing.sourceId, 200),
    url: listing.url,
    applyUrl: listing.applyUrl ?? null,
    applyEmail: listing.applyEmail ?? null,
    isDirectFromEmployer: listing.isDirectFromEmployer,
    title,
    locationText: locationTexts.length === 0 ? null : clip(locationTexts.join("; "), 300),
    salary: listing.salary ?? null,
    postedAt: postedAt !== null && postedAt > now ? now : postedAt,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  const tagSkills = (listing.tags ?? []).map(normalizeSkill).filter((tag) => extractSkills(tag).length > 0);
  const skills = [...new Set([...extractSkills(`${title}\n${description}`), ...tagSkills])].slice(0, 100);
  const companyDomain = listing.companyDomain ?? employerDomain(listing.applyUrl) ?? null;
  const draft = {
    sources: [link],
    sourceKeys: [jobSourceKey(link)],
    applyUrl: listing.applyUrl ?? (listing.isDirectFromEmployer ? listing.url : null),
    applyEmail: listing.applyEmail ?? null,
    company,
    companyDomain:
      companyDomain !== null && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(companyDomain) ? companyDomain : null,
    title,
    locations,
    remoteType,
    remoteEligibility:
      listing.remoteEligibility === undefined || listing.remoteEligibility === null
        ? null
        : clip(listing.remoteEligibility, 200),
    employmentType: listing.employmentType ?? null,
    seniority: detectSeniority(title),
    salary: listing.salary ?? null,
    visaSponsorship: listing.visaSponsorship ?? detectVisaSponsorship(description),
    relocationSupport: detectRelocationSupport(description),
    language: listing.language ?? detectPostingLanguage(`${title}\n${description}`),
    description,
    skills: skills.map((skill) => clip(skill, 60)),
    postedAt: link.postedAt,
    expiresAt: jobExpiry([link], listing.deadline ?? null),
    fingerprint: "",
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<Job, "id">;
  draft.fingerprint = jobFingerprint(draft);
  // JobSchema has refinements, so it can't be `.omit()`ed: validate with a placeholder id.
  const parsed = JobSchema.safeParse({ id: "draft", ...draft });
  if (!parsed.success) return null;
  const { id: _id, ...valid } = parsed.data;
  return valid;
}

/** Folded query terms (words of ≥ 2 characters). */
export function queryTerms(query: string): string[] {
  return foldText(query).match(/[\p{L}\p{N}+#.]{2,}/gu) ?? [];
}

/**
 * Keyword filter for whole-feed sources (Remotive, RemoteOK, Himalayas, Arbeitnow): every query
 * term in the title, company or tags, or the whole phrase in the description.
 */
export function matchesQuery(
  listing: Pick<Listing, "title" | "company" | "tags" | "description">,
  query: SearchQuery,
): boolean {
  const terms = queryTerms(query.query);
  if (terms.length === 0) return true;
  const head = foldText(`${listing.title} ${listing.company} ${(listing.tags ?? []).join(" ")}`);
  if (terms.every((term) => head.includes(term))) return true;
  return foldText(htmlToText(listing.description)).includes(terms.join(" "));
}
