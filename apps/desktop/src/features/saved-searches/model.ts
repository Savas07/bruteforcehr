/**
 * Saved searches as the Jobs area shows them (job-feed-search.md "Decision — Desktop" 1, 3, 7;
 * decisions.md "Push threshold and digest defaults"): the name a new search gets, the one-line
 * criteria summary (sidebar tooltips, manage list), the alert cadence and threshold choices and
 * how they map onto `SavedSearch` fields, duplicate detection, and the Run now result line.
 *
 * Cadence ↔ fields: "As they arrive" = hourly, "Daily digest" = daily + `dailyDigest`, "Weekly" =
 * weekly, "Off" = `enabled: false` (the schedule is kept, so turning alerts back on restores it).
 */
import {
  type JobSourceReason,
  type JobsErrorReason,
  JobsErrorReasonSchema,
  type JobsSearchResponse,
  MATCH_BAND_THRESHOLDS,
  type RemoteType,
  type SavedSearch,
  type SavedSearchFilters,
  type Seniority,
  type SourceRunReport,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type { SavedSearchInput, SavedSearchPatch } from "../../data/jobs/writes";
import { dayAndTime, money, relativeTime } from "../../shared/model/format";
import { sameSearch } from "../job-detail/filters";
import type { ModelContext, ScreenData, TimeVM } from "../../shared/model/types";

// ─── Vocabulary ────────────────────────────────────────────────────────────────────────────────

export const ALERT_CADENCES = ["asTheyArrive", "daily", "weekly", "off"] as const;
export type AlertCadence = (typeof ALERT_CADENCES)[number];

export const ALERT_THRESHOLDS = ["strong", "good", "all"] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/** Lower score bound per threshold choice: the match bands (`MATCH_BAND_THRESHOLDS`), and 0 for All. */
export const THRESHOLD_SCORES: Readonly<Record<AlertThreshold, number>> = {
  strong: MATCH_BAND_THRESHOLDS.strong,
  good: MATCH_BAND_THRESHOLDS.good,
  all: 0,
};

/** New saved searches alert for Good and above (decisions.md, job-feed-search OQ5). */
export const DEFAULT_THRESHOLD: AlertThreshold = "good";

const NAME_MAX = 120;
const NAME_QUERY_MAX = 40;
/** Countries named in a name or summary before they collapse to a count. */
const COUNTRIES_SHOWN = 2;

const CADENCE_MESSAGES: Readonly<Record<AlertCadence, MessageDescriptor>> = defineMessages({
  asTheyArrive: { id: "saved-searches.cadence.asTheyArrive", defaultMessage: "As they arrive", description: "Alert cadence option: checked every hour, an alert per new match" },
  daily: { id: "saved-searches.cadence.daily", defaultMessage: "Daily digest", description: "Alert cadence option: checked daily, one summary" },
  weekly: { id: "saved-searches.cadence.weekly", defaultMessage: "Weekly", description: "Alert cadence option" },
  off: { id: "saved-searches.cadence.off", defaultMessage: "Off", description: "Alert cadence option: no checks, no alerts" },
});

const CADENCE_HINT_MESSAGES: Readonly<Record<AlertCadence, MessageDescriptor>> = defineMessages({
  asTheyArrive: { id: "saved-searches.cadence.asTheyArriveHint", defaultMessage: "We check every hour and tell you about each new match.", description: "Explains the As they arrive option" },
  daily: { id: "saved-searches.cadence.dailyHint", defaultMessage: "We check once a day and send one summary.", description: "Explains the Daily digest option" },
  weekly: { id: "saved-searches.cadence.weeklyHint", defaultMessage: "We check once a week.", description: "Explains the Weekly option" },
  off: { id: "saved-searches.cadence.offHint", defaultMessage: "The search stays in your sidebar. No checks, no alerts.", description: "Explains the Off option" },
});

const THRESHOLD_MESSAGES: Readonly<Record<AlertThreshold, MessageDescriptor>> = defineMessages({
  strong: { id: "saved-searches.threshold.strong", defaultMessage: "Strong matches", description: "Notify threshold option (score 80+)" },
  good: { id: "saved-searches.threshold.good", defaultMessage: "Good and above", description: "Notify threshold option (score 65+)" },
  all: { id: "saved-searches.threshold.all", defaultMessage: "All", description: "Notify threshold option: every new match" },
});

const REMOTE_MESSAGES: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  onsite: { id: "saved-searches.remote.onsite", defaultMessage: "On-site" },
  hybrid: { id: "saved-searches.remote.hybrid", defaultMessage: "Hybrid" },
  remote: { id: "saved-searches.remote.remote", defaultMessage: "Remote" },
});

