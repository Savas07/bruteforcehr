/**
 * Jobs list + job detail view-model (`/jobs`, `/jobs/$jobId`, param `jobId`).
 * research/job-detail.md "Decision — Desktop" (header, action row, match section, Details rail,
 * Found on), job-feed-search.md "Decision — Desktop" for the list pane (rows ranked by match band,
 * then newest), states.md "Job detail" rows (nothing selected, no description, delisted) and
 * system.md: bands in lists, "72 of 100" in detail.
 */
import {
  type Application,
  type EmploymentType,
  type Job,
  type JobMatch,
  type JobSourceLink,
  jobSourceKey,
  type KnownJobSource,
  type MatchBand,
  type MatchEvidence,
  type MatchFactor,
  type MatchFactorKind,
  type MatchFactorStatus,
  type MatchImpact,
  type MatchRequirementFacet,
  type RemoteType,
  type SalaryPeriod,
  type SalaryRange,
  type Seniority,
  statusPhase,
} from "@bfhr/core";
import type { ApplicationSummaryVM } from "../../shared/model/blocks";
import { applicationSummaryVM } from "../../shared/model/build-blocks";
import { calendarDaysFromNow, countLabel, money, relativeTime, shortDate } from "../../shared/model/format";
import type {
  CompanyVM,
  MatchVM,
  ModelContext,
  SourceVM,
  StatusVM,
  TimeVM,
  UserData,
} from "../../shared/model/types";
import { companyVM, matchVM, sourceVM, statusVM } from "../../shared/model/vocabulary";

/**
 * A listing not refreshed by its source for this many days counts as gone: the row shows the
 * unreachable note, and when every source is gone the job is delisted (states.md `job.delisted`).
 * Sources are re-read at least weekly by saved searches.
 */
const STALE_SOURCE_DAYS = 7;
/** "Found on" shows this many rows before "Show all {n} sources" (job-detail.md). */
const SOURCES_COLLAPSED = 3;
/** The description folds after about 12 lines (components.md `DescriptionText`). */
const DESCRIPTION_COLLAPSED_LINES = 12;

/** Static copy of the Jobs list and detail (job-detail.md, job-feed-search.md, states.md). */
export const JOB_DETAIL_COPY = {
  sortLabel: "Best match",
  rankingInfo: "Sorted by match, then newest. Scores are a rough guide, not a prediction.",
  save: "Save",
  saved: "Saved",
  notForMe: "Not for me",
  openOriginal: "Open original",
  viewInTracker: "View in Tracker",
  needsConnection: "Needs a connection",
  hidden: "Hidden from your feed",
  undo: "Undo",
  whyItMatches: "Why it matches",
  gapsToConsider: "Gaps to consider",
  requirements: "Requirements",
  skills: "Skills",
  haveThis: "I have this",
  addToCv: "Add to CV…",
  changeCv: "Change",
  explainerLink: "What goes into this score?",
  explainer:
    "A rough guide to how this job fits your CV and preferences. It isn't a prediction of your chances.",
  aiSummary: "AI summary · can be wrong",
  aiFactor: "AI · can be wrong",
  notTopMatch: "A written summary is created for your top matches.",
  matchPending: "Working out your match…",
  noCv: "Pick a CV to see how this fits",
  details: "Details",
  foundOnDirect: "Direct from employer",
  foundOnBoards: "Job boards",
  sourcesFootnote: "Collected from public job sites. Details can differ between sources.",
  usedForApply: "Used for Apply",
  showMore: "Show more",
  showLess: "Show less",
  noDescription: "This posting has no description.",
  openOriginalPosting: "Open the original posting",
  noSelection: "Select a job to see the details",
  noSelectionHint: "↑ ↓ to move · Enter to open",
  notStated: "Not stated",
} as const;

const REMOTE_LABELS: Readonly<Record<RemoteType, string>> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

const EMPLOYMENT_LABELS: Readonly<Record<EmploymentType, string>> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

const SENIORITY_LABELS: Readonly<Record<Seniority, string>> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  lead: "Lead",
  manager: "Manager",
  director: "Director",
};

const PERIOD_SUFFIXES: Readonly<Record<SalaryPeriod, string>> = {
  year: "a year",
  month: "a month",
  day: "a day",
  hour: "an hour",
};

