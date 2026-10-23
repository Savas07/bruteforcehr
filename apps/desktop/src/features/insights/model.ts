/**
 * Insights view-model (`/insights`, research/insights.md "Decision — Desktop", decisions.md
 * D30/D31). Every number comes from `computeInsights` in `@bfhr/core` (the same definitions iOS
 * ports); this file only picks the range and filters from the route, formats, and attaches the
 * Tracker drill-down of each datum (`/tracker?view=table&…`, IA.md § Deep links).
 */
import {
  addDays,
  type CivilDate,
  civilDate,
  computeInsights,
  daysInclusive,
  drillDownSearchParams,
  INSIGHTS_DIMENSIONS,
  insightsJourneys,
  type InsightsDimension,
  type InsightsDrillDown,
  type InsightsFilters,
  type InsightsInput,
  type InsightsRange,
  type InsightsRangePreset,
  type InsightsReport,
  isCivilDate,
  type IsoWeekday,
  type MailCategory,
  type MedianDays,
  previousRange,
  rangeForPreset,
  type Rate,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { jobSourceName } from "../job-detail/model";
import type { ModelContext, UserData } from "../../shared/model/types";

/** Desktop ranges (D31) plus a custom date range. */
export const DESKTOP_RANGES = ["30d", "90d", "6m", "12m", "all"] as const satisfies readonly InsightsRangePreset[];
export type DesktopRange = (typeof DESKTOP_RANGES)[number] | "custom";
export const DEFAULT_RANGE: DesktopRange = "90d";

/** Breakdown tabs (the "Market" dimension is a filter only, IA.md). */
export const BREAKDOWN_DIMENSIONS = ["source", "channel", "cv"] as const satisfies readonly InsightsDimension[];
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export const ACTIVITY_SERIES = ["applied", "follow_up", "interview"] as const;
export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

export type KpiId = "applications" | "response" | "interview" | "offer" | "firstResponse";

/** Route search params the screen reads and writes. */
export interface InsightsParams {
  readonly range: DesktopRange;
  readonly from: CivilDate | null;
  readonly to: CivilDate | null;
  readonly filters: InsightsFilters;
  readonly compare: boolean;
  readonly by: BreakdownDimension;
  readonly series: ActivitySeries;
}

/** Tracker search params of a drill-down: `view=table` plus `stage`/`activity`, dates, filters. */
export type DrillSearch = Readonly<Record<string, string>>;

export interface RangeOptionVM {
  readonly value: DesktopRange;
  readonly label: string;
}

export interface FilterOptionVM {
  readonly value: string;
  readonly label: string;
  /** Applications in the range with this value (before this dimension's own filter). */
  readonly count: number;
}

export interface FilterVM {
  readonly dimension: InsightsDimension;
  /** "Source". */
  readonly label: string;
  /** Selected value or null (all). */
  readonly value: string | null;
  /** "Greenhouse"; "All" when none is selected. */
  readonly valueLabel: string;
  readonly options: readonly FilterOptionVM[];
}

export interface KpiVM {
  readonly id: KpiId;
  readonly label: string;
  /** "62 %", "47", "9 days"; "—" when suppressed. */
  readonly value: string;
  /** "47 of 75" / "Shows from 5 applications" / "45 measured · 18 still waiting". */
  readonly context: string;
  /** Neutral comparison, "+3 vs. previous 90 days"; null when off or not comparable. */
  readonly delta: string | null;
  /** Value suppressed below the low-sample threshold. */
  readonly lowSample: boolean;
  /** Plain-language definition for the ⓘ popover. */
  readonly definition: string;
  /** Full accessible name ("Response rate: 62 %, 47 of 75 applications"). */
  readonly accessibleLabel: string;
  readonly drill: DrillSearch | null;
}

export interface FunnelStepVM {
  readonly stage: "applied" | "responded" | "interview" | "offer";
  readonly label: string;
  readonly reached: number;
  /** reached ÷ applied, 0–1, for the bar length (always drawn; the label carries the meaning). */
  readonly share: number;
  /** "63 %" of applied, or "—" below the threshold. */
  readonly shareLabel: string;
  /** Step conversion chip between bars: "63 % → " of previous; null for Applied / low sample. */
  readonly stepLabel: string | null;
  /** Median days from the previous stage: "9 days", "—". */
  readonly medianLabel: string;
  readonly accessibleLabel: string;
  readonly drill: DrillSearch;
}

export interface BucketVM {
  readonly id: "waiting" | "no_response" | "withdrawn";
  /** "18 still waiting". */
  readonly label: string;
  readonly count: number;
  readonly drill: DrillSearch;
}

export interface BreakdownRowVM {
  readonly key: string;
  readonly label: string;
  readonly applications: number;
  readonly responses: number;
  /** 0–1, null when suppressed. */
  readonly rate: number | null;
  /** "60 %" or "Too few to compare". */
  readonly rateLabel: string;
  readonly medianLabel: string;
  readonly lowSample: boolean;
  readonly accessibleLabel: string;
  readonly drill: DrillSearch;
}

export interface WeekVM {
  readonly weekStart: CivilDate;
  /** "12 Oct". */
  readonly label: string;
  /** "Week of 12 October 2026". */
  readonly longLabel: string;
  readonly applied: number;
  readonly followUps: number;
  readonly interviews: number;
  /** The selected series' value. */
  readonly value: number;
  readonly accessibleLabel: string;
  readonly current: boolean;
  readonly drill: DrillSearch;
}

export interface InsightsModel {
  readonly params: InsightsParams;
  readonly ranges: readonly RangeOptionVM[];
  /** "23 Jul – 21 Oct 2026" or "All time · since 3 Nov 2025". */
  readonly rangeLabel: string;
  /** Custom range defaults for the date inputs. */
  readonly customFrom: CivilDate;
  readonly customTo: CivilDate;
  readonly today: CivilDate;
  readonly filters: readonly FilterVM[];
  readonly filtersActive: boolean;
  /**
   * `firstUse`: no application has been sent yet. `noneInRange`: none in this range / filters.
   * null: there is data to show.
   */
  readonly empty: "firstUse" | "noneInRange" | null;
  readonly kpis: readonly KpiVM[];
  readonly funnel: {
    readonly title: string;
    readonly steps: readonly FunnelStepVM[];
    readonly buckets: readonly BucketVM[];
    /** "Fewer than 5 applications in this range: rates appear from 5." when low; else null. */
    readonly lowSampleNote: string | null;
  };
  readonly breakdown: {
    readonly by: BreakdownDimension;
    readonly tabs: readonly { readonly value: BreakdownDimension; readonly label: string }[];
    readonly rows: readonly BreakdownRowVM[];
    /** Column header for the dimension ("Source"). */
    readonly keyHeader: string;
  };
  readonly weekly: {
    readonly series: ActivitySeries;
    readonly seriesOptions: readonly { readonly value: ActivitySeries; readonly label: string }[];
    readonly weeks: readonly WeekVM[];
    readonly max: number;
    /** "This week: 1 application sent. 12-week average: 1.6 a week." */
    readonly summary: string;
  };
  readonly provenance: string;
  /** CSV of the KPI strip, funnel and breakdowns (Export…). */
  readonly csv: string;
}

const messages = defineMessages({
  range30d: { id: "insights.range.30d", defaultMessage: "30D", description: "Range: last 30 days" },
  range90d: { id: "insights.range.90d", defaultMessage: "90D", description: "Range: last 90 days" },
  range6m: { id: "insights.range.6m", defaultMessage: "6M", description: "Range: last 6 months" },
  range12m: { id: "insights.range.12m", defaultMessage: "12M", description: "Range: last 12 months" },
  rangeAll: { id: "insights.range.all", defaultMessage: "All", description: "Range: all time" },
  rangeCustom: { id: "insights.range.custom", defaultMessage: "Custom…", description: "Range: pick dates" },
  rangeSpan: { id: "insights.range.span", defaultMessage: "{from} – {to}" },
  rangeAllSince: { id: "insights.range.allSince", defaultMessage: "All time · since {from}" },
  rangeAllEmpty: { id: "insights.range.allEmpty", defaultMessage: "All time" },
  previousPeriod: {
    id: "insights.range.previous",
    defaultMessage:
      "{preset, select, 30d {previous 30 days} 90d {previous 90 days} 6m {previous 6 months} 12m {previous 12 months} other {previous {days, plural, one {# day} other {# days}}}}",
  },
  dimensionSource: { id: "insights.dimension.source", defaultMessage: "Source" },
  dimensionChannel: { id: "insights.dimension.channel", defaultMessage: "Channel" },
  dimensionCv: { id: "insights.dimension.cv", defaultMessage: "CV variant" },
  dimensionMarket: { id: "insights.dimension.market", defaultMessage: "Market" },
  filterAll: { id: "insights.filter.all", defaultMessage: "All" },
  sourceNone: { id: "insights.source.none", defaultMessage: "Not recorded" },
  sourceManual: { id: "insights.source.manual", defaultMessage: "Added by you" },
  sourceAlertEmail: { id: "insights.source.alertEmail", defaultMessage: "Job alert email" },
  sourceUrlImport: { id: "insights.source.urlImport", defaultMessage: "Added from a link" },
  sourceWeb: { id: "insights.source.web", defaultMessage: "Company website" },
  channelEmail: { id: "insights.channel.email", defaultMessage: "Email" },
  channelExternal: { id: "insights.channel.externalLink", defaultMessage: "Application form" },
  channelReferral: { id: "insights.channel.referral", defaultMessage: "Referral" },
  channelRecruiter: { id: "insights.channel.recruiter", defaultMessage: "Recruiter" },
  channelOther: { id: "insights.channel.other", defaultMessage: "Other" },
  channelNone: { id: "insights.channel.none", defaultMessage: "Not recorded" },
  cvNone: { id: "insights.cv.none", defaultMessage: "No CV recorded" },
  cvDeleted: { id: "insights.cv.deleted", defaultMessage: "Deleted CV" },
  marketRemote: { id: "insights.market.remote", defaultMessage: "Remote" },
  marketNone: { id: "insights.market.none", defaultMessage: "Location not recognised" },
  kpiApplications: { id: "insights.kpi.applications", defaultMessage: "Applications" },
  kpiResponse: { id: "insights.kpi.response", defaultMessage: "Response rate" },
  kpiInterview: { id: "insights.kpi.interview", defaultMessage: "Interview rate" },
  kpiOffer: { id: "insights.kpi.offer", defaultMessage: "Offer rate" },
  kpiFirstResponse: { id: "insights.kpi.firstResponse", defaultMessage: "First response" },
  appliedContext: {
    id: "insights.kpi.appliedContext",
    defaultMessage: "sent in this range",
    description: "Under the Applications count",
  },
  rateContext: { id: "insights.kpi.rateContext", defaultMessage: "{count} of {of}" },
  rateLowContext: {
    id: "insights.kpi.rateLowContext",
    defaultMessage: "{count} of {of} · rate shows from 5",
  },
  medianContext: {
    id: "insights.kpi.medianContext",
    defaultMessage: "median of {n} · {waiting} still waiting",
  },
  medianLowContext: {
    id: "insights.kpi.medianLowContext",
    defaultMessage: "{n, plural, one {# reply} other {# replies}} so far · shows from 5",
  },
  days: {
    id: "insights.days",
    defaultMessage: "{days, plural, one {# day} other {# days}}",
    description: "{days} is a number, possibly with one decimal",
  },
  dash: { id: "insights.dash", defaultMessage: "—", description: "Shown instead of a suppressed number" },
  delta: {
    id: "insights.delta",
    defaultMessage: "{delta} vs. {period}",
    description: "Neutral comparison, e.g. '+3 vs. previous 90 days'",
  },
  deltaPoints: {
    id: "insights.deltaPoints",
    defaultMessage: "{delta} pts vs. {period}",
    description: "Change of a percentage in percentage points",
  },
  deltaDays: {
    id: "insights.deltaDays",
    defaultMessage: "{delta} days vs. {period}",
  },
  kpiAccessible: { id: "insights.kpi.accessible", defaultMessage: "{label}: {value}, {context}" },
  defApplications: {
    id: "insights.definition.applications",
    defaultMessage: "Applications you moved to Applied (or later) with an applied date in this range.",
  },
  defResponse: {
    id: "insights.definition.response",
    defaultMessage:
      "Applications that got a reply from the employer: a move to Screening, Interviewing, Offer or Not selected, or a linked email inviting you, asking for something, or deciding. Automatic receipts don't count.",
  },
  defInterview: {
    id: "insights.definition.interview",
    defaultMessage: "Applications that reached Interviewing (or an offer).",
  },
  defOffer: { id: "insights.definition.offer", defaultMessage: "Applications that reached an offer." },
  defFirstResponse: {
    id: "insights.definition.firstResponse",
    defaultMessage:
      "Median time to first response: the middle number of days from applying to the first reply, over applications that got one. Applications still waiting are counted separately.",
  },
  stageApplied: { id: "insights.stage.applied", defaultMessage: "Applied" },
  stageResponded: { id: "insights.stage.responded", defaultMessage: "Response" },
  stageInterview: { id: "insights.stage.interview", defaultMessage: "Interview" },
  stageOffer: { id: "insights.stage.offer", defaultMessage: "Offer" },
  funnelTitle: {
    id: "insights.funnel.title",
    defaultMessage: "{responded} of {applied, plural, one {# application} other {# applications}} got a response",
  },
  funnelStepAccessible: {
    id: "insights.funnel.stepAccessible",
    defaultMessage:
      "{stage}: {reached, plural, one {# application} other {# applications}}, {share} of applied{step, select, none {} other {, {step} of the previous stage}}",
  },
  lowSampleNote: {
    id: "insights.funnel.lowSample",
    defaultMessage: "Not enough applications yet to show a rate. This fills in as you apply.",
  },
  bucketWaiting: {
    id: "insights.bucket.waiting",
    defaultMessage: "{count} still waiting",
  },
  bucketNoResponse: {
    id: "insights.bucket.noResponse",
    defaultMessage: "{count} marked no response",
  },
  bucketWithdrawn: { id: "insights.bucket.withdrawn", defaultMessage: "{count} withdrawn" },
  tooFew: { id: "insights.breakdown.tooFew", defaultMessage: "Too few to compare" },
  breakdownAccessible: {
    id: "insights.breakdown.accessible",
    defaultMessage:
      "{label}: {responses} of {applications, plural, one {# application} other {# applications}} got a response, {rate}",
  },
  seriesApplied: { id: "insights.series.applied", defaultMessage: "Applications" },
  seriesFollowUps: { id: "insights.series.followUps", defaultMessage: "Follow-ups" },
  seriesInterviews: { id: "insights.series.interviews", defaultMessage: "Interviews" },
  weekLong: { id: "insights.week.long", defaultMessage: "Week of {date}" },
  weekAccessible: {
    id: "insights.week.accessible",
    defaultMessage:
      "{week}: {applied, plural, one {# application} other {# applications}}, {followUps, plural, one {# follow-up} other {# follow-ups}}, {interviews, plural, one {# interview} other {# interviews}}",
  },
  weeklySummary: {
    id: "insights.weekly.summary",
    defaultMessage:
      "{series, select, follow_up {This week: {count, plural, one {# follow-up} other {# follow-ups}} sent.} interview {This week: {count, plural, one {# interview} other {# interviews}}.} other {This week: {count, plural, one {# application} other {# applications}} sent.}} 12-week average: {average} a week.",
  },
  provenance: {
    id: "insights.provenance",
    defaultMessage: "Computed from your application history. Updated when your tracker changes.",
  },
  csvMetric: { id: "insights.csv.metric", defaultMessage: "Metric" },
  csvValue: { id: "insights.csv.value", defaultMessage: "Value" },
  csvCount: { id: "insights.csv.count", defaultMessage: "Count" },
  csvOf: { id: "insights.csv.of", defaultMessage: "Out of" },
  csvGroup: { id: "insights.csv.group", defaultMessage: "Group" },
  csvApplications: { id: "insights.csv.applications", defaultMessage: "Applications" },
  csvResponses: { id: "insights.csv.responses", defaultMessage: "Responses" },
  csvRate: { id: "insights.csv.rate", defaultMessage: "Response rate" },
  csvMedian: { id: "insights.csv.median", defaultMessage: "Median days to first response" },
  csvRange: { id: "insights.csv.range", defaultMessage: "Range" },
});

const RANGE_MESSAGES: Readonly<Record<DesktopRange, MessageDescriptor>> = {
  "30d": messages.range30d,
  "90d": messages.range90d,
  "6m": messages.range6m,
  "12m": messages.range12m,
  all: messages.rangeAll,
  custom: messages.rangeCustom,
};

export const DIMENSION_MESSAGES: Readonly<Record<InsightsDimension, MessageDescriptor>> = {
  source: messages.dimensionSource,
  channel: messages.dimensionChannel,
  cv: messages.dimensionCv,
  market: messages.dimensionMarket,
};

/** Sources without a product name (`jobSourceName` returns null for them). */
const SOURCE_FALLBACK_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  none: messages.sourceNone,
  manual: messages.sourceManual,
  alert_email: messages.sourceAlertEmail,
  url_import: messages.sourceUrlImport,
  web: messages.sourceWeb,
};

