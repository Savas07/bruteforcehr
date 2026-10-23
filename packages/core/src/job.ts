import { z } from "zod";
import {
  CountryCodeSchema,
  CurrencySchema,
  EmailSchema,
  IdSchema,
  LanguageTagSchema,
  TimestampSchema,
  UrlSchema,
} from "./common";
import { RemoteTypeSchema, SenioritySchema } from "./enums";
import { SalaryPeriodSchema } from "./profile";

/**
 * Job source id. Open vocabulary (new connectors must not break older clients), so it is a
 * slug rather than an enum; `KNOWN_JOB_SOURCES` lists the ones the app knows how to label.
 */
export const JobSourceIdSchema = z.string().regex(/^[a-z0-9_]{2,40}$/, "Expected a job source slug");
export type JobSourceId = z.infer<typeof JobSourceIdSchema>;

export const KNOWN_JOB_SOURCES = [
  "remotive",
  "arbeitnow",
  "adzuna",
  "jooble",
  "usajobs",
  "reed",
  "themuse",
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "personio",
  "bundesagentur",
  "himalayas",
  "remoteok",
  "kariyer",
  "web",
  "alert_email",
  "url_import",
  "manual",
] as const;
export type KnownJobSource = (typeof KNOWN_JOB_SOURCES)[number];

export const JobLocationSchema = z.object({
  label: z.string().min(1).max(200),
  city: z.string().min(1).max(120).nullable(),
  countryCode: CountryCodeSchema.nullable(),
});
export type JobLocation = z.infer<typeof JobLocationSchema>;

export const SalaryRangeSchema = z
  .object({
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    currency: CurrencySchema,
    period: SalaryPeriodSchema,
    /** True when the figure is our estimate rather than published by the employer. */
    estimated: z.boolean(),
  })
  .refine((range) => range.min !== null || range.max !== null, "Salary range needs min or max")
  .refine((range) => range.min === null || range.max === null || range.min <= range.max, "min must be ≤ max");
export type SalaryRange = z.infer<typeof SalaryRangeSchema>;

/**
 * One listing of a (deduplicated) job; every link is kept (§4.3). Fields that can differ between
 * listings (salary, location wording, posted date, apply route) are kept per source so the
 * "Found on" list can show conflicts instead of hiding them.
 */
export const JobSourceLinkSchema = z.object({
  source: JobSourceIdSchema,
  /** Id within the source (ATS posting id, API id); null for URL imports/manual entry. */
  sourceId: z.string().min(1).max(200).nullable(),
  url: UrlSchema,
  applyUrl: UrlSchema.nullable(),
  applyEmail: EmailSchema.nullable(),
  /** ATS board or company careers site, as opposed to an aggregator/job board. */
  isDirectFromEmployer: z.boolean(),
  /** Title as this source words it. */
  title: z.string().min(1).max(200),
  /** Location wording as this source shows it. */
  locationText: z.string().max(300).nullable(),
  salary: SalaryRangeSchema.nullable(),
  postedAt: TimestampSchema.nullable(),
  firstSeenAt: TimestampSchema,
  lastSeenAt: TimestampSchema,
});
export type JobSourceLink = z.infer<typeof JobSourceLinkSchema>;

/** `source:sourceId` (or `source:url`) keys used for `array-contains` upsert lookups. */
export function jobSourceKey(link: Pick<JobSourceLink, "source" | "sourceId" | "url">): string {
  return `${link.source}:${link.sourceId ?? link.url}`;
}

export const EmploymentTypeSchema = z.enum(["full_time", "part_time", "contract", "internship", "temporary"]);
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

/**
 * `users/{uid}/jobs/{jobId}` — a normalized, deduplicated posting. Top-level fields are the
 * merged canonical values; `sources[]` keeps each listing's own values.
 * The `embedding` vector field is server-written and deliberately absent from the client model.
 */
