/**
 * Job preferences (onboarding-signin.md "Step 2/3 Preferences"; the same editor in Settings › Job
 * preferences): the editable draft, how it maps onto `Profile` fields, and the choices the form
 * offers. Shared value mapping with the iOS app:
 * - seniority is one value (`Profile.seniority`), chosen or cleared;
 * - work authorization is asked per country, or once for "EU / EEA" when a picked country is in
 *   `EU_AUTHORIZATION_COUNTRIES`: Yes keeps a stored non-sponsorship status (else `work_permit`),
 *   No is `needs_sponsorship`, Not sure stores no entry;
 * - salary floor is amount + currency + per month / per year; TRY defaults to per month;
 * - languages use the CEFR levels of `LanguageLevelSchema`.
 */
import {
  type CvContent,
  EU_AUTHORIZATION_COUNTRIES,
  type LanguageLevel,
  type Profile,
  ProfileSchema,
  type RemoteType,
  type SalaryPeriod,
  type Seniority,
  type SpokenLanguage,
  type TargetLocation,
  type WorkAuthorization,
} from "@bfhr/core";

/** The profile fields matching reads, edited together. */
export type JobPreferences = Pick<
  Profile,
  | "targetRoles"
  | "seniority"
  | "locations"
  | "remotePreferences"
  | "salaryFloor"
  | "workAuthorization"
  | "languages"
>;

export const EMPTY_JOB_PREFERENCES: JobPreferences = {
  targetRoles: [],
  seniority: null,
  locations: [],
  remotePreferences: [],
  salaryFloor: null,
  workAuthorization: [],
  languages: [],
};

/** The form's sections, in order; a change names the section it touched. */
export const PREFERENCE_SECTIONS = [
  "name",
  "roles",
  "seniority",
  "where",
  "salary",
  "authorization",
  "languages",
] as const;
export type PreferenceSection = (typeof PREFERENCE_SECTIONS)[number];

/** What the form edits: the preferences plus the name, with the salary amount as typed. */
export interface JobPreferencesDraft {
  readonly fullName: string;
  readonly targetRoles: readonly string[];
  readonly seniority: Seniority | null;
  readonly locations: readonly TargetLocation[];
  readonly remotePreferences: readonly RemoteType[];
  readonly salary: { readonly amount: string; readonly currency: string; readonly period: SalaryPeriod };
  readonly workAuthorization: readonly WorkAuthorization[];
  readonly languages: readonly SpokenLanguage[];
}

/** Research: up to 5 target roles ("{n}/5"). */
export const MAX_ROLES = 5;
export const MAX_LOCATIONS = 10;
export const MAX_LANGUAGES = 10;

/** Seniority choices, junior to senior (labels in the form). */
export const SENIORITY_ORDER: readonly Seniority[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
  "manager",
  "director",
];

/** Workplace chips, in display order. */
export const WORKPLACE_ORDER: readonly RemoteType[] = ["remote", "hybrid", "onsite"];

/** Quick-add places: the target markets (kickoff §0). */
export const QUICK_COUNTRIES = ["TR", "DE", "NL", "GB", "US"] as const;

/** Quick-add languages. */
export const QUICK_LANGUAGES = ["en", "tr", "de"] as const;

export const LANGUAGE_LEVELS: readonly LanguageLevel[] = ["native", "C2", "C1", "B2", "B1", "A2", "A1"];

/** Level a newly added language starts at (the user adjusts it in place). */
export const DEFAULT_LANGUAGE_LEVEL: LanguageLevel = "B2";

/** Currencies offered first; the rest follow alphabetically. */
export const MAIN_CURRENCIES = ["TRY", "EUR", "GBP", "USD"] as const;
export const OTHER_CURRENCIES = [
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CZK",
  "DKK",
  "HUF",
  "JPY",
  "NOK",
  "PLN",
  "RON",
  "SEK",
] as const;

/** Salary periods the form offers (the schema also has day and hour; those show as stored). */
export const FORM_PERIODS = ["month", "year"] as const satisfies readonly SalaryPeriod[];

/** ISO 3166-1 alpha-2 codes offered in the country picker (names come from `Intl.DisplayNames`). */
export const COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG " +
  "CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH " +
  "GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW " +
  "KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA " +
  "NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK " +
  "SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN " +
  "VU WS XK YE ZA ZM ZW"
).split(" ");

/** Languages offered in the picker (ISO 639-1). */
export const LANGUAGE_CODES: readonly string[] = (
  "en tr de nl fr es it pt pl ru uk ar fa ku az zh ja ko hi bn ur sv da no fi cs sk el he ro hu bg hr " +
  "sr sl bs sq mk et lv lt ka hy id ms th vi tl sw"
).split(" ");