const CHANNEL_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  email: messages.channelEmail,
  external_link: messages.channelExternal,
  referral: messages.channelReferral,
  recruiter: messages.channelRecruiter,
  other: messages.channelOther,
  none: messages.channelNone,
};

export const STAGE_MESSAGES: Readonly<Record<FunnelStepVM["stage"], MessageDescriptor>> = {
  applied: messages.stageApplied,
  responded: messages.stageResponded,
  interview: messages.stageInterview,
  offer: messages.stageOffer,
};

const SERIES_MESSAGES: Readonly<Record<ActivitySeries, MessageDescriptor>> = {
  applied: messages.seriesApplied,
  follow_up: messages.seriesFollowUps,
  interview: messages.seriesInterviews,
};

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (values as readonly string[]).includes(value);

/** Route search → params; unknown values fall back to the defaults. */
export function readInsightsParams(
  search: Readonly<Record<string, string | undefined>>,
  storedRange: DesktopRange | null = null,
): InsightsParams {
  const requested = search.range;
  const range: DesktopRange = isOneOf([...DESKTOP_RANGES, "custom"] as const, requested)
    ? requested
    : (storedRange ?? DEFAULT_RANGE);
  const date = (value: string | undefined) => (value !== undefined && isCivilDate(value) ? value : null);
  const filters: Partial<Record<InsightsDimension, string>> = {};
  for (const dimension of INSIGHTS_DIMENSIONS) {
    const value = search[dimension];
    if (value !== undefined && value !== "") filters[dimension] = value;
  }
  return {
    range,
    from: date(search.from),
    to: date(search.to),
    filters,
    compare: search.compare === "1",
    by: isOneOf(BREAKDOWN_DIMENSIONS, search.by) ? search.by : "source",
    series: isOneOf(ACTIVITY_SERIES, search.series) ? search.series : "applied",
  };
}