/** "Best match" order: band first, so 1–2 point differences don't reorder results. */
const BAND_RANK: Readonly<Record<MatchBand, number>> = { strong: 0, good: 1, partial: 2, stretch: 3 };

const FACET_LABELS: Readonly<Record<MatchRequirementFacet, string>> = {
  location: "Location",
  remote: "Remote",
  authorization: "Work authorization",
  salary: "Salary",
  seniority: "Seniority",
  language: "Language",
};

const FACTOR_STATUS_LABELS: Readonly<Record<MatchFactorStatus, string>> = {
  met: "Met",
  partial: "Partly met",
  missing: "Not in your CV yet",
  outside_prefs: "Outside your preferences",
  not_stated: "Not stated",
};

const IMPACT_LABELS: Readonly<Record<MatchImpact, string>> = {
  most: "Matters most",
  some: "Matters some",
};

const EVIDENCE_FROM_LABELS: Readonly<Record<MatchEvidence["from"], string>> = {
  posting: "From the posting",
  cv: "From your CV",
  profile: "From your profile",
};

/** Display names of the job sources the app knows; null = name the site by its host. */
const SOURCE_NAMES: Readonly<Record<KnownJobSource, string | null>> = {
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  jooble: "Jooble",
  usajobs: "USAJOBS",
  reed: "Reed",
  themuse: "The Muse",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  web: null,
  alert_email: null,
  url_import: null,
  manual: null,
};

/** Salary with its provenance (`SalaryText`). */
export interface SalaryVM {
  /** `stated`: published in the posting; `estimated`: our estimate; `notStated`: the posting doesn't say. */
  readonly provenance: "stated" | "estimated" | "notStated";
  /** "€55,000–€68,000 a year"; null when not stated. */
  readonly amount: string | null;
  /** "€55,000–€68,000 a year · from employer", "… · estimate", "Salary not stated". */
  readonly text: string;
}

/** One row of the Jobs list pane (`JobRow`). */
export interface JobListRowVM {
  readonly jobId: string;
  readonly title: string;
  readonly company: CompanyVM;
  /** "Istanbul (Maslak), hybrid", "Remote · Europe, including Türkiye (CET ±3 h)"; null when unknown. */
  readonly where: string | null;
  readonly salary: SalaryVM;
  /** Band pill; null while the score is being worked out. */
  readonly match: MatchVM | null;
  /** "92 of 100" for the pill's tooltip and accessible name (never shown on the row). */
  readonly scoreCaption: string | null;
  /** "3 weeks ago"; null when the posting has no date. */
  readonly posted: TimeVM | null;
  /** Bookmark filled (match saved, or a Saved application). */
  readonly saved: boolean;
  /** Status chip instead of the bookmark once an application exists past Saved. */
  readonly status: StatusVM | null;
  /** `SourceStackIndicator`: "3 sources" when deduped from more than one site, else null. */
  readonly sourceCount: string | null;
  /** Site names for the indicator's tooltip, primary first. */
  readonly sourceNames: readonly string[];
  /** The job's match or application is waiting to sync (`SyncGlyph`). */
  readonly pendingSync: boolean;
}

/** One Q&A fact in the Details card (`FactsList`). */
export interface FactVM {
  readonly key:
    "salary" | "workMode" | "whereTheyHire" | "visa" | "relocation" | "employmentType" | "lastSeen";
  /** "Visa sponsorship". */
  readonly label: string;
  /** "Offered", "Not stated", "2 hours ago". */
  readonly value: string;
  /** Neutral "Not stated" styling (never a gap). */
  readonly notStated: boolean;
  /** The point in time behind `lastSeen` (tooltip); null for other facts. */
  readonly time: TimeVM | null;
}

export interface EvidenceVM {
  /** "From the posting", "From your CV". */
  readonly fromLabel: string;
  readonly quote: string;
}

/** A requirement checklist item (✓ met / ○ not stated / △ outside preferences). */
export interface RequirementVM {
  readonly facet: MatchRequirementFacet;
  /** "Work authorization". */
  readonly facetLabel: string;
  readonly status: MatchFactorStatus;
  /** "Met", "Not stated", "Outside your preferences". */
  readonly statusLabel: string;
  /** The item as shown: "Outside your preferences: No visa sponsorship", "Salary: Not stated". */
  readonly text: string;
  /** "Matters most" / "Matters some". */
  readonly impactLabel: string;
  readonly evidence: EvidenceVM | null;
  /** AI-derived: show `JOB_DETAIL_COPY.aiFactor`. */
  readonly ai: boolean;
}