/** Region of a work-authorization question: a country, or `EU` for the EU/EEA + Switzerland. */
export type AuthorizationRegion = WorkAuthorization["region"];
export type AuthorizationAnswer = "yes" | "no" | "unsure";

// ─── Profile ↔ draft ───────────────────────────────────────────────────────────────────────────

/** The currency a new salary floor starts in: the formatting locale's region, else euros. */
export function defaultCurrency(locale: string): string {
  const region = new Intl.Locale(locale).maximize().region;
  switch (region) {
    case "TR":
      return "TRY";
    case "GB":
      return "GBP";
    case "US":
      return "USD";
    default:
      return "EUR";
  }
}

/** Turkish offers are usually quoted monthly, others yearly. */
export function defaultPeriod(currency: string): SalaryPeriod {
  return currency === "TRY" ? "month" : "year";
}

/** The draft of a stored profile (or of none yet). */
export function draftFromProfile(
  profile: (JobPreferences & Pick<Profile, "fullName">) | null,
  locale: string,
): JobPreferencesDraft {
  const prefs = profile ?? EMPTY_JOB_PREFERENCES;
  const currency = prefs.salaryFloor?.currency ?? defaultCurrency(locale);
  return {
    fullName: profile?.fullName ?? "",
    targetRoles: prefs.targetRoles,
    seniority: prefs.seniority,
    locations: prefs.locations,
    remotePreferences: prefs.remotePreferences,
    salary: {
      amount: prefs.salaryFloor === null ? "" : String(prefs.salaryFloor.amount),
      currency,
      period: prefs.salaryFloor?.period ?? defaultPeriod(currency),
    },
    workAuthorization: prefs.workAuthorization,
    languages: prefs.languages,
  };
}

