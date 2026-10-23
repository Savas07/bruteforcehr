import type { Seniority } from "../enums";
import type { Job, JobMatch, JobMatchState, MatchFactor, MatchImpact, SalaryRange } from "../job";
import type { LanguageLevel, Profile, SalaryFloor } from "../profile";
import { SALARY_PERIODS_PER_YEAR } from "../jobs/filters";
import { foldText, normalizeCompanyName, normalizeTitle, skillKey } from "../jobs/normalize";

/**
 * Deterministic match scoring (docs/adr/0011-embeddings-matching.md): requirement checks from the
 * profile (hard filters), skill overlap with the CV, title fit with the target roles and the
 * embedding similarity, combined into 0–100. The AI rationale is added separately for the top N.
 *
 * Rule-generated factor labels are values ("Berlin", "Remote", "EUR 60,000 / year", "German"),
 * not sentences, so clients can localize the surrounding copy by `facet` + `status`.
 */

export type MatchProfile = Pick<
  Profile,
  | "locations"
  | "remotePreferences"
  | "salaryFloor"
  | "workAuthorization"
  | "languages"
  | "seniority"
  | "targetRoles"
  | "skills"
  | "hiddenCompanies"
>;

/** The CV a match is based on: its id, exact revision, and the skills found in it. */
export interface MatchCv {
  cvId: string;
  revisionId: string;
  skills: readonly string[];
}

export interface MatchInput {
  job: Job;
  profile: MatchProfile;
  cv: MatchCv | null;
  /** Dot product of the unit-normalized job and profile/CV embeddings, or null when unavailable. */
  similarity: number | null;
}

export type ComputedMatch = Pick<
  JobMatch,
  "score" | "basedOnCvId" | "basedOnCvRevisionId" | "reasons" | "gaps" | "skills"
> & {
  /** A requirement that matters most is outside the user's preferences; the score is capped. */
  hardFail: boolean;
};

/** Component weights; missing components are left out and the rest renormalized. */
export const MATCH_WEIGHTS = { requirements: 0.3, skills: 0.25, similarity: 0.25, role: 0.2 } as const;

/** Scores of matches failing a hard filter stay below the "partial" band. */
export const HARD_FAIL_SCORE_CAP = 44;

/**
 * Similarity range of the embedding model (gemini-embedding-001, 768 dims): unrelated job/profile
 * pairs sit near the low end, near-identical role descriptions near the high end.
 */
export const SIMILARITY_RANGE = { low: 0.55, high: 0.85 } as const;

const STATUS_VALUE: Readonly<Record<MatchFactor["status"], number>> = {
  met: 1,
  partial: 0.6,
  not_stated: 0.7,
  missing: 0.2,
  outside_prefs: 0,
};

const IMPACT_WEIGHT: Readonly<Record<MatchImpact, number>> = { most: 2, some: 1 };

/** EU/EEA + Switzerland: covered by a `workAuthorization` entry with region `EU`. */
export const EU_AUTHORIZATION_COUNTRIES: readonly string[] = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
];

const SENIORITY_RANK: Readonly<Record<Seniority, number>> = {
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  lead: 4,
  manager: 4,
  principal: 5,
  director: 6,
};

const FLUENT: readonly LanguageLevel[] = ["native", "C2", "C1", "B2"];

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: "English",
  de: "German",
  tr: "Turkish",
  nl: "Dutch",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
};

function requirement(
  facet: NonNullable<MatchFactor["facet"]>,
  label: string,
  status: MatchFactor["status"],
  impact: MatchImpact,
  evidence: MatchFactor["evidence"] = null,
): MatchFactor {
  return { kind: "requirement", facet, label: label.slice(0, 300), status, impact, evidence, source: "rule" };
}

function quote(from: "posting" | "profile" | "cv", text: string): MatchFactor["evidence"] {
  const trimmed = text.trim().slice(0, 500);
  return trimmed === "" ? null : { from, quote: trimmed };
}

function jobCountries(job: Job): string[] {
  return [
    ...new Set(
      job.locations.flatMap((location) => (location.countryCode === null ? [] : [location.countryCode])),
    ),
  ];
}

function locationFactor(job: Job, profile: MatchProfile): MatchFactor | null {
  if (profile.locations.length === 0) return null;
  if (job.locations.length === 0) {
    return job.remoteType === "remote" ? null : requirement("location", "Location", "not_stated", "most");
  }
  const posting = quote("posting", job.locations.map((location) => location.label).join("; "));
  const userCountries = new Set([
    ...profile.locations.flatMap((location) => (location.countryCode === null ? [] : [location.countryCode])),
    ...profile.workAuthorization.flatMap((entry) =>
      entry.region === "EU" ? EU_AUTHORIZATION_COUNTRIES : [entry.region],
    ),
  ]);
  if (job.remoteType === "remote") {
    const countries = jobCountries(job);
    if (countries.length === 0 || countries.some((country) => userCountries.has(country))) return null;
    return requirement("location", job.locations[0]?.label ?? "Remote", "outside_prefs", "some", posting);
  }
  let best: MatchFactor | null = null;
  for (const location of job.locations) {
    for (const target of profile.locations) {
      const sameCountry = target.countryCode !== null && target.countryCode === location.countryCode;
      const sameCity =
        target.city !== null && location.city !== null && foldText(target.city) === foldText(location.city);
      const label = location.city ?? location.label;
      if (sameCity || (sameCountry && target.city === null)) {
        return requirement("location", label, "met", "most", posting);
      }
      if (sameCountry && target.relocation) {
        best ??= requirement("location", label, "partial", "most", posting);
      }
    }
  }
  return (
    best ?? requirement("location", job.locations[0]?.label ?? "Location", "outside_prefs", "most", posting)
  );
}

