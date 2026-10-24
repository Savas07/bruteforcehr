/**
 * Settings › Job sources: the project-wide health of every source (`jobSources`, server-written),
 * grouped by how it is reached. Read-only: keys are the owner's project secrets. Health shows as
 * icon + text, never color alone.
 */
import type { JobSourceKind, JobSourceStatus } from "@bfhr/core";
import { CircleAlert, CircleCheck, CircleMinus, CircleDashed, ExternalLink } from "lucide-react";
import { useContext } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { openJobUrl } from "../../lib/desktop";
import { relativeTime } from "../../shared/model/format";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { useListState, useSettingsStore } from "./store";
import { SettingsSection } from "./ui";

const messages = defineMessages({
  description: {
    id: "settings.sources.description",
    defaultMessage:
      "Where Jobs looks for postings, and how each source did on its last run. Keys for the keyed sources are managed by the app's owner.",
  },
  keyless: { id: "settings.sources.keyless", defaultMessage: "Open sources" },
  keyed: { id: "settings.sources.keyed", defaultMessage: "Sources with an API key" },
  scrape: { id: "settings.sources.scrape", defaultMessage: "Career pages we read" },
  ok: { id: "settings.sources.ok", defaultMessage: "Working" },
  degraded: { id: "settings.sources.degraded", defaultMessage: "Partly working" },
  failing: { id: "settings.sources.failing", defaultMessage: "Not working right now" },
  skipped: { id: "settings.sources.skipped", defaultMessage: "Not in use" },
  lastSuccess: { id: "settings.sources.lastSuccess", defaultMessage: "Last found jobs {time}" },
  results: {
    id: "settings.sources.results",
    defaultMessage: "{count, plural, one {# posting} other {# postings}} last time",
  },
  quota: { id: "settings.sources.quota", defaultMessage: "{used} of {limit} requests used" },
  never: { id: "settings.sources.never", defaultMessage: "Hasn't run yet" },
  open: { id: "settings.sources.open", defaultMessage: "Visit {source}" },
  loading: { id: "settings.sources.loading", defaultMessage: "Loading job sources" },
  errorTitle: { id: "settings.sources.errorTitle", defaultMessage: "We couldn't load the job sources" },
  errorBody: { id: "settings.sources.errorBody", defaultMessage: "Jobs keeps working. Try again in a moment." },
  empty: { id: "settings.sources.empty", defaultMessage: "Sources show up here after the first job search runs." },
  reason_no_key: { id: "settings.sources.reason.noKey", defaultMessage: "No API key is set up for this source yet." },
  reason_quota_exhausted: { id: "settings.sources.reason.quota", defaultMessage: "Its request quota is used up." },
  reason_rate_limited: { id: "settings.sources.reason.rateLimited", defaultMessage: "It asked us to slow down; we'll retry later." },
  reason_blocked: { id: "settings.sources.reason.blocked", defaultMessage: "It refused automated access." },
  reason_unavailable: { id: "settings.sources.reason.unavailable", defaultMessage: "It didn't respond." },
  reason_invalid_response: { id: "settings.sources.reason.invalid", defaultMessage: "It sent data we couldn't read." },
  reason_disabled: { id: "settings.sources.reason.disabled", defaultMessage: "Turned off by the app's owner." },
});

const KIND_ORDER: readonly JobSourceKind[] = ["keyless", "keyed", "scrape"];
const STATE_ICONS = { ok: CircleCheck, degraded: CircleAlert, failing: CircleAlert, skipped: CircleMinus } as const;
const STATE_TONES = {
  ok: "text-success-text",
  degraded: "text-warning-text",
  failing: "text-warning-text",
  skipped: "text-fg-tertiary",
} as const;

function SourceRow({ source }: { source: JobSourceStatus }) {
  const intl = useIntl();
  const environment = useContext(ModelEnvironmentContext);
  const ctx = {
    intl,
    locale: intl.locale,
    now: environment.now(),
    timeZone: environment.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  const Icon = STATE_ICONS[source.state];
  const facts = [
    source.lastSuccessAt
      ? intl.formatMessage(messages.lastSuccess, { time: relativeTime(source.lastSuccessAt, ctx).label })
      : source.lastRunAt === null
        ? intl.formatMessage(messages.never)
        : null,
    source.lastResultCount !== null ? intl.formatMessage(messages.results, { count: source.lastResultCount }) : null,
    source.quota ? intl.formatMessage(messages.quota, { used: source.quota.used, limit: source.quota.limit }) : null,
  ].filter((fact): fact is string => fact !== null);
  const reason = source.reason ? (messages[`reason_${source.reason}`] as MessageDescriptor) : null;
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${STATE_TONES[source.state]}`} strokeWidth={1.75} />
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <p className="text-body text-fg-primary">
          {source.label}
          <span className="text-fg-secondary text-footnote"> · {intl.formatMessage(messages[source.state])}</span>
        </p>
        {reason && <p className="text-footnote text-fg-secondary">{intl.formatMessage(reason)}</p>}
        {facts.length > 0 && <p className="text-footnote text-fg-tertiary">{facts.join(" · ")}</p>}
      </div>
      <Button
        size="sm"
        variant="plain"
        icon={ExternalLink}
        aria-label={intl.formatMessage(messages.open, { source: source.attribution.label })}
        onClick={() => void openJobUrl(source.attribution.url).catch(() => undefined)}
      >
        {source.attribution.label}
      </Button>
    </li>
  );
}

export function JobSourcesPane() {
  const intl = useIntl();
  const store = useSettingsStore();
  const state = useListState(store.jobSources);
  if (state.status === "loading")
    return (
      <SettingsSection title={intl.formatMessage(messages.keyless)}>
        <SkeletonRegion loading label={intl.formatMessage(messages.loading)} skeleton={<SkeletonBlock className="h-40 w-full rounded-lg" />}>
          {null}
        </SkeletonRegion>
      </SettingsSection>
    );
  if (state.status === "error")
    return (
      <PaneError title={intl.formatMessage(messages.errorTitle)} body={intl.formatMessage(messages.errorBody)} onRetry={state.retry} />
    );
  if (state.items.length === 0)
    return <EmptyState kind="caughtUp" glyph={CircleDashed} body={intl.formatMessage(messages.empty)} />;
  return (
    <>
      <p className="text-callout text-fg-secondary max-w-160 pt-2">{intl.formatMessage(messages.description)}</p>
      {KIND_ORDER.map((kind) => {
        const sources = state.items
          .filter((source) => source.kind === kind)
          .toSorted((a, b) => a.label.localeCompare(b.label, intl.locale));
        if (sources.length === 0) return null;
        return (
          <SettingsSection key={kind} title={intl.formatMessage(messages[kind])}>
            <ul className="divide-line-subtle flex flex-col divide-y">
              {sources.map((source) => (
                <SourceRow key={source.id} source={source} />
              ))}
            </ul>
          </SettingsSection>
        );
      })}
    </>
  );
}