/** A "Why it matches" factor card or a "Gaps to consider" row. */
export interface FactorVM {
  readonly kind: MatchFactorKind;
  readonly status: MatchFactorStatus;
  /** "5 of 6 skills match: React, TypeScript, Next.js", "Not in your CV yet: GraphQL". */
  readonly text: string;
  readonly impactLabel: string;
  readonly evidence: EvidenceVM | null;
  readonly ai: boolean;
  /** Gap the user can correct with "I have this" / "Add to CV…" (status `missing`). */
  readonly correctable: boolean;
}

/** The match section (`MatchSummaryCard` + `MatchBreakdown`). */
export type MatchSectionVM =
  /** No score yet: labelled wait, never 0. */
  | { readonly state: "pending"; readonly label: string }
  /** The score has no CV behind it: "Pick a CV to see how this fits" + CV picker. */
  | { readonly state: "noCv"; readonly label: string }
  | {
      readonly state: "ready";
      readonly match: MatchVM;
      /** "Good match". */
      readonly bandText: string;
      /** "72 of 100". */
      readonly scoreCaption: string;
      /** `Based on CV "Base CV — English" · updated 3 hours ago`; the Change button follows it. */
      readonly basisLine: string;
      readonly basedOnCvId: string;
      readonly computedAt: TimeVM;
      /** "4 of 5 requirements met · 1 not stated · 5 of 6 skills · 1 gap". */
      readonly countsLine: string;
      /** "Good match, 72 of 100. 4 of 5 requirements met. 2 gaps." */
      readonly accessibleSummary: string;
      /** Desktop: open for Strong / Good, collapsed to the summary row for Partial / Stretch. */
      readonly defaultOpen: boolean;
      /** "Outside your preferences: No visa sponsorship" when a hard filter fails (decisions.md); else null. */
      readonly outsidePreferences: string | null;
      readonly requirements: readonly RequirementVM[];
      /** Posting skills found / not found in the CV, as normalized in the posting. */
      readonly skills: { readonly matched: readonly string[]; readonly unmatched: readonly string[] };
      readonly whyItMatches: readonly FactorVM[];
      readonly gaps: readonly FactorVM[];
      /** The AI rationale (top N only), labelled `JOB_DETAIL_COPY.aiSummary`; null below the top N. */
      readonly aiSummary: string | null;
      /** `JOB_DETAIL_COPY.notTopMatch` when there is no AI summary; else null. */
      readonly summaryNote: string | null;
    };

/** One listing in "Found on" (`SourceRow`). */
export interface SourceRowVM {
  /** `jobSourceKey()` of the listing. */
  readonly key: string;
  /** "Greenhouse", "Reed", "kariyer.net". */
  readonly name: string;
  readonly url: string;
  /** "Direct from employer" badge on ATS and company-site rows; null on job boards. */
  readonly badge: SourceVM | null;
  /** Posted at this source. */
  readonly posted: TimeVM | null;
  /** Fields this listing shows differently: "Salary: ₺150,000–₺190,000 a month", "Title: Front End Engineer (React)". */
  readonly differences: readonly string[];
  /** The listing the Apply button uses ("Used for Apply" tag). */
  readonly usedForApply: boolean;
  /** "Not seen on this site since 22 Sept. The listing may have closed."; null while the source is current. */
  readonly unreachable: string | null;
}

export interface SourceGroupVM {
  /** "Direct from employer" / "Job boards". */
  readonly label: string;
  readonly rows: readonly SourceRowVM[];
}

export interface SourcesVM {
  /** "Found on 3 sites". */
  readonly title: string;
  /** Direct from employer above Job boards; empty groups are left out. */
  readonly groups: readonly SourceGroupVM[];
  readonly total: number;
  /** Rows shown before "Show all"; equals `total` when nothing folds. */
  readonly collapsedCount: number;
  /** "Show all 5 sources"; null when every row fits. */
  readonly showAllLabel: string | null;
}