export const JobSchema = z
  .object({
    id: IdSchema,
    /** All listings of this job; `sources[0]` is the primary one. */
    sources: z.array(JobSourceLinkSchema).min(1).max(20),
    /** `jobSourceKey()` of every entry in `sources`. */
    sourceKeys: z.array(z.string().min(3)).min(1).max(20),
    /** Preferred apply route (direct employer route first, see ADR 0002). */
    applyUrl: UrlSchema.nullable(),
    applyEmail: EmailSchema.nullable(),
    company: z.string().min(1).max(200),
    companyDomain: z
      .string()
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
      .nullable(),
    title: z.string().min(1).max(200),
    locations: z.array(JobLocationSchema).max(20),
    remoteType: RemoteTypeSchema.nullable(),
    /** Free-text remote eligibility as published ("EU only", "US time zones"). */
    remoteEligibility: z.string().max(200).nullable(),
    employmentType: EmploymentTypeSchema.nullable(),
    seniority: SenioritySchema.nullable(),
    salary: SalaryRangeSchema.nullable(),
    visaSponsorship: z.boolean().nullable(),
    relocationSupport: z.boolean().nullable(),
    /** Posting language. */
    language: LanguageTagSchema,
    /** Plain text with paragraph breaks (sanitized from the source HTML). */
    description: z.string().max(100_000),
    /** Normalized skills/keywords extracted from the description. */
    skills: z.array(z.string().min(1).max(60)).max(100),
    postedAt: TimestampSchema.nullable(),
    expiresAt: TimestampSchema.nullable(),
    /** Dedupe fingerprint over normalized company/title/location (+ shingles). */
    fingerprint: z.string().min(8).max(128),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .superRefine((job, ctx) => {
    const expected = job.sources.map(jobSourceKey);
    if (expected.length !== job.sourceKeys.length || expected.some((key, i) => job.sourceKeys[i] !== key)) {
      ctx.addIssue({
        code: "custom",
        message: "sourceKeys must equal sources.map(jobSourceKey)",
        path: ["sourceKeys"],
      });
    }
  });
export type Job = z.infer<typeof JobSchema>;

export const JobMatchStateSchema = z.enum(["new", "saved", "dismissed"]);
export type JobMatchState = z.infer<typeof JobMatchStateSchema>;

/** Multi-select; feeds ranking. Hiding a whole company lives in `profile.hiddenCompanies`. */
export const DismissReasonSchema = z.enum([
  "not_relevant",
  "location",
  "salary",
  "seniority",
  "company",
  "language",
  "visa",
  "already_applied",
  "other",
]);
export type DismissReason = z.infer<typeof DismissReasonSchema>;

/** What a match factor is about. */
export const MatchFactorKindSchema = z.enum(["requirement", "skill", "experience", "other"]);
export type MatchFactorKind = z.infer<typeof MatchFactorKindSchema>;

/** Hard-filter facets shown in the requirements checklist. */
export const MatchRequirementFacetSchema = z.enum([
  "location",
  "remote",
  "authorization",
  "salary",
  "seniority",
  "language",
]);
export type MatchRequirementFacet = z.infer<typeof MatchRequirementFacetSchema>;

/**
 * - `met` / `partial`: why it matches.
 * - `missing`: not in the CV yet (a gap the user can correct with "I have this").
 * - `outside_prefs`: the posting conflicts with the user's preferences.
 * - `not_stated`: the posting does not say; neutral, never a gap.
 */
export const MatchFactorStatusSchema = z.enum(["met", "partial", "missing", "outside_prefs", "not_stated"]);
export type MatchFactorStatus = z.infer<typeof MatchFactorStatusSchema>;

/** Qualitative weight instead of numeric weights ("Matters most" / "Matters some"). */
export const MatchImpactSchema = z.enum(["most", "some"]);
export type MatchImpact = z.infer<typeof MatchImpactSchema>;

export const MatchEvidenceSchema = z.object({
  from: z.enum(["posting", "cv", "profile"]),
  quote: z.string().min(1).max(500),
});
export type MatchEvidence = z.infer<typeof MatchEvidenceSchema>;

export const MatchFactorSchema = z
  .object({
    kind: MatchFactorKindSchema,
    /** Set for `requirement` factors only. */
    facet: MatchRequirementFacetSchema.nullable(),
    /** The requirement or skill as one short sentence/phrase ("React and TypeScript", "Relocation to Berlin"). */
    label: z.string().min(1).max(300),
    status: MatchFactorStatusSchema,
    impact: MatchImpactSchema,
    evidence: MatchEvidenceSchema.nullable(),
    /** `ai` factors are labelled "AI · can be wrong" in the UI. */
    source: z.enum(["rule", "ai"]),
  })
  .refine((factor) => (factor.kind === "requirement") === (factor.facet !== null), {
    message: "facet is set exactly for requirement factors",
    path: ["facet"],
  });
export type MatchFactor = z.infer<typeof MatchFactorSchema>;

const REASON_STATUSES: readonly MatchFactorStatus[] = ["met", "partial", "not_stated"];
const GAP_STATUSES: readonly MatchFactorStatus[] = ["missing", "outside_prefs"];

/** `users/{uid}/jobMatches/{jobId}` — same id as the job. Server-computed; clients update state only. */
export const JobMatchSchema = z
  .object({
    id: IdSchema,
    score: z.int().min(0).max(100),
    /** CV and exact revision the score was computed against ("Based on CV …"). */
    basedOnCvId: IdSchema.nullable(),
    basedOnCvRevisionId: IdSchema.nullable(),
    /** Statuses `met`, `partial` or `not_stated` (requirements checklist + "Why it matches"). */
    reasons: z.array(MatchFactorSchema).max(30),
    /** Statuses `missing` or `outside_prefs` ("Gaps to consider"). */
    gaps: z.array(MatchFactorSchema).max(30),
    /** Skill chips: posting skills found / not found in the CV ("6 of 9 skills"). */
    skills: z.object({
      matched: z.array(z.string().min(1).max(60)).max(100),
      unmatched: z.array(z.string().min(1).max(60)).max(100),
    }),
    /** LLM summary, generated for the top N only. */
    rationale: z.string().max(2_000).nullable(),
    state: JobMatchStateSchema,
    /** Optional multi-select reasons; empty unless dismissed. */
    dismissReasons: z.array(DismissReasonSchema).max(9),
    stateChangedAt: TimestampSchema.nullable(),
    computedAt: TimestampSchema,
  })
  .superRefine((match, ctx) => {
    if (match.state !== "dismissed" && match.dismissReasons.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "dismissReasons only apply to dismissed matches",
        path: ["dismissReasons"],
      });
    }
    if ((match.basedOnCvId === null) !== (match.basedOnCvRevisionId === null)) {
      ctx.addIssue({
        code: "custom",
        message: "basedOnCvId and basedOnCvRevisionId go together",
        path: ["basedOnCvId"],
      });
    }
    match.reasons.forEach((factor, index) => {
      if (!REASON_STATUSES.includes(factor.status)) {
        ctx.addIssue({
          code: "custom",
          message: `reasons cannot have status ${factor.status}`,
          path: ["reasons", index, "status"],
        });
      }
    });
    match.gaps.forEach((factor, index) => {
      if (!GAP_STATUSES.includes(factor.status)) {
        ctx.addIssue({
          code: "custom",
          message: `gaps cannot have status ${factor.status}`,
          path: ["gaps", index, "status"],
        });
      }
    });
  });
