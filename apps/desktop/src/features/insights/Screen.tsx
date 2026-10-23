/**
 * Insights (`/insights`, research/insights.md "Decision — Desktop", IA.md): header with the range
 * control, Compare and Export…; filter chips; the KPI strip; the funnel with its table; "Where do
 * responses come from?"; "How active have I been?". Every number opens the Tracker table filtered
 * to exactly those applications (`/tracker?view=table&…`). Charts never rely on colour: every bar
 * carries its number and an accessible name, the funnel has a data table, and each chart is
 * titled with a sentence summary.
 */
import { useNavigate } from "@tanstack/react-router";
import { ChartColumn, Info, X } from "lucide-react";
import { DropdownMenu, Popover } from "radix-ui";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { defineMessages, useIntl } from "react-intl";
import { destinationMessages } from "../../lib/destinations";
import { saveExportFile } from "../../lib/cvExport";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ExportButton } from "../../shared/ui/ExportButton";
import { MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { SkeletonBlock, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { useToast } from "../../shared/ui/Toast";
import type {
  ActivitySeries,
  BreakdownDimension,
  BreakdownRowVM,
  DesktopRange,
  DrillSearch,
  FilterVM,
  FunnelStepVM,
  InsightsModel,
  KpiVM,
  WeekVM,
} from "./model";

const messages = defineMessages({
  range: { id: "insights.screen.range", defaultMessage: "Range" },
  from: { id: "insights.screen.from", defaultMessage: "From" },
  to: { id: "insights.screen.to", defaultMessage: "To" },
  compare: { id: "insights.screen.compare", defaultMessage: "Compare to previous period" },
  filters: { id: "insights.screen.filters", defaultMessage: "Filters" },
  filterAll: { id: "insights.screen.filterAll", defaultMessage: "All" },
  filterChip: { id: "insights.screen.filterChip", defaultMessage: "{dimension}: {value}" },
  clearFilters: { id: "insights.screen.clearFilters", defaultMessage: "Clear filters" },
  clearFilter: { id: "insights.screen.clearFilter", defaultMessage: "Clear {dimension} filter" },
  kpis: { id: "insights.screen.kpis", defaultMessage: "Key numbers" },
  definition: { id: "insights.screen.definition", defaultMessage: "How {metric} is counted" },
  openInTracker: {
    id: "insights.screen.openInTracker",
    defaultMessage: "{label}. Opens these applications in Tracker.",
    description: "Accessible description of every drill-down",
  },
  funnelQuestion: { id: "insights.screen.funnelQuestion", defaultMessage: "How far do my applications get?" },
  funnelChart: { id: "insights.screen.funnelChart", defaultMessage: "Funnel" },
  stageHeader: { id: "insights.screen.stageHeader", defaultMessage: "Stage" },
  reachedHeader: { id: "insights.screen.reachedHeader", defaultMessage: "Reached" },
  ofAppliedHeader: { id: "insights.screen.ofAppliedHeader", defaultMessage: "Of applied" },
  stepHeader: { id: "insights.screen.stepHeader", defaultMessage: "From previous stage" },
  medianHeader: { id: "insights.screen.medianHeader", defaultMessage: "Median time from previous stage" },
  breakdownQuestion: {
    id: "insights.screen.breakdownQuestion",
    defaultMessage: "Where do responses come from?",
  },
  breakdownBy: { id: "insights.screen.breakdownBy", defaultMessage: "Group by" },
  applicationsHeader: { id: "insights.screen.applicationsHeader", defaultMessage: "Applications" },
  responsesHeader: { id: "insights.screen.responsesHeader", defaultMessage: "Responses" },
  rateHeader: { id: "insights.screen.rateHeader", defaultMessage: "Response rate" },
  firstResponseHeader: { id: "insights.screen.firstResponseHeader", defaultMessage: "First response" },
  breakdownNote: {
    id: "insights.screen.breakdownNote",
    defaultMessage: "Groups with fewer than 5 applications are listed last without a rate.",
  },
  activityQuestion: { id: "insights.screen.activityQuestion", defaultMessage: "How active have I been?" },
  series: { id: "insights.screen.series", defaultMessage: "Show" },
  weeklyChart: { id: "insights.screen.weeklyChart", defaultMessage: "Last 12 weeks" },
  thisWeek: { id: "insights.screen.thisWeek", defaultMessage: "This week" },
  loading: { id: "insights.screen.loading", defaultMessage: "Loading insights" },
  errorTitle: { id: "insights.screen.errorTitle", defaultMessage: "We couldn't load your insights" },
  errorBody: {
    id: "insights.screen.errorBody",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  firstUseTitle: {
    id: "insights.screen.firstUseTitle",
    defaultMessage: "Insights start with your first application",
  },
  firstUseBody: {
    id: "insights.screen.firstUseBody",
    defaultMessage:
      "Once you move an application to Applied, this page shows how far your applications get and where replies come from.",
  },
  openTracker: { id: "insights.screen.openTracker", defaultMessage: "Open Tracker" },
  noneInRangeBody: {
    id: "insights.screen.noneInRangeBody",
    defaultMessage: "No applications were sent in this range with these filters.",
  },
  showAllTime: { id: "insights.screen.showAllTime", defaultMessage: "Show all time" },
  exportCsv: { id: "insights.screen.exportCsv", defaultMessage: "CSV · this view" },
  exportFailed: {
    id: "insights.screen.exportFailed",
    defaultMessage: "The CSV couldn't be saved. Try again.",
  },
  exported: { id: "insights.screen.exported", defaultMessage: "Insights exported" },
  keysGroup: { id: "insights.keys.group", defaultMessage: "Insights" },
  keyFilters: { id: "insights.keys.filters", defaultMessage: "Focus the filters" },
});

/** Search changes for the current route; `undefined` removes a key. */
type SearchPatch = Readonly<Record<string, string | undefined>>;

function useSearchPatch() {
  const navigate = useNavigate();
  return (patch: SearchPatch) =>
    void navigate({
      to: ".",
      replace: true,
      search: (previous: Readonly<Record<string, unknown>>) => {
        const merged: Record<string, unknown> = { ...previous, ...patch };
        return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined)) as never;
      },
    });
}

function useDrill() {
  const navigate = useNavigate();
  return (drill: DrillSearch) => void navigate({ to: "/tracker", search: drill as never });
}

export default function InsightsScreen({ model }: ScreenProps<InsightsModel>) {
  const intl = useIntl();
  const title = intl.formatMessage(destinationMessages.insights);
  return (
    <section aria-labelledby="insights-title" className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-6 pt-5 pb-10">
        {model.status === "ready" ? (
          <Ready model={model.data} title={title} stale={model.fromCache ? model : null} />
        ) : (
          <>
            <div id="insights-title">
              <ScreenTitle title={title} />
            </div>
            {model.status === "error" ? (
              <PaneError
                title={intl.formatMessage(messages.errorTitle)}
                body={intl.formatMessage(messages.errorBody)}
                onRetry={model.retry}
              />
            ) : (
              <SkeletonRegion
                loading
                label={intl.formatMessage(messages.loading)}
                skeleton={<LoadingSkeleton />}
              >
                {null}
              </SkeletonRegion>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <SkeletonBlock className="h-8 w-96" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <SkeletonBlock key={index} className="h-24" />
        ))}
      </div>
      <SkeletonBlock className="h-64" />
      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-2">
        <SkeletonText lines={6} />
        <SkeletonBlock className="h-56" />
      </div>
    </div>
  );
}

type Stale = Extract<ScreenProps<InsightsModel>["model"], { status: "ready" }>;

function Ready({ model, title, stale }: { model: InsightsModel; title: string; stale: Stale | null }) {
  const intl = useIntl();
  const patch = useSearchPatch();
  const drill = useDrill();
  const toast = useToast();
  const filtersRef = useRef<HTMLDivElement>(null);

  useKeyBindings([
    {
      id: "insights.filters",
      keys: "F",
      label: intl.formatMessage(messages.keyFilters),
      group: intl.formatMessage(messages.keysGroup),
      run: (event) => {
        event.preventDefault();
        filtersRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      },
    },
  ]);

  const exportCsv = () => {
    const bytes = new TextEncoder().encode(`\uFEFF${model.csv}`);
    const name = `insights-${model.params.range === "all" ? "all-time" : model.customFrom}-${model.customTo}.csv`;
    saveExportFile(bytes, name, "csv").then(
      (path) => {
        if (path !== null) toast.show({ variant: "info", message: intl.formatMessage(messages.exported) });
      },
      () => toast.show({ variant: "info", message: intl.formatMessage(messages.exportFailed) }),
    );
  };

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <div id="insights-title">
            <ScreenTitle title={title} />
          </div>
          {model.empty !== "firstUse" && (
            <p className="text-fg-secondary text-callout tabular-nums">{model.rangeLabel}</p>
          )}
          {stale && <StaleStamp prefix="updated" time={stale.updatedAt} clock={stale.updatedClock} />}
        </div>
        {model.empty !== "firstUse" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SegmentedControl<DesktopRange>
              label={intl.formatMessage(messages.range)}
              options={model.ranges}
              value={model.params.range}
              onValueChange={(range) =>
                patch(
                  range === "custom"
                    ? { range, from: model.customFrom, to: model.customTo }
                    : { range, from: undefined, to: undefined },
                )
              }
            />
            {model.params.range === "custom" && (
              <CustomRange
                from={model.customFrom}
                to={model.customTo}
                max={model.today}
                onChange={(from, to) => patch({ from, to })}
              />
            )}
            <label className="text-callout text-fg-primary inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-(--bfhr-color-accent-solid) size-4"
                checked={model.params.compare}
                disabled={model.params.range === "all"}
                onChange={(event) => patch({ compare: event.target.checked ? "1" : undefined })}
              />
              {intl.formatMessage(messages.compare)}
            </label>
            <div className="ms-auto">
              <ExportButton
                formats={[{ id: "csv", label: intl.formatMessage(messages.exportCsv) }]}
                onExport={exportCsv}
              />
            </div>
          </div>
        )}
        {model.empty !== "firstUse" && (
          <Filters ref={filtersRef} filters={model.filters} active={model.filtersActive} onPatch={patch} />
        )}
      </header>

      {model.empty === "firstUse" ? (
        <EmptyState
          kind="firstUse"
          glyph={ChartColumn}
          title={intl.formatMessage(messages.firstUseTitle)}
          body={intl.formatMessage(messages.firstUseBody)}
          primary={{ label: intl.formatMessage(messages.openTracker), onClick: () => drill({}) }}
        />
      ) : model.empty === "noneInRange" ? (
        <EmptyState
          kind="noResults"
          body={intl.formatMessage(messages.noneInRangeBody)}
          primary={{
            label: intl.formatMessage(model.filtersActive ? messages.clearFilters : messages.showAllTime),
            onClick: () =>
              patch(
                model.filtersActive
                  ? { source: undefined, channel: undefined, cv: undefined, market: undefined }
                  : { range: "all", from: undefined, to: undefined, compare: undefined },
              ),
          }}
        />
      ) : (
        <>
          <KpiStrip kpis={model.kpis} onDrill={drill} />
          <FunnelCard model={model} onDrill={drill} />
          <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[3fr_2fr]">
            <BreakdownCard
              model={model}
              onDrill={drill}
              onBy={(by) => patch({ by: by === "source" ? undefined : by })}
            />
            <ActivityCard
              model={model}
              onDrill={drill}
              onSeries={(series) => patch({ series: series === "applied" ? undefined : series })}
            />
          </div>
        </>
      )}
      <p className="text-footnote text-fg-tertiary">{model.provenance}</p>
    </>
  );
}

