/**
 * The Jobs filter bar (job-feed-search.md "Decision — Desktop" 2): pills for work mode, location,
 * seniority, salary, posted, match, visa and source; each opens a popover whose choices apply at
 * once (the list and its count update live), with Reset and "Show 42 jobs" to close. Active pills
 * are filled and name their value. Clear all follows the pills; Save search stays at the right end
 * of the first line while the pills wrap. `F` focuses the first pill. The open popover is the
 * screen's (`?filters=<facet>`), like its dialogs.
 */
import type { RemoteType, SavedSearchFilters, Seniority } from "@bfhr/core";
import { ChevronDown, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import {
  clearFacet,
  type FilterBarVM,
  type FilterFacet,
  type FilterOptionVM,
  type FilterPillVM,
} from "./filterBarModel";
import { type JobsFilterState, type MinBand, NO_FILTERS } from "./filters";

const messages = defineMessages({
  reset: { id: "job-detail.filters.reset", defaultMessage: "Reset" },
  show: {
    id: "job-detail.filters.show",
    defaultMessage: "{count, plural, =0 {No jobs to show} one {Show # job} other {Show # jobs}}",
  },
  salaryAmount: { id: "job-detail.filters.salaryAmount", defaultMessage: "At least, per year" },
  salaryCurrency: { id: "job-detail.filters.salaryCurrency", defaultMessage: "Currency" },
  salaryNote: {
    id: "job-detail.filters.salaryNote",
    defaultMessage: "Jobs that don't state a salary stay in the list.",
  },
  visaOnly: { id: "job-detail.filters.visaOnly", defaultMessage: "Only jobs that offer visa sponsorship" },
  visaNote: {
    id: "job-detail.filters.visaNote",
    defaultMessage: "Jobs that don't say either way stay in the list.",
  },
  noOptions: { id: "job-detail.filters.noOptions", defaultMessage: "None of your jobs name one yet." },
  anyTime: { id: "job-detail.filters.anyTime", defaultMessage: "Any time" },
  anyMatch: { id: "job-detail.filters.anyMatch", defaultMessage: "All matches" },
});

function toggled<T>(items: readonly T[], item: T, on: boolean): T[] {
  return on ? [...items.filter((value) => value !== item), item] : items.filter((value) => value !== item);
}

/** One checkbox (multi-select) or radio (single-select) row in a popover. */
function OptionRow<Value extends string | number>({
  option,
  type,
  name,
  onChange,
}: {
  option: FilterOptionVM<Value>;
  type: "checkbox" | "radio";
  name: string;
  onChange: (selected: boolean) => void;
}) {
  return (
    <label className="hover:bg-surface-hover text-callout flex min-h-8 cursor-default items-center gap-2 rounded-md px-2">
      <input
        type={type}
        name={name}
        checked={option.selected}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-(--bfhr-color-accent-solid) size-4"
      />
      <span className="min-w-0 flex-1">{option.label}</span>
    </label>
  );
}

function FacetPopover({
  pill,
  open,
  onOpenChange: setOpen,
  resultCount,
  onReset,
  children,
}: {
  pill: FilterPillVM;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultCount: number;
  onReset: () => void;
  children: ReactNode;
}) {
  const intl = useIntl();
  const titleId = useId();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-filter-pill={pill.facet}
          className={cx(
            "text-footnote inline-flex h-7 shrink-0 cursor-default items-center gap-1 rounded-full border px-2.5 font-medium whitespace-nowrap outline-offset-1 select-none focus-visible:outline-2",
            pill.active
              ? "bg-accent-subtle text-accent-text border-transparent"
              : "bg-surface-base text-fg-primary border-line-control hover:bg-surface-hover",
          )}
        >
          {pill.label}
          <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-labelledby={titleId}
          className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-32px)] flex-col gap-2 rounded-lg border p-3"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement &&
              event.target.type !== "number"
            ) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          <h2 id={titleId} className="text-headline px-2">
            {pill.title}
          </h2>
          <div className="-mx-1 min-h-0 overflow-y-auto px-1">{children}</div>
          <div className="border-line-subtle flex items-center justify-between gap-2 border-t pt-2">
            <Button size="sm" variant="plain" onClick={onReset} disabledReason={null}>
              {intl.formatMessage(messages.reset)}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              {intl.formatMessage(messages.show, { count: resultCount })}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FilterBar({
  bar,
  state,
  resultCount,
  openFacet,
  onOpenFacetChange,
  onChange,
  trailing,
}: {
  bar: FilterBarVM;
  state: JobsFilterState;
  /** Rows the list shows with the current filters ("Show 42 jobs"). */
  resultCount: number;
  /** The pill whose popover is open. */
  openFacet: FilterFacet | null;
  onOpenFacetChange: (facet: FilterFacet | null) => void;
  onChange: (next: JobsFilterState) => void;
  /** Right-aligned: Save search. */
  trailing?: ReactNode;
}) {
  const intl = useIntl();
  const groupName = useId();
  const { filters } = state;
  const setFilters = (patch: Partial<SavedSearchFilters>) =>
    onChange({ ...state, filters: { ...filters, ...patch } });
  const empty = (
    <p className="text-fg-tertiary text-footnote px-2 py-1">{intl.formatMessage(messages.noOptions)}</p>
  );

  const content: Readonly<Record<FilterFacet, ReactNode>> = {
    workMode: bar.workModes.map((option) => (
      <OptionRow
        key={option.value}
        option={option}
        type="checkbox"
        name={`${groupName}-remote`}
        onChange={(on) =>
          setFilters({ remoteTypes: toggled<RemoteType>(filters.remoteTypes, option.value, on) })
        }
      />
    )),
    location:
      bar.countries.length === 0
        ? empty
        : bar.countries.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              type="checkbox"
              name={`${groupName}-country`}
              onChange={(on) => setFilters({ countryCodes: toggled(filters.countryCodes, option.value, on) })}
            />
          )),
    seniority: bar.seniority.map((option) => (
      <OptionRow
        key={option.value}
        option={option}
        type="checkbox"
        name={`${groupName}-level`}
        onChange={(on) => setFilters({ seniority: toggled<Seniority>(filters.seniority, option.value, on) })}
      />
    )),
    salary: (
      <div className="flex flex-col gap-2 px-2 py-1">
        <div className="flex gap-2">
          <label className="text-footnote text-fg-secondary flex min-w-0 flex-1 flex-col gap-1">
            {intl.formatMessage(messages.salaryAmount)}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={bar.salary.amount ?? ""}
              onChange={(event) => {
                const amount = Number(event.target.value);
                setFilters({
                  salaryMin:
                    event.target.value === "" || !Number.isFinite(amount) || amount <= 0
                      ? null
                      : { amount: Math.round(amount), currency: bar.salary.currency, period: "year" },
                });
              }}
              className="bg-surface-base border-line-control text-body text-fg-primary h-8 w-full rounded-md border px-2 tabular-nums"
            />
          </label>
          <label className="text-footnote text-fg-secondary flex flex-col gap-1">
            {intl.formatMessage(messages.salaryCurrency)}
            <select
              value={bar.salary.currency}
              onChange={(event) =>
                setFilters({
                  salaryMin:
                    bar.salary.amount === null
                      ? null
                      : { amount: bar.salary.amount, currency: event.target.value, period: "year" },
                })
              }
              className="bg-surface-base border-line-control text-body text-fg-primary h-8 rounded-md border px-1"
            >
              {bar.salary.currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.salaryNote)}</p>
      </div>
    ),
    posted: [
      <OptionRow
        key="any"
        option={{
          value: 0,
          label: intl.formatMessage(messages.anyTime),
          selected: filters.postedWithinDays === null,
        }}
        type="radio"
        name={`${groupName}-posted`}
        onChange={() => setFilters({ postedWithinDays: null })}
      />,
      ...bar.posted.map((option) => (
        <OptionRow
          key={option.value}
          option={option}
          type="radio"
          name={`${groupName}-posted`}
          onChange={() => setFilters({ postedWithinDays: option.value })}
        />
      )),
    ],
    match: [
      <OptionRow
        key="any"
        option={{
          value: "any",
          label: intl.formatMessage(messages.anyMatch),
          selected: state.minBand === null,
        }}
        type="radio"
        name={`${groupName}-match`}
        onChange={() => onChange({ ...state, minBand: null })}
      />,
      ...bar.bands.map((option) => (
        <OptionRow
          key={option.value}
          option={option}
          type="radio"
          name={`${groupName}-match`}
          onChange={() => onChange({ ...state, minBand: option.value satisfies MinBand })}
        />
      )),
    ],
    visa: (
      <>
        <OptionRow
          option={{
            value: "visa",
            label: intl.formatMessage(messages.visaOnly),
            selected: filters.visaSponsorship === true,
          }}
          type="checkbox"
          name={`${groupName}-visa`}
          onChange={(on) => setFilters({ visaSponsorship: on ? true : null })}
        />
        <p className="text-fg-tertiary text-caption1 px-2 pt-1">{intl.formatMessage(messages.visaNote)}</p>
      </>
    ),
    source:
      bar.sources.length === 0
        ? empty
        : bar.sources.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              type="checkbox"
              name={`${groupName}-source`}
              onChange={(on) => setFilters({ sources: toggled(filters.sources, option.value, on) })}
            />
          )),
  };

  return (
    <div className="flex items-start gap-2">
      <div
        role="group"
        aria-label={bar.label}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5"
        data-filter-bar=""
      >
        {bar.pills.map((pill) => (
          <FacetPopover
            key={pill.facet}
            pill={pill}
            open={openFacet === pill.facet}
            onOpenChange={(open) =>
              onOpenFacetChange(open ? pill.facet : openFacet === pill.facet ? null : openFacet)
            }
            resultCount={resultCount}
            onReset={() => onChange(clearFacet(state, pill.facet))}
          >
            {content[pill.facet]}
          </FacetPopover>
        ))}
        {bar.activeCount > 0 && (
          <Button
            size="sm"
            variant="plain"
            icon={X}
            onClick={() =>
              onChange({
                ...state,
                minBand: null,
                filters: NO_FILTERS,
              })
            }
          >
            {bar.clearAllLabel}
          </Button>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