/** `ApplyButton`: label from the route (decisions.md D23: direct ATS → company site → apply email → aggregator). */
export interface ApplyVM {
  readonly route: "companySite" | "jobBoard" | "email";
  /** "Apply on company site", "Apply on Reed", "Apply". */
  readonly label: string;
  /** Leaves the app: show ↗ and open in the default browser. */
  readonly external: boolean;
  /** The URL, or the address for the email route. */
  readonly target: string;
  /** Disabled reason while offline ("Needs a connection"). */
  readonly offlineReason: string;
}

/** The action row once an application exists past Saved: "Applied 12 Oct · View in Tracker". */
export interface AppliedVM {
  readonly applicationId: string;
  /** "Applied 12 Oct", or "Applied" without a date. */
  readonly label: string;
  readonly linkLabel: string;
}

/** `SubmitPrompt` after an external apply round trip (apply.md "Did you submit?"). */
export interface SubmitPromptVM {
  readonly applicationId: string;
  /** "Did you submit your application to Northstar Maps?" */
  readonly question: string;
}

/** The job detail panel for the selected job. */
export interface JobDetailVM {
  readonly jobId: string;
  readonly title: string;
  readonly company: CompanyVM;
  /** "Istanbul (Maslak), hybrid"; null when the posting names no place. */
  readonly location: string | null;
  /** "Hybrid", "Remote"; null when not stated. */
  readonly workMode: string | null;
  /** "Europe, including Türkiye (CET ±3 h)" as published; null when not stated. */
  readonly remoteEligibility: string | null;
  /** Fact chip: location or remote scope ("Remote · EU only"). */
  readonly where: string | null;
  readonly employmentType: string | null;
  readonly seniority: string | null;
  readonly posted: TimeVM | null;
  readonly salary: SalaryVM;
  /** Prev / next in the list (J / K); null at either end or when the job isn't listed. */
  readonly previousJobId: string | null;
  readonly nextJobId: string | null;
  readonly facts: readonly FactVM[];
  readonly match: MatchSectionVM;
  /** BCP 47 tag of the posting, for the description's `lang`. */
  readonly descriptionLanguage: string;
  /** Paragraphs of the posting; line breaks inside a paragraph (lists) are kept. Empty when there is none. */
  readonly description: readonly string[];
  /** Lines shown before "Show more". */
  readonly descriptionCollapsedLines: number;
  /** "This posting has no description." + `JOB_DETAIL_COPY.openOriginalPosting`; null when there is one. */
  readonly noDescription: string | null;
  /** "This job is no longer listed. Greenhouse removed it on 22 Sept. Your saved copy is below."; else null. */
  readonly delisted: string | null;
  readonly sources: SourcesVM;
  /** Open original (`O`): the primary listing. */
  readonly originalUrl: string;
  readonly apply: ApplyVM;
  /** Non-null once applied: the action row shows this instead of Apply. */
  readonly applied: AppliedVM | null;
  readonly saved: boolean;
  /** Dismissed or its company hidden: `HiddenBanner` ("Hidden from your feed · Undo"). */
  readonly hidden: boolean;
  /** `ApplicationSummaryBlock` once applied; null before. */
  readonly application: ApplicationSummaryVM | null;
  /** "Did you submit?" while the application is Preparing on an external route; else null. */
  readonly submitPrompt: SubmitPromptVM | null;
  readonly pendingSync: boolean;
}

/** Empty list pane (states.md empty kinds). */
export interface JobsEmptyVM {
  /** `firstUse`: no jobs yet; `caughtUp`: every job is hidden. */
  readonly kind: "firstUse" | "caughtUp";
  readonly title: string;
  readonly body: string;
  /** Primary CTA (focuses the search field); null for caught-up. */
  readonly action: string | null;
}

export interface JobDetailModel {
  readonly list: {
    readonly rows: readonly JobListRowVM[];
    /** "37 jobs". */
    readonly countLabel: string;
    readonly sortLabel: string;
    readonly rankingInfo: string;
    readonly empty: JobsEmptyVM | null;
  };
  /** `jobId` when it names a job, else the first row, else null. */
  readonly selectedJobId: string | null;
  /** Shown in the detail pane when `selectedJobId` is null. */
  readonly noSelection: { readonly title: string; readonly hint: string };
  readonly detail: JobDetailVM | null;
}

function sourceHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./u, "");
}

function isKnownSource(slug: string): slug is KnownJobSource {
  return Object.hasOwn(SOURCE_NAMES, slug);
}

function sourceName(link: JobSourceLink): string {
  return (isKnownSource(link.source) ? SOURCE_NAMES[link.source] : null) ?? sourceHost(link.url);
}

