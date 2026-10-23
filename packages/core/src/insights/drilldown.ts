/**
 * Insights drill-downs: every number opens the Tracker table filtered to exactly the applications
 * behind it (IA.md § Deep links, `bruteforcehr://tracker?view=table&…`, desktop `/tracker?…`).
 * The URL carries the definition, not ids, so links stay valid as data changes; the Tracker
 * resolves it with `selectDrillDownIds`, the same journeys `computeInsights` counts.
 */
import { isActiveStatus } from "../status";
import { type CivilDate, civilDate, isCivilDate } from "./calendar";
import type { InsightsInput } from "./journey";
import {
  cohortOf,
  hasReached,
  INSIGHTS_DIMENSIONS,
  type InsightsFilters,
  inRange,
  insightsJourneys,
  type InsightsRange,
} from "./metrics";

/** Cohort stages (bounded by the applied date), plus the unanswered buckets. */
export const DRILL_DOWN_STAGES = [
  "applied",
  "responded",
  "interview",
  "offer",
  "waiting",
  "no_response",
  "withdrawn",
] as const;
export type DrillDownStage = (typeof DRILL_DOWN_STAGES)[number];

/** Weekly activity series (bounded by the activity's own date). */
export const DRILL_DOWN_ACTIVITIES = ["applied", "follow_up", "interview"] as const;
export type DrillDownActivity = (typeof DRILL_DOWN_ACTIVITIES)[number];

export type InsightsDrillDown = (
  | { readonly stage: DrillDownStage; readonly activity?: never }
  | { readonly activity: DrillDownActivity; readonly stage?: never }
) & {
  readonly from?: CivilDate;
  readonly to?: CivilDate;
  readonly filters?: InsightsFilters;
};

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  value !== undefined && (values as readonly string[]).includes(value);

/**
 * Reads a drill-down from Tracker search params (`stage` or `activity`, `from`, `to`, `source`,
 * `channel`, `cv`, `market`). Null when the params hold none (an ordinary Tracker filter).
 */
export function parseInsightsDrillDown(
  params: Readonly<Record<string, string | null | undefined>>,
): InsightsDrillDown | null {
  const value = (key: string) => params[key] ?? undefined;
  const filters: Partial<Record<(typeof INSIGHTS_DIMENSIONS)[number], string>> = {};
  for (const dimension of INSIGHTS_DIMENSIONS) {
    const wanted = value(dimension);
    if (wanted !== undefined && wanted !== "") filters[dimension] = wanted;
  }
  const from = value("from");
  const to = value("to");
  const bounds = {
    ...(from !== undefined && isCivilDate(from) ? { from } : {}),
    ...(to !== undefined && isCivilDate(to) ? { to } : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
  const stage = value("stage");
  if (isOneOf(DRILL_DOWN_STAGES, stage)) return { stage, ...bounds };
  const activity = value("activity");
  if (isOneOf(DRILL_DOWN_ACTIVITIES, activity)) return { activity, ...bounds };
  return null;
}

/** Search params for `drill`, in a stable order (pair with `view=table`). */
export function drillDownSearchParams(drill: InsightsDrillDown): Record<string, string> {
  const params: Record<string, string> = {};
  if (drill.stage !== undefined) params.stage = drill.stage;
  if (drill.activity !== undefined) params.activity = drill.activity;
  if (drill.from !== undefined) params.from = drill.from;
  if (drill.to !== undefined) params.to = drill.to;
  for (const dimension of INSIGHTS_DIMENSIONS) {
    const wanted = drill.filters?.[dimension];
    if (wanted !== undefined) params[dimension] = wanted;
  }
  return params;
}

export interface DrillDownOptions {
  readonly now: Date;
  readonly timeZone: string;
}

/** Ids of the applications behind `drill`, in input order. */
export function selectDrillDownIds(
  input: InsightsInput,
  drill: InsightsDrillDown,
  options: DrillDownOptions,
): string[] {
  const journeys = insightsJourneys(input, {
    timeZone: options.timeZone,
    ...(drill.filters ? { filters: drill.filters } : {}),
  });
  const today = civilDate(options.now, options.timeZone);
  const range: InsightsRange = { from: drill.from ?? null, to: drill.to ?? today };

  if (drill.stage !== undefined) {
    const cohort = cohortOf(journeys, range);
    const stage = drill.stage;
    return cohort
      .filter((journey) => {
        switch (stage) {
          case "applied":
          case "responded":
          case "interview":
          case "offer":
            return hasReached(journey, stage);
          case "waiting":
            return !journey.responded && isActiveStatus(journey.status);
          case "no_response":
            return !journey.responded && journey.status === "ghosted";
          case "withdrawn":
            return !journey.responded && journey.status === "withdrawn";
        }
      })
      .map((journey) => journey.id);
  }

  const activity = drill.activity;
  const interviewed = new Set(
    (input.interviews ?? []).flatMap((interview) =>
      interview.startsAt.getTime() <= options.now.getTime() &&
      inRange(civilDate(interview.startsAt, options.timeZone), range)
        ? [interview.applicationId]
        : [],
    ),
  );
  return journeys
    .filter((journey) => {
      switch (activity) {
        case "applied":
          return inRange(journey.appliedDate, range);
        case "follow_up":
          return journey.followUps.some((at) => inRange(civilDate(at, options.timeZone), range));
        case "interview":
          return interviewed.has(journey.id);
      }
    })
    .map((journey) => journey.id);
}
