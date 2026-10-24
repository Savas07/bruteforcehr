/**
 * Jobs list + job detail view-model (`/jobs`, `/jobs/$jobId`, param `jobId`).
 * research/job-detail.md "Decision — Desktop" (header, action row, match section, Details rail,
 * Found on), job-feed-search.md "Decision — Desktop" for the list pane (rows ranked by match band,
 * then newest), states.md "Job detail" rows (nothing selected, no description, delisted) and
 * system.md: bands in lists, "72 of 100" in detail.
 */
import {
  type Application,
  type DismissReason,
  DismissReasonSchema,
  type EmploymentType,
  type Job,
  type JobMatch,
  type JobSourceLink,
  jobSourceKey,
  type JobSourceStatus,
  type KnownJobSource,
  type MatchBand,
  type MatchEvidence,
  type MatchFactor,
  type MatchFactorKind,
  type MatchFactorStatus,
  type MatchImpact,
  type MatchRequirementFacet,
  passesSearchFilters,
  type RemoteType,
  type SalaryRange,
  type Seniority,
  statusPhase,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type { ApplicationSummaryVM } from "../../shared/model/blocks";
import { applicationSummaryVM } from "../../shared/model/build-blocks";
import { calendarDaysFromNow, money, relativeTime, shortDate } from "../../shared/model/format";
import type {
  CompanyVM,
  MatchVM,
  ModelContext,
  ScreenData,
  SourceVM,
  StatusVM,
  TimeVM,
} from "../../shared/model/types";
import { companyVM, matchVM, sourceVM, statusVM } from "../../shared/model/vocabulary";
import {
  buildFilterBar,
  clearFacet,
  type FilterBarVM,
  removableChips,
  type RemovableChipVM,
  savedSearchItems,
  type SavedSearchItemVM,
} from "./filterBarModel";
import { type JobsFilterState, matchesQuery, readFilterParams } from "./filters";

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
const COPY_MESSAGES = defineMessages({
  sortLabel: { id: "job-detail.copy.sortLabel", defaultMessage: "Best match" },
  rankingInfo: {
    id: "job-detail.copy.rankingInfo",
    defaultMessage: "Sorted by match, then newest. Scores are a rough guide, not a prediction.",
  },
  sortNewest: { id: "job-detail.copy.sortNewest", defaultMessage: "Newest" },
  rankingNewest: {
    id: "job-detail.copy.rankingNewest",
    defaultMessage: "Sorted by posting date, newest first. Scores are a rough guide, not a prediction.",
  },
  save: { id: "job-detail.copy.save", defaultMessage: "Save" },
  saved: { id: "job-detail.copy.saved", defaultMessage: "Saved" },
  notForMe: { id: "job-detail.copy.notForMe", defaultMessage: "Not for me" },
  openOriginal: { id: "job-detail.copy.openOriginal", defaultMessage: "Open original" },
  viewInTracker: { id: "job-detail.copy.viewInTracker", defaultMessage: "View in Tracker" },
  needsConnection: { id: "job-detail.copy.needsConnection", defaultMessage: "Needs a connection" },
  hidden: { id: "job-detail.copy.hidden", defaultMessage: "Hidden from your feed" },
  undo: { id: "job-detail.copy.undo", defaultMessage: "Undo" },
  whyItMatches: { id: "job-detail.copy.whyItMatches", defaultMessage: "Why it matches" },
  gapsToConsider: { id: "job-detail.copy.gapsToConsider", defaultMessage: "Gaps to consider" },
  requirements: { id: "job-detail.copy.requirements", defaultMessage: "Requirements" },
  skills: { id: "job-detail.copy.skills", defaultMessage: "Skills" },
  haveThis: { id: "job-detail.copy.haveThis", defaultMessage: "I have this" },
  addToCv: { id: "job-detail.copy.addToCv", defaultMessage: "Add to CV…" },
  changeCv: {
    id: "job-detail.copy.changeCv",
    defaultMessage: "Change",
    description: "Button after the CV basis line",
  },
  explainerLink: { id: "job-detail.copy.explainerLink", defaultMessage: "What goes into this score?" },
  explainer: {
    id: "job-detail.copy.explainer",
    defaultMessage:
      "A rough guide to how this job fits your CV and preferences. It isn't a prediction of your chances.",
  },
  aiSummary: { id: "job-detail.copy.aiSummary", defaultMessage: "Summary · can be wrong" },
  aiFactor: { id: "job-detail.copy.aiFactor", defaultMessage: "AI · can be wrong" },
  notTopMatch: {
    id: "job-detail.copy.notTopMatch",
    defaultMessage: "A written summary is created for your top matches.",
  },
  matchPending: { id: "job-detail.copy.matchPending", defaultMessage: "Working out your match…" },
  noCv: { id: "job-detail.copy.noCv", defaultMessage: "Pick a CV to see how this fits" },
  details: { id: "job-detail.copy.details", defaultMessage: "Details" },
  foundOnDirect: { id: "job-detail.copy.foundOnDirect", defaultMessage: "Direct from employer" },
  foundOnBoards: { id: "job-detail.copy.foundOnBoards", defaultMessage: "Job boards" },
  sourcesFootnote: {
    id: "job-detail.copy.sourcesFootnote",
    defaultMessage: "Collected from public job sites. Details can differ between sources.",
  },
  usedForApply: { id: "job-detail.copy.usedForApply", defaultMessage: "Used for Apply" },
  showMore: { id: "job-detail.copy.showMore", defaultMessage: "Show more" },
  showLess: { id: "job-detail.copy.showLess", defaultMessage: "Show less" },
  noDescription: { id: "job-detail.copy.noDescription", defaultMessage: "This posting has no description." },
  openOriginalPosting: {
    id: "job-detail.copy.openOriginalPosting",
    defaultMessage: "Open the original posting",
  },
  noSelection: { id: "job-detail.copy.noSelection", defaultMessage: "Select a job to see the details" },
  noSelectionHint: { id: "job-detail.copy.noSelectionHint", defaultMessage: "↑ ↓ to move · Enter to open" },
  notStated: { id: "job-detail.copy.notStated", defaultMessage: "Not stated" },
});

/** The static copy of the Jobs list and detail, formatted for the current locale. */
export type JobDetailCopyVM = Readonly<Record<keyof typeof COPY_MESSAGES, string>>;

const messages = defineMessages({
  salaryRange: { id: "job-detail.salary.range", defaultMessage: "{min}–{max}" },
  salaryFrom: { id: "job-detail.salary.from", defaultMessage: "From {min}" },
  salaryUpTo: { id: "job-detail.salary.upTo", defaultMessage: "Up to {max}" },
  salaryPeriod: {
    id: "job-detail.salary.period",
    defaultMessage:
      "{period, select, year {{range} a year} month {{range} a month} day {{range} a day} other {{range} an hour}}",
  },
  salaryNotStated: { id: "job-detail.salary.notStated", defaultMessage: "Salary not stated" },
  salaryEstimate: { id: "job-detail.salary.estimate", defaultMessage: "{amount} · estimate" },
  salaryFromEmployer: { id: "job-detail.salary.fromEmployer", defaultMessage: "{amount} · from employer" },
  salaryFromEmployerShort: {
    id: "job-detail.salary.fromEmployerShort",
    defaultMessage: "{amount} · employer",
    description: "Job list rows: short salary provenance; the full '· from employer' is in the tooltip",
  },
  scoreCaption: { id: "job-detail.match.scoreCaption", defaultMessage: "{score} of 100" },
  sourceCount: {
    id: "job-detail.list.sourceCount",
    defaultMessage: "{count, plural, one {# source} other {# sources}}",
  },
  jobCount: { id: "job-detail.list.jobCount", defaultMessage: "{count, plural, one {# job} other {# jobs}}" },
  outsidePrefs: { id: "job-detail.match.outsidePrefs", defaultMessage: "Outside your preferences: {detail}" },
  notInCv: { id: "job-detail.match.notInCv", defaultMessage: "Not in your CV yet: {skill}" },
  requirementNotStated: {
    id: "job-detail.match.requirementNotStated",
    defaultMessage: "{label}: Not stated",
  },
  requirementsMet: {
    id: "job-detail.match.requirementsMet",
    defaultMessage: "{met} of {total} requirements met",
  },
  requirementsMetSentence: {
    id: "job-detail.match.requirementsMetSentence",
    defaultMessage: "{met} of {total} requirements met.",
  },
  countNotStated: {
    id: "job-detail.match.countNotStated",
    defaultMessage: "{count, plural, other {# not stated}}",
  },
  countSkills: { id: "job-detail.match.countSkills", defaultMessage: "{matched} of {total} skills" },
  countGaps: {
    id: "job-detail.match.countGaps",
    defaultMessage: "{count, plural, one {# gap} other {# gaps}}",
  },
  countGapsSentence: {
    id: "job-detail.match.countGapsSentence",
    defaultMessage: "{count, plural, one {# gap.} other {# gaps.}}",
  },
  summaryHead: { id: "job-detail.match.summaryHead", defaultMessage: "{band}, {caption}." },
  basisLine: {
    id: "job-detail.match.basisLine",
    defaultMessage: 'Based on CV "{name}" · updated {time}',
    description: "{time} is a relative time such as “3 hours ago”",
  },
  offered: { id: "job-detail.facts.offered", defaultMessage: "Offered" },
  notOffered: { id: "job-detail.facts.notOffered", defaultMessage: "Not offered" },
  factSalary: { id: "job-detail.facts.salary", defaultMessage: "Salary" },
  factWorkMode: { id: "job-detail.facts.workMode", defaultMessage: "Work mode" },
  factWhereTheyHire: { id: "job-detail.facts.whereTheyHire", defaultMessage: "Where they hire" },
  factVisa: { id: "job-detail.facts.visa", defaultMessage: "Visa sponsorship" },
  factRelocation: { id: "job-detail.facts.relocation", defaultMessage: "Relocation" },
  factEmploymentType: { id: "job-detail.facts.employmentType", defaultMessage: "Employment type" },
  factLastSeen: { id: "job-detail.facts.lastSeen", defaultMessage: "Last seen" },
  applyByEmail: { id: "job-detail.apply.byEmail", defaultMessage: "Apply by email" },
  applyCompanySite: { id: "job-detail.apply.companySite", defaultMessage: "Apply on company site" },
  applyOnBoard: { id: "job-detail.apply.onBoard", defaultMessage: "Apply on {board}" },
  differenceTitle: { id: "job-detail.sources.differenceTitle", defaultMessage: "Title: {value}" },
  differenceLocation: { id: "job-detail.sources.differenceLocation", defaultMessage: "Location: {value}" },
  differenceSalary: { id: "job-detail.sources.differenceSalary", defaultMessage: "Salary: {value}" },
  unreachable: {
    id: "job-detail.sources.unreachable",
    defaultMessage: "Not seen on this site since {date}. The listing may have closed.",
  },
  foundOn: {
    id: "job-detail.sources.foundOn",
    defaultMessage: "{count, plural, one {Found on # site} other {Found on # sites}}",
  },
  showAll: {
    id: "job-detail.sources.showAll",
    defaultMessage: "{count, plural, other {Show all # sources}}",
  },
  delisted: {
    id: "job-detail.detail.delisted",
    defaultMessage: "This job is no longer listed. {source} removed it on {date}. Your saved copy is below.",
  },
  appliedOn: { id: "job-detail.detail.appliedOn", defaultMessage: "Applied {date}" },
  applied: { id: "job-detail.detail.applied", defaultMessage: "Applied" },
  submitQuestion: {
    id: "job-detail.detail.submitQuestion",
    defaultMessage: "Did you submit your application to {company}?",
  },
  firstUseTitle: { id: "job-detail.empty.firstUseTitle", defaultMessage: "No jobs yet" },
  firstUseBody: {
    id: "job-detail.empty.firstUseBody",
    defaultMessage:
      "Search for a role and save the search. We'll collect matching jobs here and rank them against your CV.",
  },
  firstUseAction: { id: "job-detail.empty.firstUseAction", defaultMessage: "Search jobs" },
  noResultsTitle: {
    id: "job-detail.empty.noResultsTitle",
    defaultMessage: "No jobs match “{query}”",
  },
  noResultsBody: {
    id: "job-detail.empty.noResultsBody",
    defaultMessage: "Try another word, or clear the search to see all your jobs.",
  },
  noResultsAction: { id: "job-detail.empty.noResultsAction", defaultMessage: "Clear search" },
  noFilterResultsTitle: {
    id: "job-detail.empty.noFilterResultsTitle",
    defaultMessage: "No jobs match all of these filters",
  },
  noFilterResultsBody: {
    id: "job-detail.empty.noFilterResultsBody",
    defaultMessage: "Try removing one, or search the job sites for more.",
  },
  noFilterResultsBodyNoQuery: {
    id: "job-detail.empty.noFilterResultsBodyNoQuery",
    defaultMessage: "Try removing one to see more of your jobs.",
  },
  noFilterResultsAction: {
    id: "job-detail.empty.noFilterResultsAction",
    defaultMessage: "Remove all filters",
  },
  searchSitesAction: {
    id: "job-detail.empty.searchSitesAction",
    defaultMessage: "Search job sites for “{query}”",
  },
  caughtUpTitle: { id: "job-detail.empty.caughtUpTitle", defaultMessage: "No jobs to show" },
  caughtUpBody: {
    id: "job-detail.empty.caughtUpBody",
    defaultMessage: "Jobs you marked Not for me are in Hidden jobs. New matches will show up here.",
  },
  sourcesReady: {
    id: "job-detail.sources.ready",
    defaultMessage:
      "{count, plural, one {Searches # job site: {names}.} other {Searches # job sites: {names}.}}",
  },
  sourcesWaiting: {
    id: "job-detail.sources.waiting",
    defaultMessage: "{names} start once their access keys are added.",
  },
  sourcesNone: {
    id: "job-detail.sources.none",
    defaultMessage: "No job site can be searched right now. Paste a link to a posting to add it here.",
  },
  sourcesTrouble: {
    id: "job-detail.sources.trouble",
    defaultMessage: "{names} didn't answer last time; results from them may be missing.",
  },
  applyByEmailInstead: { id: "job-detail.apply.byEmailInstead", defaultMessage: "Apply by email instead" },
});

const REMOTE_MESSAGES: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  onsite: { id: "job-detail.remote.onsite", defaultMessage: "On-site" },
  hybrid: { id: "job-detail.remote.hybrid", defaultMessage: "Hybrid" },
  remote: { id: "job-detail.remote.remote", defaultMessage: "Remote" },
});

