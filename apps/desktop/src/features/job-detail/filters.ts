/**
 * The Jobs feed's search and filters (job-feed-search.md "Decision — Desktop" 2, 4, 7) as route
 * search params, so the list, a saved search and the on-demand `jobsSearch` share one model: the
 * filters are core's `SavedSearchFilters`, plus a minimum match band and the sort, which only the
 * feed applies. Every param is validated; anything unknown reads as "no filter".
 *
 *   ?q=react typescript&remote=remote,hybrid&level=mid,senior&country=DE,NL&posted=14&visa=1
 *    &salary=55000:EUR:year&source=greenhouse,remotive&match=good&sort=newest&search=<saved id>
 */
import {
  CountryCodeSchema,
  CurrencySchema,
  type Job,
  JobSourceIdSchema,
  type MatchBand,
  RemoteTypeSchema,
  SalaryPeriodSchema,
  type SavedSearchFilters,
  SenioritySchema,
} from "@bfhr/core";

export const JOB_SORTS = ["best", "newest"] as const;
export type JobSort = (typeof JOB_SORTS)[number];

/** Minimum bands the Match filter offers ("Strong only", "Good and above", "Partial and above"). */
export const MIN_BANDS = ["strong", "good", "partial"] as const satisfies readonly MatchBand[];
export type MinBand = (typeof MIN_BANDS)[number];

/** "Posted" presets in days. */
export const POSTED_WITHIN_DAYS = [1, 3, 7, 14, 30] as const;

export const NO_FILTERS: SavedSearchFilters = {
  countryCodes: [],
  remoteTypes: [],
  seniority: [],
  salaryMin: null,
  sources: [],
  postedWithinDays: null,
  visaSponsorship: null,
};

export interface JobsFilterState {
  /** The search text (`q`), trimmed. */
  readonly query: string;
  readonly filters: SavedSearchFilters;
  readonly minBand: MinBand | null;
  readonly sort: JobSort;
}

/** The search params this module owns (everything else in the route is kept as is). */
export const FILTER_PARAM_KEYS = [
  "q",
  "remote",
  "level",
  "country",
  "posted",
  "visa",
  "salary",
  "source",
  "match",
  "sort",
] as const;

function list<T>(value: string | undefined, parse: (item: string) => T | null): T[] {
  if (!value) return [];
  const items: T[] = [];
  for (const item of value.split(",")) {
    const parsed = parse(item.trim());
    if (parsed !== null && !items.includes(parsed)) items.push(parsed);
  }
  return items;
}

const parsed =
  <T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }) =>
  (item: string): T | null => {
    const result = schema.safeParse(item);
    return result.success ? result.data : null;
  };

function salaryParam(value: string | undefined): SavedSearchFilters["salaryMin"] {
  if (!value) return null;
  const [amount, currency, period] = value.split(":");
  const number = Number(amount);
  const unit = CurrencySchema.safeParse(currency);
  const per = SalaryPeriodSchema.safeParse(period ?? "year");
  if (!Number.isFinite(number) || number <= 0 || !unit.success || !per.success) return null;
  return { amount: Math.round(number), currency: unit.data, period: per.data };
}

export function readFilterParams(params: Readonly<Record<string, string | undefined>>): JobsFilterState {
  const posted = Number(params["posted"]);
  return {
    query: (params["q"] ?? "").trim(),
    filters: {
      countryCodes: list(params["country"], parsed(CountryCodeSchema)),
      remoteTypes: list(params["remote"], parsed(RemoteTypeSchema)),
      seniority: list(params["level"], parsed(SenioritySchema)),
      salaryMin: salaryParam(params["salary"]),
      sources: list(params["source"], parsed(JobSourceIdSchema)),
      postedWithinDays: Number.isInteger(posted) && posted >= 1 && posted <= 90 ? posted : null,
      visaSponsorship: params["visa"] === "1" ? true : null,
    },
    minBand: MIN_BANDS.find((band) => band === params["match"]) ?? null,
    sort: JOB_SORTS.find((sort) => sort === params["sort"]) ?? "best",
  };
}

/** The search params for `state`; unset filters are `undefined` so they leave the URL. */
export function filterSearchParams(
  state: JobsFilterState,
): Record<(typeof FILTER_PARAM_KEYS)[number], string | undefined> {
  const joined = (items: readonly string[]) => (items.length > 0 ? items.join(",") : undefined);
  const { filters } = state;
  return {
    q: state.query === "" ? undefined : state.query,
    remote: joined(filters.remoteTypes),
    level: joined(filters.seniority),
    country: joined(filters.countryCodes),
    posted: filters.postedWithinDays === null ? undefined : String(filters.postedWithinDays),
    visa: filters.visaSponsorship === true ? "1" : undefined,
    salary: filters.salaryMin
      ? `${filters.salaryMin.amount}:${filters.salaryMin.currency}:${filters.salaryMin.period}`
      : undefined,
    source: joined(filters.sources),
    match: state.minBand ?? undefined,
    sort: state.sort === "best" ? undefined : state.sort,
  };
}

/** How many filters are set (the pills' "Clear all" and the zero-results chips). */
export function activeFilterCount(state: Pick<JobsFilterState, "filters" | "minBand">): number {
  const { filters } = state;
  return (
    [filters.countryCodes, filters.remoteTypes, filters.seniority, filters.sources].filter(
      (items) => items.length > 0,
    ).length +
    [filters.salaryMin, filters.postedWithinDays, filters.visaSponsorship, state.minBand].filter(
      (value) => value !== null,
    ).length
  );
}

/**
 * Alternatives of a search text: `OR` (any case) separates them, the words of one alternative must
 * all appear ("frontend engineer OR product engineer"). Saved-search queries use the same syntax.
 */
export function queryAlternatives(query: string, locale: string): string[][] {
  return query
    .split(/\s+or\s+/iu)
    .map((alternative) =>
      alternative
        .toLocaleLowerCase(locale)
        .split(/\s+/u)
        .filter((word) => word.length > 0 && word !== "and"),
    )
    .filter((words) => words.length > 0);
}

/** Whether the job's title, company, places or skills contain the search text (`queryAlternatives`). */
export function matchesQuery(job: Job, query: string, locale: string): boolean {
  const alternatives = queryAlternatives(query, locale);
  if (alternatives.length === 0) return true;
  const text = [
    job.title,
    job.company,
    ...job.locations.map((location) => location.label),
    job.remoteEligibility ?? "",
    ...job.skills,
  ]
    .join(" ")
    .toLocaleLowerCase(locale);
  return alternatives.some((words) => words.every((word) => text.includes(word)));
}

/** Same query (case and spacing aside) and same filters, whatever the order of list values. */
export function sameSearch(
  a: { readonly query: string; readonly filters: SavedSearchFilters },
  b: { readonly query: string; readonly filters: SavedSearchFilters },
): boolean {
  const norm = (query: string) => query.trim().toLocaleLowerCase("en").replace(/\s+/gu, " ");
  const sorted = (items: readonly string[]) => [...items].sort().join(",");
  const keyOf = (filters: SavedSearchFilters) =>
    JSON.stringify([
      sorted(filters.countryCodes),
      sorted(filters.remoteTypes),
      sorted(filters.seniority),
      sorted(filters.sources),
      filters.salaryMin,
      filters.postedWithinDays,
      filters.visaSponsorship,
    ]);
  return norm(a.query) === norm(b.query) && keyOf(a.filters) === keyOf(b.filters);
}