function remoteFactor(job: Job, profile: MatchProfile): MatchFactor | null {
  if (profile.remotePreferences.length === 0) return null;
  const label = job.remoteType === null ? "Workplace" : job.remoteType;
  if (job.remoteType === null) return requirement("remote", label, "not_stated", "most");
  return requirement(
    "remote",
    label,
    profile.remotePreferences.includes(job.remoteType) ? "met" : "outside_prefs",
    "most",
    job.remoteEligibility === null ? null : quote("posting", job.remoteEligibility),
  );
}

function authorizationFactor(job: Job, profile: MatchProfile): MatchFactor | null {
  if (profile.workAuthorization.length === 0) return null;
  const countries = jobCountries(job);
  if (countries.length === 0) return null;
  const statuses = countries.map((country) => {
    const entry =
      profile.workAuthorization.find((auth) => auth.region === country) ??
      (EU_AUTHORIZATION_COUNTRIES.includes(country)
        ? profile.workAuthorization.find((auth) => auth.region === "EU")
        : undefined);
    if (entry !== undefined && entry.status !== "needs_sponsorship")
      return { country, status: "met" as const };
    if (job.visaSponsorship === true) return { country, status: "met" as const, sponsored: true };
    if (job.visaSponsorship === false) return { country, status: "outside_prefs" as const };
    return { country, status: "not_stated" as const };
  });
  const rank = { met: 0, not_stated: 1, outside_prefs: 2 } as const;
  const best = statuses.sort((a, b) => rank[a.status] - rank[b.status])[0];
  if (best === undefined) return null;
  const label = "sponsored" in best ? "Visa sponsorship" : best.country;
  return requirement("authorization", label, best.status, "most");
}

function formatSalary(salary: SalaryRange): string {
  const figure = (value: number) => Math.round(value).toLocaleString("en-US");
  const range =
    salary.min !== null && salary.max !== null && salary.min !== salary.max
      ? `${figure(salary.min)}–${figure(salary.max)}`
      : figure((salary.max ?? salary.min) as number);
  return `${salary.currency} ${range} / ${salary.period}`;
}

function salaryFactor(job: Job, floor: SalaryFloor | null): MatchFactor | null {
  if (floor === null) return null;
  if (job.salary === null) return requirement("salary", "Salary", "not_stated", "most");
  const label = formatSalary(job.salary);
  if (job.salary.currency !== floor.currency) return requirement("salary", label, "not_stated", "most");
  const top = ((job.salary.max ?? job.salary.min) as number) * SALARY_PERIODS_PER_YEAR[job.salary.period];
  const wanted = floor.amount * SALARY_PERIODS_PER_YEAR[floor.period];
  if (top >= wanted) return requirement("salary", label, "met", "most");
  if (top >= wanted * 0.9) return requirement("salary", label, "partial", "most");
  // An estimated figure is a gap to consider, never a hard filter.
  return requirement("salary", label, "outside_prefs", job.salary.estimated ? "some" : "most");
}

function seniorityFactor(job: Job, profile: MatchProfile): MatchFactor | null {
  if (profile.seniority === null) return null;
  if (job.seniority === null) return null;
  const distance = Math.abs(SENIORITY_RANK[job.seniority] - SENIORITY_RANK[profile.seniority]);
  return requirement(
    "seniority",
    job.seniority,
    distance === 0 ? "met" : distance === 1 ? "partial" : "outside_prefs",
    "some",
  );
}

function languageFactor(job: Job, profile: MatchProfile): MatchFactor | null {
  if (profile.languages.length === 0 || job.language === "und") return null;
  const primary = job.language.split("-")[0] ?? job.language;
  const label = LANGUAGE_NAMES[primary] ?? primary;
  const spoken = profile.languages.find((entry) => entry.language.split("-")[0] === primary);
  if (spoken === undefined) return requirement("language", label, "missing", "most");
  if (FLUENT.includes(spoken.level)) return requirement("language", label, "met", "most");
  if (spoken.level === "B1") return requirement("language", label, "partial", "some");
  return requirement("language", label, "missing", "most");
}

