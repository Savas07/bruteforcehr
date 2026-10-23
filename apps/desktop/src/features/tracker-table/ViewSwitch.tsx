/**
 * Tracker views (research/tracker.md "Decision — Desktop › IA and chrome"): Board · Table ·
 * Calendar in one segmented control in each view's toolbar, keys 1 / 2 / 3. The view lives in the
 * route (`/tracker?view=table`) so deep links and Insights drill-downs open it; without the param
 * the last view used on this device opens.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDays, Columns3, Table2 } from "lucide-react";
import type { ComponentType } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { CsvImportHost } from "../tracker-csv";

export const TRACKER_VIEWS = ["board", "table", "calendar"] as const;
export type TrackerView = (typeof TRACKER_VIEWS)[number];

const STORAGE_KEY = "bfhr.tracker.view";

const messages = defineMessages({
  label: { id: "tracker.views.label", defaultMessage: "View", description: "Accessible name of the view switch" },
  board: { id: "tracker.views.board", defaultMessage: "Board" },
  table: { id: "tracker.views.table", defaultMessage: "Table" },
  calendar: { id: "tracker.views.calendar", defaultMessage: "Calendar" },
  group: { id: "tracker.views.group", defaultMessage: "Tracker", description: "Shortcuts sheet group" },
  show: {
    id: "tracker.views.show",
    defaultMessage: "Show {view}",
    description: "Shortcuts sheet label: switch the Tracker to the Board, Table or Calendar view",
  },
});

const ICONS = { board: Columns3, table: Table2, calendar: CalendarDays } as const;

function storedView(): TrackerView {
  const value = globalThis.localStorage?.getItem(STORAGE_KEY);
  return TRACKER_VIEWS.find((view) => view === value) ?? "board";
}

/** The Tracker view the route asks for, else the one last used on this device. */
export function useTrackerView(): [TrackerView, (view: TrackerView) => void] {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const navigate = useNavigate();
  const view = TRACKER_VIEWS.find((candidate) => candidate === search["view"]) ?? storedView();
  const setView = (next: TrackerView) => {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
    // Filters of the view left behind (Insights drill-downs included) don't follow along.
    void navigate({ to: "/tracker", search: (previous: Readonly<Record<string, unknown>>) => ({ ...keepAcrossViews(previous), view: next }) });
  };
  return [view, setView];
}

/** Search params every view understands; the design build's state params ride along. */
function keepAcrossViews(search: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of ["fixture", "state", "platform", "locale", "tz"]) if (key in search) kept[key] = search[key];
  return kept;
}

/** Board · Table · Calendar, for the toolbar of each view (sits right after the title). */
export function TrackerViewSwitch({ current }: { current: TrackerView }) {
  const intl = useIntl();
  const [, setView] = useTrackerView();
  return (
    <SegmentedControl
      size="sm"
      label={intl.formatMessage(messages.label)}
      value={current}
      onValueChange={setView}
      options={TRACKER_VIEWS.map((view) => ({ value: view, label: intl.formatMessage(messages[view]), icon: ICONS[view] }))}
    />
  );
}

/**
 * The Tracker route: renders the chosen view, binds 1 / 2 / 3 and hosts the CSV import dialog
 * (`openCsvImport()` works from any view).
 */
export function TrackerViewsRoute({ views }: { views: Readonly<Record<TrackerView, ComponentType>> }) {
  const intl = useIntl();
  const [view, setView] = useTrackerView();
  useKeyBindings(
    TRACKER_VIEWS.map((target, index) => ({
      id: `tracker.view.${target}`,
      keys: String(index + 1),
      label: intl.formatMessage(messages.show, { view: intl.formatMessage(messages[target]) }),
      group: intl.formatMessage(messages.group),
      run: () => {
        if (target !== view) setView(target);
      },
    })),
  );
  const View = views[view];
  return (
    <>
      <View key={view} />
      <CsvImportHost />
    </>
  );
}