const SENIORITY_MESSAGES: Readonly<Record<Seniority, MessageDescriptor>> = defineMessages({
  intern: { id: "saved-searches.seniority.intern", defaultMessage: "Intern" },
  junior: { id: "saved-searches.seniority.junior", defaultMessage: "Junior" },
  mid: { id: "saved-searches.seniority.mid", defaultMessage: "Mid-level" },
  senior: { id: "saved-searches.seniority.senior", defaultMessage: "Senior" },
  staff: { id: "saved-searches.seniority.staff", defaultMessage: "Staff" },
  principal: { id: "saved-searches.seniority.principal", defaultMessage: "Principal" },
  lead: { id: "saved-searches.seniority.lead", defaultMessage: "Lead" },
  manager: { id: "saved-searches.seniority.manager", defaultMessage: "Manager" },
  director: { id: "saved-searches.seniority.director", defaultMessage: "Director" },
});

/** Short reasons for the Run now line ("Adzuna skipped: no key"). */
const SOURCE_REASON_MESSAGES: Readonly<Record<JobSourceReason, MessageDescriptor>> = defineMessages({
  no_key: { id: "saved-searches.sourceReason.noKey", defaultMessage: "no key", description: "Why a job source was skipped: no API key is configured" },
  quota_exhausted: { id: "saved-searches.sourceReason.quotaExhausted", defaultMessage: "quota used up" },
  rate_limited: { id: "saved-searches.sourceReason.rateLimited", defaultMessage: "busy, retrying later" },
  blocked: { id: "saved-searches.sourceReason.blocked", defaultMessage: "refused automated access" },
  unavailable: { id: "saved-searches.sourceReason.unavailable", defaultMessage: "didn't respond" },
  invalid_response: { id: "saved-searches.sourceReason.invalidResponse", defaultMessage: "unreadable response" },
  disabled: { id: "saved-searches.sourceReason.disabled", defaultMessage: "turned off" },
});

