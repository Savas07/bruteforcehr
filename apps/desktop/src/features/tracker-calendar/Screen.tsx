/**
 * Tracker › Calendar (research/tracker.md "Decision — Desktop › Calendar"): a Month or Week grid
 * (‹ Today ›, weekends toggle), a type filter (Interviews · Deadlines · Follow-ups · Reminders,
 * suggested follow-ups toggle) and a right agenda panel: the next 7 days, or the chosen day.
 *
 * Keyboard (WAI-ARIA date grid): one tab stop in the grid; ← → ↑ ↓ move by day / week, Home / End
 * to the week's ends, Page Up / Page Down by month (week in Week view), T today; Enter shows the
 * day in the agenda panel, where entries open their application and interviews export `.ics`.
 */
import {
  Bell,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Flag,
  Send,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { z } from "zod";
import { useTrackerData } from "../../data/tracker/live";
import { interviewsToIcs, icsFileName, saveIcsFile } from "../../data/tracker/ics";
import { destinationMessages } from "../../lib/destinations";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { Button, IconButton } from "../../shared/ui/Button";
import { ExportButton } from "../../shared/ui/ExportButton";
import { MenuCheckboxItem, MenuContent, MenuLabel, MenuSeparator } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { SkeletonBlock, useSkeletonGate } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { useToast } from "../../shared/ui/Toast";
import { ApplicationPanel } from "../application-detail/ApplicationPanel";
import { TrackerViewSwitch } from "../tracker-table/ViewSwitch";
import {
  addDays,
  addMonths,
  CALENDAR_ENTRY_KINDS,
  type CalendarEntryKind,
  type CalendarEntryVM,
  dayDate,
  isWeekend,
  KIND_MESSAGES,
  monthWeeks,
  startOfWeek,
  type TrackerCalendarModel,
  weekDays,
} from "./model";

const messages = defineMessages({
  errorTitle: { id: "tracker-calendar.error.title", defaultMessage: "We couldn't load your applications" },
  errorBody: {
    id: "tracker-calendar.error.body",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  previous: {
    id: "tracker-calendar.previous",
    defaultMessage: "Previous {unit, select, month {month} other {week}}",
  },
  next: { id: "tracker-calendar.next", defaultMessage: "Next {unit, select, month {month} other {week}}" },
  today: { id: "tracker-calendar.today", defaultMessage: "Today" },
  mode: {
    id: "tracker-calendar.mode",
    defaultMessage: "Period",
    description: "Accessible name of Month/Week",
  },
  month: { id: "tracker-calendar.month", defaultMessage: "Month" },
  week: { id: "tracker-calendar.week", defaultMessage: "Week" },
  display: { id: "tracker-calendar.display", defaultMessage: "Show" },
  displayMenu: { id: "tracker-calendar.displayMenu", defaultMessage: "What the calendar shows" },
  types: { id: "tracker-calendar.types", defaultMessage: "Types" },
  suggested: { id: "tracker-calendar.suggested", defaultMessage: "Suggested follow-ups" },
  weekends: { id: "tracker-calendar.weekends", defaultMessage: "Weekends" },
  more: { id: "tracker-calendar.more", defaultMessage: "+{count} more" },
  dayLabel: {
    id: "tracker-calendar.dayLabel",
    defaultMessage:
      "{date}{today, select, yes {, today} other {}}: {count, plural, =0 {nothing planned} one {# item} other {# items}}",
  },
  next7: { id: "tracker-calendar.next7", defaultMessage: "Next 7 days" },
  backToNext7: { id: "tracker-calendar.backToNext7", defaultMessage: "Show next 7 days" },
  timed: { id: "tracker-calendar.timed", defaultMessage: "Timed" },
  allDay: { id: "tracker-calendar.allDay", defaultMessage: "All day" },
  nothing: { id: "tracker-calendar.nothing", defaultMessage: "Nothing planned." },
  nothingNext7: {
    id: "tracker-calendar.nothingNext7",
    defaultMessage: "Nothing in the next 7 days. Interviews, deadlines and reminders you add show up here.",
  },
  suggestedTag: { id: "tracker-calendar.suggestedTag", defaultMessage: "Suggested" },
  open: { id: "tracker-calendar.open", defaultMessage: "Open {company}, {role}" },
  openShort: {
    id: "tracker-calendar.openShort",
    defaultMessage: "Open",
    description: "Agenda entry button that opens its application",
  },
  addToCalendar: { id: "tracker-calendar.addToCalendar", defaultMessage: "Add to calendar (.ics)" },
  exportUpcoming: { id: "tracker-calendar.exportUpcoming", defaultMessage: "Upcoming interviews (.ics)" },
  noUpcoming: { id: "tracker-calendar.noUpcoming", defaultMessage: "No upcoming interviews to export." },
  icsSaved: { id: "tracker-calendar.toast.icsSaved", defaultMessage: "Saved {fileName}" },
  icsFailed: {
    id: "tracker-calendar.toast.icsFailed",
    defaultMessage: "Couldn't save the calendar file. Try again, or choose another folder.",
  },
  icsAllName: {
    id: "tracker-calendar.icsAllName",
    defaultMessage: "BruteForceHR interviews {date}",
    description: "File name of the upcoming interviews export without extension; {date} is YYYY-MM-DD",
  },
  group: { id: "tracker-calendar.keys.group", defaultMessage: "Tracker calendar" },
  keyToday: { id: "tracker-calendar.keys.today", defaultMessage: "Go to today" },
  grid: { id: "tracker-calendar.grid", defaultMessage: "{period}" },
  panelNav: {
    id: "tracker-calendar.panelNav",
    defaultMessage: "{index} of {count} on {day}",
    description: "Detail panel position label for applications opened from a calendar day",
  },
});

const KIND_ICONS = { interview: Users, deadline: Flag, followUp: Send, reminder: Bell } as const;
const KIND_TONE: Readonly<Record<CalendarEntryKind, string>> = {
  interview: "bg-accent-subtle text-accent-text",
  deadline: "bg-warning-subtle text-warning-text",
  followUp: "bg-surface-sunken text-fg-secondary",
  reminder: "bg-info-subtle text-info-text",
};

const PrefsSchema = z.object({
  mode: z.enum(["month", "week"]),
  weekends: z.boolean(),
  kinds: z.array(z.enum(["interview", "deadline", "followUp", "reminder"])),
  suggested: z.boolean(),
});
type CalendarPrefs = z.infer<typeof PrefsSchema>;
const PREFS_KEY = "bfhr.tracker.calendar.v1";
const DEFAULT_PREFS: CalendarPrefs = {
  mode: "month",
  weekends: true,
  kinds: [...CALENDAR_ENTRY_KINDS],
  suggested: true,
};

function useCalendarPrefs(): [CalendarPrefs, (update: (prefs: CalendarPrefs) => CalendarPrefs) => void] {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => {
    try {
      const parsed = PrefsSchema.safeParse(JSON.parse(globalThis.localStorage?.getItem(PREFS_KEY) ?? "null"));
      return parsed.success ? parsed.data : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });
  useEffect(() => {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);
  return [prefs, setPrefs];
}

export default function TrackerCalendarScreen({ model }: ScreenProps<TrackerCalendarModel>) {
  const intl = useIntl();
  const title = intl.formatMessage(destinationMessages.tracker);
  const showSkeleton = useSkeletonGate(model.status === "loading");
  if (model.status === "ready")
    return <ReadyCalendar model={model.data} stamp={model.fromCache ? model : null} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={model.status === "loading"}>
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-5 pb-3">
        <ScreenTitle title={title} />
        <TrackerViewSwitch current="calendar" />
      </div>
      {model.status === "error" ? (
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
        />
      ) : (
        showSkeleton && (
          <div aria-hidden="true" className="grid flex-1 grid-cols-7 gap-px px-6 pb-6">
            {Array.from({ length: 35 }, (_, index) => (
              <SkeletonBlock key={index} className="h-full min-h-20 rounded-sm" />
            ))}
          </div>
        )
      )}
    </div>
  );
}

type Stamp = Extract<ScreenProps<TrackerCalendarModel>["model"], { status: "ready" }>;

function ReadyCalendar({ model, stamp }: { model: TrackerCalendarModel; stamp: Stamp | null }) {
  const intl = useIntl();
  const toast = useToast();
  const live = useTrackerData();
  const [prefs, setPrefs] = useCalendarPrefs();
  const [focused, setFocused] = useState(model.today);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocusIntoGrid = useRef(false);

  const entries = useMemo(
    () =>
      model.entries.filter(
        (entry) => prefs.kinds.includes(entry.kind) && (prefs.suggested || !entry.suggested),
      ),
    [model.entries, prefs.kinds, prefs.suggested],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntryVM[]>();
    for (const entry of entries) map.set(entry.day, [...(map.get(entry.day) ?? []), entry]);
    return map;
  }, [entries]);

  const weeks =
    prefs.mode === "month"
      ? monthWeeks(focused, model.weekStartsOn)
      : [weekDays(focused, model.weekStartsOn)];
  const showDay = (day: string) => prefs.weekends || !isWeekend(day);
  const columns = weeks[0]?.filter(showDay) ?? [];

  // Keep keyboard focus on the focused day after it moves (a new month may have re-rendered).
  useEffect(() => {
    if (!moveFocusIntoGrid.current) return;
    moveFocusIntoGrid.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${focused}"]`)?.focus();
  }, [focused]);

  const moveTo = (day: string) => {
    // Hidden weekend days: step over them in the travel direction.
    let target = day;
    if (!prefs.weekends) {
      const direction = target >= focused ? 1 : -1;
      while (isWeekend(target)) target = addDays(target, direction);
    }
    moveFocusIntoGrid.current = true;
    setFocused(target);
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const week = startOfWeek(focused, model.weekStartsOn);
    const jumps: Readonly<Record<string, () => string>> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => week,
      End: () => addDays(week, 6),
      PageUp: () => (prefs.mode === "month" ? addMonths(focused, -1) : addDays(focused, -7)),
      PageDown: () => (prefs.mode === "month" ? addMonths(focused, 1) : addDays(focused, 7)),
    };
    const jump = jumps[event.key];
    if (jump) {
      event.preventDefault();
      moveTo(jump());
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedDay(focused);
      setOpenId(null);
    }
  };

  const step = (direction: -1 | 1) =>
    setFocused(prefs.mode === "month" ? addMonths(focused, direction) : addDays(focused, 7 * direction));

  useKeyBindings([
    {
      id: "tracker-calendar.today",
      keys: "T",
      label: intl.formatMessage(messages.keyToday),
      group: intl.formatMessage(messages.group),
      run: () => moveTo(model.today),
    },
  ]);

  const exportInterviews = async (interviewIds: readonly string[], fileName: string | null) => {
    if (live.status !== "ready" || exporting) return;
    const applications = new Map(live.data.applications.map((application) => [application.id, application]));
    const items = live.data.interviews.flatMap((interview) => {
      const application = applications.get(interview.applicationId);
      return interviewIds.includes(interview.id) && application ? [{ interview, application }] : [];
    });
    const [first] = items;
    if (!first) return;
    const name =
      fileName ??
      (items.length === 1
        ? icsFileName(first)
        : `${intl.formatMessage(messages.icsAllName, { date: model.today })}.ics`);
    setExporting(true);
    try {
      const path = await saveIcsFile(name, interviewsToIcs(items, intl, new Date()));
      if (path !== null)
        toast.show({ variant: "info", message: intl.formatMessage(messages.icsSaved, { fileName: name }) });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.icsFailed) });
    } finally {
      setExporting(false);
    }
  };
  const upcomingInterviews = model.entries.filter(
    (entry) => entry.kind === "interview" && entry.day >= model.today && entry.interviewId !== null,
  );

  const periodFormat = new Intl.DateTimeFormat(intl.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const rangeFormat = new Intl.DateTimeFormat(intl.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const period =
    prefs.mode === "month"
      ? periodFormat.format(dayDate(focused))
      : rangeFormat.formatRange(dayDate(columns[0] ?? focused), dayDate(columns.at(-1) ?? focused));
  const weekdayFormat = new Intl.DateTimeFormat(intl.locale, { weekday: "short", timeZone: "UTC" });
  const longDayFormat = new Intl.DateTimeFormat(intl.locale, { dateStyle: "full", timeZone: "UTC" });

  const agendaDays = selectedDay
    ? [selectedDay]
    : Array.from({ length: 7 }, (_, index) => addDays(model.today, index));
  const agendaEntries = agendaDays.flatMap((day) => byDay.get(day) ?? []);
  const openIndex = agendaEntries.findIndex((entry) => entry.applicationId === openId);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-5 pb-3">
          <ScreenTitle title={intl.formatMessage(destinationMessages.tracker)} />
          <TrackerViewSwitch current="calendar" />
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {stamp && <StaleStamp prefix="updated" time={stamp.updatedAt} clock={stamp.updatedClock} />}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button icon={SlidersHorizontal}>{intl.formatMessage(messages.display)}</Button>
              </DropdownMenu.Trigger>
              <MenuContent aria-label={intl.formatMessage(messages.displayMenu)} align="end">
                <MenuLabel>{intl.formatMessage(messages.types)}</MenuLabel>
                {CALENDAR_ENTRY_KINDS.map((kind) => {
                  const Icon = KIND_ICONS[kind];
                  return (
                    <MenuCheckboxItem
                      key={kind}
                      checked={prefs.kinds.includes(kind)}
                      leading={<Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
                      onCheckedChange={(checked) =>
                        setPrefs((current) => ({
                          ...current,
                          kinds: checked
                            ? [...current.kinds, kind]
                            : current.kinds.filter((value) => value !== kind),
                        }))
                      }
                    >
                      {intl.formatMessage(KIND_MESSAGES[kind])}
                    </MenuCheckboxItem>
                  );
                })}
                <MenuSeparator />
                <MenuCheckboxItem
                  checked={prefs.suggested}
                  onCheckedChange={(suggested) => setPrefs((current) => ({ ...current, suggested }))}
                >
                  {intl.formatMessage(messages.suggested)}
                </MenuCheckboxItem>
                <MenuCheckboxItem
                  checked={prefs.weekends}
                  onCheckedChange={(weekends) => setPrefs((current) => ({ ...current, weekends }))}
                >
                  {intl.formatMessage(messages.weekends)}
                </MenuCheckboxItem>
              </MenuContent>
            </DropdownMenu.Root>
            <ExportButton
              formats={[{ id: "ics", label: intl.formatMessage(messages.exportUpcoming) }]}
              onExport={() =>
                void exportInterviews(
                  upcomingInterviews.flatMap((entry) => entry.interviewId ?? []),
                  null,
                )
              }
              exporting={exporting}
              disabledReason={
                upcomingInterviews.length === 0 ? intl.formatMessage(messages.noUpcoming) : null
              }
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 pb-3">
          <h2 className="text-title3 min-w-44 font-semibold" aria-live="polite">
            {period}
          </h2>
          <IconButton
            icon={ChevronLeft}
            label={intl.formatMessage(messages.previous, { unit: prefs.mode })}
            shortcut="PageUp"
            onClick={() => step(-1)}
          />
          <Button size="md" shortcut="T" onClick={() => setFocused(model.today)}>
            {intl.formatMessage(messages.today)}
          </Button>
          <IconButton
            icon={ChevronRight}
            label={intl.formatMessage(messages.next, { unit: prefs.mode })}
            shortcut="PageDown"
            onClick={() => step(1)}
          />
          <span className="ms-2">
            <SegmentedControl
              size="sm"
              label={intl.formatMessage(messages.mode)}
              value={prefs.mode}
              onValueChange={(mode) => setPrefs((current) => ({ ...current, mode }))}
              options={[
                { value: "month", label: intl.formatMessage(messages.month) },
                { value: "week", label: intl.formatMessage(messages.week) },
              ]}
            />
          </span>
        </div>

        <div
          ref={gridRef}
          role="grid"
          aria-label={intl.formatMessage(messages.grid, { period })}
          onKeyDown={onGridKeyDown}
          className="border-line-subtle mx-6 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border"
          data-testid="tracker-calendar-grid"
        >
          <div role="row" className="border-line-subtle bg-surface-sunken flex border-b">
            {columns.map((day) => (
              <div
                key={day}
                role="columnheader"
                className="text-fg-secondary flex-1 px-2 py-1.5 text-footnote font-medium"
              >
                {weekdayFormat.format(dayDate(day))}
              </div>
            ))}
          </div>
          <div className={cx("grid min-h-0 flex-1", prefs.mode === "month" ? "auto-rows-fr" : "grid-rows-1")}>
            {weeks.map((week) => (
              <div
                key={week[0]}
                role="row"
                className="border-line-subtle flex min-h-0 border-b last:border-b-0"
              >
                {week.filter(showDay).map((day) => {
                  const dayEntries = byDay.get(day) ?? [];
                  const inMonth = prefs.mode === "week" || day.slice(0, 7) === focused.slice(0, 7);
                  const isToday = day === model.today;
                  const limit = prefs.mode === "month" ? 3 : 12;
                  return (
                    <div
                      key={day}
                      role="gridcell"
                      data-day={day}
                      tabIndex={day === focused ? 0 : -1}
                      aria-selected={day === selectedDay}
                      onFocus={() => setFocused(day)}
                      onClick={() => {
                        setFocused(day);
                        setSelectedDay(day);
                        setOpenId(null);
                      }}
                      className={cx(
                        "border-line-subtle flex min-w-0 flex-1 cursor-default flex-col gap-1 overflow-hidden border-e p-1.5 last:border-e-0 focus-visible:-outline-offset-2",
                        day === selectedDay
                          ? "bg-surface-selected"
                          : !inMonth
                            ? "bg-surface-sunken/60"
                            : "bg-surface-base",
                      )}
                    >
                      <span className="sr-only">
                        {intl.formatMessage(messages.dayLabel, {
                          date: longDayFormat.format(dayDate(day)),
                          today: isToday ? "yes" : "no",
                          count: dayEntries.length,
                        })}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cx(
                          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-footnote tabular-nums",
                          isToday
                            ? "bg-accent-solid text-fg-on-accent font-semibold"
                            : inMonth
                              ? "text-fg-primary"
                              : "text-fg-tertiary",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      <ul className="flex min-h-0 flex-col gap-0.5">
                        {dayEntries.slice(0, limit).map((entry) => (
                          <EntryChip key={entry.id} entry={entry} onOpen={(id) => setOpenId(id)} />
                        ))}
                        {dayEntries.length > limit && (
                          <li className="text-fg-secondary px-1 text-caption1">
                            {intl.formatMessage(messages.more, { count: dayEntries.length - limit })}
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {openId !== null ? (
        <ApplicationPanel
          applicationId={openId}
          nav={
            openIndex >= 0
              ? {
                  label: intl.formatMessage(messages.panelNav, {
                    index: openIndex + 1,
                    count: agendaEntries.length,
                    day: selectedDay
                      ? longDayFormat.format(dayDate(selectedDay))
                      : intl.formatMessage(messages.next7),
                  }),
                  previousId: agendaEntries[openIndex - 1]?.applicationId ?? null,
                  nextId: agendaEntries[openIndex + 1]?.applicationId ?? null,
                }
              : null
          }
          onSelect={setOpenId}
          onClose={() => setOpenId(null)}
        />
      ) : (
        <aside
          aria-label={
            selectedDay ? longDayFormat.format(dayDate(selectedDay)) : intl.formatMessage(messages.next7)
          }
          className="border-line-subtle bg-surface-base flex w-80 shrink-0 flex-col border-s"
        >
          <div className="flex items-baseline justify-between gap-2 px-4 pt-5 pb-2">
            <h2 className="text-headline">
              {selectedDay ? longDayFormat.format(dayDate(selectedDay)) : intl.formatMessage(messages.next7)}
            </h2>
            {selectedDay && (
              <Button variant="plain" size="sm" onClick={() => setSelectedDay(null)}>
                {intl.formatMessage(messages.backToNext7)}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <Agenda
              entries={agendaEntries}
              showDays={selectedDay === null}
              emptyText={intl.formatMessage(selectedDay ? messages.nothing : messages.nothingNext7)}
              onOpen={setOpenId}
              onExport={(interviewId) => void exportInterviews([interviewId], null)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}

/** One entry in a day cell: icon + time + title; the type is named by the icon's label in the panel. */
function EntryChip({ entry, onOpen }: { entry: CalendarEntryVM; onOpen: (applicationId: string) => void }) {
  const Icon = KIND_ICONS[entry.kind];
  return (
    <li>
      <button
        type="button"
        tabIndex={-1}
        title={`${entry.title} · ${entry.company.name} · ${entry.absolute}`}
        onClick={(event) => {
          event.stopPropagation();
          if (entry.applicationId) onOpen(entry.applicationId);
        }}
        className={cx(
          "flex w-full min-w-0 cursor-default items-center gap-1 rounded-sm px-1 py-0.5 text-start text-caption1",
          KIND_TONE[entry.kind],
          entry.suggested && "outline-line-control outline-1 -outline-offset-1 outline-dashed",
        )}
      >
        <Icon aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
        {entry.time && <span className="shrink-0 tabular-nums">{entry.time}</span>}
        <span className="min-w-0 truncate">{entry.company.name}</span>
      </button>
    </li>
  );
}

function Agenda({
  entries,
  showDays,
  emptyText,
  onOpen,
  onExport,
}: {
  entries: readonly CalendarEntryVM[];
  showDays: boolean;
  emptyText: string;
  onOpen: (applicationId: string) => void;
  onExport: (interviewId: string) => void;
}) {
  const intl = useIntl();
  if (entries.length === 0) return <p className="text-fg-secondary text-callout">{emptyText}</p>;
  const timed = entries.filter((entry) => entry.time !== null);
  const allDay = entries.filter((entry) => entry.time === null);
  const dayFormat = new Intl.DateTimeFormat(intl.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const section = (label: string, list: readonly CalendarEntryVM[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-2">
        <h3 className="text-fg-secondary pt-2 text-footnote font-medium">{label}</h3>
        <ul className="flex flex-col gap-2">
          {list.map((entry) => {
            const Icon = KIND_ICONS[entry.kind];
            return (
              <li key={entry.id} className="border-line-subtle flex flex-col gap-1 rounded-md border p-2.5">
                <p className="flex items-center gap-1.5 text-footnote">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5",
                      KIND_TONE[entry.kind],
                    )}
                  >
                    <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                    {intl.formatMessage(KIND_MESSAGES[entry.kind])}
                  </span>
                  {entry.suggested && (
                    <span className="text-fg-secondary">{intl.formatMessage(messages.suggestedTag)}</span>
                  )}
                  {entry.pendingSync && <SyncGlyph />}
                </p>
                <p className="text-callout font-medium">{entry.title}</p>
                <p className="text-fg-secondary text-footnote">
                  {entry.company.name} · {entry.context}
                </p>
                <p className="text-fg-secondary text-footnote tabular-nums">
                  <time dateTime={entry.iso} title={entry.absolute}>
                    {showDays && `${dayFormat.format(dayDate(entry.day))}${entry.timeDetail ? " · " : ""}`}
                    {entry.timeDetail}
                  </time>
                </p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {entry.applicationId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => entry.applicationId && onOpen(entry.applicationId)}
                      aria-label={intl.formatMessage(messages.open, {
                        company: entry.company.name,
                        role: entry.context,
                      })}
                    >
                      {entry.company.name}
                    </Button>
                  )}
                  {entry.interviewId && (
                    <Button
                      size="sm"
                      variant="plain"
                      icon={CalendarPlus}
                      onClick={() => entry.interviewId && onExport(entry.interviewId)}
                    >
                      {intl.formatMessage(messages.addToCalendar)}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  return (
    <div className="flex flex-col gap-2">
      {section(intl.formatMessage(messages.timed), timed)}
      {section(intl.formatMessage(messages.allDay), allDay)}
    </div>
  );
}
