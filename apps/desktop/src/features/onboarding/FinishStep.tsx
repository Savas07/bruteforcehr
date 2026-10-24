/**
 * Onboarding step 3/3 · Finish (shared onboarding contract): what the first saved search will look
 * for, before "Start searching" creates it, refreshes matches and opens Today. Without a role or a
 * place there is nothing to search for yet, so the step says how to get one instead.
 */
import type { RemoteType } from "@bfhr/core";
import { useMemo } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import type { SavedSearchInput } from "../../data/jobs/writes";

const messages = defineMessages({
  intro: {
    id: "onboarding.finish.intro",
    defaultMessage: "We'll check for new jobs every day and score each one against your preferences.",
  },
  nothing: {
    id: "onboarding.finish.nothing",
    defaultMessage: "Add a role or a place in your preferences, and we'll search for you every day.",
  },
  searchFor: { id: "onboarding.finish.searchFor", defaultMessage: "Looking for" },
  anyTitle: { id: "onboarding.finish.anyTitle", defaultMessage: "Any job title" },
  countries: { id: "onboarding.finish.countries", defaultMessage: "In" },
  anywhere: { id: "onboarding.finish.anywhere", defaultMessage: "Anywhere" },
  workplace: { id: "onboarding.finish.workplace", defaultMessage: "Workplace" },
  anyWorkplace: { id: "onboarding.finish.anyWorkplace", defaultMessage: "Any" },
  alerts: { id: "onboarding.finish.alerts", defaultMessage: "Alerts" },
  alertsValue: {
    id: "onboarding.finish.alertsValue",
    defaultMessage: "Checked daily · good matches and above",
  },
  later: {
    id: "onboarding.finish.later",
    defaultMessage: "You can change this search or add more under Jobs.",
  },
});

const WORKPLACE: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  remote: { id: "onboarding.finish.remote", defaultMessage: "Remote" },
  hybrid: { id: "onboarding.finish.hybrid", defaultMessage: "Hybrid" },
  onsite: { id: "onboarding.finish.onsite", defaultMessage: "On-site" },
});

export function FinishStep({ search }: { readonly search: SavedSearchInput | null }) {
  const intl = useIntl();
  const rows = useMemo(() => {
    if (search === null) return [];
    const regions = new Intl.DisplayNames([intl.locale], { type: "region" });
    const list = (items: readonly string[]) =>
      new Intl.ListFormat(intl.locale, { type: "conjunction" }).format(items);
    const { countryCodes, remoteTypes } = search.filters;
    return [
      {
        label: messages.searchFor,
        value: search.query === "" ? intl.formatMessage(messages.anyTitle) : search.query,
      },
      {
        label: messages.countries,
        value:
          countryCodes.length === 0
            ? intl.formatMessage(messages.anywhere)
            : list(countryCodes.map((code) => regions.of(code) ?? code)),
      },
      {
        label: messages.workplace,
        value:
          remoteTypes.length === 0
            ? intl.formatMessage(messages.anyWorkplace)
            : list(remoteTypes.map((type) => intl.formatMessage(WORKPLACE[type]))),
      },
      { label: messages.alerts, value: intl.formatMessage(messages.alertsValue) },
    ];
  }, [search, intl]);

  if (search === null)
    return <p className="text-body text-fg-primary">{intl.formatMessage(messages.nothing)}</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-fg-primary">{intl.formatMessage(messages.intro)}</p>
      <dl className="border-line-subtle bg-surface-base grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3 rounded-lg border p-4">
        {rows.map((row) => (
          <div key={row.label.id} className="contents">
            <dt className="text-callout text-fg-secondary">{intl.formatMessage(row.label)}</dt>
            <dd className="text-callout text-fg-primary break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.later)}</p>
    </div>
  );
}
