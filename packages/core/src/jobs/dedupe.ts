import { type Job, type JobLocation, type JobSourceLink, jobSourceKey } from "../job";
import { foldText, jaccard, normalizeCompanyName, normalizeTitle, shingles } from "./normalize";

/** Fingerprint scheme version; part of the value so a new scheme never collides with an old one. */
export const FINGERPRINT_VERSION = "v1";

/** A job is considered gone this many days after any source last listed it (unless a source gives a deadline). */
export const JOB_STALE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

/** Description shingle overlap above which two same-company postings with similar titles are one job. */
export const SAME_JOB_DESCRIPTION_SIMILARITY = 0.6;

/** Location part of the fingerprint: first city, else first country, else `remote`/`any`. */
function locationKey(job: Pick<Job, "locations" | "remoteType">): string {
  const first: JobLocation | undefined = job.locations[0];
  const city = job.locations.find((location) => location.city !== null)?.city;
  if (city !== undefined && city !== null) return foldText(city);
  const country = job.locations.find((location) => location.countryCode !== null)?.countryCode;
  if (country !== undefined && country !== null) return country.toLowerCase();
  if (job.remoteType === "remote") return "remote";
  return first === undefined ? "any" : foldText(first.label).slice(0, 40);
}

/**
 * Dedupe fingerprint over normalized company, title and location
 * (`v1|<company>|<title>|<location>`, ≤ 128 chars). Company is the normalized name rather than the
 * domain because aggregators rarely know the domain; the domain is used in `isSameJob` instead.
 */
export function jobFingerprint(
  job: Pick<Job, "company" | "companyDomain" | "title" | "locations" | "remoteType">,
): string {
  const company = normalizeCompanyName(job.company) || (job.companyDomain ?? "unknown");
  return [FINGERPRINT_VERSION, company, normalizeTitle(job.title), locationKey(job)].join("|").slice(0, 128);
}

/**
 * Whether two postings are the same job: equal fingerprints, or the same company (name or domain)
 * with near-identical titles and overlapping descriptions (word 3-gram Jaccard ≥ 0.6). Catches
 * the same posting listed with different location wording on two boards.
 */