const EMPLOYMENT_MESSAGES: Readonly<Record<EmploymentType, MessageDescriptor>> = defineMessages({
  full_time: { id: "job-detail.employment.fullTime", defaultMessage: "Full-time" },
  part_time: { id: "job-detail.employment.partTime", defaultMessage: "Part-time" },
  contract: { id: "job-detail.employment.contract", defaultMessage: "Contract" },
  internship: { id: "job-detail.employment.internship", defaultMessage: "Internship" },
  temporary: { id: "job-detail.employment.temporary", defaultMessage: "Temporary" },
});

const SENIORITY_MESSAGES: Readonly<Record<Seniority, MessageDescriptor>> = defineMessages({
  intern: { id: "job-detail.seniority.intern", defaultMessage: "Intern" },
  junior: { id: "job-detail.seniority.junior", defaultMessage: "Junior" },
  mid: { id: "job-detail.seniority.mid", defaultMessage: "Mid-level" },
  senior: { id: "job-detail.seniority.senior", defaultMessage: "Senior" },
  staff: { id: "job-detail.seniority.staff", defaultMessage: "Staff" },
  principal: { id: "job-detail.seniority.principal", defaultMessage: "Principal" },
  lead: { id: "job-detail.seniority.lead", defaultMessage: "Lead" },
  manager: { id: "job-detail.seniority.manager", defaultMessage: "Manager" },
  director: { id: "job-detail.seniority.director", defaultMessage: "Director" },
});

