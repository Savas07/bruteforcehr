/**
 * Jobs: list + job detail split view (`/jobs`, `/jobs/$jobId`; research/job-detail.md and
 * job-feed-search.md "Decision — Desktop", states.md "Job detail"). Selection lives in the route
 * (`jobId`), the search in `?q=` and the scope in `?scope=saved|hidden` (sidebar children).
 * Actions have no backend in M0: save, Not for me, "I have this", CV change and AI feedback are
 * optimistic local state with the matching toast and Undo.
 */
import { layout } from "@bfhr/ui-tokens";
import { Briefcase, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { destinationMessages } from "../../lib/destinations";
import { openJobUrl } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useListNavigation } from "../../shared/ui/focus";
import { Keycaps } from "../../shared/ui/Keycaps";
import { useBreakpoints } from "../../shared/ui/layout";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SidebarChildItem, SidebarChildren } from "../../shared/ui/SidebarChildren";
import { JobDetailSkeleton, JobRowSkeleton, SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { SplitView } from "../../shared/ui/SplitView";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { useToast } from "../../shared/ui/Toast";
import { DetailPane } from "./DetailPane";
import { JobList, type HiddenPlaceholder } from "./JobList";
import {
  JOBS_SCOPES,
  SCOPE_MESSAGES,
  type DismissReasonVM,
  type FactorVM,
  type JobDetailModel,
  type JobListRowVM,
  type JobsScope,
} from "./model";

const messages = defineMessages({
  group: { id: "job-detail.view.keysGroup", defaultMessage: "Jobs", description: "Shortcuts-sheet group" },
  listLabel: { id: "job-detail.view.listLabel", defaultMessage: "Jobs" },
  detailLabel: { id: "job-detail.view.detailLabel", defaultMessage: "Job details" },
  backLabel: { id: "job-detail.view.backLabel", defaultMessage: "Back to Jobs" },
  scopesLabel: { id: "job-detail.view.scopesLabel", defaultMessage: "Job lists" },
  search: { id: "job-detail.view.search", defaultMessage: "Search jobs" },
  searchPlaceholder: { id: "job-detail.view.searchPlaceholder", defaultMessage: "Search by title, company or place" },
  focusSearch: { id: "job-detail.view.focusSearch", defaultMessage: "Search jobs" },
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
  why: { id: "job-detail.view.why", defaultMessage: "Why?" },
  hiddenToast: { id: "job-detail.view.hiddenToast", defaultMessage: "Hidden from your feed: {title}" },
  unhiddenToast: { id: "job-detail.view.unhiddenToast", defaultMessage: "Back in your feed: {title}" },
  companyHiddenToast: {
    id: "job-detail.view.companyHiddenToast",
    defaultMessage: "Hiding all jobs from {company}",
  },
  savedToast: { id: "job-detail.view.savedToast", defaultMessage: "Saved: {title}" },
  unsavedToast: { id: "job-detail.view.unsavedToast", defaultMessage: "Removed from Saved: {title}" },
  reasonsToast: {
    id: "job-detail.view.reasonsToast",
    defaultMessage: "Thanks. We'll use this to tune your matches.",
  },
  haveThisToast: {
    id: "job-detail.view.haveThisToast",
    defaultMessage: "Added to your profile: {skill}",
  },
  cvToast: { id: "job-detail.view.cvToast", defaultMessage: "Matching against “{cv}”" },
  linkCopied: { id: "job-detail.view.linkCopied", defaultMessage: "Link copied" },
  emailApply: {
    id: "job-detail.view.emailApply",
    defaultMessage: "Apply by email opens the Apply panel, which arrives in a later build.",
  },
  openFailed: {
    id: "job-detail.view.openFailed",
    defaultMessage: "We couldn't open the link. Copy it from the More menu instead.",
  },
  appliedToast: { id: "job-detail.view.appliedToast", defaultMessage: "Marked as applied: {company}" },
  notYetToast: { id: "job-detail.view.notYetToast", defaultMessage: "We'll ask again next time you open this job." },
  notApplyingToast: { id: "job-detail.view.notApplyingToast", defaultMessage: "Kept in Saved: {company}" },
});

/** Optimistic, per-session state of the screen's actions (no backend in M0). */
function useLocalState() {
  const [saved, setSaved] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [unhidden, setUnhidden] = useState<ReadonlySet<string>>(new Set());
  const [placeholder, setPlaceholder] = useState<HiddenPlaceholder | null>(null);
  const [gaps, setGaps] = useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
  const [feedback, setFeedback] = useState<ReadonlyMap<string, "up" | "down">>(new Map());
  const [rescoring, setRescoring] = useState<ReadonlyMap<string, { id: string; title: string }>>(new Map());
  const [askSubmit, setAskSubmit] = useState<ReadonlySet<string>>(new Set());
  const [answeredSubmit, setAnsweredSubmit] = useState<ReadonlySet<string>>(new Set());
  return {
    saved,
    setSaved,
    hidden,
    setHidden,
    unhidden,
    setUnhidden,
    placeholder,
    setPlaceholder,
    gaps,
    setGaps,
    feedback,
    setFeedback,
    rescoring,
    setRescoring,
    askSubmit,
    setAskSubmit,
    answeredSubmit,
    setAnsweredSubmit,
  };
}

function withKey<K, V>(map: ReadonlyMap<K, V>, key: K, value: V | undefined): ReadonlyMap<K, V> {
  const next = new Map(map);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return next;
}

function toggled<T>(set: ReadonlySet<T>, item: T, on: boolean): ReadonlySet<T> {
  const next = new Set(set);
  if (on) next.add(item);
  else next.delete(item);
  return next;
}

export default function JobDetailScreen({ model, params }: ScreenProps<JobDetailModel>) {
  const intl = useIntl();
  const navigate = useNavigate();
  const toast = useToast();
  const { narrow, wide } = useBreakpoints();
  const offline = useConnectivity().status === "offline";
  const local = useLocalState();
  const [detailOpen, setDetailOpen] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [query, setQuery] = useState(params.q ?? "");
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const data = model.status === "ready" ? model.data : null;
  const group = intl.formatMessage(messages.group);

  const isHidden = (jobId: string, fromModel: boolean) =>
    (fromModel || local.hidden.has(jobId)) && !local.unhidden.has(jobId);
  // Hidden jobs: rows unhidden this session leave; elsewhere rows hidden this session leave.
  const rows: readonly JobListRowVM[] = (data?.list.rows ?? []).filter((row) =>
    data?.scope === "hidden" ? !local.unhidden.has(row.jobId) : !isHidden(row.jobId, false),
  );
  const savedOf = (row: { jobId: string; saved: boolean }) => local.saved.get(row.jobId) ?? row.saved;
  const detail = data?.detail ?? null;
  const selectedId = data?.selectedJobId ?? null;
  const visibleIds = rows.map((row) => row.jobId);

  const select = (jobId: string) =>
    void navigate({
      to: "/jobs/$jobId",
      params: { jobId },
      search: (previous: Readonly<Record<string, unknown>>) => previous,
      replace: true,
    });
  const neighbour = (jobId: string, without: ReadonlySet<string>) => {
    const index = visibleIds.indexOf(jobId);
    const rest = visibleIds.filter((id) => !without.has(id));
    return rest.find((id) => visibleIds.indexOf(id) > index) ?? rest.findLast((id) => visibleIds.indexOf(id) < index);
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
    enabled: data !== null,
  });

  const setSearch = (value: string) => {
    setQuery(value);
    void navigate({
      to: "/jobs",
      search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, q: value === "" ? undefined : value }),
      replace: true,
    });
  };
  const setScope = (scope: JobsScope) =>
    void navigate({
      to: "/jobs",
      search: (previous: Readonly<Record<string, unknown>>) => ({
        ...previous,
        scope: scope === "all" ? undefined : scope,
      }),
    });

  const openUrl = (url: string) =>
    void openJobUrl(url).catch(() => toast.show({ variant: "info", message: intl.formatMessage(messages.openFailed) }));

  const toggleSave = (row: { jobId: string; saved: boolean; title: string }) => {
    const before = local.saved.get(row.jobId);
    const next = !savedOf(row);
    local.setSaved((map) => withKey(map, row.jobId, next));
    toast.show({
      message: intl.formatMessage(next ? messages.savedToast : messages.unsavedToast, { title: row.title }),
      action: {
        label: data?.copy.undo ?? "",
        run: () => local.setSaved((map) => withKey(map, row.jobId, before)),
      },
    });
  };

  const undoHide = (jobIds: readonly string[], reselect: string | null) => {
    local.setHidden((set) => {
      const next = new Set(set);
      for (const id of jobIds) next.delete(id);
      return next;
    });
    local.setPlaceholder((current) => (current && jobIds.includes(current.jobId) ? null : current));
    setReasonsOpen(false);
    if (reselect) select(reselect);
  };

  const hide = (row: { jobId: string; title: string }, withReason: boolean) => {
    const jobIds = [row.jobId];
    const index = visibleIds.indexOf(row.jobId);
    local.setHidden((set) => toggled(set, row.jobId, true));
    local.setUnhidden((set) => toggled(set, row.jobId, false));
    if (index >= 0) local.setPlaceholder({ jobId: row.jobId, index });
    setReasonsOpen(withReason && index >= 0);
    if (selectedId === row.jobId) {
      const next = neighbour(row.jobId, new Set(jobIds));
      if (next) select(next);
      if (narrow) setDetailOpen(false);
    }
    toast.show({
      message: intl.formatMessage(messages.hiddenToast, { title: row.title }),
      action: { label: data?.copy.undo ?? "", run: () => undoHide(jobIds, row.jobId) },
      // D19: "Hidden from your feed · Undo · Why?"; Why? opens the optional reason popover.
      ...(index >= 0 && {
        secondaryAction: { label: intl.formatMessage(messages.why), run: () => setReasonsOpen(true) },
      }),
    });
  };

  const hideCompany = (company: string) => {
    const jobIds = rows.filter((row) => row.company.name === company).map((row) => row.jobId);
    const ids = new Set(jobIds);
    local.setHidden((set) => new Set([...set, ...jobIds]));
    local.setPlaceholder(null);
    if (selectedId !== null && ids.has(selectedId)) {
      const next = neighbour(selectedId, ids);
      if (next) select(next);
    }
    toast.show({
      message: intl.formatMessage(messages.companyHiddenToast, { company }),
      extended: jobIds.length > 1,
      action: { label: data?.copy.undo ?? "", run: () => undoHide(jobIds, selectedId) },
    });
  };

  const unhide = (row: { jobId: string; title: string }) => {
    local.setUnhidden((set) => toggled(set, row.jobId, true));
    local.setHidden((set) => toggled(set, row.jobId, false));
    toast.show({
      message: intl.formatMessage(messages.unhiddenToast, { title: row.title }),
      action: {
        label: data?.copy.undo ?? "",
        run: () => local.setUnhidden((set) => toggled(set, row.jobId, false)),
      },
    });
  };

  const saveReasons = (keys: readonly DismissReasonVM["key"][]) => {
    if (keys.length > 0) toast.show({ variant: "info", message: intl.formatMessage(messages.reasonsToast) });
  };

  const detailHidden = detail ? isHidden(detail.jobId, detail.hidden) : false;

  const apply = () => {
    if (!detail || detail.applied || offline) return;
    if (!detail.apply.external) {
      toast.show({ variant: "info", message: intl.formatMessage(messages.emailApply) });
      return;
    }
    openUrl(detail.apply.target);
    local.setAskSubmit((set) => toggled(set, detail.jobId, true));
    local.setAnsweredSubmit((set) => toggled(set, detail.jobId, false));
  };

  const answerSubmit = (message: string, undoable: boolean) => {
    if (!detail) return;
    const jobId = detail.jobId;
    local.setAnsweredSubmit((set) => toggled(set, jobId, true));
    toast.show({
      variant: undoable ? "undo" : "info",
      message,
      ...(undoable && {
        action: {
          label: data?.copy.undo ?? "",
          run: () => local.setAnsweredSubmit((set) => toggled(set, jobId, false)),
        },
      }),
    });
  };

  useKeyBindings([
    {
      id: "jobs.save",
      keys: "S",
      label: intl.formatMessage(messages.keySave),
      group,
      enabled: detail !== null,
      run: () => detail && toggleSave({ ...detail, saved: detail.saved }),
    },
    {
      id: "jobs.notForMe",
      keys: ["D", "Backspace"],
      label: intl.formatMessage(messages.keyNotForMe),
      group,
      enabled: detail !== null && !detailHidden,
      run: () => detail && hide(detail, false),
    },
    {
      id: "jobs.notForMeReason",
      keys: "Shift+D",
      label: intl.formatMessage(messages.keyNotForMeReason),
      group,
      enabled: detail !== null && !detailHidden,
      run: () => detail && hide(detail, true),
    },
    {
      id: "jobs.apply",
      keys: "A",
      label: intl.formatMessage(messages.keyApply),
      group,
      enabled: detail !== null && detail.applied === null && !offline,
      run: apply,
    },
    {
      id: "jobs.open",
      keys: "O",
      label: intl.formatMessage(messages.keyOpen),
      group,
      enabled: detail !== null,
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
  ]);


  // Rendered in every state so the sidebar doesn't jump while the list loads or fails.
  const currentScope = data?.scope ?? JOBS_SCOPES.find((scope) => scope === params.scope) ?? "all";
  const scopeTitle =
    currentScope === "all"
      ? intl.formatMessage(destinationMessages.jobs)
      : intl.formatMessage(SCOPE_MESSAGES[currentScope]);

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 px-6 pt-4 pb-3">
      <ScreenTitle
        title={scopeTitle}
        documentTitle={detail ? `${detail.title} · ${detail.company.name}` : scopeTitle}
      />
      <label className="relative flex w-full max-w-96 items-center">
        <span className="sr-only">{intl.formatMessage(messages.search)}</span>
        <Search aria-hidden="true" className="text-fg-tertiary pointer-events-none absolute left-2.5 size-4" strokeWidth={1.75} />
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
          className="bg-surface-base border-line-control text-body placeholder:text-fg-tertiary h-8 w-full rounded-md border pr-9 pl-8 outline-offset-0 focus-visible:outline-2 disabled:opacity-60"
        />
        <span className="pointer-events-none absolute right-2" aria-hidden="true">
          <Keycaps keys="/" />
        </span>
      </label>
    </header>
  );

  const scopes = (
    <SidebarChildren destination="jobs" label={intl.formatMessage(messages.scopesLabel)}>
      {JOBS_SCOPES.map((scope) => (
        <SidebarChildItem key={scope} current={scope === currentScope} onSelect={() => setScope(scope)}>
          {intl.formatMessage(SCOPE_MESSAGES[scope])}
        </SidebarChildItem>
      ))}
    </SidebarChildren>
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
  const stamp = model.fromCache && <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />;

  if (ready.list.empty?.kind === "firstUse")
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {scopes}
        {header}
        <EmptyState
          kind="firstUse"
          glyph={Briefcase}
          title={ready.list.empty.title}
          body={ready.list.empty.body}
          className="flex-1 justify-center"
          {...(ready.list.empty.action && {
            primary: { label: ready.list.empty.action, onClick: () => searchRef.current?.focus(), keys: "/" },
          })}
        />
      </div>
    );

  const empty = ready.list.empty;
  const list = empty ? (
    <div className="px-5 pt-6">
      <EmptyState
        kind={empty.kind}
        title={empty.title}
        body={empty.body}
        {...(empty.action && { primary: { label: empty.action, onClick: () => setSearch("") } })}
      />
    </div>
  ) : (
    <JobList
      model={ready}
      rows={rows}
      savedOf={savedOf}
      selectedId={selectedId}
      placeholder={local.placeholder}
      listRef={listRef}
      nav={nav}
      reasonsOpen={reasonsOpen}
      onReasonsOpenChange={setReasonsOpen}
      onSaveReasons={saveReasons}
      onSelect={(jobId) => {
        select(jobId);
        if (narrow) setDetailOpen(true);
      }}
      onToggleSave={toggleSave}
      onNotForMe={(row) => hide(row, false)}
      onOpenOriginal={(row) => openUrl(row.originalUrl)}
      stamp={stamp}
    />
  );

  const position = detail ? visibleIds.indexOf(detail.jobId) : -1;
  const detailView = detail ? (
    <DetailPane
      key={detail.jobId}
      detail={detail}
      copy={ready.copy}
      position={position >= 0 ? position + 1 : null}
      total={visibleIds.length}
      saved={savedOf(detail)}
      hidden={detailHidden}
      showSubmitPrompt={
        (detail.submitPrompt !== null || local.askSubmit.has(detail.jobId)) && !local.answeredSubmit.has(detail.jobId)
      }
      actions={{
        onPrevious: () => detail.previousJobId && select(detail.previousJobId),
        onNext: () => detail.nextJobId && select(detail.nextJobId),
        onApply: apply,
        onToggleSave: () => toggleSave({ ...detail, saved: detail.saved }),
        onNotForMe: () => hide(detail, false),
        onNotForMeWithReason: () => hide(detail, true),
        onUnhide: () => unhide(detail),
        onHideCompany: () => hideCompany(detail.company.name),
        onCopyLink: () =>
          void navigator.clipboard
            .writeText(detail.originalUrl)
            .then(() => toast.show({ variant: "info", message: intl.formatMessage(messages.linkCopied) })),
        onOpenUrl: openUrl,
        onViewInTracker: (applicationId) =>
          void navigate({ to: "/tracker", search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, applicationId }) }),
        onOpenCv: (cvId) =>
          void navigate({ to: "/cvs/$cvId", params: { cvId }, search: (previous: Readonly<Record<string, unknown>>) => previous }),
        onSubmitYes: () =>
          answerSubmit(intl.formatMessage(messages.appliedToast, { company: detail.company.name }), true),
        onSubmitNotYet: () => answerSubmit(intl.formatMessage(messages.notYetToast), false),
        onSubmitNotApplying: () =>
          answerSubmit(intl.formatMessage(messages.notApplyingToast, { company: detail.company.name }), true),
      }}
      match={{
        resolvedGaps: local.gaps.get(detail.jobId) ?? new Set(),
        onHaveThis: (gap: FactorVM) => {
          local.setGaps((map) => withKey(map, detail.jobId, toggled(map.get(detail.jobId) ?? new Set(), gap.text, true)));
          toast.show({
            message: intl.formatMessage(messages.haveThisToast, { skill: gap.text }),
            action: {
              label: ready.copy.undo,
              run: () =>
                local.setGaps((map) =>
                  withKey(map, detail.jobId, toggled(map.get(detail.jobId) ?? new Set(), gap.text, false)),
                ),
            },
          });
        },
        onUndoHaveThis: (gap: FactorVM) =>
          local.setGaps((map) =>
            withKey(map, detail.jobId, toggled(map.get(detail.jobId) ?? new Set(), gap.text, false)),
          ),
        onAddToCv: (cvId) =>
          void navigate({ to: "/cvs/$cvId", params: { cvId }, search: (previous: Readonly<Record<string, unknown>>) => previous }),
        rescoringCv: local.rescoring.get(detail.jobId) ?? null,
        onChangeCv: (cvId) => {
          const match = detail.match;
          if (match.state !== "ready") return;
          const cv = match.cvOptions.find((option) => option.id === cvId);
          const before = local.rescoring.get(detail.jobId);
          local.setRescoring((map) => withKey(map, detail.jobId, cvId === match.basedOnCvId ? undefined : cv));
          if (cv && cvId !== match.basedOnCvId)
            toast.show({
              message: intl.formatMessage(messages.cvToast, { cv: cv.title }),
              action: {
                label: ready.copy.undo,
                run: () => local.setRescoring((map) => withKey(map, detail.jobId, before)),
              },
            });
        },
        feedback: local.feedback.get(detail.jobId) ?? null,
        onFeedback: (value) => local.setFeedback((map) => withKey(map, detail.jobId, value ?? undefined)),
      }}
    />
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-title3">{ready.noSelection.title}</p>
      <p className="text-fg-secondary text-callout">{ready.noSelection.hint}</p>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {scopes}
      {header}
      <div className="border-line-subtle flex min-h-0 flex-1 border-t">
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
      </div>
    </div>
  );
}