export type JobMatch = z.infer<typeof JobMatchSchema>;

export type MatchBand = "strong" | "good" | "partial" | "stretch";

/** Provisional band thresholds (lower bounds); recalibrate against real score distributions in M4. */
export const MATCH_BAND_THRESHOLDS = { strong: 80, good: 65, partial: 45 } as const;

/** Band first, number second: lists show the band, detail shows "72 of 100". */
export function matchBand(score: number): MatchBand {
  if (score >= MATCH_BAND_THRESHOLDS.strong) return "strong";
  if (score >= MATCH_BAND_THRESHOLDS.good) return "good";
  if (score >= MATCH_BAND_THRESHOLDS.partial) return "partial";
  return "stretch";
}

export const SavedSearchScheduleSchema = z.enum(["hourly", "daily", "weekly"]);
export type SavedSearchSchedule = z.infer<typeof SavedSearchScheduleSchema>;

export const SavedSearchFiltersSchema = z.object({
  countryCodes: z.array(CountryCodeSchema).max(30),
  remoteTypes: z.array(RemoteTypeSchema).max(3),
  seniority: z.array(SenioritySchema).max(9),
  salaryMin: z
    .object({ amount: z.number().nonnegative(), currency: CurrencySchema, period: SalaryPeriodSchema })
    .nullable(),
  /** Restrict to these sources; empty = all enabled sources. */
  sources: z.array(JobSourceIdSchema).max(30),
  postedWithinDays: z.int().min(1).max(90).nullable(),
  visaSponsorship: z.boolean().nullable(),
});
export type SavedSearchFilters = z.infer<typeof SavedSearchFiltersSchema>;

