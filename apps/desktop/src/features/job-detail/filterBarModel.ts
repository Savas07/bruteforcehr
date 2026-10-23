/**
 * View-models of the Jobs filter bar (job-feed-search.md "Decision — Desktop" 2): one pill per
 * facet with its value ("Work mode: Remote", "Location (2)"), the options each popover lists, the
 * sort menu, the zero-results chips (7), and the saved searches nested under Jobs in the sidebar
 * (1). Pure: the feed's filtering itself lives in model.ts.
 */
import { type Job, type RemoteType, type SavedSearch, type Seniority, SenioritySchema } from "@bfhr/core";
import { defineMessages, type MessageDescriptor } from "react-intl";
import { money } from "../../shared/model/format";
import type { ModelContext } from "../../shared/model/types";
import {
  activeFilterCount,
  filterSearchParams,
  JOB_SORTS,
  type JobSort,
  type JobsFilterState,
  MIN_BANDS,
  type MinBand,
  POSTED_WITHIN_DAYS,
  sameSearch,
} from "./filters";

const messages = defineMessages({
  workMode: { id: "job-detail.filters.workMode", defaultMessage: "Work mode" },
  location: { id: "job-detail.filters.location", defaultMessage: "Location" },
  seniority: { id: "job-detail.filters.seniority", defaultMessage: "Seniority" },
  salary: { id: "job-detail.filters.salary", defaultMessage: "Salary" },
  posted: { id: "job-detail.filters.posted", defaultMessage: "Posted" },
  match: { id: "job-detail.filters.match", defaultMessage: "Match" },
  visa: { id: "job-detail.filters.visa", defaultMessage: "Visa sponsorship" },
  source: { id: "job-detail.filters.source", defaultMessage: "Source" },
  clearAll: { id: "job-detail.filters.clearAll", defaultMessage: "Clear all" },
  barLabel: { id: "job-detail.filters.barLabel", defaultMessage: "Filters" },
  pillValue: {
    id: "job-detail.filters.pillValue",
    defaultMessage: "{facet}: {value}",
    description: "An active filter pill with one value: “Work mode: Remote”",
  },
  pillCount: {
    id: "job-detail.filters.pillCount",
    defaultMessage: "{facet} ({count})",
    description: "An active filter pill with several values: “Location (3)”",
  },
  postedWithin: {
    id: "job-detail.filters.postedWithin",
    defaultMessage: "{days, plural, one {Last 24 hours} other {Last # days}}",
  },
  salaryAtLeast: { id: "job-detail.filters.salaryAtLeast", defaultMessage: "From {amount}" },
  salaryPeriod: {
    id: "job-detail.filters.salaryPeriod",
    defaultMessage: "{period, select, year {a year} month {a month} day {a day} other {an hour}}",
  },
  visaOffered: { id: "job-detail.filters.visaOffered", defaultMessage: "Offered" },
  sortBest: { id: "job-detail.filters.sortBest", defaultMessage: "Best match" },
  sortNewest: { id: "job-detail.filters.sortNewest", defaultMessage: "Newest" },
  sortLabel: { id: "job-detail.filters.sortLabel", defaultMessage: "Sort" },
  removeFilter: {
    id: "job-detail.filters.removeFilter",
    defaultMessage: "Remove filter: {filter}",
    description: "Accessible name of a zero-results chip",
  },
  chipCount: {
    id: "job-detail.filters.chipCount",
    defaultMessage: "{count, plural, one {Shows # more job} other {Shows # more jobs}}",
    description: "Tooltip of a zero-results chip's “+3”: jobs that come back without this filter alone",
  },
});

const REMOTE_OPTION_MESSAGES: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  remote: { id: "job-detail.filters.remote", defaultMessage: "Remote" },
  hybrid: { id: "job-detail.filters.hybrid", defaultMessage: "Hybrid" },
  onsite: { id: "job-detail.filters.onsite", defaultMessage: "On-site" },
});

const SENIORITY_OPTION_MESSAGES: Readonly<Record<Seniority, MessageDescriptor>> = defineMessages({
  intern: { id: "job-detail.filters.level.intern", defaultMessage: "Intern" },
  junior: { id: "job-detail.filters.level.junior", defaultMessage: "Junior" },
  mid: { id: "job-detail.filters.level.mid", defaultMessage: "Mid-level" },
  senior: { id: "job-detail.filters.level.senior", defaultMessage: "Senior" },
  staff: { id: "job-detail.filters.level.staff", defaultMessage: "Staff" },
  principal: { id: "job-detail.filters.level.principal", defaultMessage: "Principal" },
  lead: { id: "job-detail.filters.level.lead", defaultMessage: "Lead" },
  manager: { id: "job-detail.filters.level.manager", defaultMessage: "Manager" },
  director: { id: "job-detail.filters.level.director", defaultMessage: "Director" },
});