/** Params → route search (defaults omitted, so plain `/insights` stays clean). */
export function insightsSearch(params: InsightsParams): Record<string, string> {
  const search: Record<string, string> = { range: params.range };
  if (params.range === "custom") {
    if (params.from !== null) search.from = params.from;
    if (params.to !== null) search.to = params.to;
  }
  for (const dimension of INSIGHTS_DIMENSIONS) {
    const value = params.filters[dimension];
    if (value !== undefined) search[dimension] = value;
  }
  if (params.compare) search.compare = "1";
  if (params.by !== "source") search.by = params.by;
  if (params.series !== "applied") search.series = params.series;
  return search;
}

/** Locale week start (Monday for TR/DE/UK, Sunday for US): `Intl.Locale` week info, else Monday. */
export function localeWeekStart(locale: string): IsoWeekday {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (firstDay !== undefined && firstDay >= 1 && firstDay <= 7) return firstDay as IsoWeekday;
  } catch {
    // Fall through to the default.
  }
  return /-US$/u.test(locale) ? 7 : 1;
}

function civilFormat(date: CivilDate, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));
}

const percent = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);

const oneDecimal = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

const signed = (value: number, locale: string, fractionDigits = 0) =>
  new Intl.NumberFormat(locale, { signDisplay: "exceptZero", maximumFractionDigits: fractionDigits }).format(value);