function salaryAmount(salary: SalaryRange, locale: string): string {
  const { min, max, currency, period } = salary;
  let range: string;
  if (min !== null && max !== null && min !== max)
    range = `${money(min, currency, locale)}–${money(max, currency, locale)}`;
  else if (min !== null && max === null) range = `From ${money(min, currency, locale)}`;
  else if (min === null && max !== null) range = `Up to ${money(max, currency, locale)}`;
  else range = money(min ?? 0, currency, locale);
  return `${range} ${PERIOD_SUFFIXES[period]}`;
}

function salaryVM(salary: SalaryRange | null, ctx: ModelContext): SalaryVM {
  if (!salary) return { provenance: "notStated", amount: null, text: "Salary not stated" };
  const amount = salaryAmount(salary, ctx.locale);
  return salary.estimated
    ? { provenance: "estimated", amount, text: `${amount} · estimate` }
    : { provenance: "stated", amount, text: `${amount} · from employer` };
}

function locationLabel(job: Job): string | null {
  return job.locations.length > 0 ? job.locations.map((location) => location.label).join(" · ") : null;
}

/** "Remote · EU only" for remote roles; otherwise the place plus the work mode unless the label already says it. */
function whereLine(job: Job): string | null {
  if (job.remoteType === "remote")
    return [REMOTE_LABELS.remote, job.remoteEligibility].filter(Boolean).join(" · ");
  const place = locationLabel(job);
  const mode = job.remoteType ? REMOTE_LABELS[job.remoteType] : null;
  if (place === null) return mode;
  if (mode === null || place.toLocaleLowerCase("en").includes(mode.toLocaleLowerCase("en"))) return place;
  return `${place} · ${mode}`;
}

function isHiddenCompany(job: Job, data: Pick<UserData, "profile">): boolean {
  const name = job.company.toLocaleLowerCase("en");
  return data.profile.hiddenCompanies.some((hidden) =>
    hidden.domain !== null && job.companyDomain !== null
      ? hidden.domain === job.companyDomain
      : hidden.name.toLocaleLowerCase("en") === name,
  );
}

function lastSeen(job: Job): Date {
  return new Date(Math.max(...job.sources.map((source) => source.lastSeenAt.getTime())));
}

function isStale(date: Date, ctx: ModelContext): boolean {
  return calendarDaysFromNow(date, ctx) <= -STALE_SOURCE_DAYS;
}

function hasApplied(application: Application | undefined): application is Application {
  return application !== undefined && statusPhase(application.status) !== "shortlist";
}

function rowVM(
  job: Job,
  match: JobMatch | undefined,
  application: Application | undefined,
  ctx: ModelContext,
): JobListRowVM {
  return {
    jobId: job.id,
    title: job.title,
    company: companyVM(job.company, job.companyDomain),
    where: whereLine(job),
    salary: salaryVM(job.salary, ctx),
    match: match ? matchVM(match.score) : null,
    scoreCaption: match ? `${match.score} of 100` : null,
    posted: job.postedAt ? relativeTime(job.postedAt, ctx) : null,
    saved: match?.state === "saved" || application?.status === "saved",
    status: hasApplied(application) ? statusVM(application.status) : null,
    sourceCount:
      job.sources.length > 1 ? countLabel(job.sources.length, "source", "sources", ctx.locale) : null,
    sourceNames: job.sources.map(sourceName),
    pendingSync:
      ctx.pendingWrites.has(job.id) || (application !== undefined && ctx.pendingWrites.has(application.id)),
  };
}

/** Band, then newest inside a band, then score; jobs still being scored go last. */
function compareRows(a: JobListRowVM, b: JobListRowVM): number {
  const band = (row: JobListRowVM) => (row.match ? BAND_RANK[row.match.band] : 4);
  const posted = (row: JobListRowVM) => (row.posted ? Date.parse(row.posted.iso) : 0);
  return (
    band(a) - band(b) ||
    posted(b) - posted(a) ||
    (b.match?.score ?? 0) - (a.match?.score ?? 0) ||
    a.title.localeCompare(b.title, "en")
  );
}

function factorText(factor: MatchFactor): string {
  if (factor.status === "outside_prefs") return `Outside your preferences: ${factor.label}`;
  if (factor.status === "missing" && factor.kind === "skill") return `Not in your CV yet: ${factor.label}`;
  return factor.label;
}