const messages = defineMessages({
  allJobs: { id: "saved-searches.name.allJobs", defaultMessage: "All jobs", description: "Name of a saved search with no query and no main filters" },
  nameParts: { id: "saved-searches.name.parts", defaultMessage: "{first} · {second}", description: "Joins two parts of a saved search's name or summary" },
  countryCount: { id: "saved-searches.criteria.countryCount", defaultMessage: "{count, plural, one {# country} other {# countries}}" },
  countriesMore: { id: "saved-searches.criteria.countriesMore", defaultMessage: "{names} +{count}", description: "First countries, then how many more: 'Germany, Netherlands +3'" },
  query: { id: "saved-searches.criteria.query", defaultMessage: "“{query}”", description: "The search text, quoted, in a criteria summary" },
  anyQuery: { id: "saved-searches.criteria.anyQuery", defaultMessage: "Any job title", description: "Criteria summary when the search has no text" },
  salaryYear: { id: "saved-searches.criteria.salaryYear", defaultMessage: "From {amount} a year" },
  salaryMonth: { id: "saved-searches.criteria.salaryMonth", defaultMessage: "From {amount} a month" },
  salaryDay: { id: "saved-searches.criteria.salaryDay", defaultMessage: "From {amount} a day" },
  salaryHour: { id: "saved-searches.criteria.salaryHour", defaultMessage: "From {amount} an hour" },
  postedWithin: { id: "saved-searches.criteria.postedWithin", defaultMessage: "{days, plural, one {Posted today or yesterday} other {Posted in the last # days}}" },
  visa: { id: "saved-searches.criteria.visa", defaultMessage: "Visa sponsorship" },
  sources: { id: "saved-searches.criteria.sources", defaultMessage: "{count, plural, one {# source} other {# sources}}", description: "Criteria summary: the search is limited to these job sources" },
  labelQuery: { id: "saved-searches.criteria.labelQuery", defaultMessage: "Search" },
  labelLocation: { id: "saved-searches.criteria.labelLocation", defaultMessage: "Location" },
  labelWorkMode: { id: "saved-searches.criteria.labelWorkMode", defaultMessage: "Work mode" },
  labelSeniority: { id: "saved-searches.criteria.labelSeniority", defaultMessage: "Seniority" },
  labelSalary: { id: "saved-searches.criteria.labelSalary", defaultMessage: "Salary" },
  labelPosted: { id: "saved-searches.criteria.labelPosted", defaultMessage: "Posted" },
  labelVisa: { id: "saved-searches.criteria.labelVisa", defaultMessage: "Visa" },
  labelSources: { id: "saved-searches.criteria.labelSources", defaultMessage: "Sources" },
  dailyPlain: { id: "saved-searches.cadence.dailyPlain", defaultMessage: "Daily", description: "Cadence of a daily search that alerts per match rather than in a digest" },
  withDigest: { id: "saved-searches.cadence.withDigest", defaultMessage: "{cadence} · daily digest", description: "Cadence label when alerts are bundled into a daily summary" },
  thresholdCustom: { id: "saved-searches.threshold.custom", defaultMessage: "Score {score} and above", description: "A notify threshold set outside the three choices" },
  thresholdHint: { id: "saved-searches.threshold.hint", defaultMessage: "{score, plural, =0 {Every new match} other {Matches scoring # or more}}", description: "Explains a notify threshold choice" },
  lastRun: { id: "saved-searches.run.last", defaultMessage: "Checked {time}", description: "When the search last ran: 'Checked 2 hours ago'" },
  neverRun: { id: "saved-searches.run.never", defaultMessage: "Not checked yet" },
  nextRun: { id: "saved-searches.run.next", defaultMessage: "Next check: {time}", description: "'Next check: Tomorrow, 09:00'" },
  nextRunSoon: { id: "saved-searches.run.nextSoon", defaultMessage: "Next check in a few minutes" },
  dailyPlainHint: {
    id: "saved-searches.cadence.dailyPlainHint",
    defaultMessage: "We check once a day and tell you about each new match.",
    description: "Explains a daily search that alerts per match rather than in a digest",
  },
  alertsOff: { id: "saved-searches.run.alertsOff", defaultMessage: "Alerts off" },
  resultNew: { id: "saved-searches.result.new", defaultMessage: "{count, plural, =0 {No new jobs} one {# new job} other {# new jobs}}", description: "Run now result: new job postings found" },
  resultSeen: { id: "saved-searches.result.seen", defaultMessage: "{count, plural, one {# seen before} other {# seen before}}", description: "Run now result: postings that were already in the feed" },
  resultSkipped: { id: "saved-searches.result.skipped", defaultMessage: "{sources} skipped: {reason}", description: "'Adzuna and Jooble skipped: no key'" },
  resultSkippedNoReason: { id: "saved-searches.result.skippedNoReason", defaultMessage: "{sources} skipped" },
  resultError: { id: "saved-searches.result.error", defaultMessage: "{sources} couldn't be searched: {reason}", description: "'Reed couldn't be searched: didn't respond'" },
  resultErrorNoReason: { id: "saved-searches.result.errorNoReason", defaultMessage: "{sources} couldn't be searched" },
  errorRateLimited: { id: "saved-searches.error.rateLimited", defaultMessage: "You've run a lot of searches today. Try again in a little while." },
  errorNotFound: { id: "saved-searches.error.notFound", defaultMessage: "This search was deleted on another device." },
  errorNoSources: { id: "saved-searches.error.noSources", defaultMessage: "No job sources are available right now, so nothing could be searched. Try again later." },
  errorGeneric: { id: "saved-searches.error.generic", defaultMessage: "We couldn't run this search. Check your connection and try again." },
});

const SALARY_MESSAGES = {
  year: messages.salaryYear,
  month: messages.salaryMonth,
  day: messages.salaryDay,
  hour: messages.salaryHour,
} as const;

export function cadenceLabel(cadence: AlertCadence, intl: IntlShape): string {
  return intl.formatMessage(CADENCE_MESSAGES[cadence]);
}

/**
 * A cadence choice as the alert settings show it for `search`. A daily search without the digest
 * (set on another device or before digests existed) reads "Daily", so the radio matches the list.
 */
export function cadenceOption(
  cadence: AlertCadence,
  search: Pick<SavedSearch, "enabled" | "schedule" | "dailyDigest">,
  intl: IntlShape,
): { readonly label: string; readonly hint: string } {
  if (cadence === "daily" && cadenceOf(search) === "daily" && !search.dailyDigest)
    return { label: intl.formatMessage(messages.dailyPlain), hint: intl.formatMessage(messages.dailyPlainHint) };
  return { label: cadenceLabel(cadence, intl), hint: intl.formatMessage(CADENCE_HINT_MESSAGES[cadence]) };
}

