import { type JobSourceLink, type KnownJobSource, jobSourceKey } from "../job";
import { jobFingerprint } from "../jobs/dedupe";
import {
  detectPostingLanguage,
  detectRelocationSupport,
  detectVisaSponsorship,
  extractSkills,
  hostOf,
} from "../jobs/normalize";
import type { JobDraft } from "./contract";
import { companyDomainOf } from "./normalize";
import type { ExtractedPosting } from "./posting";
import { NOT_EMPLOYER_HOSTS, type SiteAdapter } from "./sites";

/** Source id of jobs imported from a link the user shared or pasted. */
export const URL_IMPORT_JOB_SOURCE = "url_import" satisfies KnownJobSource;

/** `jobs.description` limit (JobSchema). */
const MAX_DESCRIPTION_CHARS = 100_000;

/** Careers subdomains that stand for the company's own domain (`careers.acme.com` → `acme.com`). */
const CAREERS_SUBDOMAIN = /^(careers?|jobs|karriere|kariyer|werkenbij|join|apply|talent)\./;

const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

export interface ImportedJobContext {
  /** Canonical posting URL (the `url_import` source and its key). */
  url: string;
  site: SiteAdapter | null;
  /** `<html lang>` of the page. */
  declaredLanguage: string | null;
  at: Date;
}

/**
 * The `jobs` document for an imported posting (title and company required): one `url_import`
 * source pointing at the shared page, canonical fields from the extraction, derived fields from
 * the connector normalizers, and the shared dedupe fingerprint.
 */
export function buildImportedJob(posting: ExtractedPosting, context: ImportedJobContext): JobDraft {
  const { title, company } = posting;
  if (title === null || company === null) throw new Error("buildImportedJob needs a title and a company");
  const isDirect = context.site?.isDirectFromEmployer ?? true;
  const pageHost = hostOf(context.url);
  // An unknown host is the employer's own careers site.
  const ownDomain = context.site === null && pageHost !== null ? pageHost.replace(CAREERS_SUBDOMAIN, "") : null;
  const companyDomain = companyDomainOf(posting.companyUrl, NOT_EMPLOYER_HOSTS) ?? ownDomain;

  const truncated = posting.description.length > MAX_DESCRIPTION_CHARS;
  const description = truncated ? posting.description.slice(0, MAX_DESCRIPTION_CHARS) : posting.description;
  const detected = detectPostingLanguage(description);
  const declared = (posting.language ?? context.declaredLanguage ?? "").trim().replace("_", "-");
  const declaredTag = /^([a-zA-Z]{2,3})(?:-([a-zA-Z]{2}))?$/.exec(declared);
  const language =
    detected !== "und"
      ? detected
      : declaredTag?.[1] !== undefined && LANGUAGE_TAG.test(declaredTag[1].toLowerCase())
        ? declaredTag[1].toLowerCase()
        : "und";

  const source: JobSourceLink = {
    source: URL_IMPORT_JOB_SOURCE,
    sourceId: null,
    url: context.url,
    applyUrl: posting.applyUrl ?? context.url,
    applyEmail: posting.applyEmail,
    isDirectFromEmployer: isDirect,
    title,
    locationText: posting.locations.length === 0 ? null : posting.locations.map((location) => location.label).join(" · ").slice(0, 300),
    salary: posting.salary,
    postedAt: posting.datePosted,
    firstSeenAt: context.at,
    lastSeenAt: context.at,
  };
  const fields = {
    company,
    companyDomain,
    title,
    locations: posting.locations.slice(0, 20),
    remoteType: posting.remoteType,
  };
  return {
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
    applyUrl: source.applyUrl,
    applyEmail: source.applyEmail,
    ...fields,
    remoteEligibility: posting.remoteEligibility,
    employmentType: posting.employmentType,
    seniority: posting.seniority,
    salary: posting.salary,
    visaSponsorship: detectVisaSponsorship(description),
    relocationSupport: detectRelocationSupport(description),
    language,
    description,
    skills: (posting.skills.length > 0 ? posting.skills : extractSkills(`${title}\n${description}`)).slice(0, 100),
    postedAt: posting.datePosted,
    expiresAt: posting.validThrough,
    fingerprint: jobFingerprint(fields),
    createdAt: context.at,
    updatedAt: context.at,
  };
}