const DISMISS_REASON_MESSAGES: Readonly<Record<DismissReason, MessageDescriptor>> = defineMessages({
  not_relevant: { id: "job-detail.dismissReason.notRelevant", defaultMessage: "Role or skills" },
  location: { id: "job-detail.dismissReason.location", defaultMessage: "Location" },
  salary: { id: "job-detail.dismissReason.salary", defaultMessage: "Salary" },
  seniority: { id: "job-detail.dismissReason.seniority", defaultMessage: "Seniority" },
  company: { id: "job-detail.dismissReason.company", defaultMessage: "Company" },
  language: { id: "job-detail.dismissReason.language", defaultMessage: "Language" },
  visa: { id: "job-detail.dismissReason.visa", defaultMessage: "Visa or work permit" },
  already_applied: { id: "job-detail.dismissReason.alreadyApplied", defaultMessage: "Already applied" },
  other: { id: "job-detail.dismissReason.other", defaultMessage: "Something else" },
});

/** The list's scope (IA.md: Jobs › Saved · Hidden jobs, nested in the sidebar), from `?scope=`. */
export const JOBS_SCOPES = ["all", "saved", "hidden"] as const;
export type JobsScope = (typeof JOBS_SCOPES)[number];

export const SCOPE_MESSAGES: Readonly<Record<JobsScope, MessageDescriptor>> = defineMessages({
  all: { id: "job-detail.scope.all", defaultMessage: "All jobs" },
  saved: { id: "job-detail.scope.saved", defaultMessage: "Saved" },
  hidden: { id: "job-detail.scope.hidden", defaultMessage: "Hidden jobs" },
});

const CAUGHT_UP_MESSAGES: Readonly<Record<JobsScope, { title: MessageDescriptor; body: MessageDescriptor }>> =
  {
    all: { title: messages.caughtUpTitle, body: messages.caughtUpBody },
    saved: defineMessages({
      title: { id: "job-detail.empty.savedTitle", defaultMessage: "No saved jobs" },
      body: {
        id: "job-detail.empty.savedBody",
        defaultMessage: "Save a job with S or the bookmark and it stays here while you decide.",
      },
    }),
    hidden: defineMessages({
      title: { id: "job-detail.empty.hiddenTitle", defaultMessage: "No hidden jobs" },
      body: {
        id: "job-detail.empty.hiddenBody",
        defaultMessage: "Jobs you mark Not for me move here, so you can bring one back any time.",
      },
    }),
  };