function rateLabel(rate: Rate, intl: IntlShape): string {
  return rate.value === null ? intl.formatMessage(messages.dash) : percent(rate.value, intl.locale);
}

function daysLabel(median: MedianDays | null, intl: IntlShape): string {
  if (median?.days === null || median === null) return intl.formatMessage(messages.dash);
  const rounded = Math.round(median.days * 10) / 10;
  return intl.formatMessage(messages.days, { days: rounded });
}

export interface InsightsLabels {
  /** CV id → title. */
  readonly cvTitles: Readonly<Record<string, string>>;
}

/** Display label of a breakdown / filter key. */
export function dimensionValueLabel(
  dimension: InsightsDimension,
  key: string,
  intl: IntlShape,
  labels: InsightsLabels,
): string {
  switch (dimension) {
    case "source":
      return jobSourceName(key) ?? (SOURCE_FALLBACK_MESSAGES[key] ? intl.formatMessage(SOURCE_FALLBACK_MESSAGES[key]) : key);
    case "channel": {
      const message = CHANNEL_MESSAGES[key];
      return message === undefined ? key : intl.formatMessage(message);
    }
    case "cv":
      if (key === "none") return intl.formatMessage(messages.cvNone);
      return labels.cvTitles[key] ?? intl.formatMessage(messages.cvDeleted);
    case "market":
      if (key === "remote") return intl.formatMessage(messages.marketRemote);
      if (key === "none") return intl.formatMessage(messages.marketNone);
      try {
        return new Intl.DisplayNames([intl.locale], { type: "region" }).of(key) ?? key;
      } catch {
        return key;
      }
  }
}