function CustomRange({
  from,
  to,
  max,
  onChange,
}: {
  from: string;
  to: string;
  max: string;
  onChange: (from: string, to: string) => void;
}) {
  const intl = useIntl();
  const input =
    "border-line-control bg-surface-base text-fg-primary h-8 rounded-md border px-2 text-callout tabular-nums";
  return (
    <div className="flex items-center gap-2">
      <label className="text-callout text-fg-secondary flex items-center gap-1.5">
        {intl.formatMessage(messages.from)}
        <input
          type="date"
          className={input}
          value={from}
          max={to}
          onChange={(event) => event.target.value && onChange(event.target.value, to)}
        />
      </label>
      <label className="text-callout text-fg-secondary flex items-center gap-1.5">
        {intl.formatMessage(messages.to)}
        <input
          type="date"
          className={input}
          value={to}
          min={from}
          max={max}
          onChange={(event) => event.target.value && onChange(from, event.target.value)}
        />
      </label>
    </div>
  );
}

function Filters({
  ref,
  filters,
  active,
  onPatch,
}: {
  ref: Ref<HTMLDivElement>;
  filters: readonly FilterVM[];
  active: boolean;
  onPatch: (patch: SearchPatch) => void;
}) {
  const intl = useIntl();
  return (
    <div
      ref={ref}
      role="group"
      aria-label={intl.formatMessage(messages.filters)}
      className="flex flex-wrap items-center gap-2"
    >
      {filters.map((filter) => (
        <FilterChip key={filter.dimension} filter={filter} onPatch={onPatch} />
      ))}
      {active && (
        <Button
          variant="plain"
          size="sm"
          onClick={() => onPatch({ source: undefined, channel: undefined, cv: undefined, market: undefined })}
        >
          {intl.formatMessage(messages.clearFilters)}
        </Button>
      )}
    </div>
  );
}