export function thresholdLabel(threshold: AlertThreshold, intl: IntlShape): string {
  return intl.formatMessage(THRESHOLD_MESSAGES[threshold]);
}

export function thresholdHint(threshold: AlertThreshold, intl: IntlShape): string {
  return intl.formatMessage(messages.thresholdHint, { score: THRESHOLD_SCORES[threshold] });
}

// ─── Cadence and threshold mapping ─────────────────────────────────────────────────────────────

/** The cadence choice a saved search's fields show. */
export function cadenceOf(search: Pick<SavedSearch, "enabled" | "schedule">): AlertCadence {
  if (!search.enabled) return "off";
  return search.schedule === "hourly" ? "asTheyArrive" : search.schedule;
}

/** The fields a cadence choice writes. Off keeps the schedule so On restores it. */
export function cadencePatch(cadence: AlertCadence): SavedSearchPatch {
  switch (cadence) {
    case "off":
      return { enabled: false };
    case "asTheyArrive":
      return { enabled: true, schedule: "hourly", dailyDigest: false };
    case "daily":
      return { enabled: true, schedule: "daily", dailyDigest: true };
    case "weekly":
      return { enabled: true, schedule: "weekly", dailyDigest: false };
  }
}

/** The threshold choice for a stored score, or null when it is none of them (set elsewhere). */
export function thresholdOf(alertThreshold: number): AlertThreshold | null {
  return ALERT_THRESHOLDS.find((threshold) => THRESHOLD_SCORES[threshold] === alertThreshold) ?? null;
}

/** What the search's alerts are, as the list shows it: "Daily digest", "As they arrive · daily digest", "Off". */
export function alertCadenceText(search: Pick<SavedSearch, "enabled" | "schedule" | "dailyDigest">, intl: IntlShape): string {
  const cadence = cadenceOf(search);
  if (cadence === "daily") return search.dailyDigest ? cadenceLabel("daily", intl) : intl.formatMessage(messages.dailyPlain);
  if (cadence === "asTheyArrive" && search.dailyDigest)
    return intl.formatMessage(messages.withDigest, { cadence: cadenceLabel(cadence, intl) });
  return cadenceLabel(cadence, intl);
}

export function alertThresholdText(alertThreshold: number, intl: IntlShape): string {
  const threshold = thresholdOf(alertThreshold);
  return threshold === null
    ? intl.formatMessage(messages.thresholdCustom, { score: alertThreshold })
    : thresholdLabel(threshold, intl);
}

// ─── Names, summaries, duplicates ──────────────────────────────────────────────────────────────

/** The saved search with this query and these filters, if there is one (Save search shows it as saved). */
export function findSavedSearch(
  savedSearches: readonly SavedSearch[],
  query: string,
  filters: SavedSearchFilters,
): SavedSearch | null {
  return savedSearches.find((search) => sameSearch(search, { query, filters })) ?? null;
}

function countryNames(codes: readonly string[], intl: IntlShape): string {
  const names = new Intl.DisplayNames([intl.locale], { type: "region" });
  const named = codes.slice(0, COUNTRIES_SHOWN).map((code) => names.of(code) ?? code);
  const list = intl.formatList(named, { type: "conjunction", style: "narrow" });
  return codes.length > COUNTRIES_SHOWN
    ? intl.formatMessage(messages.countriesMore, { names: list, count: codes.length - COUNTRIES_SHOWN })
    : list;
}

const join = (parts: readonly string[], intl: IntlShape): string =>
  parts.reduce((first, second) => intl.formatMessage(messages.nameParts, { first, second }));