/** Word overlap (Jaccard) between the job title and the closest target role, 0–1. */
function roleFit(job: Job, targetRoles: readonly string[]): { overlap: number; role: string } | null {
  if (targetRoles.length === 0) return null;
  const words = (value: string) =>
    new Set(
      normalizeTitle(value)
        .split(" ")
        .filter((word) => word.length > 1),
    );
  const title = words(job.title);
  let best = { overlap: 0, role: targetRoles[0] ?? "" };
  for (const role of targetRoles) {
    const target = words(role);
    let shared = 0;
    for (const word of target) if (title.has(word)) shared++;
    const union = title.size + target.size - shared;
    // Recall-weighted: "Senior Backend Engineer, Payments" still fits "Backend Engineer".
    const overlap =
      union === 0 ? 0 : Math.max(shared / union, target.size === 0 ? 0 : (shared / target.size) * 0.9);
    if (overlap > best.overlap) best = { overlap, role };
  }
  return best;
}

/** Hidden companies (profile.hiddenCompanies, by domain or normalized name) never get a match. */
export function isHiddenCompany(
  job: Pick<Job, "company" | "companyDomain">,
  profile: Pick<Profile, "hiddenCompanies">,
): boolean {
  const name = normalizeCompanyName(job.company);
  return profile.hiddenCompanies.some(
    (hidden) =>
      (hidden.domain !== null && hidden.domain === job.companyDomain) ||
      normalizeCompanyName(hidden.name) === name,
  );
}

/** Initial `state` of a new match: client-saved imports (URL import, manual) start as saved. */
export function initialMatchState(job: Pick<Job, "sources">): JobMatchState {
  const primary = job.sources[0]?.source;
  return primary === "url_import" || primary === "manual" ? "saved" : "new";
}

/** Score and structured reasons/gaps for one job against the profile and CV. */
export function computeMatch(input: MatchInput): ComputedMatch {
  const { job, profile, cv, similarity } = input;
  const requirements = [
    locationFactor(job, profile),
    remoteFactor(job, profile),
    authorizationFactor(job, profile),
    salaryFactor(job, profile.salaryFloor),
    seniorityFactor(job, profile),
    languageFactor(job, profile),
  ].filter((factor): factor is MatchFactor => factor !== null);

  const have = new Set([...(cv?.skills ?? []), ...profile.skills].map(skillKey));
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const skill of job.skills) (have.has(skillKey(skill)) ? matched : unmatched).push(skill);

  const role = roleFit(job, profile.targetRoles);
  const reasons: MatchFactor[] = requirements.filter((factor) =>
    ["met", "partial", "not_stated"].includes(factor.status),
  );
  const gaps: MatchFactor[] = requirements.filter((factor) =>
    ["missing", "outside_prefs"].includes(factor.status),
  );
  if (role !== null && role.overlap >= 0.25) {
    reasons.push({
      kind: "experience",
      facet: null,
      label: role.role.slice(0, 300),
      status: role.overlap >= 0.5 ? "met" : "partial",
      impact: "most",
      evidence: quote("posting", job.title),
      source: "rule",
    });
  }
  for (const skill of matched.slice(0, 10)) {
    reasons.push({
      kind: "skill",
      facet: null,
      label: skill,
      status: "met",
      impact: "some",
      evidence: null,
      source: "rule",
    });
  }
  for (const skill of unmatched.slice(0, 10)) {
    gaps.push({
      kind: "skill",
      facet: null,
      label: skill,
      status: "missing",
      impact: "some",
      evidence: null,
      source: "rule",
    });
  }

  let weighted = 0;
  let impactTotal = 0;
  for (const factor of requirements) {
    weighted += STATUS_VALUE[factor.status] * IMPACT_WEIGHT[factor.impact];
    impactTotal += IMPACT_WEIGHT[factor.impact];
  }
  const components: [number, number][] = [
    [MATCH_WEIGHTS.requirements, impactTotal === 0 ? STATUS_VALUE.not_stated : weighted / impactTotal],
  ];
  if (job.skills.length > 0)
    components.push([MATCH_WEIGHTS.skills, (matched.length + 0.5) / (job.skills.length + 1)]);
  if (similarity !== null) {
    const scaled = (similarity - SIMILARITY_RANGE.low) / (SIMILARITY_RANGE.high - SIMILARITY_RANGE.low);
    components.push([MATCH_WEIGHTS.similarity, Math.min(1, Math.max(0, scaled))]);
  }
  if (role !== null) components.push([MATCH_WEIGHTS.role, Math.min(1, role.overlap)]);
  const weightSum = components.reduce((sum, [weight]) => sum + weight, 0);
  const raw = components.reduce((sum, [weight, value]) => sum + weight * value, 0) / weightSum;
  const hardFail = requirements.some(
    (factor) => factor.status === "outside_prefs" && factor.impact === "most",
  );
  const score = Math.round(Math.min(hardFail ? HARD_FAIL_SCORE_CAP : 100, raw * 100));

  return {
    score: Math.max(0, Math.min(100, score)),
    basedOnCvId: cv?.cvId ?? null,
    basedOnCvRevisionId: cv?.revisionId ?? null,
    reasons: reasons.slice(0, 30),
    gaps: gaps.slice(0, 30),
    skills: { matched: matched.slice(0, 100), unmatched: unmatched.slice(0, 100) },
    hardFail,
  };
}
