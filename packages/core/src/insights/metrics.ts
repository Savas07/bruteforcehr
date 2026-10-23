/**
 * §4.8 Insights: pure metrics over applications and their `applicationEvents` (decisions.md D30,
 * D31). Cohort = applications whose applied date falls in the range; every stage counts
 * applications that ever reached it, so step conversion never exceeds 100 %. Rates and medians
 * are suppressed (null) below `LOW_SAMPLE_THRESHOLD`, and every number carries its `n`.
 * Ported to Swift (BFHRCore `Insights.swift`) and proven by `conformance/insights.json`.
 */
import { isActiveStatus } from "../status";
import {
  addDays,
  addMonths,
  type CivilDate,
  civilDate,
  dayNumber,
  daysInclusive,
  type IsoWeekday,
  startOfWeek,
} from "./calendar";
import { buildJourney, type InsightsInput, type Journey } from "./journey";

/** Rates and medians need at least this many applications (D31; fixed, not configurable). */
export const LOW_SAMPLE_THRESHOLD = 5;
/** Weeks in the weekly activity chart, ending with the current week. */
export const ACTIVITY_WEEKS = 12;

const DAY_MS = 86_400_000;

/** iOS: `4w · 12w · all`; desktop: `30d · 90d · 6m · 12m · all` (+ custom). D31. */
export const INSIGHTS_RANGE_PRESETS = ["4w", "12w", "30d", "90d", "6m", "12m", "all"] as const;
export type InsightsRangePreset = (typeof INSIGHTS_RANGE_PRESETS)[number];

/** Inclusive applied-date bounds; `from` null means since the first application. */
export interface InsightsRange {
  readonly from: CivilDate | null;
  readonly to: CivilDate;
}