const MIN_BAND_MESSAGES: Readonly<Record<MinBand, MessageDescriptor>> = defineMessages({
  strong: { id: "job-detail.filters.band.strong", defaultMessage: "Strong matches" },
  good: { id: "job-detail.filters.band.good", defaultMessage: "Good and above" },
  partial: { id: "job-detail.filters.band.partial", defaultMessage: "Partial and above" },
});

const SORT_MESSAGES: Readonly<Record<JobSort, MessageDescriptor>> = {
  best: messages.sortBest,
  newest: messages.sortNewest,
};

/** Currencies the Salary popover offers (the target markets: TR, EU, UK, US). */
export const SALARY_CURRENCIES = ["EUR", "GBP", "USD", "TRY"] as const;

export interface FilterOptionVM<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
  readonly selected: boolean;
}

export const FILTER_FACETS = [
  "workMode",
  "location",
  "seniority",
  "salary",
  "posted",
  "match",
  "visa",
  "source",
] as const;
export type FilterFacet = (typeof FILTER_FACETS)[number];

export interface FilterPillVM {
  readonly facet: FilterFacet;
  /** "Work mode"; the popover's title. */
  readonly title: string;
  /** "Work mode: Remote", "Location (2)", or the title when unset. */
  readonly label: string;
  readonly active: boolean;
}

/** A zero-results chip (job-feed-search.md "Decision — Desktop" 7): one active filter, removable. */
export interface RemovableChipVM {
  readonly facet: FilterFacet;
  /** The pill's label: "Work mode: On-site". */
  readonly label: string;
  /** "+3" and "Shows 3 more jobs": what removing only this filter brings back; null for none. */
  readonly count: { readonly label: string; readonly hint: string } | null;
  /** "Remove filter: Work mode: On-site". */
  readonly removeLabel: string;
}

/** `state` without the filter behind one pill (its Reset, its zero-results chip). */
export function clearFacet(state: JobsFilterState, facet: FilterFacet): JobsFilterState {
  const { filters } = state;
  switch (facet) {
    case "workMode":
      return { ...state, filters: { ...filters, remoteTypes: [] } };
    case "location":
      return { ...state, filters: { ...filters, countryCodes: [] } };
    case "seniority":
      return { ...state, filters: { ...filters, seniority: [] } };
    case "salary":
      return { ...state, filters: { ...filters, salaryMin: null } };
    case "posted":
      return { ...state, filters: { ...filters, postedWithinDays: null } };
    case "match":
      return { ...state, minBand: null };
    case "visa":
      return { ...state, filters: { ...filters, visaSponsorship: null } };
    case "source":
      return { ...state, filters: { ...filters, sources: [] } };
  }
}

/**
 * The active pills as zero-results chips, each with the jobs removing it alone brings back
 * (`countWithout`, cheap on the client: the feed is already in memory).
 */
export function removableChips(
  pills: readonly FilterPillVM[],
  countWithout: (facet: FilterFacet) => number,
  ctx: Pick<ModelContext, "intl">,
): RemovableChipVM[] {
  const { intl } = ctx;
  return pills
    .filter((pill) => pill.active)
    .map((pill) => {
      const count = countWithout(pill.facet);
      return {
        facet: pill.facet,
        label: pill.label,
        count:
          count > 0
            ? {
                label: intl.formatNumber(count, { signDisplay: "always" }),
                hint: intl.formatMessage(messages.chipCount, { count }),
              }
            : null,
        removeLabel: intl.formatMessage(messages.removeFilter, { filter: pill.label }),
      };
    });
}

export interface FilterBarVM {
  readonly label: string;
  readonly pills: readonly FilterPillVM[];
  readonly workModes: readonly FilterOptionVM<RemoteType>[];
  /** Countries of the jobs in the feed, plus any selected one, by name. */
  readonly countries: readonly FilterOptionVM<string>[];
  readonly seniority: readonly FilterOptionVM<Seniority>[];
  readonly posted: readonly FilterOptionVM<number>[];
  readonly bands: readonly FilterOptionVM<MinBand>[];
  /** Sources the feed's jobs came from, plus any selected one. */
  readonly sources: readonly FilterOptionVM<string>[];
  readonly salary: {
    readonly amount: number | null;
    readonly currency: string;
    readonly currencies: readonly string[];
  };
  readonly activeCount: number;
  readonly clearAllLabel: string;
  readonly sort: {
    readonly label: string;
    readonly value: JobSort;
    readonly options: readonly FilterOptionVM<JobSort>[];
  };
}

const option = <Value extends string | number>(
  value: Value,
  label: string,
  selected: boolean,
): FilterOptionVM<Value> => ({
  value,
  label,
  selected,
});