function requirementVM(factor: MatchFactor, facet: MatchRequirementFacet): RequirementVM {
  return {
    facet,
    facetLabel: FACET_LABELS[facet],
    status: factor.status,
    statusLabel: FACTOR_STATUS_LABELS[factor.status],
    text:
      factor.status === "not_stated" ? `${factor.label}: ${JOB_DETAIL_COPY.notStated}` : factorText(factor),
    impactLabel: IMPACT_LABELS[factor.impact],
    evidence: factor.evidence && {
      fromLabel: EVIDENCE_FROM_LABELS[factor.evidence.from],
      quote: factor.evidence.quote,
    },
    ai: factor.source === "ai",
  };
}

function factorVM(factor: MatchFactor): FactorVM {
  return {
    kind: factor.kind,
    status: factor.status,
    text: factorText(factor),
    impactLabel: IMPACT_LABELS[factor.impact],
    evidence: factor.evidence && {
      fromLabel: EVIDENCE_FROM_LABELS[factor.evidence.from],
      quote: factor.evidence.quote,
    },
    ai: factor.source === "ai",
    correctable: factor.status === "missing",
  };
}

function matchSectionVM(
  match: JobMatch | undefined,
  data: Pick<UserData, "cvs">,
  ctx: ModelContext,
): MatchSectionVM {
  if (!match) return { state: "pending", label: JOB_DETAIL_COPY.matchPending };
  const cv = data.cvs.find((candidate) => candidate.id === match.basedOnCvId);
  if (!cv) return { state: "noCv", label: JOB_DETAIL_COPY.noCv };
  const factors = [...match.reasons, ...match.gaps];
  const requirements = factors.flatMap((factor) =>
    factor.facet ? [requirementVM(factor, factor.facet)] : [],
  );
  const stated = requirements.filter((item) => item.status !== "not_stated");
  const met = stated.filter((item) => item.status === "met").length;
  const notStated = requirements.length - stated.length;
  const skillTotal = match.skills.matched.length + match.skills.unmatched.length;
  const requirementsCount = stated.length > 0 ? `${met} of ${stated.length} requirements met` : null;
  const gapsCount = match.gaps.length > 0 ? countLabel(match.gaps.length, "gap", "gaps", ctx.locale) : null;
  const counts = [
    requirementsCount,
    notStated > 0 ? `${notStated} not stated` : null,
    skillTotal > 0 ? `${match.skills.matched.length} of ${skillTotal} skills` : null,
    gapsCount,
  ].filter((part) => part !== null);
  const vm = matchVM(match.score);
  const caption = `${match.score} of 100`;
  const outside = requirements.filter((item) => item.status === "outside_prefs");
  const computedAt = relativeTime(match.computedAt, ctx);
  return {
    state: "ready",
    match: vm,
    bandText: vm.pillLabel,
    scoreCaption: caption,
    basisLine: `Based on CV "${cv.title}" · updated ${computedAt.label}`,
    basedOnCvId: cv.id,
    computedAt,
    countsLine: counts.join(" · "),
    accessibleSummary: [
      `${vm.pillLabel}, ${caption}.`,
      requirementsCount && `${requirementsCount}.`,
      gapsCount && `${gapsCount}.`,
    ]
      .filter(Boolean)
      .join(" "),
    defaultOpen: vm.band === "strong" || vm.band === "good",
    outsidePreferences: outside.length > 0 ? outside.map((item) => item.text).join(" · ") : null,
    requirements,
    skills: { matched: match.skills.matched, unmatched: match.skills.unmatched },
    whyItMatches: match.reasons.filter((factor) => factor.kind !== "requirement").map(factorVM),
    gaps: match.gaps.map(factorVM),
    aiSummary: match.rationale,
    summaryNote: match.rationale === null ? JOB_DETAIL_COPY.notTopMatch : null,
  };
}

function yesNo(value: boolean | null): string {
  if (value === null) return JOB_DETAIL_COPY.notStated;
  return value ? "Offered" : "Not offered";
}

function factVM(key: FactVM["key"], label: string, value: string | null, time: TimeVM | null = null): FactVM {
  return {
    key,
    label,
    value: value ?? JOB_DETAIL_COPY.notStated,
    notStated: value === null || value === JOB_DETAIL_COPY.notStated,
    time,
  };
}