function remoteText(remoteTypes: readonly RemoteType[], intl: IntlShape): string {
  return intl.formatList(
    remoteTypes.map((type) => intl.formatMessage(REMOTE_MESSAGES[type])),
    { type: "disjunction" },
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The name a new saved search gets: the query, then work mode and places ("react · Remote",
 * "designer · Hybrid · Germany, Netherlands"); "All jobs" with neither.
 */
export function savedSearchName(query: string, filters: SavedSearchFilters, intl: IntlShape): string {
  const parts: string[] = [];
  const text = query.trim().replace(/\s+/gu, " ");
  if (text) parts.push(truncate(text, NAME_QUERY_MAX));
  if (filters.remoteTypes.length > 0) parts.push(remoteText(filters.remoteTypes, intl));
  if (filters.countryCodes.length > 0)
    parts.push(
      filters.countryCodes.length > COUNTRIES_SHOWN
        ? intl.formatMessage(messages.countryCount, { count: filters.countryCodes.length })
        : countryNames(filters.countryCodes, intl),
    );
  return parts.length === 0 ? intl.formatMessage(messages.allJobs) : truncate(join(parts, intl), NAME_MAX);
}

/** One criterion of a saved search, labelled (the editor's read-only filter list). */
export interface CriterionVM {
  readonly key: "query" | "location" | "workMode" | "seniority" | "salary" | "posted" | "visa" | "sources";
  readonly label: string;
  readonly value: string;
}

/** Every criterion the search sets, in filter-bar order; the query always comes first. */
export function savedSearchCriteria(
  search: Pick<SavedSearch, "query" | "filters">,
  intl: IntlShape,
): CriterionVM[] {
  const { filters } = search;
  const query = search.query.trim();
  const criteria: CriterionVM[] = [
    {
      key: "query",
      label: intl.formatMessage(messages.labelQuery),
      value: query ? intl.formatMessage(messages.query, { query }) : intl.formatMessage(messages.anyQuery),
    },
  ];
  const add = (key: CriterionVM["key"], label: MessageDescriptor, value: string) =>
    criteria.push({ key, label: intl.formatMessage(label), value });
  if (filters.countryCodes.length > 0) add("location", messages.labelLocation, countryNames(filters.countryCodes, intl));
  if (filters.remoteTypes.length > 0) add("workMode", messages.labelWorkMode, remoteText(filters.remoteTypes, intl));
  if (filters.seniority.length > 0)
    add(
      "seniority",
      messages.labelSeniority,
      intl.formatList(
        filters.seniority.map((level) => intl.formatMessage(SENIORITY_MESSAGES[level])),
        { type: "disjunction" },
      ),
    );
  if (filters.salaryMin)
    add(
      "salary",
      messages.labelSalary,
      intl.formatMessage(SALARY_MESSAGES[filters.salaryMin.period], {
        amount: money(filters.salaryMin.amount, filters.salaryMin.currency, intl.locale),
      }),
    );
  if (filters.postedWithinDays !== null)
    add("posted", messages.labelPosted, intl.formatMessage(messages.postedWithin, { days: filters.postedWithinDays }));
  if (filters.visaSponsorship === true) add("visa", messages.labelVisa, intl.formatMessage(messages.visa));
  if (filters.sources.length > 0)
    add("sources", messages.labelSources, intl.formatMessage(messages.sources, { count: filters.sources.length }));
  return criteria;
}

/**
 * The criteria on one line: "“react typescript” · Remote · Mid-level or Senior · From €55,000 a
 * year · Posted in the last 14 days" (sidebar tooltip, manage list rows).
 */
export function savedSearchSummary(search: Pick<SavedSearch, "query" | "filters">, intl: IntlShape): string {
  return join(
    savedSearchCriteria(search, intl).map((criterion) => criterion.value),
    intl,
  );
}

/** What Save search writes: the derived name and the default alert (Good and above, daily digest). */
export function newSavedSearchInput(query: string, filters: SavedSearchFilters, intl: IntlShape): SavedSearchInput {
  return {
    name: savedSearchName(query, filters, intl),
    query: query.trim(),
    filters,
    schedule: "daily",
    alertThreshold: THRESHOLD_SCORES[DEFAULT_THRESHOLD],
    dailyDigest: true,
    enabled: true,
  };
}

// ─── Run now ───────────────────────────────────────────────────────────────────────────────────

/** Source display names (`jobSources/{id}.label`); unknown ids show as they are. */
export type SourceLabels = ReadonlyMap<string, string>;

function sourceGroups(
  reports: readonly SourceRunReport[],
  status: SourceRunReport["status"],
): Map<JobSourceReason | null, string[]> {
  const groups = new Map<JobSourceReason | null, string[]>();
  for (const report of reports) {
    if (report.status !== status) continue;
    groups.set(report.reason, [...(groups.get(report.reason) ?? []), report.source]);
  }
  return groups;
}

/**
 * The Run now result line: "12 new jobs · 3 seen before · Adzuna and Jooble skipped: no key".
 * New = `counts.created`; seen before = `counts.updated`; skipped and failed sources grouped by reason.
 */
export function runResultText(response: JobsSearchResponse, labels: SourceLabels, intl: IntlShape): string {
  const parts = [intl.formatMessage(messages.resultNew, { count: response.counts.created })];
  if (response.counts.updated > 0) parts.push(intl.formatMessage(messages.resultSeen, { count: response.counts.updated }));
  const name = (source: string) => labels.get(source) ?? source;
  for (const [status, withReason, withoutReason] of [
    ["skipped", messages.resultSkipped, messages.resultSkippedNoReason],
    ["error", messages.resultError, messages.resultErrorNoReason],
  ] as const) {
    for (const [reason, sources] of sourceGroups(response.sources, status)) {
      const list = intl.formatList(sources.map(name), { type: "conjunction" });
      parts.push(
        reason === null
          ? intl.formatMessage(withoutReason, { sources: list })
          : intl.formatMessage(withReason, { sources: list, reason: intl.formatMessage(SOURCE_REASON_MESSAGES[reason]) }),
      );
    }
  }
  return join(parts, intl);
}

const ERROR_MESSAGES: Readonly<Partial<Record<JobsErrorReason, MessageDescriptor>>> = {
  search_rate_limited: messages.errorRateLimited,
  saved_search_not_found: messages.errorNotFound,
  no_sources: messages.errorNoSources,
};

/** A failed `savedSearchRunNow`, by the callable's `details.reason`. */
export function runErrorText(error: unknown, intl: IntlShape): string {
  const details = typeof error === "object" && error !== null && "details" in error ? error.details : null;
  const reason = JobsErrorReasonSchema.safeParse(
    typeof details === "object" && details !== null && "reason" in details ? details.reason : null,
  );
  const message = reason.success ? ERROR_MESSAGES[reason.data] : undefined;
  return intl.formatMessage(message ?? messages.errorGeneric);
}

// ─── Manage list ───────────────────────────────────────────────────────────────────────────────

export interface SavedSearchRowVM {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly criteria: readonly CriterionVM[];
  readonly query: string;
  readonly cadence: AlertCadence;
  readonly cadenceText: string;
  /** Null when the stored score is none of the three choices (`thresholdText` says which). */
  readonly threshold: AlertThreshold | null;
  readonly thresholdText: string;
  readonly dailyDigest: boolean;
  readonly enabled: boolean;
  /** "Checked 2 hours ago" / "Not checked yet". */
  readonly lastRunText: string;
  readonly lastRun: TimeVM | null;
  /** "Next check Tomorrow, 09:00" / "Next check in a few minutes" / "Alerts off". */
  readonly nextRunText: string;
  readonly nextRun: TimeVM | null;
  readonly pendingSync: boolean;
  /** The stored document, for updates and Undo delete. */
  readonly savedSearch: SavedSearch;
}

export interface SavedSearchesModel {
  /** Newest first, as the sidebar lists them. */
  readonly rows: readonly SavedSearchRowVM[];
}

export function savedSearchRowVM(search: SavedSearch, ctx: ModelContext): SavedSearchRowVM {
  const { intl } = ctx;
  const lastRun = search.lastRunAt ? relativeTime(search.lastRunAt, ctx) : null;
  // Due (or not scheduled yet while enabled): the runner picks it up on its next pass.
  const upcoming = search.enabled && search.nextRunAt && search.nextRunAt.getTime() > ctx.now.getTime() ? search.nextRunAt : null;
  const nextRun = upcoming ? dayAndTime(upcoming, ctx) : null;
  const nextRunText = !search.enabled
    ? intl.formatMessage(messages.alertsOff)
    : nextRun
      ? intl.formatMessage(messages.nextRun, { time: nextRun.label })
      : intl.formatMessage(messages.nextRunSoon);
  return {
    id: search.id,
    name: search.name,
    summary: savedSearchSummary(search, intl),
    criteria: savedSearchCriteria(search, intl),
    query: search.query,
    cadence: cadenceOf(search),
    cadenceText: alertCadenceText(search, intl),
    threshold: thresholdOf(search.alertThreshold),
    thresholdText: alertThresholdText(search.alertThreshold, intl),
    dailyDigest: search.dailyDigest,
    enabled: search.enabled,
    lastRunText: lastRun ? intl.formatMessage(messages.lastRun, { time: lastRun.label }) : intl.formatMessage(messages.neverRun),
    lastRun,
    nextRunText,
    nextRun,
    pendingSync: ctx.pendingWrites.has(search.id),
    savedSearch: search,
  };
}

/** The manage dialog's list (a `useTrackerModel` builder: saved searches come from the Jobs listeners). */
export function buildSavedSearchesModel(data: Pick<ScreenData, "savedSearches">, ctx: ModelContext): SavedSearchesModel {
  return {
    rows: data.savedSearches
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name, ctx.locale))
      .map((search) => savedSearchRowVM(search, ctx)),
  };
}