/** "Best match" order: band first, so 1–2 point differences don't reorder results. */
const BAND_RANK: Readonly<Record<MatchBand, number>> = { strong: 0, good: 1, partial: 2, stretch: 3 };

const FACET_MESSAGES: Readonly<Record<MatchRequirementFacet, MessageDescriptor>> = defineMessages({
  location: { id: "job-detail.facet.location", defaultMessage: "Location" },
  remote: { id: "job-detail.facet.remote", defaultMessage: "Remote" },
  authorization: { id: "job-detail.facet.authorization", defaultMessage: "Work authorization" },
  salary: { id: "job-detail.facet.salary", defaultMessage: "Salary" },
  seniority: { id: "job-detail.facet.seniority", defaultMessage: "Seniority" },
  language: { id: "job-detail.facet.language", defaultMessage: "Language" },
});

const FACTOR_STATUS_MESSAGES: Readonly<Record<MatchFactorStatus, MessageDescriptor>> = defineMessages({
  met: { id: "job-detail.factorStatus.met", defaultMessage: "Met" },
  partial: { id: "job-detail.factorStatus.partial", defaultMessage: "Partly met" },
  missing: { id: "job-detail.factorStatus.missing", defaultMessage: "Not in your CV yet" },
  outside_prefs: { id: "job-detail.factorStatus.outsidePrefs", defaultMessage: "Outside your preferences" },
  not_stated: { id: "job-detail.factorStatus.notStated", defaultMessage: "Not stated" },
});

const IMPACT_MESSAGES: Readonly<Record<MatchImpact, MessageDescriptor>> = defineMessages({
  most: { id: "job-detail.impact.most", defaultMessage: "Matters most" },
  some: { id: "job-detail.impact.some", defaultMessage: "Matters some" },
});

const EVIDENCE_FROM_MESSAGES: Readonly<Record<MatchEvidence["from"], MessageDescriptor>> = defineMessages({
  posting: { id: "job-detail.evidence.posting", defaultMessage: "From the posting" },
  cv: { id: "job-detail.evidence.cv", defaultMessage: "From your CV" },
  profile: { id: "job-detail.evidence.profile", defaultMessage: "From your profile" },
});

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
  personio: "Personio",
  bundesagentur: "Bundesagentur für Arbeit",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  kariyer: "Kariyer.net",
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
  /** List rows: "€55,000–€68,000 a year · employer", "… · estimate"; `text` is the tooltip. */
  readonly shortText: string;
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
  /** The primary listing, for the row's Open original (`O`). */
  readonly originalUrl: string;
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
  /** AI-derived: show `copy.aiFactor`. */
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
  /** The skill "I have this" adds to the profile ("GraphQL"); null for other factors. */
  readonly skill: string | null;
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
      /** The user's active CVs for the basis line's Change menu (current one included). */
      readonly cvOptions: readonly { readonly id: string; readonly title: string }[];
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
      /** The AI rationale (top N only), labelled `copy.aiSummary`; null below the top N. */
      readonly aiSummary: string | null;
      /** `copy.notTopMatch` when there is no AI summary; else null. */
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
  /** "Apply on company site", "Apply on Reed", "Apply by email". */
  readonly label: string;
  /** Leaves the app: show ↗ and open in the default browser. */
  readonly external: boolean;
  /** The URL, or the address for the email route. */
  readonly target: string;
  /** Disabled reason while offline ("Needs a connection"). */
  readonly offlineReason: string;
  /** "Apply by email instead" when the route is a site but the posting also names an address; else null. */
  readonly emailAlternative: string | null;
}

/** The CV an external apply pins (the match's basis, else the default or newest active CV). */
export interface ApplyCvVM {
  readonly cvId: string;
  readonly cvRevisionId: string;
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
  /** "This posting has no description." + `copy.openOriginalPosting`; null when there is one. */
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
  /** What "Yes, I applied" pins; null without any CV. */
  readonly applyCv: ApplyCvVM | null;
  readonly pendingSync: boolean;
}

/** Empty list pane (states.md empty kinds). */
export interface JobsEmptyVM {
  /** `firstUse`: no jobs yet; `noResults`: the search or filters hide every job; `caughtUp`: every job is hidden. */
  readonly kind: "firstUse" | "noResults" | "caughtUp";
  readonly title: string;
  readonly body: string;
  /** Primary CTA: focuses the search field (first use) or clears the search / filters (no results); null for caught-up. */
  readonly action: string | null;
  /** No results: the active filters as removable chips (job-feed-search.md 7). */
  readonly chips: readonly RemovableChipVM[];
  /** "Search job sites for “react”" while there is search text; else null. */
  readonly searchAction: string | null;
}

/** One choice in the optional "What didn't fit?" popover (`DismissReasonPopover`). */
export interface DismissReasonVM {
  readonly key: DismissReason;
  /** "Location", "Already applied". */
  readonly label: string;
}