function drillSearch(drill: InsightsDrillDown): DrillSearch {
  return { view: "table", ...drillDownSearchParams(drill) };
}

function resolveRange(params: InsightsParams, today: CivilDate): InsightsRange {
  if (params.range !== "custom") return rangeForPreset(params.range, today);
  const from = params.from ?? rangeForPreset("90d", today).from;
  const to = params.to ?? today;
  return from !== null && from > to ? { from: to, to: from } : { from, to };
}

export type InsightsData = Pick<UserData, "applications" | "applicationEvents" | "interviews" | "cvs"> & {
  readonly mailMessages?: UserData["mailMessages"];
};

/** The core input from user data (mail categories from linked mail messages, D30 rule 2). */
export function insightsInput(data: InsightsData): InsightsInput {
  const mailCategories: Record<string, MailCategory> = {};
  for (const message of data.mailMessages ?? []) mailCategories[message.id] = message.category;
  return {
    applications: data.applications,
    events: data.applicationEvents,
    interviews: data.interviews,
    mailCategories,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildInsightsModel(
  data: InsightsData,
  ctx: ModelContext,
  search: Readonly<Record<string, string | undefined>>,
): InsightsModel {
  const { intl } = ctx;
  const params = readInsightsParams(search);
  const today = civilDate(ctx.now, ctx.timeZone);
  const range = resolveRange(params, today);
  const weekStart = localeWeekStart(ctx.locale);
  const input = insightsInput(data);
  const options = { now: ctx.now, timeZone: ctx.timeZone, weekStart, range, filters: params.filters };
  const report = computeInsights(input, options);
  const labels: InsightsLabels = {
    cvTitles: Object.fromEntries(data.cvs.map((cv) => [cv.id, cv.title])),
  };
  const appliedDates = insightsJourneys(input, { timeZone: ctx.timeZone }).flatMap((journey) =>
    journey.appliedDate === null ? [] : [journey.appliedDate],
  );
  const firstApplied = appliedDates.reduce<CivilDate | null>((min, date) => (min === null || date < min ? date : min), null);

  // Filter options: values present in this range, counted with the other filters applied.
  const filters = INSIGHTS_DIMENSIONS.map((dimension): FilterVM => {
    const others: Partial<Record<InsightsDimension, string>> = { ...params.filters };
    delete others[dimension];
    const rows = computeInsights(input, { ...options, filters: others }).breakdowns[dimension];
    const value = params.filters[dimension] ?? null;
    const optionsVM = rows
      .map((row) => ({ value: row.key, label: dimensionValueLabel(dimension, row.key, intl, labels), count: row.applications }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, intl.locale));
    if (value !== null && !optionsVM.some((option) => option.value === value)) {
      optionsVM.push({ value, label: dimensionValueLabel(dimension, value, intl, labels), count: 0 });
    }
    return {
      dimension,
      label: intl.formatMessage(DIMENSION_MESSAGES[dimension]),
      value,
      valueLabel:
        value === null ? intl.formatMessage(messages.filterAll) : dimensionValueLabel(dimension, value, intl, labels),
      options: optionsVM,
    };
  });

  const bounds = { ...(range.from === null ? {} : { from: range.from }), to: range.to };
  const filtersDrill = Object.keys(params.filters).length > 0 ? { filters: params.filters } : {};
  const stageDrill = (stage: InsightsDrillDown["stage"] & string): DrillSearch =>
    drillSearch({ stage, ...bounds, ...filtersDrill } as InsightsDrillDown);

  const previous = params.compare ? previousRange(range) : null;
  const before = previous === null ? null : computeInsights(input, { ...options, range: previous });
  const period =
    previous === null || range.from === null
      ? ""
      : intl.formatMessage(messages.previousPeriod, {
          preset: params.range,
          days: daysInclusive(range.from, range.to),
        });

  const rateKpi = (id: KpiId, label: MessageDescriptor, definition: MessageDescriptor, rate: Rate, previousRate: Rate | null, drill: DrillSearch): KpiVM => {
    const value = rateLabel(rate, intl);
    const context = intl.formatMessage(rate.value === null ? messages.rateLowContext : messages.rateContext, {
      count: rate.count,
      of: rate.of,
    });
    const delta =
      previousRate?.value === null || previousRate === null || rate.value === null || !period
        ? null
        : intl.formatMessage(messages.deltaPoints, {
            delta: signed(Math.round((rate.value - previousRate.value) * 100), intl.locale),
            period,
          });
    const name = intl.formatMessage(label);
    return {
      id,
      label: name,
      value,
      context,
      delta,
      lowSample: rate.value === null,
      definition: intl.formatMessage(definition),
      accessibleLabel: intl.formatMessage(messages.kpiAccessible, { label: name, value, context }),
      drill,
    };
  };

  const applicationsLabel = intl.formatMessage(messages.kpiApplications);
  const applicationsContext = intl.formatMessage(messages.appliedContext);
  const median = report.medianDaysToFirstResponse;
  const medianValue = daysLabel(median, intl);
  const medianContext =
    median.days === null
      ? intl.formatMessage(messages.medianLowContext, { n: median.n })
      : intl.formatMessage(messages.medianContext, { n: median.n, waiting: report.stillWaiting });
  const firstResponseLabel = intl.formatMessage(messages.kpiFirstResponse);
  const previousMedian = before?.medianDaysToFirstResponse.days ?? null;

  const kpis: KpiVM[] = [
    {
      id: "applications",
      label: applicationsLabel,
      value: new Intl.NumberFormat(intl.locale).format(report.applications),
      context: applicationsContext,
      delta:
        before === null || !period
          ? null
          : intl.formatMessage(messages.delta, {
              delta: signed(report.applications - before.applications, intl.locale),
              period,
            }),
      lowSample: false,
      definition: intl.formatMessage(messages.defApplications),
      accessibleLabel: intl.formatMessage(messages.kpiAccessible, {
        label: applicationsLabel,
        value: report.applications,
        context: applicationsContext,
      }),
      drill: stageDrill("applied"),
    },
    rateKpi("response", messages.kpiResponse, messages.defResponse, report.responseRate, before?.responseRate ?? null, stageDrill("responded")),
    rateKpi("interview", messages.kpiInterview, messages.defInterview, report.interviewRate, before?.interviewRate ?? null, stageDrill("interview")),
    rateKpi("offer", messages.kpiOffer, messages.defOffer, report.offerRate, before?.offerRate ?? null, stageDrill("offer")),
    {
      id: "firstResponse",
      label: firstResponseLabel,
      value: medianValue,
      context: medianContext,
      delta:
        median.days === null || previousMedian === null || !period
          ? null
          : intl.formatMessage(messages.deltaDays, {
              delta: signed(Math.round((median.days - previousMedian) * 10) / 10, intl.locale, 1),
              period,
            }),
      lowSample: median.days === null,
      definition: intl.formatMessage(messages.defFirstResponse),
      accessibleLabel: intl.formatMessage(messages.kpiAccessible, {
        label: firstResponseLabel,
        value: medianValue,
        context: medianContext,
      }),
      drill: stageDrill("responded"),
    },
  ];

  const steps = report.funnel.map((step): FunnelStepVM => {
    const share = report.applications === 0 ? 0 : step.reached / report.applications;
    const shareLabel = rateLabel(step.ofApplied, intl);
    const stepLabel = step.fromPrevious === null || step.fromPrevious.value === null ? null : percent(step.fromPrevious.value, intl.locale);
    const stage = intl.formatMessage(STAGE_MESSAGES[step.stage]);
    return {
      stage: step.stage,
      label: stage,
      reached: step.reached,
      share,
      shareLabel,
      stepLabel,
      medianLabel: step.daysFromPrevious === null ? intl.formatMessage(messages.dash) : daysLabel(step.daysFromPrevious, intl),
      accessibleLabel: intl.formatMessage(messages.funnelStepAccessible, {
        stage,
        reached: step.reached,
        share: shareLabel,
        step: stepLabel ?? "none",
      }),
      drill: stageDrill(step.stage),
    };
  });

  const buckets: BucketVM[] = [
    { id: "waiting" as const, count: report.stillWaiting, message: messages.bucketWaiting },
    { id: "no_response" as const, count: report.noResponse, message: messages.bucketNoResponse },
    { id: "withdrawn" as const, count: report.withdrawn, message: messages.bucketWithdrawn },
  ]
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      id: bucket.id,
      count: bucket.count,
      label: intl.formatMessage(bucket.message, { count: bucket.count }),
      drill: stageDrill(bucket.id),
    }));

  const breakdownRows = (dimension: InsightsDimension) =>
    report.breakdowns[dimension].map((row): BreakdownRowVM => {
      const label = dimensionValueLabel(dimension, row.key, intl, labels);
      const rate = row.rate.value;
      const shown = rate === null ? intl.formatMessage(messages.tooFew) : percent(rate, intl.locale);
      return {
        key: row.key,
        label,
        applications: row.applications,
        responses: row.responses,
        rate,
        rateLabel: shown,
        medianLabel: daysLabel(row.medianDaysToResponse, intl),
        lowSample: rate === null,
        accessibleLabel: intl.formatMessage(messages.breakdownAccessible, {
          label,
          responses: row.responses,
          applications: row.applications,
          rate: shown,
        }),
        drill: drillSearch({
          stage: "applied",
          ...bounds,
          filters: { ...params.filters, [dimension]: row.key },
        }),
      };
    });

  const seriesValue = (week: InsightsReport["weekly"][number]) =>
    params.series === "applied" ? week.applied : params.series === "follow_up" ? week.followUps : week.interviews;
  const lastWeek = report.weekly.at(-1)?.weekStart ?? today;
  const weeks = report.weekly.map((week): WeekVM => {
    const end = week.weekStart === lastWeek ? today : addDays(week.weekStart, 6);
    const longLabel = intl.formatMessage(messages.weekLong, {
      date: civilFormat(week.weekStart, intl.locale, { day: "numeric", month: "long", year: "numeric" }),
    });
    return {
      weekStart: week.weekStart,
      label: civilFormat(week.weekStart, intl.locale, { day: "numeric", month: "short" }),
      longLabel,
      applied: week.applied,
      followUps: week.followUps,
      interviews: week.interviews,
      value: seriesValue(week),
      accessibleLabel: intl.formatMessage(messages.weekAccessible, {
        week: longLabel,
        applied: week.applied,
        followUps: week.followUps,
        interviews: week.interviews,
      }),
      current: week.weekStart === lastWeek,
      drill: drillSearch({ activity: params.series, from: week.weekStart, to: end, ...filtersDrill }),
    };
  });
  const total = weeks.reduce((sum, week) => sum + week.value, 0);

  const rangeLabel =
    range.from === null
      ? firstApplied === null
        ? intl.formatMessage(messages.rangeAllEmpty)
        : intl.formatMessage(messages.rangeAllSince, {
            from: civilFormat(firstApplied, intl.locale, { day: "numeric", month: "short", year: "numeric" }),
          })
      : intl.formatMessage(messages.rangeSpan, {
          from: civilFormat(range.from, intl.locale, { day: "numeric", month: "short", ...(range.from.slice(0, 4) === range.to.slice(0, 4) ? {} : { year: "numeric" }) }),
          to: civilFormat(range.to, intl.locale, { day: "numeric", month: "short", year: "numeric" }),
        });

  const empty = firstApplied === null ? "firstUse" : report.applications === 0 ? "noneInRange" : null;
  const breakdownTabs = BREAKDOWN_DIMENSIONS.map((value) => ({ value, label: intl.formatMessage(DIMENSION_MESSAGES[value]) }));

  // CSV: one table per block, blank line between, header rows in the UI language.
  const csvLines: (string | number)[][] = [
    [intl.formatMessage(messages.csvRange), rangeLabel],
    [],
    [intl.formatMessage(messages.csvMetric), intl.formatMessage(messages.csvValue), intl.formatMessage(messages.csvCount), intl.formatMessage(messages.csvOf)],
    [applicationsLabel, report.applications, report.applications, report.applications],
    ...([
      [messages.kpiResponse, report.responseRate],
      [messages.kpiInterview, report.interviewRate],
      [messages.kpiOffer, report.offerRate],
    ] as const).map(([label, rate]) => [intl.formatMessage(label), rate.value === null ? "" : Math.round(rate.value * 1000) / 1000, rate.count, rate.of]),
    [intl.formatMessage(messages.csvMedian), median.days === null ? "" : Math.round(median.days * 10) / 10, median.n, ""],
    ...BREAKDOWN_DIMENSIONS.flatMap((dimension) => [
      [],
      [intl.formatMessage(DIMENSION_MESSAGES[dimension]), intl.formatMessage(messages.csvApplications), intl.formatMessage(messages.csvResponses), intl.formatMessage(messages.csvRate), intl.formatMessage(messages.csvMedian)],
      ...report.breakdowns[dimension].map((row) => [
        dimensionValueLabel(dimension, row.key, intl, labels),
        row.applications,
        row.responses,
        row.rate.value === null ? "" : Math.round(row.rate.value * 1000) / 1000,
        row.medianDaysToResponse.days === null ? "" : Math.round(row.medianDaysToResponse.days * 10) / 10,
      ]),
    ]),
  ];

  return {
    params,
    ranges: [...DESKTOP_RANGES, "custom" as const].map((value) => ({ value, label: intl.formatMessage(RANGE_MESSAGES[value]) })),
    rangeLabel,
    customFrom: range.from ?? rangeForPreset("90d", today).from ?? today,
    customTo: range.to,
    today,
    filters,
    filtersActive: Object.keys(params.filters).length > 0,
    empty,
    kpis,
    funnel: {
      title: intl.formatMessage(messages.funnelTitle, {
        responded: report.responseRate.count,
        applied: report.applications,
      }),
      steps,
      buckets,
      lowSampleNote: report.applications > 0 && report.applications < 5 ? intl.formatMessage(messages.lowSampleNote) : null,
    },
    breakdown: {
      by: params.by,
      tabs: breakdownTabs,
      rows: breakdownRows(params.by),
      keyHeader: intl.formatMessage(DIMENSION_MESSAGES[params.by]),
    },
    weekly: {
      series: params.series,
      seriesOptions: ACTIVITY_SERIES.map((value) => ({ value, label: intl.formatMessage(SERIES_MESSAGES[value]) })),
      weeks,
      max: Math.max(0, ...weeks.map((week) => week.value)),
      summary: intl.formatMessage(messages.weeklySummary, {
        series: params.series,
        count: weeks.at(-1)?.value ?? 0,
        average: oneDecimal(total / Math.max(1, weeks.length), intl.locale),
      }),
    },
    provenance: intl.formatMessage(messages.provenance),
    csv: `${csvLines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`,
  };
}