export function isSameJob(
  a: Pick<
    Job,
    "company" | "companyDomain" | "title" | "locations" | "remoteType" | "description" | "fingerprint"
  >,
  b: Pick<
    Job,
    "company" | "companyDomain" | "title" | "locations" | "remoteType" | "description" | "fingerprint"
  >,
): boolean {
  if (a.fingerprint === b.fingerprint) return true;
  const sameCompany =
    (a.companyDomain !== null && a.companyDomain === b.companyDomain) ||
    normalizeCompanyName(a.company) === normalizeCompanyName(b.company);
  if (!sameCompany || normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  if (a.description.length < 200 || b.description.length < 200) return false;
  return jaccard(shingles(a.description), shingles(b.description)) >= SAME_JOB_DESCRIPTION_SIMILARITY;
}

/** Direct-from-employer listings first, then the earliest seen; stable otherwise. */
function orderSources(sources: readonly JobSourceLink[]): JobSourceLink[] {
  return [...sources].sort(
    (a, b) =>
      Number(b.isDirectFromEmployer) - Number(a.isDirectFromEmployer) ||
      a.firstSeenAt.getTime() - b.firstSeenAt.getTime(),
  );
}

/**
 * Canonical apply route: the direct employer's apply URL (or its posting URL), then any source's
 * apply URL, then an apply email. ADR 0002: direct employer route first.
 */
export function preferredApplyRoute(sources: readonly JobSourceLink[]): {
  applyUrl: string | null;
  applyEmail: string | null;
} {
  const ordered = orderSources(sources);
  const direct = ordered.find((source) => source.isDirectFromEmployer);
  const applyUrl =
    direct?.applyUrl ?? direct?.url ?? ordered.find((source) => source.applyUrl !== null)?.applyUrl ?? null;
  const applyEmail = ordered.find((source) => source.applyEmail !== null)?.applyEmail ?? null;
  return { applyUrl, applyEmail };
}

/**
 * Expiry: the earliest published deadline when one is known, else `JOB_STALE_AFTER_DAYS` after the
 * latest sighting. Every re-sighting pushes the computed expiry forward.
 */
export function jobExpiry(sources: readonly JobSourceLink[], publishedDeadline: Date | null): Date {
  const lastSeen = Math.max(...sources.map((source) => source.lastSeenAt.getTime()));
  const stale = new Date(lastSeen + JOB_STALE_AFTER_DAYS * DAY_MS);
  return publishedDeadline !== null && publishedDeadline < stale ? publishedDeadline : stale;
}

function mergeLocations(a: readonly JobLocation[], b: readonly JobLocation[]): JobLocation[] {
  const merged = [...a];
  for (const location of b) {
    const key = foldText(location.city ?? location.label);
    if (!merged.some((existing) => foldText(existing.city ?? existing.label) === key)) merged.push(location);
  }
  return merged.slice(0, 20);
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/**
 * Merges a newly seen listing (`incoming`, a full job draft from a connector or import) into an
 * existing job. Sources are unioned by `jobSourceKey`: a known source keeps its `firstSeenAt` and
 * takes the new wording, salary and `lastSeenAt`; a new one is appended. Canonical fields prefer
 * the direct employer listing, then the existing values; nulls are filled from the other side.
 * Identity (`id`, `fingerprint`, `createdAt`) never changes.
 */
export function mergeJobListing(existing: Job, incoming: Omit<Job, "id">, at: Date): Job {
  const byKey = new Map(existing.sources.map((source) => [jobSourceKey(source), source] as const));
  for (const source of incoming.sources) {
    const key = jobSourceKey(source);
    const known = byKey.get(key);
    byKey.set(
      key,
      known === undefined
        ? { ...source, lastSeenAt: at }
        : { ...source, firstSeenAt: known.firstSeenAt, lastSeenAt: at },
    );
  }
  const sources = orderSources([...byKey.values()]).slice(0, 20);
  const incomingIsDirect = incoming.sources.some((source) => source.isDirectFromEmployer);
  const existingIsDirect = existing.sources.some((source) => source.isDirectFromEmployer);
  // Which side's canonical wording wins: the direct employer listing; on a tie, the existing job.
  const preferIncoming = incomingIsDirect && !existingIsDirect;
  const [primary, secondary] = preferIncoming ? [incoming, existing] : [existing, incoming];
  const description =
    primary.description.length >= 200 || primary.description.length >= secondary.description.length
      ? primary.description
      : secondary.description;
  const skills = [...new Set([...primary.skills, ...secondary.skills])].slice(0, 100);
  // The newest sighting carries the freshest expiry (its deadline, or stale-after from now).
  const expiresAt = incoming.expiresAt ?? jobExpiry(sources, null);

  return {
    id: existing.id,
    sources,
    sourceKeys: sources.map(jobSourceKey),
    ...preferredApplyRoute(sources),
    company: primary.company,
    companyDomain: primary.companyDomain ?? secondary.companyDomain,
    title: primary.title,
    locations: mergeLocations(primary.locations, secondary.locations),
    remoteType: primary.remoteType ?? secondary.remoteType,
    remoteEligibility: primary.remoteEligibility ?? secondary.remoteEligibility,
    employmentType: primary.employmentType ?? secondary.employmentType,
    seniority: primary.seniority ?? secondary.seniority,
    salary: pickSalary(sources) ?? primary.salary ?? secondary.salary,
    visaSponsorship: primary.visaSponsorship ?? secondary.visaSponsorship,
    relocationSupport: primary.relocationSupport ?? secondary.relocationSupport,
    language: primary.language !== "und" ? primary.language : secondary.language,
    description,
    skills,
    postedAt: earliest(existing.postedAt, incoming.postedAt),
    expiresAt,
    fingerprint: existing.fingerprint,
    createdAt: existing.createdAt,
    updatedAt: at,
  };
}

/** Published salary of the most authoritative listing: direct employer first, estimates last. */
function pickSalary(sources: readonly JobSourceLink[]): JobSourceLink["salary"] {
  const withSalary = sources.filter((source) => source.salary !== null);
  const published = withSalary.find((source) => source.salary?.estimated === false);
  return (published ?? withSalary[0])?.salary ?? null;
}