/** The range `preset` covers, ending `today` (inclusive). */
export function rangeForPreset(preset: InsightsRangePreset, today: CivilDate): InsightsRange {
  switch (preset) {
    case "4w":
      return { from: addDays(today, -27), to: today };
    case "12w":
      return { from: addDays(today, -83), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "6m":
      return { from: addDays(addMonths(today, -6), 1), to: today };
    case "12m":
      return { from: addDays(addMonths(today, -12), 1), to: today };
    case "all":
      return { from: null, to: today };
  }
}

/** The equally long range just before `range` (desktop "Compare to previous period"); null for "all". */
export function previousRange(range: InsightsRange): InsightsRange | null {
  if (range.from === null) return null;
  const length = daysInclusive(range.from, range.to);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

/** Breakdown and filter dimensions. Keys are the field values, `none` when unset. */
export const INSIGHTS_DIMENSIONS = ["source", "channel", "cv", "market"] as const;
export type InsightsDimension = (typeof INSIGHTS_DIMENSIONS)[number];

/** One selected value per dimension (desktop filter chips). */
export type InsightsFilters = Partial<Readonly<Record<InsightsDimension, string>>>;

export interface InsightsOptions {
  readonly now: Date;
  /** IANA zone for applied dates and weeks. */
  readonly timeZone: string;
  /** Locale week start (Monday for TR/DE/UK/EU, Sunday for US). */
  readonly weekStart: IsoWeekday;
  readonly range: InsightsRange;
  readonly filters?: InsightsFilters;
}

/** `count` of `of`; `value` = count ÷ of, null while `of` < LOW_SAMPLE_THRESHOLD. */
export interface Rate {
  readonly count: number;
  readonly of: number;
  readonly value: number | null;
}

/** Median days over `n` measured applications; null while `n` < LOW_SAMPLE_THRESHOLD. */
export interface MedianDays {
  readonly n: number;
  readonly days: number | null;
}

export type FunnelStage = "applied" | "responded" | "interview" | "offer";
export const FUNNEL_STAGES = [
  "applied",
  "responded",
  "interview",
  "offer",
] as const satisfies readonly FunnelStage[];

export interface FunnelStep {
  readonly stage: FunnelStage;
  /** Applications that reached this stage. */
  readonly reached: number;
  /** reached ÷ previous stage's reached (null for Applied and below the threshold). */
  readonly fromPrevious: Rate | null;
  /** reached ÷ cohort. */
  readonly ofApplied: Rate;
  /** Days from the previous stage, over applications with both times known. */
  readonly daysFromPrevious: MedianDays | null;
}

export interface BreakdownRow {
  readonly key: string;
  readonly applications: number;
  readonly responses: number;
  readonly rate: Rate;
  readonly medianDaysToResponse: MedianDays;
}

export interface ActivityWeek {
  /** First day of the week. */
  readonly weekStart: CivilDate;
  readonly applied: number;
  readonly followUps: number;
  /** Interviews that started in the week, up to now. */
  readonly interviews: number;
}

export interface InsightsReport {
  readonly range: InsightsRange;
  /** Applications applied in the range (after filters). */
  readonly applications: number;
  readonly funnel: readonly FunnelStep[];
  readonly responseRate: Rate;
  readonly interviewRate: Rate;
  readonly offerRate: Rate;
  readonly medianDaysToFirstResponse: MedianDays;
  /** No response yet and still active ("Still waiting", D15). */
  readonly stillWaiting: number;
  /** No response and marked No response (`ghosted`). */
  readonly noResponse: number;
  /** No response and withdrawn by the user. */
  readonly withdrawn: number;
  readonly breakdowns: Readonly<Record<InsightsDimension, readonly BreakdownRow[]>>;
  /** ACTIVITY_WEEKS weeks, oldest first, ending with the current week. Ignores the range. */
  readonly weekly: readonly ActivityWeek[];
}

export function rate(count: number, of: number): Rate {
  return { count, of, value: of < LOW_SAMPLE_THRESHOLD ? null : count / of };
}

export function medianDays(samples: readonly number[]): MedianDays {
  const n = samples.length;
  if (n < LOW_SAMPLE_THRESHOLD) return { n, days: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const days = n % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return { n, days };
}

const daysBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);

/** Every application's journey, filtered (`filters`) but not limited to a range. */
export function insightsJourneys(
  input: InsightsInput,
  options: Pick<InsightsOptions, "timeZone" | "filters">,
): Journey[] {
  const mailCategories = input.mailCategories ?? {};
  const filters = options.filters ?? {};
  const byApplication = new Map<string, InsightsInput["events"][number][]>();
  for (const event of input.events) {
    const list = byApplication.get(event.applicationId);
    if (list === undefined) byApplication.set(event.applicationId, [event]);
    else list.push(event);
  }
  return input.applications
    .map((application) =>
      buildJourney(application, byApplication.get(application.id) ?? [], mailCategories, options.timeZone),
    )
    .filter((journey) =>
      INSIGHTS_DIMENSIONS.every((dimension) => {
        const wanted = filters[dimension];
        return wanted === undefined || journey[dimension] === wanted;
      }),
    );
}

export function inRange(date: CivilDate | null, range: InsightsRange): date is CivilDate {
  return date !== null && (range.from === null || date >= range.from) && date <= range.to;
}

/** The cohort: journeys applied within `range`. */
export function cohortOf(journeys: readonly Journey[], range: InsightsRange): Journey[] {
  return journeys.filter((journey) => inRange(journey.appliedDate, range));
}

const reachedAt = (journey: Journey, stage: FunnelStage): Date | null => {
  switch (stage) {
    case "applied":
      return journey.appliedAt;
    case "responded":
      return journey.respondedAt;
    case "interview":
      return journey.interviewedAt;
    case "offer":
      return journey.offeredAt;
  }
};

export function hasReached(journey: Journey, stage: FunnelStage): boolean {
  switch (stage) {
    case "applied":
      return journey.appliedAt !== null;
    case "responded":
      return journey.responded;
    case "interview":
      return journey.interviewed;
    case "offer":
      return journey.offered;
  }
}

/** Response samples (days from applied to first response) of responded journeys with known times. */
const responseDays = (journeys: readonly Journey[]) =>
  journeys.flatMap((journey) =>
    journey.appliedAt !== null && journey.respondedAt !== null
      ? [daysBetween(journey.appliedAt, journey.respondedAt)]
      : [],
  );

function breakdown(cohort: readonly Journey[], dimension: InsightsDimension): BreakdownRow[] {
  const groups = new Map<string, Journey[]>();
  for (const journey of cohort) {
    const key = journey[dimension];
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [journey]);
    else list.push(journey);
  }
  const rows = [...groups].map(([key, journeys]): BreakdownRow => {
    const responses = journeys.filter((journey) => journey.responded).length;
    return {
      key,
      applications: journeys.length,
      responses,
      rate: rate(responses, journeys.length),
      medianDaysToResponse: medianDays(responseDays(journeys.filter((journey) => journey.responded))),
    };
  });
  // Comparable rows first (highest rate), then the low-sample rows; ties by size, then key.
  return rows.sort((a, b) => {
    if ((a.rate.value === null) !== (b.rate.value === null)) return a.rate.value === null ? 1 : -1;
    const byRate = (b.rate.value ?? 0) - (a.rate.value ?? 0);
    if (byRate !== 0) return byRate;
    if (a.applications !== b.applications) return b.applications - a.applications;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** The weeks of the activity chart, oldest first. */
export function activityWeeks(today: CivilDate, weekStart: IsoWeekday): CivilDate[] {
  const current = startOfWeek(today, weekStart);
  return Array.from({ length: ACTIVITY_WEEKS }, (_, index) =>
    addDays(current, (index - ACTIVITY_WEEKS + 1) * 7),
  );
}

export function computeInsights(input: InsightsInput, options: InsightsOptions): InsightsReport {
  const journeys = insightsJourneys(input, options);
  const cohort = cohortOf(journeys, options.range);
  const n = cohort.length;

  const funnel = FUNNEL_STAGES.map((stage, index): FunnelStep => {
    const reached = cohort.filter((journey) => hasReached(journey, stage));
    const previousStage = index === 0 ? null : FUNNEL_STAGES[index - 1];
    if (previousStage === null || previousStage === undefined) {
      return {
        stage,
        reached: reached.length,
        fromPrevious: null,
        ofApplied: rate(reached.length, n),
        daysFromPrevious: null,
      };
    }
    const previousReached = cohort.filter((journey) => hasReached(journey, previousStage)).length;
    const samples = reached.flatMap((journey) => {
      const start = reachedAt(journey, previousStage);
      const end = reachedAt(journey, stage);
      return start !== null && end !== null ? [daysBetween(start, end)] : [];
    });
    return {
      stage,
      reached: reached.length,
      fromPrevious: rate(reached.length, previousReached),
      ofApplied: rate(reached.length, n),
      daysFromPrevious: medianDays(samples),
    };
  });

  const responded = cohort.filter((journey) => journey.responded);
  const unanswered = cohort.filter((journey) => !journey.responded);

  const today = civilDate(options.now, options.timeZone);
  const weeks = activityWeeks(today, options.weekStart);
  const firstWeek = weeks[0] ?? today;
  const weekIndex = (date: CivilDate) => {
    const offset = dayNumber(date) - dayNumber(firstWeek);
    return offset < 0 || date > today ? -1 : Math.floor(offset / 7);
  };
  const applied = weeks.map(() => 0);
  const followUps = weeks.map(() => 0);
  const interviews = weeks.map(() => 0);
  const bump = (counts: number[], date: CivilDate) => {
    const index = weekIndex(date);
    if (index >= 0 && index < counts.length) counts[index] = (counts[index] ?? 0) + 1;
  };
  const included = new Set<string>();
  for (const journey of journeys) {
    included.add(journey.id);
    if (journey.appliedDate !== null) bump(applied, journey.appliedDate);
    for (const at of journey.followUps) bump(followUps, civilDate(at, options.timeZone));
  }
  for (const interview of input.interviews ?? []) {
    if (!included.has(interview.applicationId) || interview.startsAt.getTime() > options.now.getTime())
      continue;
    bump(interviews, civilDate(interview.startsAt, options.timeZone));
  }

  return {
    range: options.range,
    applications: n,
    funnel,
    responseRate: rate(responded.length, n),
    interviewRate: rate(cohort.filter((journey) => journey.interviewed).length, n),
    offerRate: rate(cohort.filter((journey) => journey.offered).length, n),
    medianDaysToFirstResponse: medianDays(responseDays(responded)),
    stillWaiting: unanswered.filter((journey) => isActiveStatus(journey.status)).length,
    noResponse: unanswered.filter((journey) => journey.status === "ghosted").length,
    withdrawn: unanswered.filter((journey) => journey.status === "withdrawn").length,
    breakdowns: {
      source: breakdown(cohort, "source"),
      channel: breakdown(cohort, "channel"),
      cv: breakdown(cohort, "cv"),
      market: breakdown(cohort, "market"),
    },
    weekly: weeks.map((weekStart, index) => ({
      weekStart,
      applied: applied[index] ?? 0,
      followUps: followUps[index] ?? 0,
      interviews: interviews[index] ?? 0,
    })),
  };
}
