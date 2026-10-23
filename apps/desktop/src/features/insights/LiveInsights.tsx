/**
 * Insights in the app (`/insights`): the screen fed by the signed-in user's live tracker data
 * (applications, applicationEvents, interviews, CVs: `useTrackerData`). Rendered behind
 * `AuthGate`. The selected range persists per device (research/insights.md "RangePicker").
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useIntl } from "react-intl";
import { displayTimeZone, useTrackerData } from "../../data/tracker/live";
import { clockTime, relativeTime } from "../../shared/model/format";
import type { Loadable, ModelContext } from "../../shared/model/types";
import { buildInsightsModel, type DesktopRange, DESKTOP_RANGES, type InsightsModel } from "./model";
import InsightsScreen from "./Screen";

const RANGE_KEY = "bfhr.insights.range";

function storedRange(): DesktopRange | null {
  try {
    const value = localStorage.getItem(RANGE_KEY);
    return (DESKTOP_RANGES as readonly string[]).includes(value ?? "") ? (value as DesktopRange) : null;
  } catch {
    return null;
  }
}

export default function LiveInsights() {
  const intl = useIntl();
  const navigate = useNavigate();
  const live = useTrackerData();
  const search = useSearch({ strict: false }) as Readonly<Record<string, string | undefined>>;
  const searchKey = JSON.stringify(search);
  const params = useMemo(
    (): Readonly<Record<string, string | undefined>> => JSON.parse(searchKey),
    [searchKey],
  );

  // Restore the last preset when the route carries none; remember presets (not custom dates).
  useEffect(() => {
    const range = params.range;
    if (range === undefined) {
      const stored = storedRange();
      if (stored !== null)
        void navigate({
          to: ".",
          replace: true,
          search: (previous: object) => ({ ...previous, range: stored }) as never,
        });
    } else if ((DESKTOP_RANGES as readonly string[]).includes(range)) {
      try {
        localStorage.setItem(RANGE_KEY, range);
      } catch {
        // Storage unavailable: the default range applies next time.
      }
    }
  }, [params.range, navigate]);

  const model = useMemo((): Loadable<InsightsModel> => {
    if (live.status !== "ready") return live;
    const { data } = live;
    const ctx: ModelContext = {
      now: new Date(),
      locale: intl.locale,
      intl,
      timeZone: displayTimeZone(data.profile),
      pendingWrites: data.pendingWrites,
    };
    return {
      status: "ready",
      // Mail categories (D30 rule 2) join when mail messages sync to the app (M5).
      data: buildInsightsModel(data, ctx, params),
      fromCache: data.fromCache,
      updatedAt: relativeTime(data.syncedAt, ctx),
      updatedClock: clockTime(data.syncedAt, ctx),
    };
  }, [live, intl, params]);

  return <InsightsScreen model={model} params={params} />;
}