export function buildFilterBar(
  state: JobsFilterState,
  jobs: readonly Job[],
  sourceName: (slug: string) => string,
  ctx: ModelContext,
): FilterBarVM {
  const { intl, locale } = ctx;
  const { filters } = state;
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const countryCodes = new Set(filters.countryCodes);
  const sourceSlugs = new Set(filters.sources);
  const currencies = new Map<string, number>();
  for (const job of jobs) {
    for (const location of job.locations) if (location.countryCode) countryCodes.add(location.countryCode);
    for (const link of job.sources) sourceSlugs.add(link.source);
    if (job.salary) currencies.set(job.salary.currency, (currencies.get(job.salary.currency) ?? 0) + 1);
  }
  const mostCommonCurrency = [...currencies].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";

  const pill = (facet: FilterFacet, title: MessageDescriptor, values: readonly string[]): FilterPillVM => {
    const name = intl.formatMessage(title);
    const label =
      values.length === 0
        ? name
        : values.length === 1
          ? intl.formatMessage(messages.pillValue, { facet: name, value: values[0] })
          : intl.formatMessage(messages.pillCount, { facet: name, count: values.length });
    return { facet, title: name, label, active: values.length > 0 };
  };
  const salaryValue = filters.salaryMin
    ? `${intl.formatMessage(messages.salaryAtLeast, {
        amount: money(filters.salaryMin.amount, filters.salaryMin.currency, locale),
      })} ${intl.formatMessage(messages.salaryPeriod, { period: filters.salaryMin.period })}`
    : null;
  const countryName = (code: string) => regions.of(code) ?? code;

  const pills = [
    pill(
      "workMode",
      messages.workMode,
      filters.remoteTypes.map((type) => intl.formatMessage(REMOTE_OPTION_MESSAGES[type])),
    ),
    pill("location", messages.location, filters.countryCodes.map(countryName)),
    pill(
      "seniority",
      messages.seniority,
      filters.seniority.map((level) => intl.formatMessage(SENIORITY_OPTION_MESSAGES[level])),
    ),
    pill("salary", messages.salary, salaryValue ? [salaryValue] : []),
    pill(
      "posted",
      messages.posted,
      filters.postedWithinDays === null
        ? []
        : [intl.formatMessage(messages.postedWithin, { days: filters.postedWithinDays })],
    ),
    pill(
      "match",
      messages.match,
      state.minBand ? [intl.formatMessage(MIN_BAND_MESSAGES[state.minBand])] : [],
    ),
    pill("visa", messages.visa, filters.visaSponsorship ? [intl.formatMessage(messages.visaOffered)] : []),
    pill("source", messages.source, filters.sources.map(sourceName)),
  ];

  return {
    label: intl.formatMessage(messages.barLabel),
    pills,
    workModes: (["remote", "hybrid", "onsite"] as const).map((type) =>
      option(type, intl.formatMessage(REMOTE_OPTION_MESSAGES[type]), filters.remoteTypes.includes(type)),
    ),
    countries: [...countryCodes]
      .map((code) => option(code, countryName(code), filters.countryCodes.includes(code)))
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
    seniority: SenioritySchema.options.map((level) =>
      option(level, intl.formatMessage(SENIORITY_OPTION_MESSAGES[level]), filters.seniority.includes(level)),
    ),
    posted: POSTED_WITHIN_DAYS.map((days) =>
      option(days, intl.formatMessage(messages.postedWithin, { days }), filters.postedWithinDays === days),
    ),
    bands: MIN_BANDS.map((band) =>
      option(band, intl.formatMessage(MIN_BAND_MESSAGES[band]), state.minBand === band),
    ),
    sources: [...sourceSlugs]
      .map((slug) => option(slug, sourceName(slug), filters.sources.includes(slug)))
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
    salary: {
      amount: filters.salaryMin?.amount ?? null,
      currency: filters.salaryMin?.currency ?? mostCommonCurrency,
      currencies: [...new Set([...SALARY_CURRENCIES, mostCommonCurrency])],
    },
    activeCount: activeFilterCount(state),
    clearAllLabel: intl.formatMessage(messages.clearAll),
    sort: {
      label: intl.formatMessage(messages.sortLabel),
      value: state.sort,
      options: JOB_SORTS.map((sort) =>
        option(sort, intl.formatMessage(SORT_MESSAGES[sort]), state.sort === sort),
      ),
    },
  };
}

/**
 * A saved search nested under Jobs in the sidebar. No new-match count: Jobs never carries a badge
 * (decisions.md D01).
 */
export interface SavedSearchItemVM {
  readonly id: string;
  readonly name: string;
  /** The feed shows this saved search: it was picked and its criteria are unchanged. */
  readonly current: boolean;
  readonly enabled: boolean;
  /** Route search params that show its results (query + filters, the feed's sort kept). */
  readonly params: Readonly<Record<string, string | undefined>>;
}

export function savedSearchItems(
  savedSearches: readonly SavedSearch[],
  state: JobsFilterState,
  currentId: string | null,
): SavedSearchItemVM[] {
  return savedSearches
    .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((search) => ({
      id: search.id,
      name: search.name,
      current: search.id === currentId && sameSearch(search, state),
      enabled: search.enabled,
      params: {
        ...filterSearchParams({
          query: search.query,
          filters: search.filters,
          minBand: null,
          sort: state.sort,
        }),
        search: search.id,
      },
    }));
}
