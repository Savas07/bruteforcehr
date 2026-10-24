import type { RemoteType, Seniority } from "../enums";
import type { EmploymentType, JobLocation, SalaryRange } from "../job";

/**
 * What an extractor read from a page, before it becomes a `jobs` document. Every field is
 * optional; later extractors (site adapter, AI) fill what earlier ones left empty.
 */
export interface ExtractedPosting {
  title: string | null;
  company: string | null;
  /** The employer's own website, when the page names it (for `companyDomain`). */
  companyUrl: string | null;
  locations: JobLocation[];
  remoteType: RemoteType | null;
  remoteEligibility: string | null;
  employmentType: EmploymentType | null;
  seniority: Seniority | null;
  /** Plain text with paragraph breaks. */
  description: string;
  datePosted: Date | null;
  validThrough: Date | null;
  salary: SalaryRange | null;
  applyUrl: string | null;
  applyEmail: string | null;
  skills: string[];
  /** BCP 47 language the page declares or the text is written in. */
  language: string | null;
}

export const EMPTY_POSTING: ExtractedPosting = {
  title: null,
  company: null,
  companyUrl: null,
  locations: [],
  remoteType: null,
  remoteEligibility: null,
  employmentType: null,
  seniority: null,
  description: "",
  datePosted: null,
  validThrough: null,
  salary: null,
  applyUrl: null,
  applyEmail: null,
  skills: [],
  language: null,
};

/** A posting is usable once it has a title and a company. */
export function isComplete(posting: ExtractedPosting): boolean {
  return posting.title !== null && posting.company !== null;
}

/** Fills the empty fields of `base` from `extra` (base wins where both have a value). */
export function fillPosting(base: ExtractedPosting, extra: ExtractedPosting): ExtractedPosting {
  return {
    title: base.title ?? extra.title,
    company: base.company ?? extra.company,
    companyUrl: base.companyUrl ?? extra.companyUrl,
    locations: base.locations.length > 0 ? base.locations : extra.locations,
    remoteType: base.remoteType ?? extra.remoteType,
    remoteEligibility: base.remoteEligibility ?? extra.remoteEligibility,
    employmentType: base.employmentType ?? extra.employmentType,
    seniority: base.seniority ?? extra.seniority,
    description: base.description.length >= extra.description.length ? base.description : extra.description,
    datePosted: base.datePosted ?? extra.datePosted,
    validThrough: base.validThrough ?? extra.validThrough,
    salary: base.salary ?? extra.salary,
    applyUrl: base.applyUrl ?? extra.applyUrl,
    applyEmail: base.applyEmail ?? extra.applyEmail,
    skills: base.skills.length > 0 ? base.skills : extra.skills,
    language: base.language ?? extra.language,
  };
}

/** Fields an extractor filled (for per-field confidence). */
export function filledFields(posting: ExtractedPosting): string[] {
  const fields: string[] = [];
  if (posting.title !== null) fields.push("title");
  if (posting.company !== null) fields.push("company");
  if (posting.locations.length > 0) fields.push("locations");
  if (posting.remoteType !== null) fields.push("remoteType");
  if (posting.employmentType !== null) fields.push("employmentType");
  if (posting.seniority !== null) fields.push("seniority");
  if (posting.description !== "") fields.push("description");
  if (posting.datePosted !== null) fields.push("postedAt");
  if (posting.validThrough !== null) fields.push("expiresAt");
  if (posting.salary !== null) fields.push("salary");
  if (posting.applyUrl !== null) fields.push("applyUrl");
  if (posting.skills.length > 0) fields.push("skills");
  return fields;
}
