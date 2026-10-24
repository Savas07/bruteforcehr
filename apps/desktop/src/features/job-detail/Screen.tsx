/**
 * Jobs: list + job detail split view (`/jobs`, `/jobs/$jobId`; research/job-detail.md and
 * job-feed-search.md "Decision — Desktop", states.md "Job detail"). Selection lives in the route
 * (`jobId`), the search and filters in the search params (`filters.ts`), the scope in
 * `?scope=saved|hidden` and the picked saved search in `?search=` (sidebar children). Save, Not
 * for me (with reasons), Hide company, "I have this", the CV basis and "Yes, I applied" write
 * through the Jobs repository (`useJobsActions`); Enter in the search field searches the job sites
 * (`jobsSearch`). Dialogs: `?import=1` (paste a link), `?searches=manage` (saved searches),
 * `?apply=1` (apply by email).
 */
import { layout } from "@bfhr/ui-tokens";
import type { JobsSearchResponse } from "@bfhr/core";
import { Briefcase, Link2, ListFilter, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { destinationMessages } from "../../lib/destinations";
import { openJobUrl } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useListNavigation } from "../../shared/ui/focus";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { Keycaps } from "../../shared/ui/Keycaps";
import { useBreakpoints } from "../../shared/ui/layout";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SidebarChildItem, SidebarChildren } from "../../shared/ui/SidebarChildren";
import { JobDetailSkeleton, JobRowSkeleton, SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { SplitView } from "../../shared/ui/SplitView";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { useToast } from "../../shared/ui/Toast";
import { ApplyKitPanel, EmailApplyPanel, type SubmitAnswer, TailorHost } from "../apply";
import type { AppliedPins } from "./useJobsActions";
import { ImportJobDialog } from "../jobs-import";
import { SavedSearchesDialog, SaveSearchButton } from "../saved-searches";
import { DetailPane } from "./DetailPane";
import { clearFacet, FILTER_FACETS, type FilterFacet } from "./filterBarModel";
import { FilterBar } from "./FilterBar";
import { FILTER_PARAM_KEYS, filterSearchParams, type JobsFilterState, NO_FILTERS } from "./filters";
import { EmptyResults, JobList, type HiddenPlaceholder } from "./JobList";
import {
  JOBS_SCOPES,
  SCOPE_MESSAGES,
  sourceHealthLine,
  type DismissReasonVM,
  type FactorVM,
  type JobDetailModel,
  type JobsScope,
} from "./model";
import { useJobsActions } from "./useJobsActions";

const messages = defineMessages({
  group: { id: "job-detail.view.keysGroup", defaultMessage: "Jobs", description: "Shortcuts-sheet group" },
  listLabel: { id: "job-detail.view.listLabel", defaultMessage: "Jobs" },
  detailLabel: { id: "job-detail.view.detailLabel", defaultMessage: "Job details" },
  backLabel: { id: "job-detail.view.backLabel", defaultMessage: "Back to Jobs" },
  scopesLabel: { id: "job-detail.view.scopesLabel", defaultMessage: "Job lists" },
  search: { id: "job-detail.view.search", defaultMessage: "Search jobs" },
  searchPlaceholder: {
    id: "job-detail.view.searchPlaceholder",
    defaultMessage: "Search by title, company, place or skill",
  },
  focusSearch: { id: "job-detail.view.focusSearch", defaultMessage: "Search jobs" },
  focusFilters: { id: "job-detail.view.focusFilters", defaultMessage: "Focus the filters" },
  searchSites: { id: "job-detail.view.searchSites", defaultMessage: "Search job sites" },
  searchSitesNeedsQuery: {
    id: "job-detail.view.searchSitesNeedsQuery",
    defaultMessage: "Type a role or skill in the search field first.",
  },
  searching: { id: "job-detail.view.searching", defaultMessage: "Searching job sites for “{query}”…" },
  searchingBody: {
    id: "job-detail.view.searchingBody",
    defaultMessage: "New jobs show up in the list as they're found.",
  },
  searchDone: {
    id: "job-detail.view.searchDone",
    defaultMessage:
      "{created, plural, =0 {No new jobs for “{query}”} one {# new job for “{query}”} other {# new jobs for “{query}”}}",
  },
  searchChecked: {
    id: "job-detail.view.searchChecked",
    defaultMessage:
      "{found, plural, =0 {The job sites had no postings for this search.} one {Checked # posting, {updated} already in your list.} other {Checked # postings, {updated} already in your list.}}",
    description:
      "After a live search: postings the sources returned, and how many were jobs the user already had",
  },
  searchSkipped: {
    id: "job-detail.view.searchSkipped",
    defaultMessage: "Skipped: {names} (no access key yet).",
  },
  searchRateLimited: {
    id: "job-detail.view.searchRateLimited",
    defaultMessage: "You've searched a lot today. Your saved searches keep running; try again later.",
  },
  searchNoSources: {
    id: "job-detail.view.searchNoSources",
    defaultMessage: "No job site could be searched just now. Try again in a while.",
  },
  searchFailed: {
    id: "job-detail.view.searchFailed",
    defaultMessage: "The search didn't finish. Check your connection and try again.",
  },
  dismissSearch: { id: "job-detail.view.dismissSearch", defaultMessage: "Close" },
  addFromLink: { id: "job-detail.view.addFromLink", defaultMessage: "Add from link" },
  manageSearches: { id: "job-detail.view.manageSearches", defaultMessage: "Saved searches…" },
  loading: { id: "job-detail.view.loading", defaultMessage: "Loading your jobs" },
  loadingDetail: { id: "job-detail.view.loadingDetail", defaultMessage: "Loading the job" },
  errorTitle: { id: "job-detail.view.errorTitle", defaultMessage: "We couldn't load your jobs" },
  errorBody: {
    id: "job-detail.view.errorBody",
    defaultMessage: "Our server didn't respond. Your saved jobs are safe. Try again in a moment.",
  },
  keySave: { id: "job-detail.view.keySave", defaultMessage: "Save or unsave" },
  keyNotForMe: { id: "job-detail.view.keyNotForMe", defaultMessage: "Not for me" },
  keyNotForMeReason: { id: "job-detail.view.keyNotForMeReason", defaultMessage: "Not for me, with a reason" },
  keyApply: { id: "job-detail.view.keyApply", defaultMessage: "Apply" },
  keyOpen: { id: "job-detail.view.keyOpen", defaultMessage: "Open the original posting" },
  linkCopied: { id: "job-detail.view.linkCopied", defaultMessage: "Link copied" },
  openFailed: {
    id: "job-detail.view.openFailed",
    defaultMessage: "We couldn't open the link. Copy it from the More menu instead.",
  },
  notYetToast: {
    id: "job-detail.view.notYetToast",
    defaultMessage: "We'll ask again next time you open this job.",
  },
  notApplyingToast: { id: "job-detail.view.notApplyingToast", defaultMessage: "Kept in Saved: {company}" },
  needsProfile: {
    id: "job-detail.view.needsProfile",
    defaultMessage: "Finish setting up your profile first, then you can hide companies.",
  },
});

/** A list row that should get focus once it renders as the selection (see `select`). */
let rowToFocus: string | null = null;

type SearchRun =
  | { readonly state: "running"; readonly query: string }
  | { readonly state: "done"; readonly query: string; readonly response: JobsSearchResponse }
  | { readonly state: "failed"; readonly message: string };

function callableReason(error: unknown): string | null {
  if (error === null || typeof error !== "object" || !("details" in error)) return null;
  const details = error.details;
  return details !== null &&
    typeof details === "object" &&
    "reason" in details &&
    typeof details.reason === "string"
    ? details.reason
    : null;
}

export default function JobDetailScreen({ model, params }: ScreenProps<JobDetailModel>) {
  const intl = useIntl();
  const navigate = useNavigate();
  const toast = useToast();
  const actions = useJobsActions();
  const jobsData = useJobsData();
  const { narrow, wide } = useBreakpoints();
  const offline = useConnectivity().status === "offline";
  /** Apply by email (`?apply=1`) takes the detail column; the list's single-key shortcuts pause. */
  const applyOpen = params.apply === "1" && model.status === "ready" && model.data.detail !== null;
  /** Tailor review (`?tailor=<cvId>[&rev=<revisionId>]`) takes the whole content area. */
  const tailorOpen = applyOpen && params.tailor !== undefined;
  const [placeholder, setPlaceholder] = useState<HiddenPlaceholder | null>(null);
  // UI-only state: the re-score in flight after "Change" and the external-apply round trip.
  const [rescoring, setRescoring] = useState<ReadonlyMap<string, { id: string; title: string }>>(new Map());
  const [askSubmit, setAskSubmit] = useState<ReadonlySet<string>>(new Set());
  const [answeredSubmit, setAnsweredSubmit] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<ReadonlyMap<string, "up" | "down">>(new Map());
  const [run, setRun] = useState<SearchRun | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const routeQuery = params.q ?? "";
  const [query, setQuery] = useState(routeQuery);
  // The field follows the route when the search changes from outside (a link, Back, a saved search).
  const [syncedQuery, setSyncedQuery] = useState(routeQuery);
  if (routeQuery !== syncedQuery) {
    setSyncedQuery(routeQuery);
    setQuery(routeQuery);
  }
  /** `?filters=<facet>` opens that filter's popover (any other value: the first one). */
  const openFacet: FilterFacet | null =
    params.filters === undefined
      ? null
      : (FILTER_FACETS.find((facet) => facet === params.filters) ?? FILTER_FACETS[0]);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const data = model.status === "ready" ? model.data : null;
  const group = intl.formatMessage(messages.group);

  const rows = data?.list.rows ?? [];
  const detail = data?.detail ?? null;
  const selectedId = data?.selectedJobId ?? null;
  const visibleIds = rows.map((row) => row.jobId);
  const jobSources = jobsData.status === "ready" ? jobsData.data.jobSources : [];

  // "Change" re-scores against another CV: shown as in progress until the match names that CV.
  const pendingCv = detail ? (rescoring.get(detail.jobId) ?? null) : null;
  const rescoringCv =
    pendingCv && !(detail?.match.state === "ready" && detail.match.basedOnCvId === pendingCv.id)
      ? pendingCv
      : null;

  const setSearchParams = (patch: Readonly<Record<string, string | undefined>>, to: "/jobs" | null = null) =>
    void navigate({
      ...(to === null ? { to: "." } : { to }),
      search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, ...patch }),
      replace: true,
    });

  const select = (jobId: string) => {
    // Keep keyboard focus on the list across the route change (`/jobs` → `/jobs/$jobId` remounts
    // the screen) and when the focused row is hidden.
    const active = document.activeElement;
    if (active === document.body || (active instanceof Node && listRef.current?.contains(active)))
      rowToFocus = jobId;
    void navigate({
      to: "/jobs/$jobId",
      params: { jobId },
      search: (previous: Readonly<Record<string, unknown>>) => previous,
      replace: true,
    });
  };
  useEffect(() => {
    if (rowToFocus === null || rowToFocus !== selectedId) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(rowToFocus)}"]`);
    if (!element) return;
    rowToFocus = null;
    element.focus();
  });
  const neighbour = (jobId: string, without: ReadonlySet<string>) => {
    const index = visibleIds.indexOf(jobId);
    const rest = visibleIds.filter((id) => !without.has(id));
    return (
      rest.find((id) => visibleIds.indexOf(id) > index) ??
      rest.findLast((id) => visibleIds.indexOf(id) < index)
    );
  };
  const nav = useListNavigation({
    containerRef: listRef,
    ids: visibleIds,
    activeId: selectedId,
    onActivate: select,
    onOpen: (jobId) => {
      if (narrow) setDetailOpen(true);
      else document.getElementById(`job-title-${jobId}`)?.focus();
    },
    group,
    enabled: data !== null && !tailorOpen,
  });

  const setSearch = (value: string) => {
    setQuery(value);
    setSearchParams({ q: value === "" ? undefined : value });
  };
  const setFilters = (next: JobsFilterState) => setSearchParams(filterSearchParams(next));
  const setScope = (scope: JobsScope) =>
    void navigate({
      to: "/jobs",
      search: (previous: Readonly<Record<string, unknown>>) => ({
        ...previous,
        scope: scope === "all" ? undefined : scope,
        search: undefined,
      }),
    });
  const showSavedSearch = (searchParams: Readonly<Record<string, string | undefined>>) => {
    const cleared = Object.fromEntries(FILTER_PARAM_KEYS.map((key) => [key, undefined]));
    void navigate({
      to: "/jobs",
      search: (previous: Readonly<Record<string, unknown>>) => ({
        ...previous,
        ...cleared,
        ...searchParams,
        scope: undefined,
        searches: undefined,
      }),
    });
  };

  /** On-demand `jobsSearch` with the feed's search and filters; results arrive through the listeners. */
  const searchSites = () => {
    const text = query.trim();
    if (!data || text === "" || offline || run?.state === "running") return;
    setRun({ state: "running", query: text });
    actions.search(text, data.search.filters).then(
      (response) => setRun({ state: "done", query: text, response }),
      (error: unknown) => {
        const reason = callableReason(error);
        setRun({
          state: "failed",
          message: intl.formatMessage(
            reason === "search_rate_limited"
              ? messages.searchRateLimited
              : reason === "no_sources"
                ? messages.searchNoSources
                : messages.searchFailed,
          ),
        });
      },
    );
  };

  const openUrl = (url: string) =>
    void openJobUrl(url).catch(() =>
      toast.show({ variant: "info", message: intl.formatMessage(messages.openFailed) }),
    );

  const hide = (row: { jobId: string }, withReason: boolean) => {
    const index = visibleIds.indexOf(row.jobId);
    if (index >= 0) setPlaceholder({ jobId: row.jobId, index });
    setReasonsOpen(withReason && index >= 0);
    if (selectedId === row.jobId) {
      const next = neighbour(row.jobId, new Set([row.jobId]));
      if (next) {
        // The focused row (or the detail showing it) is going away: continue triage from the next row.
        if (!withReason) rowToFocus = next;
        select(next);
        // With a reason the popover takes focus; it hands it back to the list when it closes.
        if (withReason) rowToFocus = null;
      }
      if (narrow) setDetailOpen(false);
    }
    actions.dismiss(row.jobId, {
      // D19: "Hidden from your feed · Undo · Why?"; Why? opens the optional reason popover.
      ...(index >= 0 && { onWhy: () => setReasonsOpen(true) }),
      onUndo: () => {
        setPlaceholder((current) => (current?.jobId === row.jobId ? null : current));
        setReasonsOpen(false);
        select(row.jobId);
      },
    });
  };

  const hideCompany = (jobId: string) => {
    if (!actions.hideCompany(jobId, () => select(jobId)))
      toast.show({ variant: "info", message: intl.formatMessage(messages.needsProfile) });
    else setPlaceholder(null);
  };

  const saveReasons = (keys: readonly DismissReasonVM["key"][]) => {
    if (placeholder) actions.setDismissReasons(placeholder.jobId, keys);
  };

  const openApply = () => setSearchParams({ apply: "1" });
  const apply = () => {
    if (!detail || detail.applied || offline) return;
    if (!detail.apply.external) {
      openApply();
      return;
    }
    openSite();
    // The kit sits beside the site the user is filling in.
    openApply();
  };
  /** "Open company site": the posting's link, then "Did you submit?" when the user is back. */
  const openSite = () => {
    if (!detail) return;
    openUrl(detail.apply.target);
    setAskSubmit((set) => new Set(set).add(detail.jobId));
    setAnsweredSubmit((set) => {
      const next = new Set(set);
      next.delete(detail.jobId);
      return next;
    });
  };
  const answered = (jobId: string) => setAnsweredSubmit((set) => new Set(set).add(jobId));
  const answerSubmit = (jobId: string, company: string, answer: SubmitAnswer, pins: AppliedPins | null) => {
    answered(jobId);
    if (answer === "yes") actions.recordApplied(jobId, pins, viewInTracker);
    else if (answer === "notYet") toast.show({ variant: "info", message: intl.formatMessage(messages.notYetToast) });
    else toast.show({ variant: "info", message: intl.formatMessage(messages.notApplyingToast, { company }) });
  };
  const viewInTracker = (applicationId: string) =>
    void navigate({
      to: "/tracker",
      search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, applicationId }),
    });

  useKeyBindings([
    {
      id: "jobs.save",
      keys: "S",
      label: intl.formatMessage(messages.keySave),
      group,
      enabled: detail !== null && !applyOpen,
      run: () => detail && actions.toggleSave(detail.jobId),
    },
    {
      id: "jobs.notForMe",
      keys: ["D", "Backspace"],
      label: intl.formatMessage(messages.keyNotForMe),
      group,
      enabled: detail !== null && !detail.hidden && !applyOpen,
      run: () => detail && hide(detail, false),
    },
    {
      id: "jobs.notForMeReason",
      keys: "Shift+D",
      label: intl.formatMessage(messages.keyNotForMeReason),
      group,
      enabled: detail !== null && !detail.hidden && !applyOpen,
      run: () => detail && hide(detail, true),
    },
    {
      id: "jobs.apply",
      keys: "A",
      label: intl.formatMessage(messages.keyApply),
      group,
      enabled: detail !== null && detail.applied === null && !offline && !applyOpen,
      run: apply,
    },
    {
      id: "jobs.open",
      keys: "O",
      label: intl.formatMessage(messages.keyOpen),
      group,
      enabled: detail !== null && !applyOpen,
      run: () => detail && openUrl(detail.originalUrl),
    },
    {
      id: "jobs.search",
      keys: "/",
      label: intl.formatMessage(messages.focusSearch),
      group,
      enabled: data !== null,
      run: (event) => {
        event.preventDefault();
        searchRef.current?.focus();
      },
    },
    {
      id: "jobs.filters",
      keys: "F",
      label: intl.formatMessage(messages.focusFilters),
      group,
      enabled: data !== null && !applyOpen,
      run: (event) => {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-pill]")?.focus();
      },
    },
  ]);

  // Rendered in every state so the sidebar doesn't jump while the list loads or fails.
  const currentScope = data?.scope ?? JOBS_SCOPES.find((scope) => scope === params.scope) ?? "all";
  const currentSearch = data?.savedSearches.find((item) => item.current) ?? null;
  const scopeTitle =
    currentSearch?.name ??
    (currentScope === "all"
      ? intl.formatMessage(destinationMessages.jobs)
      : intl.formatMessage(SCOPE_MESSAGES[currentScope]));

  const skippedNames =
    run?.state === "done"
      ? run.response.sources
          .filter((source) => source.status === "skipped" && source.reason === "no_key")
          .map((source) => jobSources.find((status) => status.id === source.source)?.label ?? source.source)
      : [];
  // One polite live region that stays mounted, so starting, finishing and failing are all announced;
  // each alert is keyed by its state so only this region (not the alert's own) reports the change.
  const runBanner = (
    <div aria-live="polite" className={run ? "px-6 pb-2" : undefined}>
      {run?.state === "failed" ? (
        <InlineAlert key="failed" tone="warning" title={run.message} onDismiss={() => setRun(null)} />
      ) : run?.state === "running" ? (
        <InlineAlert
          key="running"
          tone="info"
          title={intl.formatMessage(messages.searching, { query: run.query })}
        >
          {intl.formatMessage(messages.searchingBody)}
        </InlineAlert>
      ) : run?.state === "done" ? (
        <InlineAlert
          key="done"
          tone="info"
          title={intl.formatMessage(messages.searchDone, {
            query: run.query,
            created: run.response.counts.created,
          })}
          onDismiss={() => setRun(null)}
        >
          {[
            intl.formatMessage(messages.searchChecked, {
              found: run.response.counts.found,
              updated: run.response.counts.updated,
            }),
            ...(skippedNames.length > 0
              ? [
                  intl.formatMessage(messages.searchSkipped, {
                    names: intl.formatList(skippedNames, { type: "conjunction" }),
                  }),
                ]
              : []),
          ].join(" ")}
        </InlineAlert>
      ) : null}
    </div>
  );

  const header = (
    <header className="flex shrink-0 flex-col gap-3 px-6 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ScreenTitle
          title={scopeTitle}
          documentTitle={detail ? `${detail.title} · ${detail.company.name}` : scopeTitle}
        />
        {/* The field and "Search job sites" are one search: Enter in the field runs it too. */}
        <form
          role="search"
          className="flex min-w-0 flex-1 basis-96 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            searchSites();
          }}
        >
          <div className="relative flex max-w-96 min-w-48 flex-1 items-center">
            <label className="contents">
              <span className="sr-only">{intl.formatMessage(messages.search)}</span>
              <Search
                aria-hidden="true"
                className="text-fg-tertiary pointer-events-none absolute left-2.5 size-4"
                strokeWidth={1.75}
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                disabled={data === null}
                placeholder={intl.formatMessage(messages.searchPlaceholder)}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query !== "") {
                    event.preventDefault();
                    setSearch("");
                  }
                }}
                className="bg-surface-base border-line-control text-body placeholder:text-fg-tertiary h-8 w-full rounded-md border pr-9 pl-8 text-ellipsis outline-offset-0 focus-visible:outline-2 disabled:opacity-60"
              />
            </label>
            <span className="pointer-events-none absolute right-2" aria-hidden="true">
              <Keycaps keys="/" />
            </span>
          </div>
          <Button
            icon={Search}
            onClick={searchSites}
            loading={run?.state === "running"}
            loadingLabel={intl.formatMessage(messages.searchSites)}
            disabledReason={
              offline
                ? (data?.copy.needsConnection ?? null)
                : query.trim() === ""
                  ? intl.formatMessage(messages.searchSitesNeedsQuery)
                  : null
            }
          >
            {intl.formatMessage(messages.searchSites)}
          </Button>
        </form>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button icon={ListFilter} variant="plain" onClick={() => setSearchParams({ searches: "manage" })}>
            {intl.formatMessage(messages.manageSearches)}
          </Button>
          <Button icon={Link2} onClick={() => setSearchParams({ import: "1" })}>
            {intl.formatMessage(messages.addFromLink)}
          </Button>
        </span>
      </div>
      {data && data.list.empty?.kind !== "firstUse" && (
        <FilterBar
          bar={data.filterBar}
          state={data.search}
          resultCount={rows.length}
          openFacet={openFacet}
          onOpenFacetChange={(facet) => setSearchParams({ filters: facet ?? undefined })}
          onChange={setFilters}
          trailing={<SaveSearchButton query={data.search.query} filters={data.search.filters} />}
        />
      )}
    </header>
  );

  const scopes = (
    <SidebarChildren destination="jobs" label={intl.formatMessage(messages.scopesLabel)}>
      {JOBS_SCOPES.filter((scope) => scope !== "hidden").map((scope) => (
        <SidebarChildItem
          key={scope}
          current={scope === currentScope && currentSearch === null}
          onSelect={() => setScope(scope)}
        >
          {intl.formatMessage(SCOPE_MESSAGES[scope])}
        </SidebarChildItem>
      ))}
      {(data?.savedSearches ?? []).map((item) => (
        <SidebarChildItem key={item.id} current={item.current} onSelect={() => showSavedSearch(item.params)}>
          {item.name}
        </SidebarChildItem>
      ))}
      <SidebarChildItem current={currentScope === "hidden"} onSelect={() => setScope("hidden")}>
        {intl.formatMessage(SCOPE_MESSAGES.hidden)}
      </SidebarChildItem>
    </SidebarChildren>
  );

  const dialogs = (
    <>
      <ImportJobDialog
        open={params.import === "1"}
        onOpenChange={(open) => setSearchParams({ import: open ? "1" : undefined })}
        onImported={(jobId) => {
          setSearchParams({ import: undefined });
          select(jobId);
        }}
      />
      <SavedSearchesDialog
        open={params.searches === "manage"}
        onOpenChange={(open) => setSearchParams({ searches: open ? "manage" : undefined })}
        onShowResults={(savedSearchId) => {
          const item = data?.savedSearches.find((candidate) => candidate.id === savedSearchId);
          if (item) showSavedSearch(item.params);
        }}
      />
    </>
  );

  // Below 1440 px start at the narrow end so a 13" window gives the detail more room.
  const listPane = { ...layout.listPane, default: wide ? layout.listPane.default : layout.listPane.min };
  const splitLabels = {
    listLabel: intl.formatMessage(messages.listLabel),
    detailLabel: intl.formatMessage(messages.detailLabel),
    backLabel: intl.formatMessage(messages.backLabel),
  };

  if (model.status === "loading")
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {scopes}
        {header}
        <SplitView
          {...splitLabels}
          listPane={listPane}
          detailOpen={false}
          onBack={() => undefined}
          list={
            <SkeletonRegion
              loading
              label={intl.formatMessage(messages.loading)}
              skeleton={
                <div className="flex flex-col gap-1 px-4 pt-9">
                  {Array.from({ length: 6 }, (_, index) => (
                    <JobRowSkeleton key={index} />
                  ))}
                </div>
              }
            >
              {null}
            </SkeletonRegion>
          }
          detail={
            <SkeletonRegion
              loading
              label={intl.formatMessage(messages.loadingDetail)}
              skeleton={
                <div className="pt-11">
                  <div className="flex flex-col gap-3 px-6 pt-5">
                    <SkeletonBlock className="h-4 w-40" />
                    <SkeletonBlock className="h-6 w-80" />
                    <SkeletonBlock className="h-8 w-72" />
                  </div>
                  <JobDetailSkeleton />
                </div>
              }
            >
              {null}
            </SkeletonRegion>
          }
        />
      </div>
    );

  if (model.status === "error")
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {scopes}
        {header}
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
        />
      </div>
    );

  const ready = model.data;
  const stamp = model.fromCache && (
    <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />
  );

  if (ready.list.empty?.kind === "firstUse")
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {scopes}
        {header}
        {runBanner}
        <EmptyState
          kind="firstUse"
          glyph={Briefcase}
          title={ready.list.empty.title}
          body={`${ready.list.empty.body} ${sourceHealthLine(jobSources, intl)}`}
          className="flex-1 justify-center"
          {...(ready.list.empty.action && {
            primary: { label: ready.list.empty.action, onClick: () => searchRef.current?.focus(), keys: "/" },
          })}
        />
        {dialogs}
      </div>
    );

  const empty = ready.list.empty;
  const list = empty ? (
    <EmptyResults
      empty={empty}
      searchDisabledReason={offline ? ready.copy.needsConnection : null}
      onRemoveFacet={(facet) => {
        setFilters(clearFacet(ready.search, facet));
        // The chip goes away; continue from that filter's pill in the bar.
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-filter-bar] [data-filter-pill="${facet}"]`)?.focus(),
        );
      }}
      // "Remove all filters" when filters hide everything, else "Clear search".
      onAction={() =>
        empty.chips.length > 0
          ? setFilters({ ...ready.search, filters: NO_FILTERS, minBand: null })
          : setSearch("")
      }
      onSearchSites={searchSites}
    />
  ) : (
    <JobList
      model={ready}
      rows={rows}
      savedOf={(row) => row.saved}
      selectedId={selectedId}
      placeholder={placeholder}
      listRef={listRef}
      nav={nav}
      reasonsOpen={reasonsOpen}
      onReasonsOpenChange={setReasonsOpen}
      onSaveReasons={saveReasons}
      onSelect={(jobId) => {
        select(jobId);
        if (narrow) setDetailOpen(true);
      }}
      onToggleSave={(row) => actions.toggleSave(row.jobId)}
      onNotForMe={(row) => hide(row, false)}
      onOpenOriginal={(row) => openUrl(row.originalUrl)}
      onSortChange={(sort) => setFilters({ ...ready.search, sort })}
      stamp={stamp}
    />
  );

  const position = detail ? visibleIds.indexOf(detail.jobId) : -1;
  const detailView =
    detail && applyOpen ? (
      detail.apply.external ? (
        <ApplyKitPanel
          key={`kit-${detail.jobId}`}
          jobId={detail.jobId}
          siteUrl={detail.apply.target}
          showSubmitPrompt={
            (detail.submitPrompt !== null || askSubmit.has(detail.jobId)) && !answeredSubmit.has(detail.jobId)
          }
          onOpenSite={openSite}
          onSubmitAnswer={(answer, pins) =>
            answerSubmit(detail.jobId, detail.company.name, answer, pins ?? detail.applyCv)
          }
          onClose={() => setSearchParams({ apply: undefined })}
          onTailor={(cvId, revisionId) => setSearchParams({ tailor: cvId, rev: revisionId ?? undefined })}
        />
      ) : (
        <EmailApplyPanel
          key={`apply-${detail.jobId}`}
          jobId={detail.jobId}
          onClose={() => setSearchParams({ apply: undefined })}
          onTailor={(cvId, revisionId) => setSearchParams({ tailor: cvId, rev: revisionId ?? undefined })}
        />
      )
    ) : detail ? (
      <DetailPane
        key={detail.jobId}
        detail={detail}
        copy={ready.copy}
        position={position >= 0 ? position + 1 : null}
        total={visibleIds.length}
        saved={detail.saved}
        hidden={detail.hidden}
        showSubmitPrompt={
          (detail.submitPrompt !== null || askSubmit.has(detail.jobId)) && !answeredSubmit.has(detail.jobId)
        }
        actions={{
          onPrevious: () => detail.previousJobId && select(detail.previousJobId),
          onNext: () => detail.nextJobId && select(detail.nextJobId),
          onApply: apply,
          onToggleSave: () => actions.toggleSave(detail.jobId),
          onNotForMe: () => hide(detail, false),
          onNotForMeWithReason: () => hide(detail, true),
          onUnhide: () => actions.restore(detail.jobId),
          onHideCompany: () => hideCompany(detail.jobId),
          onCopyLink: () =>
            void navigator.clipboard
              .writeText(detail.originalUrl)
              .then(() => toast.show({ variant: "info", message: intl.formatMessage(messages.linkCopied) })),
          onOpenUrl: openUrl,
          onViewInTracker: viewInTracker,
          onOpenCv: (cvId) =>
            void navigate({
              to: "/cvs/$cvId",
              params: { cvId },
              search: (previous: Readonly<Record<string, unknown>>) => previous,
            }),
          onSubmitYes: () => {
            answered(detail.jobId);
            actions.recordApplied(detail.jobId, detail.applyCv, viewInTracker);
          },
          onSubmitNotYet: () => {
            answered(detail.jobId);
            toast.show({ variant: "info", message: intl.formatMessage(messages.notYetToast) });
          },
          onSubmitNotApplying: () => {
            answered(detail.jobId);
            toast.show({
              variant: "info",
              message: intl.formatMessage(messages.notApplyingToast, { company: detail.company.name }),
            });
          },
        }}
        match={{
          resolvedGaps: new Set(),
          onHaveThis: (gap: FactorVM) => gap.skill && actions.haveSkill(detail.jobId, gap.skill),
          onUndoHaveThis: () => undefined,
          onAddToCv: (cvId) =>
            void navigate({
              to: "/cvs/$cvId",
              params: { cvId },
              search: (previous: Readonly<Record<string, unknown>>) => previous,
            }),
          rescoringCv,
          onChangeCv: (cvId) => {
            const match = detail.match;
            if (match.state !== "ready" || cvId === match.basedOnCvId) return;
            const cv = match.cvOptions.find((option) => option.id === cvId);
            if (!cv) return;
            const jobId = detail.jobId;
            setRescoring((map) => new Map(map).set(jobId, cv));
            actions.changeCv(jobId, cvId, cv.title, () =>
              setRescoring((map) => {
                const next = new Map(map);
                next.delete(jobId);
                return next;
              }),
            );
          },
          feedback: feedback.get(detail.jobId) ?? null,
          onFeedback: (value) =>
            setFeedback((map) => {
              const next = new Map(map);
              if (value) next.set(detail.jobId, value);
              else next.delete(detail.jobId);
              return next;
            }),
        }}
      />
    ) : empty ? null : (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-title3">{ready.noSelection.title}</p>
        <p className="text-fg-secondary text-callout">{ready.noSelection.hint}</p>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tailoring takes the whole content area: the feed's search and filters step aside. */}
      {!tailorOpen && scopes}
      {!tailorOpen && header}
      {!tailorOpen && runBanner}
      <div className="border-line-subtle flex min-h-0 flex-1 border-t">
        {tailorOpen && detail && params.tailor ? (
          <TailorHost
            key={`tailor-${detail.jobId}-${params.tailor}`}
            jobId={detail.jobId}
            cvId={params.tailor}
            revisionId={params.rev ?? null}
            onClose={() => setSearchParams({ tailor: undefined, rev: undefined })}
          />
        ) : (
          <SplitView
            {...splitLabels}
            listPane={listPane}
            list={list}
            detail={detailView}
            detailOpen={detailOpen && detail !== null}
            onBack={() => {
              setDetailOpen(false);
              if (selectedId) requestAnimationFrame(() => nav.focusItem(selectedId));
            }}
          />
        )}
      </div>
      {dialogs}
    </div>
  );
}