/** `users/{uid}/savedSearches/{id}`. `nextRunAt` drives the scheduled collection-group query. */
export const SavedSearchSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  query: z.string().max(500),
  filters: SavedSearchFiltersSchema,
  schedule: SavedSearchScheduleSchema,
  /** Push for new matches scoring at or above this (0–100). */
  alertThreshold: z.int().min(0).max(100),
  dailyDigest: z.boolean(),
  enabled: z.boolean(),
  lastRunAt: TimestampSchema.nullable(),
  nextRunAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type SavedSearch = z.infer<typeof SavedSearchSchema>;

export interface ManualJobInput {
  readonly company: string;
  readonly title: string;
  /** The posting's address the user pasted (http/https). */
  readonly url: string;
  readonly location: string | null;
  readonly at: Date;
}

/** Source id of jobs the user entered by hand ("Log an application" with a link). */
export const MANUAL_JOB_SOURCE = "manual" satisfies KnownJobSource;

/**
 * The `jobs` document for a link entered with "Log an application" (ADR 0002: jobs may be created
 * by the client for manual entry). One `manual` source pointing at the link; nothing is fetched or
 * guessed, so the posting language is `und` (undetermined) and the description empty. The
 * fingerprint is the normalized company and title, so a later import of the same posting can be
 * deduplicated against it.
 */
export function manualJob(input: ManualJobInput): Omit<Job, "id"> {
  const source: JobSourceLink = {
    source: MANUAL_JOB_SOURCE,
    sourceId: null,
    url: input.url,
    applyUrl: input.url,
    applyEmail: null,
    isDirectFromEmployer: false,
    title: input.title,
    locationText: input.location,
    salary: null,
    postedAt: null,
    firstSeenAt: input.at,
    lastSeenAt: input.at,
  };
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
  return {
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
    applyUrl: input.url,
    applyEmail: null,
    company: input.company,
    companyDomain: null,
    title: input.title,
    locations: input.location === null ? [] : [{ label: input.location, city: null, countryCode: null }],
    remoteType: null,
    remoteEligibility: null,
    employmentType: null,
    seniority: null,
    salary: null,
    visaSponsorship: null,
    relocationSupport: null,
    language: "und",
    description: "",
    skills: [],
    postedAt: null,
    expiresAt: null,
    fingerprint: `manual|${normalize(input.company)}|${normalize(input.title)}`.slice(0, 128),
    createdAt: input.at,
    updatedAt: input.at,
  };
}