function factsVM(job: Job, salary: SalaryVM, ctx: ModelContext): FactVM[] {
  const seen = relativeTime(lastSeen(job), ctx);
  return [
    factVM("salary", "Salary", salary.amount === null ? null : salary.text),
    factVM("workMode", "Work mode", job.remoteType ? REMOTE_LABELS[job.remoteType] : null),
    factVM("whereTheyHire", "Where they hire", whereLine(job)),
    factVM("visa", "Visa sponsorship", yesNo(job.visaSponsorship)),
    factVM("relocation", "Relocation", yesNo(job.relocationSupport)),
    factVM(
      "employmentType",
      "Employment type",
      job.employmentType ? EMPLOYMENT_LABELS[job.employmentType] : null,
    ),
    factVM("lastSeen", "Last seen", seen.label, seen),
  ];
}

/** The listing behind the preferred apply URL (matched by apply link, then listing URL). */
function applySource(job: Job): JobSourceLink | undefined {
  if (job.applyUrl === null) return job.applyEmail === null ? job.sources[0] : undefined;
  return (
    job.sources.find((source) => source.applyUrl === job.applyUrl) ??
    job.sources.find((source) => source.url === job.applyUrl)
  );
}

function applyVM(job: Job, source: JobSourceLink | undefined): ApplyVM {
  const offlineReason = JOB_DETAIL_COPY.needsConnection;
  if (job.applyUrl === null && job.applyEmail !== null)
    return { route: "email", label: "Apply", external: false, target: job.applyEmail, offlineReason };
  const target = job.applyUrl ?? source?.url ?? "";
  if (source?.isDirectFromEmployer)
    return { route: "companySite", label: "Apply on company site", external: true, target, offlineReason };
  const board = source ? sourceName(source) : sourceHost(target);
  return { route: "jobBoard", label: `Apply on ${board}`, external: true, target, offlineReason };
}

function differencesOf(source: JobSourceLink, job: Job, ctx: ModelContext): string[] {
  const differences: string[] = [];
  if (source.title !== job.title) differences.push(`Title: ${source.title}`);
  const canonicalPlace = locationLabel(job);
  if (source.locationText !== null && canonicalPlace !== null && source.locationText !== canonicalPlace)
    differences.push(`Location: ${source.locationText}`);
  const salary = source.salary ? salaryAmount(source.salary, ctx.locale) : null;
  const canonicalSalary = job.salary ? salaryAmount(job.salary, ctx.locale) : null;
  if (salary !== null && salary !== canonicalSalary) differences.push(`Salary: ${salary}`);
  return differences;
}

function sourcesVM(job: Job, used: JobSourceLink | undefined, ctx: ModelContext): SourcesVM {
  const row = (source: JobSourceLink): SourceRowVM => ({
    key: jobSourceKey(source),
    name: sourceName(source),
    url: source.url,
    badge: source.isDirectFromEmployer ? sourceVM("employer") : null,
    posted: source.postedAt ? relativeTime(source.postedAt, ctx) : null,
    differences: differencesOf(source, job, ctx),
    usedForApply: source === used,
    unreachable: isStale(source.lastSeenAt, ctx)
      ? `Not seen on this site since ${shortDate(source.lastSeenAt, ctx)}. The listing may have closed.`
      : null,
  });
  const groups: SourceGroupVM[] = [
    {
      label: JOB_DETAIL_COPY.foundOnDirect,
      rows: job.sources.filter((source) => source.isDirectFromEmployer).map(row),
    },
    {
      label: JOB_DETAIL_COPY.foundOnBoards,
      rows: job.sources.filter((source) => !source.isDirectFromEmployer).map(row),
    },
  ].filter((group) => group.rows.length > 0);
  const total = job.sources.length;
  return {
    title: `Found on ${countLabel(total, "site", "sites", ctx.locale)}`,
    groups,
    total,
    collapsedCount: Math.min(total, SOURCES_COLLAPSED),
    showAllLabel: total > SOURCES_COLLAPSED ? `Show all ${total} sources` : null,
  };
}