const NO_FILTER = "__all__";

function FilterChip({ filter, onPatch }: { filter: FilterVM; onPatch: (patch: SearchPatch) => void }) {
  const intl = useIntl();
  const selected = filter.value !== null;
  return (
    <span className="inline-flex items-center">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cx(
              "inline-flex h-7 cursor-default items-center gap-1 rounded-full border px-2.5 text-footnote whitespace-nowrap transition-colors duration-(--bfhr-duration-fast) select-none",
              selected
                ? "bg-accent-subtle text-accent-text border-transparent font-medium"
                : "border-line-control bg-surface-base text-fg-primary hover:bg-surface-hover",
              selected && "rounded-e-none pe-1.5",
            )}
          >
            {intl.formatMessage(messages.filterChip, { dimension: filter.label, value: filter.valueLabel })}
            <span aria-hidden="true">▾</span>
          </button>
        </DropdownMenu.Trigger>
        <MenuContent aria-label={filter.label}>
          <MenuRadioGroup
            value={filter.value ?? NO_FILTER}
            onValueChange={(value) =>
              onPatch({ [filter.dimension]: value === NO_FILTER ? undefined : value })
            }
          >
            <MenuRadioItem value={NO_FILTER}>{intl.formatMessage(messages.filterAll)}</MenuRadioItem>
            <MenuSeparator />
            {filter.options.map((option) => (
              <MenuRadioItem key={option.value} value={option.value}>
                <span className="flex w-full items-center justify-between gap-4">
                  <span>{option.label}</span>
                  <span className="text-fg-tertiary tabular-nums">{option.count}</span>
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </DropdownMenu.Root>
      {selected && (
        <button
          type="button"
          aria-label={intl.formatMessage(messages.clearFilter, { dimension: filter.label })}
          onClick={() => onPatch({ [filter.dimension]: undefined })}
          className="bg-accent-subtle text-accent-text hover:bg-surface-hover inline-flex h-7 w-7 cursor-default items-center justify-center rounded-e-full border-s border-(--bfhr-color-surface-base)"
        >
          <X aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </span>
  );
}

function Card({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cx(
        "border-line-subtle bg-surface-base flex min-w-0 flex-col gap-4 rounded-lg border p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="text-headline text-fg-primary">
            {title}
          </h2>
          {subtitle !== undefined && <p className="text-callout text-fg-secondary">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function DefinitionButton({
  metric,
  definition,
  provenance,
}: {
  metric: string;
  definition: string;
  provenance?: string;
}) {
  const intl = useIntl();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={intl.formatMessage(messages.definition, { metric })}
          className="text-fg-tertiary hover:text-fg-primary hover:bg-surface-hover -m-1 inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-md"
        >
          <Info aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="bg-surface-elevated text-fg-primary shadow-overlay z-(--bfhr-layer-popover) flex max-w-80 flex-col gap-2 rounded-md p-3 text-footnote"
        >
          <p>{definition}</p>
          {provenance !== undefined && <p className="text-fg-secondary">{provenance}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * A datum that opens its applications in the Tracker table. The accessible name is the visible
 * content (WCAG 2.5.3); `label`, the full sentence with every number, is its description.
 */
function DrillButton({
  drill,
  label,
  onDrill,
  className,
  children,
  ...rest
}: {
  drill: DrillSearch;
  label: string;
  onDrill: (drill: DrillSearch) => void;
  className?: string;
  children: ReactNode;
  tabIndex?: number;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  "data-index"?: number;
}) {
  const intl = useIntl();
  const descriptionId = useId();
  return (
    <button
      type="button"
      {...rest}
      aria-describedby={descriptionId}
      onClick={() => onDrill(drill)}
      className={cx("cursor-default text-start", className)}
    >
      {children}
      <span id={descriptionId} hidden>
        {intl.formatMessage(messages.openInTracker, { label })}
      </span>
    </button>
  );
}

function KpiStrip({ kpis, onDrill }: { kpis: readonly KpiVM[]; onDrill: (drill: DrillSearch) => void }) {
  const intl = useIntl();
  return (
    <ul
      aria-label={intl.formatMessage(messages.kpis)}
      className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3"
    >
      {kpis.map((kpi) => (
        <li
          key={kpi.id}
          className="border-line-subtle bg-surface-base relative flex flex-col rounded-lg border"
        >
          <DrillButton
            drill={kpi.drill ?? {}}
            label={kpi.accessibleLabel}
            onDrill={onDrill}
            className="hover:bg-surface-hover flex h-full flex-col gap-1 rounded-lg p-4 pe-10"
          >
            <span className="text-footnote text-fg-secondary">{kpi.label}</span>
            <span
              className={cx(
                "text-title2 tabular-nums",
                kpi.lowSample ? "text-fg-tertiary" : "text-fg-primary",
              )}
            >
              {kpi.value}
            </span>
            <span className="text-footnote text-fg-secondary tabular-nums">{kpi.context}</span>
            {kpi.delta !== null && (
              <span className="text-footnote text-fg-secondary tabular-nums">{kpi.delta}</span>
            )}
          </DrillButton>
          <span className="absolute end-3 top-3">
            <DefinitionButton metric={kpi.label} definition={kpi.definition} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function FunnelCard({ model, onDrill }: { model: InsightsModel; onDrill: (drill: DrillSearch) => void }) {
  const intl = useIntl();
  const { funnel } = model;
  const steps = funnel.steps;
  const lowSample = funnel.lowSampleNote !== null;
  return (
    <Card
      title={intl.formatMessage(messages.funnelQuestion)}
      subtitle={funnel.title}
      actions={
        <DefinitionButton
          metric={intl.formatMessage(messages.funnelChart)}
          definition={model.kpis.find((kpi) => kpi.id === "response")?.definition ?? ""}
          provenance={model.provenance}
        />
      }
    >
      {funnel.lowSampleNote !== null && (
        <p className="text-callout text-fg-secondary">{funnel.lowSampleNote}</p>
      )}
      <div className="@container">
        {/* Vertical bars from 560 px; horizontal rows below (research: Squarespace / Calendly). */}
        <ol aria-label={funnel.title} className="hidden h-52 items-end gap-14 @min-[560px]:flex">
          {steps.map((step, index) => (
            <li key={step.stage} className="relative flex h-full min-w-0 flex-1">
              {index > 0 && step.stepLabel !== null && <StepChip label={step.stepLabel} />}
              <DrillButton
                drill={step.drill}
                label={step.accessibleLabel}
                onDrill={onDrill}
                className="hover:bg-surface-hover flex h-full min-w-0 flex-1 flex-col justify-end gap-1 rounded-md p-1"
              >
                <span className="text-callout text-fg-primary tabular-nums">
                  <span className="text-headline">{step.reached}</span>
                  {!lowSample && <span className="text-fg-secondary"> · {step.shareLabel}</span>}
                </span>
                <span className="flex w-full flex-1 items-end">
                  <span
                    aria-hidden="true"
                    className="bg-chart-series w-full rounded-t-sm"
                    style={{ height: step.reached > 0 ? `${Math.max(step.share * 100, 2)}%` : "2px" }}
                  />
                </span>
                <span className="text-footnote text-fg-secondary truncate">{step.label}</span>
              </DrillButton>
            </li>
          ))}
        </ol>
        <ol aria-label={funnel.title} className="flex flex-col gap-2 @min-[560px]:hidden">
          {steps.map((step) => (
            <li key={step.stage}>
              <DrillButton
                drill={step.drill}
                label={step.accessibleLabel}
                onDrill={onDrill}
                className="hover:bg-surface-hover grid w-full grid-cols-[6rem_1fr_auto] items-center gap-3 rounded-md p-1"
              >
                <span className="text-footnote text-fg-secondary">{step.label}</span>
                <span className="bg-surface-sunken flex h-3 overflow-hidden rounded-sm">
                  <span
                    aria-hidden="true"
                    className="bg-chart-series"
                    style={{ width: `${step.share * 100}%` }}
                  />
                </span>
                <span className="text-callout tabular-nums">
                  {step.reached}
                  {!lowSample && ` · ${step.shareLabel}`}
                </span>
              </DrillButton>
            </li>
          ))}
        </ol>
      </div>
      <FunnelTable steps={steps} onDrill={onDrill} />
      {funnel.buckets.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {funnel.buckets.map((bucket) => (
            <li key={bucket.id}>
              <DrillButton
                drill={bucket.drill}
                label={bucket.label}
                onDrill={onDrill}
                className="text-callout text-fg-link hover:underline tabular-nums"
              >
                {bucket.label}
              </DrillButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StepChip({ label }: { label: string }) {
  // Sits in the gap before its bar: the share of the previous stage that reached this one.
  return (
    <span
      aria-hidden="true"
      className="text-caption1 text-fg-secondary bg-surface-sunken absolute top-1/2 -start-7 -translate-x-1/2 rounded-full px-1.5 py-0.5 whitespace-nowrap tabular-nums rtl:translate-x-1/2"
    >
      {label} →
    </span>
  );
}

function FunnelTable({
  steps,
  onDrill,
}: {
  steps: readonly FunnelStepVM[];
  onDrill: (drill: DrillSearch) => void;
}) {
  const intl = useIntl();
  const th = "text-footnote text-fg-secondary px-2 py-1.5 font-normal";
  const td = "px-2 py-1.5 text-callout tabular-nums";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-line-subtle border-b">
            <th scope="col" className={cx(th, "text-start")}>
              {intl.formatMessage(messages.stageHeader)}
            </th>
            <th scope="col" className={cx(th, "text-end")}>
              {intl.formatMessage(messages.reachedHeader)}
            </th>
            <th scope="col" className={cx(th, "text-end")}>
              {intl.formatMessage(messages.ofAppliedHeader)}
            </th>
            <th scope="col" className={cx(th, "text-end")}>
              {intl.formatMessage(messages.stepHeader)}
            </th>
            <th scope="col" className={cx(th, "text-end")}>
              {intl.formatMessage(messages.medianHeader)}
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.stage} className="border-line-subtle border-b last:border-b-0">
              <th scope="row" className={cx(td, "text-start font-normal")}>
                <DrillButton
                  drill={step.drill}
                  label={step.accessibleLabel}
                  onDrill={onDrill}
                  className="text-fg-link hover:underline"
                >
                  {step.label}
                </DrillButton>
              </th>
              <td className={cx(td, "text-end")}>{step.reached}</td>
              <td className={cx(td, "text-end")}>{step.shareLabel}</td>
              <td className={cx(td, "text-end")}>{step.stepLabel ?? "—"}</td>
              <td className={cx(td, "text-end")}>{step.stage === "applied" ? "—" : step.medianLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownCard({
  model,
  onDrill,
  onBy,
}: {
  model: InsightsModel;
  onDrill: (drill: DrillSearch) => void;
  onBy: (by: BreakdownDimension) => void;
}) {
  const intl = useIntl();
  const { breakdown } = model;
  const th = "text-footnote text-fg-secondary px-2 py-1.5 font-normal";
  const td = "px-2 py-1.5 text-callout tabular-nums";
  return (
    <Card
      title={intl.formatMessage(messages.breakdownQuestion)}
      subtitle={intl.formatMessage(messages.breakdownNote)}
      actions={
        <SegmentedControl<BreakdownDimension>
          label={intl.formatMessage(messages.breakdownBy)}
          options={breakdown.tabs}
          value={breakdown.by}
          onValueChange={onBy}
          size="sm"
        />
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-line-subtle border-b">
              <th scope="col" className={cx(th, "text-start")}>
                {breakdown.keyHeader}
              </th>
              <th scope="col" className={cx(th, "w-2/5 text-start")}>
                {intl.formatMessage(messages.rateHeader)}
              </th>
              <th scope="col" className={cx(th, "text-end")}>
                {intl.formatMessage(messages.applicationsHeader)}
              </th>
              <th scope="col" className={cx(th, "text-end")}>
                {intl.formatMessage(messages.responsesHeader)}
              </th>
              <th scope="col" className={cx(th, "text-end")}>
                {intl.formatMessage(messages.firstResponseHeader)}
              </th>
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((row) => (
              <BreakdownRow key={row.key} row={row} onDrill={onDrill} td={td} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BreakdownRow({
  row,
  onDrill,
  td,
}: {
  row: BreakdownRowVM;
  onDrill: (drill: DrillSearch) => void;
  td: string;
}) {
  return (
    <tr className={cx("border-line-subtle border-b last:border-b-0", row.lowSample && "text-fg-secondary")}>
      <th scope="row" className={cx(td, "text-start font-normal")}>
        <DrillButton
          drill={row.drill}
          label={row.accessibleLabel}
          onDrill={onDrill}
          className="text-fg-link hover:underline"
        >
          {row.label}
        </DrillButton>
      </th>
      <td className={td}>
        {row.rate === null ? (
          <span className="text-footnote text-fg-secondary whitespace-nowrap">{row.rateLabel}</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="bg-surface-sunken flex h-2 flex-1 overflow-hidden rounded-sm" aria-hidden="true">
              <span className="bg-chart-series" style={{ width: `${row.rate * 100}%` }} />
            </span>
            <span className="w-10 text-end">{row.rateLabel}</span>
          </span>
        )}
      </td>
      <td className={cx(td, "text-end")}>{row.applications}</td>
      <td className={cx(td, "text-end")}>{row.responses}</td>
      <td className={cx(td, "text-end")}>{row.medianLabel}</td>
    </tr>
  );
}

function ActivityCard({
  model,
  onDrill,
  onSeries,
}: {
  model: InsightsModel;
  onDrill: (drill: DrillSearch) => void;
  onSeries: (series: ActivitySeries) => void;
}) {
  const intl = useIntl();
  const { weekly } = model;
  const [focused, setFocused] = useState(weekly.weeks.length - 1);
  const barsRef = useRef<HTMLOListElement>(null);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = weekly.weeks.length - 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(last, index + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, index - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setFocused(next);
    barsRef.current?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
  };
  const max = Math.max(1, weekly.max);
  return (
    <Card
      title={intl.formatMessage(messages.activityQuestion)}
      subtitle={weekly.summary}
      actions={
        <SegmentedControl<ActivitySeries>
          label={intl.formatMessage(messages.series)}
          options={weekly.seriesOptions}
          value={weekly.series}
          onValueChange={onSeries}
          size="sm"
        />
      }
    >
      <ol
        ref={barsRef}
        aria-label={`${intl.formatMessage(messages.weeklyChart)}. ${weekly.summary}`}
        className="border-line-subtle flex h-48 items-end gap-1 border-b"
      >
        {weekly.weeks.map((week: WeekVM, index) => (
          <li key={week.weekStart} className="flex h-full min-w-0 flex-1 flex-col">
            <DrillButton
              drill={week.drill}
              label={week.accessibleLabel}
              onDrill={onDrill}
              tabIndex={index === focused ? 0 : -1}
              onKeyDown={(event) => move(event, index)}
              data-index={index}
              className="hover:bg-surface-hover flex h-full flex-col items-center justify-end gap-1 rounded-t-md px-0.5"
            >
              <span className="sr-only">{week.longLabel}: </span>
              <span className="text-caption1 text-fg-secondary tabular-nums">{week.value}</span>
              <span
                aria-hidden="true"
                className={cx(
                  "w-full max-w-8 rounded-t-sm",
                  week.value === 0 ? "bg-chart-grid" : "bg-chart-series",
                )}
                style={{ height: week.value === 0 ? "2px" : `${(week.value / max) * 100}%` }}
              />
            </DrillButton>
          </li>
        ))}
      </ol>
      <ol aria-hidden="true" className="-mt-2 flex gap-1">
        {weekly.weeks.map((week, index) => (
          <li
            key={week.weekStart}
            className={cx(
              "text-caption2 flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap",
              week.current ? "text-fg-primary justify-end font-medium" : "text-fg-tertiary",
            )}
          >
            {/* Every third week plus this one: the bars' accessible names carry every date. */}
            {week.current
              ? intl.formatMessage(messages.thisWeek)
              : index % 3 === 0 && index < weekly.weeks.length - 3
                ? week.label
                : ""}
          </li>
        ))}
      </ol>
    </Card>
  );
}