/** Digits of a typed amount ("55.000", "55,000", "55 000" → 55000); null when there are none. */
export function parseAmount(typed: string): number | null {
  const digits = typed.replace(/\D/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** The amount as the locale groups it ("55.000" in German), or the text as typed when it isn't one. */
export function formatAmount(typed: string, locale: string): string {
  const value = parseAmount(typed);
  return value === null ? "" : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

/** The stored preferences of a draft, validated against `ProfileSchema`. */
export function preferencesFromDraft(draft: JobPreferencesDraft): JobPreferences {
  const amount = parseAmount(draft.salary.amount);
  return ProfileSchema.pick({
    targetRoles: true,
    seniority: true,
    locations: true,
    remotePreferences: true,
    salaryFloor: true,
    workAuthorization: true,
    languages: true,
  }).parse({
    targetRoles: [...draft.targetRoles],
    seniority: draft.seniority,
    locations: [...draft.locations],
    remotePreferences: [...draft.remotePreferences],
    salaryFloor:
      amount === null || amount === 0
        ? null
        : { amount, currency: draft.salary.currency, period: draft.salary.period },
    workAuthorization: [...draft.workAuthorization],
    languages: [...draft.languages],
  });
}

/** The profile fields one section writes (Settings autosaves per section). */
export function sectionPatch(
  section: Exclude<PreferenceSection, "name">,
  draft: JobPreferencesDraft,
): Partial<JobPreferences> {
  const prefs = preferencesFromDraft(draft);
  switch (section) {
    case "roles":
      return { targetRoles: prefs.targetRoles };
    case "seniority":
      return { seniority: prefs.seniority };
    case "where":
      return { locations: prefs.locations, remotePreferences: prefs.remotePreferences };
    case "salary":
      return { salaryFloor: prefs.salaryFloor };
    case "authorization":
      return { workAuthorization: prefs.workAuthorization };
    case "languages":
      return { languages: prefs.languages };
  }
}

/** A name worth saving (`ProfileSchema.fullName`): trimmed, 1–200 characters; else null. */
export function validName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && trimmed.length <= 200 ? trimmed : null;
}

/** A starting name from an address ("deniz.aksoy@…" → "Deniz Aksoy"); the user can change it. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._+-]+/).filter((word) => /\p{L}/u.test(word));
  const name = words.map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ");
  return validName(name) ?? validName(local) ?? "BruteForceHR user";
}

// ─── Roles ─────────────────────────────────────────────────────────────────────────────────────

/** Adds a role (trimmed, case-insensitively unique, at most `MAX_ROLES`); unchanged when it can't. */
export function addRole(roles: readonly string[], role: string): readonly string[] {
  const trimmed = role.trim().replace(/\s+/g, " ").slice(0, 120);
  if (trimmed === "" || roles.length >= MAX_ROLES) return roles;
  const folded = trimmed.toLocaleLowerCase();
  if (roles.some((existing) => existing.toLocaleLowerCase() === folded)) return roles;
  return [...roles, trimmed];
}

/** Common roles the suggestions start from (English titles, as most postings use them). */
export const COMMON_ROLES: readonly string[] = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "Mobile Engineer",
  "iOS Engineer",
  "Android Engineer",
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Data Engineer",
  "Data Scientist",
  "Data Analyst",
  "Machine Learning Engineer",
  "QA Engineer",
  "Security Engineer",
  "Engineering Manager",
  "Product Manager",
  "Product Designer",
  "UX Designer",
  "UX Researcher",
  "Project Manager",
  "Business Analyst",
  "Marketing Manager",
  "Sales Manager",
  "Account Executive",
  "Customer Success Manager",
  "Recruiter",
  "HR Business Partner",
  "Financial Analyst",
  "Accountant",
  "Operations Manager",
  "Technical Writer",
];

/** Up to `limit` suggestions for what's typed: the user's own (CV) first, never one already picked. */
export function roleSuggestions(
  typed: string,
  picked: readonly string[],
  own: readonly string[],
  limit = 6,
): string[] {
  const query = typed.trim().toLocaleLowerCase();
  const taken = new Set(picked.map((role) => role.toLocaleLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const role of [...own, ...COMMON_ROLES]) {
    const folded = role.toLocaleLowerCase();
    if (taken.has(folded) || seen.has(folded)) continue;
    if (query !== "" && !folded.includes(query)) continue;
    seen.add(folded);
    out.push(role);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Places ────────────────────────────────────────────────────────────────────────────────────

/** Two locations name the same place (country + city, case-insensitive). */
export function sameLocation(
  a: Pick<TargetLocation, "city" | "countryCode">,
  b: Pick<TargetLocation, "city" | "countryCode">,
): boolean {
  return (
    a.countryCode === b.countryCode &&
    (a.city ?? "").toLocaleLowerCase() === (b.city ?? "").toLocaleLowerCase()
  );
}

/** A new place; `label` is "City, Country" or the country, in `countryName`'s language. */
export function newLocation(
  countryCode: string,
  city: string,
  relocation: boolean,
  countryName: (code: string) => string,
): TargetLocation {
  const trimmed = city.trim().replace(/\s+/g, " ").slice(0, 80);
  const country = countryName(countryCode);
  return {
    label: (trimmed === "" ? country : `${trimmed}, ${country}`).slice(0, 120),
    city: trimmed === "" ? null : trimmed,
    countryCode,
    relocation,
  };
}

/** Adds a place unless the same one is there or the list is full. */
export function addLocation(
  locations: readonly TargetLocation[],
  location: TargetLocation,
): readonly TargetLocation[] {
  if (locations.length >= MAX_LOCATIONS || locations.some((existing) => sameLocation(existing, location)))
    return locations;
  return [...locations, location];
}

// ─── Work authorization ────────────────────────────────────────────────────────────────────────

/** The region a country's question is asked for: `EU` for the EU/EEA + Switzerland. */
export function authorizationRegionOf(countryCode: string): AuthorizationRegion {
  return EU_AUTHORIZATION_COUNTRIES.includes(countryCode) ? "EU" : countryCode;
}

/**
 * One question per region: the picked places' countries (EU countries once, as `EU`), then any
 * region already answered (another device, or a place removed since), in first-seen order.
 */
export function authorizationRegions(
  locations: readonly TargetLocation[],
  answered: readonly WorkAuthorization[],
): AuthorizationRegion[] {
  const regions: AuthorizationRegion[] = [];
  const add = (region: AuthorizationRegion) => {
    if (!regions.includes(region)) regions.push(region);
  };
  for (const location of locations)
    if (location.countryCode !== null) add(authorizationRegionOf(location.countryCode));
  for (const entry of answered) add(entry.region);
  return regions;
}

export function authorizationAnswer(
  entries: readonly WorkAuthorization[],
  region: AuthorizationRegion,
): AuthorizationAnswer {
  const entry = entries.find((candidate) => candidate.region === region);
  if (entry === undefined) return "unsure";
  return entry.status === "needs_sponsorship" ? "no" : "yes";
}

export function setAuthorizationAnswer(
  entries: readonly WorkAuthorization[],
  region: AuthorizationRegion,
  answer: AuthorizationAnswer,
): readonly WorkAuthorization[] {
  const current = entries.find((candidate) => candidate.region === region);
  const rest = entries.filter((candidate) => candidate.region !== region);
  if (answer === "unsure") return rest;
  if (answer === "no") return [...rest, { region, status: "needs_sponsorship" }];
  const status =
    current !== undefined && current.status !== "needs_sponsorship" ? current.status : "work_permit";
  return [...rest, { region, status }];
}

// ─── Languages ─────────────────────────────────────────────────────────────────────────────────

/** Adds a language at `level` unless it is there or the list is full. */
export function addLanguage(
  languages: readonly SpokenLanguage[],
  language: string,
  level: LanguageLevel = DEFAULT_LANGUAGE_LEVEL,
): readonly SpokenLanguage[] {
  if (
    languages.length >= MAX_LANGUAGES ||
    languages.some((entry) => entry.language.split("-")[0] === language)
  )
    return languages;
  return [...languages, { language, level }];
}

// ─── From the CV ───────────────────────────────────────────────────────────────────────────────

/** What a CV suggests for the preferences step (onboarding-signin.md: "pre-filled from the CV"). */
export interface CvPrefill {
  readonly fullName: string | null;
  readonly roles: readonly string[];
  readonly location: { readonly countryCode: string; readonly city: string } | null;
  readonly languages: readonly SpokenLanguage[];
}

/** Matches a JSON Resume language name ("English", "Türkçe", "Deutsch", "en") to a picker code. */
function languageCode(name: string): string | null {
  const folded = name.trim().toLocaleLowerCase();
  if (folded === "") return null;
  if (LANGUAGE_CODES.includes(folded)) return folded;
  for (const display of ["en", "tr", "de"]) {
    const names = new Intl.DisplayNames([display], { type: "language" });
    const match = LANGUAGE_CODES.find((code) => names.of(code)?.toLocaleLowerCase() === folded);
    if (match) return match;
  }
  return null;
}

/** A free-text fluency ("Native speaker", "C1", "Fließend", "İleri") as a CEFR level. */
function fluencyLevel(fluency: string): LanguageLevel {
  const text = fluency.toLocaleLowerCase();
  const cefr = /\b([abc][12])\b/i.exec(fluency)?.[1]?.toUpperCase();
  if (cefr && (LANGUAGE_LEVELS as readonly string[]).includes(cefr)) return cefr as LanguageLevel;
  if (/native|mother|muttersprach|ana ?dil/.test(text)) return "native";
  if (/fluent|proficien|fließend|verhandlungssicher|akıcı/.test(text)) return "C1";
  if (/professional|advanced|ileri|sehr gut/.test(text)) return "C1";
  if (/intermediate|orta|gut/.test(text)) return "B1";
  if (/basic|elementary|beginner|grund|başlangıç|temel/.test(text)) return "A2";
  return DEFAULT_LANGUAGE_LEVEL;
}

export function prefillFromCv(content: CvContent): CvPrefill {
  let roles: readonly string[] = [];
  for (const role of [
    content.basics?.label,
    ...(content.work ?? []).slice(0, 3).map((work) => work.position),
  ]) {
    if (role !== undefined) roles = addRole(roles, role.split(/[·|,]/)[0] ?? role);
  }
  const countryCode = content.basics?.location?.countryCode?.trim().toUpperCase() ?? "";
  const city = content.basics?.location?.city?.trim() ?? "";
  let languages: readonly SpokenLanguage[] = [];
  for (const entry of content.languages ?? []) {
    const code = languageCode(entry.language ?? "");
    if (code !== null) languages = addLanguage(languages, code, fluencyLevel(entry.fluency ?? ""));
  }
  return {
    fullName: validName(content.basics?.name ?? ""),
    roles,
    location: COUNTRY_CODES.includes(countryCode) ? { countryCode, city } : null,
    languages,
  };
}

/**
 * Fills the draft's empty sections from the CV; returns the new draft and the sections it filled
 * (shown with a "From your CV" tag until edited). `replaceName` lets the CV's name replace the one
 * guessed from the email address.
 */
export function applyCvPrefill(
  draft: JobPreferencesDraft,
  prefill: CvPrefill,
  countryName: (code: string) => string,
  replaceName: boolean,
): { draft: JobPreferencesDraft; filled: PreferenceSection[] } {
  const filled: PreferenceSection[] = [];
  let next = draft;
  if (prefill.fullName !== null && replaceName && prefill.fullName !== draft.fullName) {
    next = { ...next, fullName: prefill.fullName };
    filled.push("name");
  }
  if (draft.targetRoles.length === 0 && prefill.roles.length > 0) {
    next = { ...next, targetRoles: prefill.roles };
    filled.push("roles");
  }
  if (draft.locations.length === 0 && prefill.location !== null) {
    next = {
      ...next,
      locations: [newLocation(prefill.location.countryCode, prefill.location.city, false, countryName)],
    };
    filled.push("where");
  }
  if (draft.languages.length === 0 && prefill.languages.length > 0) {
    next = { ...next, languages: prefill.languages };
    filled.push("languages");
  }
  return { draft: next, filled };
}