function detailVM(job: Job, data: UserData, ctx: ModelContext, rows: readonly JobListRowVM[]): JobDetailVM {
  const match = data.jobMatches.find((candidate) => candidate.id === job.id);
  const application = data.applications.find((candidate) => candidate.jobId === job.id);
  const salary = salaryVM(job.salary, ctx);
  const used = applySource(job);
  const apply = applyVM(job, used);
  const index = rows.findIndex((row) => row.jobId === job.id);
  const primary = job.sources[0];
  const seen = lastSeen(job);
  const paragraphs = job.description
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return {
    jobId: job.id,
    title: job.title,
    company: companyVM(job.company, job.companyDomain),
    location: locationLabel(job),
    workMode: job.remoteType ? REMOTE_LABELS[job.remoteType] : null,
    remoteEligibility: job.remoteEligibility,
    where: whereLine(job),
    employmentType: job.employmentType ? EMPLOYMENT_LABELS[job.employmentType] : null,
    seniority: job.seniority ? SENIORITY_LABELS[job.seniority] : null,
    posted: job.postedAt ? relativeTime(job.postedAt, ctx) : null,
    salary,
    previousJobId: index > 0 ? (rows[index - 1]?.jobId ?? null) : null,
    nextJobId: index >= 0 ? (rows[index + 1]?.jobId ?? null) : null,
    facts: factsVM(job, salary, ctx),
    match: matchSectionVM(match, data, ctx),
    descriptionLanguage: job.language,
    description: paragraphs,
    descriptionCollapsedLines: DESCRIPTION_COLLAPSED_LINES,
    noDescription: paragraphs.length === 0 ? JOB_DETAIL_COPY.noDescription : null,
    delisted:
      primary && isStale(seen, ctx)
        ? `This job is no longer listed. ${sourceName(primary)} removed it on ${shortDate(seen, ctx)}. Your saved copy is below.`
        : null,
    sources: sourcesVM(job, used, ctx),
    originalUrl: primary?.url ?? apply.target,
    apply,
    applied: hasApplied(application)
      ? {
          applicationId: application.id,
          label: application.appliedAt ? `Applied ${shortDate(application.appliedAt, ctx)}` : "Applied",
          linkLabel: JOB_DETAIL_COPY.viewInTracker,
        }
      : null,
    saved: match?.state === "saved" || application?.status === "saved",
    hidden: match?.state === "dismissed" || isHiddenCompany(job, data),
    application: hasApplied(application) ? applicationSummaryVM(application, data, ctx) : null,
    submitPrompt:
      application?.status === "preparing" && apply.external
        ? { applicationId: application.id, question: `Did you submit your application to ${job.company}?` }
        : null,
    pendingSync:
      ctx.pendingWrites.has(job.id) || (application !== undefined && ctx.pendingWrites.has(application.id)),
  };
}

export function buildJobDetailModel(
  data: UserData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): JobDetailModel {
  const rows = data.jobs
    .filter((job) => !isHiddenCompany(job, data))
    .flatMap((job) => {
      const match = data.jobMatches.find((candidate) => candidate.id === job.id);
      if (match?.state === "dismissed") return [];
      const application = data.applications.find((candidate) => candidate.jobId === job.id);
      return [rowVM(job, match, application, ctx)];
    })
    .sort(compareRows);

  const requested = params.jobId === undefined ? undefined : data.jobs.find((job) => job.id === params.jobId);
  const selectedJobId = requested?.id ?? rows[0]?.jobId ?? null;
  const selected = data.jobs.find((job) => job.id === selectedJobId);

  let empty: JobsEmptyVM | null = null;
  if (data.jobs.length === 0)
    empty = {
      kind: "firstUse",
      title: "No jobs yet",
      body: "Search for a role and save the search. We'll collect matching jobs here and rank them against your CV.",
      action: "Search jobs",
    };
  else if (rows.length === 0)
    empty = {
      kind: "caughtUp",
      title: "No jobs to show",
      body: "Jobs you marked Not for me are in Hidden. New matches will show up here.",
      action: null,
    };

  return {
    list: {
      rows,
      countLabel: countLabel(rows.length, "job", "jobs", ctx.locale),
      sortLabel: JOB_DETAIL_COPY.sortLabel,
      rankingInfo: JOB_DETAIL_COPY.rankingInfo,
      empty,
    },
    selectedJobId,
    noSelection: { title: JOB_DETAIL_COPY.noSelection, hint: JOB_DETAIL_COPY.noSelectionHint },
    detail: selected ? detailVM(selected, data, ctx, rows) : null,
  };
}