export interface JobDetailModel {
  /** Static labels of the list and detail panes (buttons, headings, notes). */
  readonly copy: JobDetailCopyVM;
  readonly list: {
    readonly rows: readonly JobListRowVM[];
    /** "37 jobs". */
    readonly countLabel: string;
    readonly sortLabel: string;
    readonly rankingInfo: string;
    /** The search text (`q` param) the rows are filtered by; "" when there is none. */
    readonly query: string;
    readonly empty: JobsEmptyVM | null;
  };
  /** The scope the list shows (sidebar children under Jobs: `SCOPE_MESSAGES`). */
  readonly scope: JobsScope;
  /** Search, filters and sort from the route (`filters.ts`). */
  readonly search: JobsFilterState;
  readonly filterBar: FilterBarVM;
  /** Saved searches nested under Jobs in the sidebar. */
  readonly savedSearches: readonly SavedSearchItemVM[];
  /** Multi-select reasons for Not for me, in the core enum's order (numbered 1–9 on desktop). */
  readonly dismissReasons: readonly DismissReasonVM[];
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

/** Display name of a job source slug ("greenhouse" → "Greenhouse"); null for unnamed or unknown sources. */
export function jobSourceName(slug: string): string | null {
  return isKnownSource(slug) ? SOURCE_NAMES[slug] : null;
}

function sourceName(link: JobSourceLink): string {
  return (isKnownSource(link.source) ? SOURCE_NAMES[link.source] : null) ?? sourceHost(link.url);
}

function salaryAmount(salary: SalaryRange, ctx: ModelContext): string {
  const { min, max, currency, period } = salary;
  const { intl, locale } = ctx;
  let range: string;
  if (min !== null && max !== null && min !== max)
    range = intl.formatMessage(messages.salaryRange, {
      min: money(min, currency, locale),
      max: money(max, currency, locale),
    });
  else if (min !== null && max === null)
    range = intl.formatMessage(messages.salaryFrom, { min: money(min, currency, locale) });
  else if (min === null && max !== null)
    range = intl.formatMessage(messages.salaryUpTo, { max: money(max, currency, locale) });
  else range = money(min ?? 0, currency, locale);
  return intl.formatMessage(messages.salaryPeriod, { period, range });
}

function salaryVM(salary: SalaryRange | null, ctx: ModelContext): SalaryVM {
  const { intl } = ctx;
  if (!salary) {
    const text = intl.formatMessage(messages.salaryNotStated);
    return { provenance: "notStated", amount: null, text, shortText: text };
  }
  const amount = salaryAmount(salary, ctx);
  if (salary.estimated) {
    const text = intl.formatMessage(messages.salaryEstimate, { amount });
    return { provenance: "estimated", amount, text, shortText: text };
  }
  return {
    provenance: "stated",
    amount,
    text: intl.formatMessage(messages.salaryFromEmployer, { amount }),
    shortText: intl.formatMessage(messages.salaryFromEmployerShort, { amount }),
  };
}

function locationLabel(job: Job): string | null {
  return job.locations.length > 0 ? job.locations.map((location) => location.label).join(" · ") : null;
}

/** The work mode ("Hybrid"); null when the posting doesn't say. */
function remoteLabel(job: Job, intl: IntlShape): string | null {
  return job.remoteType ? intl.formatMessage(REMOTE_MESSAGES[job.remoteType]) : null;
}

/** "Remote · EU only" for remote roles; otherwise the place plus the work mode unless the label already says it. */
function whereLine(job: Job, ctx: ModelContext): string | null {
  const mode = remoteLabel(job, ctx.intl);
  if (job.remoteType === "remote") return [mode, job.remoteEligibility].filter(Boolean).join(" · ");
  const place = locationLabel(job);
  if (place === null) return mode;
  if (mode === null || place.toLocaleLowerCase(ctx.locale).includes(mode.toLocaleLowerCase(ctx.locale)))
    return place;
  return `${place} · ${mode}`;
}

function isHiddenCompany(job: Job, data: Pick<ScreenData, "profile">): boolean {
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
  const { intl } = ctx;
  return {
    jobId: job.id,
    title: job.title,
    company: companyVM(job.company, job.companyDomain),
    where: whereLine(job, ctx),
    salary: salaryVM(job.salary, ctx),
    match: match ? matchVM(match.score, intl) : null,
    scoreCaption: match ? intl.formatMessage(messages.scoreCaption, { score: match.score }) : null,
    posted: job.postedAt ? relativeTime(job.postedAt, ctx) : null,
    // D02: a tracked job is Saved while its application is; otherwise the match's bookmark says.
    saved: application ? application.status === "saved" : match?.state === "saved",
    status: hasApplied(application) ? statusVM(application.status, intl) : null,
    sourceCount:
      job.sources.length > 1 ? intl.formatMessage(messages.sourceCount, { count: job.sources.length }) : null,
    sourceNames: job.sources.map(sourceName),
    pendingSync:
      ctx.pendingWrites.has(job.id) || (application !== undefined && ctx.pendingWrites.has(application.id)),
    originalUrl: job.sources[0]?.url ?? job.applyUrl ?? "",
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

function factorText(factor: MatchFactor, intl: IntlShape): string {
  if (factor.status === "outside_prefs")
    return intl.formatMessage(messages.outsidePrefs, { detail: factor.label });
  if (factor.status === "missing" && factor.kind === "skill")
    return intl.formatMessage(messages.notInCv, { skill: factor.label });
  return factor.label;
}

function requirementVM(factor: MatchFactor, facet: MatchRequirementFacet, intl: IntlShape): RequirementVM {
  return {
    facet,
    facetLabel: intl.formatMessage(FACET_MESSAGES[facet]),
    status: factor.status,
    statusLabel: intl.formatMessage(FACTOR_STATUS_MESSAGES[factor.status]),
    text:
      factor.status === "not_stated"
        ? intl.formatMessage(messages.requirementNotStated, { label: factor.label })
        : factorText(factor, intl),
    impactLabel: intl.formatMessage(IMPACT_MESSAGES[factor.impact]),
    evidence: factor.evidence && {
      fromLabel: intl.formatMessage(EVIDENCE_FROM_MESSAGES[factor.evidence.from]),
      quote: factor.evidence.quote,
    },
    ai: factor.source === "ai",
  };
}

function factorVM(factor: MatchFactor, intl: IntlShape): FactorVM {
  return {
    kind: factor.kind,
    status: factor.status,
    text: factorText(factor, intl),
    impactLabel: intl.formatMessage(IMPACT_MESSAGES[factor.impact]),
    evidence: factor.evidence && {
      fromLabel: intl.formatMessage(EVIDENCE_FROM_MESSAGES[factor.evidence.from]),
      quote: factor.evidence.quote,
    },
    ai: factor.source === "ai",
    correctable: factor.status === "missing",
    skill: factor.kind === "skill" ? factor.label : null,
  };
}

function matchSectionVM(
  match: JobMatch | undefined,
  data: Pick<ScreenData, "cvs">,
  ctx: ModelContext,
): MatchSectionVM {
  const { intl } = ctx;
  if (!match) return { state: "pending", label: intl.formatMessage(COPY_MESSAGES.matchPending) };
  const cv = data.cvs.find((candidate) => candidate.id === match.basedOnCvId);
  if (!cv) return { state: "noCv", label: intl.formatMessage(COPY_MESSAGES.noCv) };
  const factors = [...match.reasons, ...match.gaps];
  const requirements = factors.flatMap((factor) =>
    factor.facet ? [requirementVM(factor, factor.facet, intl)] : [],
  );
  const stated = requirements.filter((item) => item.status !== "not_stated");
  const met = stated.filter((item) => item.status === "met").length;
  const notStated = requirements.length - stated.length;
  const skillTotal = match.skills.matched.length + match.skills.unmatched.length;
  const gaps = match.gaps.length;
  const counts = [
    stated.length > 0 ? intl.formatMessage(messages.requirementsMet, { met, total: stated.length }) : null,
    notStated > 0 ? intl.formatMessage(messages.countNotStated, { count: notStated }) : null,
    skillTotal > 0
      ? intl.formatMessage(messages.countSkills, { matched: match.skills.matched.length, total: skillTotal })
      : null,
    gaps > 0 ? intl.formatMessage(messages.countGaps, { count: gaps }) : null,
  ].filter((part) => part !== null);
  const vm = matchVM(match.score, intl);
  const caption = intl.formatMessage(messages.scoreCaption, { score: match.score });
  const outside = requirements.filter((item) => item.status === "outside_prefs");
  const computedAt = relativeTime(match.computedAt, ctx);
  return {
    state: "ready",
    match: vm,
    bandText: vm.pillLabel,
    scoreCaption: caption,
    basisLine: intl.formatMessage(messages.basisLine, { name: cv.title, time: computedAt.label }),
    basedOnCvId: cv.id,
    cvOptions: data.cvs
      .filter((candidate) => candidate.archivedAt === null)
      .map((candidate) => ({ id: candidate.id, title: candidate.title })),
    computedAt,
    countsLine: counts.join(" · "),
    accessibleSummary: [
      intl.formatMessage(messages.summaryHead, { band: vm.pillLabel, caption }),
      stated.length > 0
        ? intl.formatMessage(messages.requirementsMetSentence, { met, total: stated.length })
        : null,
      gaps > 0 ? intl.formatMessage(messages.countGapsSentence, { count: gaps }) : null,
    ]
      .filter((part) => part !== null)
      .join(" "),
    defaultOpen: vm.band === "strong" || vm.band === "good",
    outsidePreferences:
      outside.length > 0
        ? intl.formatMessage(messages.outsidePrefs, {
            detail: intl.formatList(
              factors
                .filter((factor) => factor.facet && factor.status === "outside_prefs")
                .map((factor) => factor.label),
              { type: "conjunction" },
            ),
          })
        : null,
    requirements,
    skills: { matched: match.skills.matched, unmatched: match.skills.unmatched },
    whyItMatches: match.reasons
      .filter((factor) => factor.kind !== "requirement")
      .map((factor) => factorVM(factor, intl)),
    gaps: match.gaps.map((factor) => factorVM(factor, intl)),
    aiSummary: match.rationale,
    summaryNote: match.rationale === null ? intl.formatMessage(COPY_MESSAGES.notTopMatch) : null,
  };
}

function factsVM(job: Job, salary: SalaryVM, ctx: ModelContext): FactVM[] {
  const { intl } = ctx;
  const notStated = intl.formatMessage(COPY_MESSAGES.notStated);
  const fact = (
    key: FactVM["key"],
    label: MessageDescriptor,
    value: string | null,
    time: TimeVM | null = null,
  ): FactVM => ({
    key,
    label: intl.formatMessage(label),
    value: value ?? notStated,
    notStated: value === null,
    time,
  });
  const offered = (value: boolean | null) =>
    value === null ? null : intl.formatMessage(value ? messages.offered : messages.notOffered);
  const seen = relativeTime(lastSeen(job), ctx);
  return [
    fact("salary", messages.factSalary, salary.amount === null ? null : salary.text),
    fact("workMode", messages.factWorkMode, remoteLabel(job, intl)),
    fact("whereTheyHire", messages.factWhereTheyHire, whereLine(job, ctx)),
    fact("visa", messages.factVisa, offered(job.visaSponsorship)),
    fact("relocation", messages.factRelocation, offered(job.relocationSupport)),
    fact(
      "employmentType",
      messages.factEmploymentType,
      job.employmentType ? intl.formatMessage(EMPLOYMENT_MESSAGES[job.employmentType]) : null,
    ),
    fact("lastSeen", messages.factLastSeen, seen.label, seen),
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

function applyVM(job: Job, source: JobSourceLink | undefined, intl: IntlShape): ApplyVM {
  const offlineReason = intl.formatMessage(COPY_MESSAGES.needsConnection);
  if (job.applyUrl === null && job.applyEmail !== null)
    return {
      route: "email",
      label: intl.formatMessage(messages.applyByEmail),
      external: false,
      target: job.applyEmail,
      offlineReason,
      emailAlternative: null,
    };
  const target = job.applyUrl ?? source?.url ?? "";
  if (source?.isDirectFromEmployer)
    return {
      route: "companySite",
      label: intl.formatMessage(messages.applyCompanySite),
      external: true,
      target,
      offlineReason,
      emailAlternative: job.applyEmail === null ? null : intl.formatMessage(messages.applyByEmailInstead),
    };
  const board = source ? sourceName(source) : sourceHost(target);
  return {
    route: "jobBoard",
    label: intl.formatMessage(messages.applyOnBoard, { board }),
    external: true,
    target,
    offlineReason,
    emailAlternative: job.applyEmail === null ? null : intl.formatMessage(messages.applyByEmailInstead),
  };
}

function differencesOf(source: JobSourceLink, job: Job, ctx: ModelContext): string[] {
  const { intl } = ctx;
  const differences: string[] = [];
  if (source.title !== job.title)
    differences.push(intl.formatMessage(messages.differenceTitle, { value: source.title }));
  const canonicalPlace = locationLabel(job);
  if (source.locationText !== null && canonicalPlace !== null && source.locationText !== canonicalPlace)
    differences.push(intl.formatMessage(messages.differenceLocation, { value: source.locationText }));
  const salary = source.salary ? salaryAmount(source.salary, ctx) : null;
  const canonicalSalary = job.salary ? salaryAmount(job.salary, ctx) : null;
  if (salary !== null && salary !== canonicalSalary)
    differences.push(intl.formatMessage(messages.differenceSalary, { value: salary }));
  return differences;
}

function sourcesVM(job: Job, used: JobSourceLink | undefined, ctx: ModelContext): SourcesVM {
  const { intl } = ctx;
  const row = (source: JobSourceLink): SourceRowVM => ({
    key: jobSourceKey(source),
    name: sourceName(source),
    url: source.url,
    badge: source.isDirectFromEmployer ? sourceVM("employer", intl) : null,
    posted: source.postedAt ? relativeTime(source.postedAt, ctx) : null,
    differences: differencesOf(source, job, ctx),
    usedForApply: source === used,
    unreachable: isStale(source.lastSeenAt, ctx)
      ? intl.formatMessage(messages.unreachable, { date: shortDate(source.lastSeenAt, ctx) })
      : null,
  });
  const groups: SourceGroupVM[] = [
    {
      label: intl.formatMessage(COPY_MESSAGES.foundOnDirect),
      rows: job.sources.filter((source) => source.isDirectFromEmployer).map(row),
    },
    {
      label: intl.formatMessage(COPY_MESSAGES.foundOnBoards),
      rows: job.sources.filter((source) => !source.isDirectFromEmployer).map(row),
    },
  ].filter((group) => group.rows.length > 0);
  const total = job.sources.length;
  return {
    title: intl.formatMessage(messages.foundOn, { count: total }),
    groups,
    total,
    collapsedCount: Math.min(total, SOURCES_COLLAPSED),
    showAllLabel: total > SOURCES_COLLAPSED ? intl.formatMessage(messages.showAll, { count: total }) : null,
  };
}

function detailVM(job: Job, data: ScreenData, ctx: ModelContext, rows: readonly JobListRowVM[]): JobDetailVM {
  const { intl } = ctx;
  const match = data.jobMatches.find((candidate) => candidate.id === job.id);
  const application = data.applications.find((candidate) => candidate.jobId === job.id);
  const salary = salaryVM(job.salary, ctx);
  const used = applySource(job);
  const apply = applyVM(job, used, intl);
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
    workMode: remoteLabel(job, intl),
    remoteEligibility: job.remoteEligibility,
    where: whereLine(job, ctx),
    employmentType: job.employmentType ? intl.formatMessage(EMPLOYMENT_MESSAGES[job.employmentType]) : null,
    seniority: job.seniority ? intl.formatMessage(SENIORITY_MESSAGES[job.seniority]) : null,
    posted: job.postedAt ? relativeTime(job.postedAt, ctx) : null,
    salary,
    previousJobId: index > 0 ? (rows[index - 1]?.jobId ?? null) : null,
    nextJobId: index >= 0 ? (rows[index + 1]?.jobId ?? null) : null,
    facts: factsVM(job, salary, ctx),
    match: matchSectionVM(match, data, ctx),
    descriptionLanguage: job.language,
    description: paragraphs,
    descriptionCollapsedLines: DESCRIPTION_COLLAPSED_LINES,
    noDescription: paragraphs.length === 0 ? intl.formatMessage(COPY_MESSAGES.noDescription) : null,
    delisted:
      primary && isStale(seen, ctx)
        ? intl.formatMessage(messages.delisted, { source: sourceName(primary), date: shortDate(seen, ctx) })
        : null,
    sources: sourcesVM(job, used, ctx),
    originalUrl: primary?.url ?? apply.target,
    apply,
    applied: hasApplied(application)
      ? {
          applicationId: application.id,
          label: application.appliedAt
            ? intl.formatMessage(messages.appliedOn, { date: shortDate(application.appliedAt, ctx) })
            : intl.formatMessage(messages.applied),
          linkLabel: intl.formatMessage(COPY_MESSAGES.viewInTracker),
        }
      : null,
    saved: application ? application.status === "saved" : match?.state === "saved",
    hidden: match?.state === "dismissed" || isHiddenCompany(job, data),
    application: hasApplied(application) ? applicationSummaryVM(application, data, ctx) : null,
    submitPrompt:
      application?.status === "preparing" && apply.external
        ? {
            applicationId: application.id,
            question: intl.formatMessage(messages.submitQuestion, { company: job.company }),
          }
        : null,
    applyCv: applyCvVM(match, data, data.profile.defaultCvId),
    pendingSync:
      ctx.pendingWrites.has(job.id) || (application !== undefined && ctx.pendingWrites.has(application.id)),
  };
}

/** "Newest": posting date (else first seen) first, then band. */
function compareNewest(a: JobListRowVM, b: JobListRowVM): number {
  const posted = (row: JobListRowVM) => (row.posted ? Date.parse(row.posted.iso) : 0);
  return posted(b) - posted(a) || compareRows(a, b);
}

/** The CV "Yes, I applied" pins: the match's basis, else the default CV, else the newest active one. */
function applyCvVM(
  match: JobMatch | undefined,
  data: Pick<ScreenData, "cvs">,
  defaultCvId: string | null,
): ApplyCvVM | null {
  if (match?.basedOnCvId && match.basedOnCvRevisionId)
    return { cvId: match.basedOnCvId, cvRevisionId: match.basedOnCvRevisionId };
  const active = data.cvs.filter((cv) => cv.archivedAt === null);
  const cv =
    active.find((candidate) => candidate.id === defaultCvId) ??
    active.toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return cv ? { cvId: cv.id, cvRevisionId: cv.currentRevisionId } : null;
}

/**
 * One line about the job sources for the empty feed and search results: what can be searched now,
 * what waits for a key, what had trouble (`jobSources/{id}`; never a count of failures).
 */
export function sourceHealthLine(sources: readonly JobSourceStatus[], intl: IntlShape): string {
  const names = (list: readonly JobSourceStatus[]) =>
    intl.formatList(
      list.map((source) => source.label),
      { type: "conjunction" },
    );
  const ready = sources.filter((source) => source.state === "ok" || source.state === "degraded");
  const waiting = sources.filter((source) => source.state === "skipped" && source.reason === "no_key");
  const trouble = sources.filter((source) => source.state === "failing");
  if (ready.length === 0 && trouble.length === 0) return intl.formatMessage(messages.sourcesNone);
  return [
    ready.length > 0
      ? intl.formatMessage(messages.sourcesReady, { count: ready.length, names: names(ready) })
      : null,
    trouble.length > 0 ? intl.formatMessage(messages.sourcesTrouble, { names: names(trouble) }) : null,
    waiting.length > 0 ? intl.formatMessage(messages.sourcesWaiting, { names: names(waiting) }) : null,
  ]
    .filter((part) => part !== null)
    .join(" ");
}

/**
 * Params: `jobId`, `scope` (all | saved | hidden), `search` (the saved search picked in the
 * sidebar) and the search + filters of `filters.ts`.
 */
export function buildJobDetailModel(
  data: ScreenData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): JobDetailModel {
  const { intl } = ctx;
  const search = readFilterParams(params);
  const { query } = search;
  const scope: JobsScope = JOBS_SCOPES.find((candidate) => candidate === params.scope) ?? "all";
  const matches = new Map(data.jobMatches.map((match) => [match.id, match]));
  const applications = new Map(
    data.applications.flatMap((application) => (application.jobId ? [[application.jobId, application]] : [])),
  );
  const feedJobs = data.jobs.filter((job) => {
    const match = matches.get(job.id);
    const hidden = match?.state === "dismissed" || isHiddenCompany(job, data);
    return (scope === "hidden") === hidden;
  });
  const feed = feedJobs
    .map((job) => rowVM(job, matches.get(job.id), applications.get(job.id), ctx))
    .filter((row) => scope !== "saved" || row.saved);
  const jobsById = new Map(data.jobs.map((job) => [job.id, job]));
  /** Feed rows that pass `state`'s search and filters, unsorted. */
  const visibleRows = (state: JobsFilterState) => {
    const minRank = state.minBand ? BAND_RANK[state.minBand] : null;
    return feed.filter((row) => {
      const job = jobsById.get(row.jobId);
      if (
        !job ||
        !matchesQuery(job, state.query, ctx.locale) ||
        !passesSearchFilters(job, state.filters, ctx.now)
      )
        return false;
      return minRank === null || (row.match !== null && BAND_RANK[row.match.band] <= minRank);
    });
  };
  const rows = visibleRows(search).sort(search.sort === "newest" ? compareNewest : compareRows);

  const requested = params.jobId === undefined ? undefined : jobsById.get(params.jobId);
  const selectedJobId = requested?.id ?? rows[0]?.jobId ?? null;
  const selected = selectedJobId === null ? undefined : jobsById.get(selectedJobId);
  const filterBar = buildFilterBar(
    search,
    feedJobs,
    (slug) => (isKnownSource(slug) ? SOURCE_NAMES[slug] : null) ?? slug,
    ctx,
  );

  let empty: JobsEmptyVM | null = null;
  const searchAction = query === "" ? null : intl.formatMessage(messages.searchSitesAction, { query });
  if (data.jobs.length === 0)
    empty = {
      kind: "firstUse",
      title: intl.formatMessage(messages.firstUseTitle),
      body: intl.formatMessage(messages.firstUseBody),
      action: intl.formatMessage(messages.firstUseAction),
      chips: [],
      searchAction,
    };
  else if (feed.length > 0 && rows.length === 0) {
    const filtered = filterBar.activeCount > 0;
    empty = {
      kind: "noResults",
      title: filtered
        ? intl.formatMessage(messages.noFilterResultsTitle)
        : intl.formatMessage(messages.noResultsTitle, { query }),
      body: filtered
        ? intl.formatMessage(
            query === "" ? messages.noFilterResultsBodyNoQuery : messages.noFilterResultsBody,
          )
        : intl.formatMessage(messages.noResultsBody),
      action: filtered
        ? intl.formatMessage(messages.noFilterResultsAction)
        : intl.formatMessage(messages.noResultsAction),
      chips: removableChips(filterBar.pills, (facet) => visibleRows(clearFacet(search, facet)).length, ctx),
      searchAction,
    };
  } else if (rows.length === 0) {
    const caughtUp = CAUGHT_UP_MESSAGES[scope];
    empty = {
      kind: "caughtUp",
      title: intl.formatMessage(caughtUp.title),
      body: intl.formatMessage(caughtUp.body),
      action: null,
      chips: [],
      searchAction: null,
    };
  }

  const copyEntries = Object.entries(COPY_MESSAGES) as [keyof JobDetailCopyVM, MessageDescriptor][];
  const copy = Object.fromEntries(
    copyEntries.map(([key, descriptor]) => [key, intl.formatMessage(descriptor)]),
  ) as Record<keyof JobDetailCopyVM, string>;
  return {
    copy,
    list: {
      rows,
      countLabel: intl.formatMessage(messages.jobCount, { count: rows.length }),
      sortLabel: search.sort === "newest" ? copy.sortNewest : copy.sortLabel,
      rankingInfo: search.sort === "newest" ? copy.rankingNewest : copy.rankingInfo,
      query,
      empty,
    },
    scope,
    search,
    filterBar,
    savedSearches: savedSearchItems(data.savedSearches, search, params.search ?? null),
    dismissReasons: DismissReasonSchema.options.map((key) => ({
      key,
      label: intl.formatMessage(DISMISS_REASON_MESSAGES[key]),
    })),
    selectedJobId,
    noSelection: { title: copy.noSelection, hint: copy.noSelectionHint },
    detail: selected ? detailVM(selected, data, ctx, rows) : null,
  };
}
