/**
 * Insights drill-downs in the table (IA.md § Deep links: `/tracker?view=table&stage=…`): the URL
 * carries the definition, `@bfhr/core` resolves it to the applications behind the number, the
 * table shows exactly those under a dismissible "From Insights" chip.
 */
import { INSIGHTS_DIMENSIONS, parseInsightsDrillDown, selectDrillDownIds } from "@bfhr/core";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useContext, useMemo } from "react";
import { defineMessages, useIntl } from "react-intl";
import { displayTimeZone } from "../../data/tracker/live";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import type { LiveTrackerState } from "../../data/tracker/repository";
import { drillDownLabel } from "../insights/drilldown";

const messages = defineMessages({
  chip: {
    id: "tracker-table.drill.chip",
    defaultMessage: "From Insights: {label}",
    description: "Filter chip of a table opened from an Insights number",
  },
  dismiss: { id: "tracker-table.drill.dismiss", defaultMessage: "Show all applications" },
});

/** Search keys a drill-down uses; dismissing drops them. */
const DRILL_KEYS: readonly string[] = ["stage", "activity", "from", "to", ...INSIGHTS_DIMENSIONS];

export interface TableDrillDown {
  readonly ids: ReadonlySet<string>;
  readonly label: string;
  readonly dismissLabel: string;
  readonly dismiss: () => void;
}

/** The drill-down in the route, resolved against the live data; null without one. */
export function useInsightsDrillDown(live: LiveTrackerState): TableDrillDown | null {
  const intl = useIntl();
  const navigate = useNavigate();
  const environment = useContext(ModelEnvironmentContext);
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const key = JSON.stringify(DRILL_KEYS.map((name) => search[name] ?? null));

  return useMemo(() => {
    const params = Object.fromEntries(
      DRILL_KEYS.map((name) => [
        name,
        typeof search[name] === "string" ? (search[name] as string) : undefined,
      ]),
    );
    const drill = parseInsightsDrillDown(params);
    if (!drill || live.status !== "ready") return null;
    const { data } = live;
    const ids = selectDrillDownIds(
      { applications: data.applications, events: data.applicationEvents, interviews: data.interviews },
      drill,
      { now: environment.now(), timeZone: environment.timeZone ?? displayTimeZone(data.profile) },
    );
    return {
      ids: new Set(ids),
      label: intl.formatMessage(messages.chip, { label: drillDownLabel(intl, drill) }),
      dismissLabel: intl.formatMessage(messages.dismiss),
      dismiss: () =>
        void navigate({
          to: "/tracker",
          search: (previous: Readonly<Record<string, unknown>>) =>
            Object.fromEntries(Object.entries(previous).filter(([name]) => !DRILL_KEYS.includes(name))),
        }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the drill-down params
  }, [key, live, environment, intl, navigate]);
}
