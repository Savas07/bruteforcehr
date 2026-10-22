/**
 * Today (desktop): what needs attention, in one fixed order (today-home.md "Decision — Desktop",
 * IA.md "Per-section layouts"). Center column of sections; the selected item's detail pane from
 * 1200 px (inline under its row below that); the read-only 7-day agenda rail from 1440 px. The
 * header is the title, the date and the Open / Later filter: no greeting (U8), no badges, no
 * streaks. Every action is optimistic with an Undo toast; automatic changes keep their own Undo.
 */
import { useNavigate } from "@tanstack/react-router";
import { AlarmClock, Check, ExternalLink, Inbox, Mail, MailX, PencilLine, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { ROUTE_TITLE_ID } from "../../components/RouteContainer";
import { openExternal } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useListNavigation } from "../../shared/ui/focus";
import { useBreakpoints } from "../../shared/ui/layout";
import { MenuItem } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import {
  AttentionRowSkeleton,
  SkeletonRegion,
  SkeletonText,
  useSkeletonGate,
} from "../../shared/ui/Skeleton";
import { SplitView } from "../../shared/ui/SplitView";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { AgendaRail, AgendaRailSkeleton } from "./AgendaRail";
import { AttentionList, type DoneEntry, type ListSection } from "./AttentionList";
import { DETAIL_MESSAGES, ItemDetail, type TodayLinks } from "./ItemDetail";
import type { AttentionItemVM, TodayModel } from "./model";
import { SnoozeDateDialog } from "./SnoozeDateDialog";
import { type SnoozeUntil, useTodayActions } from "./useTodayActions";

const messages = defineMessages({
  title: {
    id: "today.screen.title",
    defaultMessage: "Today",
    description: "Screen title while loading or failed",
  },
  show: {
    id: "today.screen.show",
    defaultMessage: "Show",
    description: "Accessible name of the Open / Later filter",
  },
  open: {
    id: "today.screen.open",
    defaultMessage: "Open",
    description: "Filter: items that need attention now",
  },
  later: { id: "today.screen.later", defaultMessage: "Later", description: "Filter: snoozed items" },
  snoozedSection: {
    id: "today.screen.snoozedSection",
    defaultMessage: "Snoozed",
    description: "Section title in the Later view",
  },
  laterEmpty: {
    id: "today.screen.laterEmpty",
    defaultMessage: "Nothing snoozed. Items you snooze wait here until their time comes.",
  },
  caughtUp: {
    id: "today.screen.caughtUp",
    defaultMessage: "You're all caught up. New updates will show up here.",
    description: "Shown when the user handled everything on Today",
  },
  until: {
    id: "today.screen.until",
    defaultMessage:
      "{preset, select, laterToday {Until later today} tomorrow {Until tomorrow} nextWeek {Until next week} other {Until {date, date, medium}}}",
    description: "Row meta in the Later view",
  },
  details: {
    id: "today.screen.details",
    defaultMessage: "Details",
    description: "Accessible name of the detail pane",
  },
  selectItem: {
    id: "today.screen.selectItem",
    defaultMessage: "Select an item to see the details.",
  },
  backToToday: { id: "today.screen.backToToday", defaultMessage: "Back to Today" },
  loading: { id: "today.screen.loading", defaultMessage: "Loading Today" },
  errorTitle: { id: "today.screen.errorTitle", defaultMessage: "We couldn't load Today" },
  errorBody: {
    id: "today.screen.errorBody",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  // Shortcut-sheet labels (Today group).
  keyOpen: { id: "today.key.open", defaultMessage: "Open details", description: "Shortcut label (Enter)" },
  keyBack: { id: "today.key.back", defaultMessage: "Back to the list", description: "Shortcut label (Esc)" },
  keyConfirm: {
    id: "today.key.confirm",
    defaultMessage: "Confirm review item",
    description: "Shortcut label (C)",
  },
  keyChange: {
    id: "today.key.change",
    defaultMessage: "Change what we found",
    description: "Shortcut label (M)",
  },
  keyNotJobMail: {
    id: "today.key.notJobMail",
    defaultMessage: "Not job mail",
    description: "Shortcut label (N)",
  },
  keyDone: { id: "today.key.done", defaultMessage: "Done / mark as seen", description: "Shortcut label (E)" },
  keySnooze: { id: "today.key.snooze", defaultMessage: "Snooze", description: "Shortcut label (H)" },
  keyDismiss: {
    id: "today.key.dismiss",
    defaultMessage: "Not needed / Not for me",
    description: "Shortcut label (D)",
  },
  keySave: { id: "today.key.save", defaultMessage: "Save or unsave job", description: "Shortcut label (S)" },
  keySource: {
    id: "today.key.source",
    defaultMessage: "Open source (email or job)",
    description: "Shortcut label (O)",
  },
  // Context menu.
  confirm: { id: "today.menu.confirm", defaultMessage: "Confirm", description: "Context menu item" },
  change: {
    id: "today.menu.change",
    defaultMessage: "Change…",
    description: "Context menu item: opens it in Mail",
  },
  notJobMail: {
    id: "today.menu.notJobMail",
    defaultMessage: "Not job mail",
    description: "Context menu item",
  },
  reviewLater: {
    id: "today.menu.reviewLater",
    defaultMessage: "Review later",
    description: "Context menu item",
  },
  undo: {
    id: "today.menu.undo",
    defaultMessage: "Undo this change",
    description: "Context menu item on an automatic change",
  },
  viewSource: {
    id: "today.menu.viewSource",
    defaultMessage: "View source email",
    description: "Context menu item",
  },
  snoozeTomorrow: {
    id: "today.menu.snoozeTomorrow",
    defaultMessage: "Snooze until tomorrow",
    description: "Context menu item",
  },
  unsave: { id: "today.menu.unsave", defaultMessage: "Remove from saved", description: "Context menu item" },
});

type View = "open" | "later";
/** `focusAfter` value meaning "the list is empty now: focus the title". */
const TITLE_FOCUS = "";

export default function TodayScreen({ model }: ScreenProps<TodayModel>) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { detail: split, wide } = useBreakpoints();
  const offline = useConnectivity().status === "offline";
  const ready = model.status === "ready" ? model.data : null;

  const [view, setView] = useState<View>("open");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [dateFor, setDateFor] = useState<AttentionItemVM | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const visibleIds = useRef<readonly string[]>([]);
  const focusAfter = useRef<string | null>(null);

  const actions = useTodayActions({
    beforeRemove: (item) => {
      const ids = visibleIds.current;
      const index = ids.indexOf(item.id);
      const next = ids[index + 1] ?? ids[index - 1] ?? null;
      setPickedId(next);
      setSnoozeOpen(false);
      setExpandedId(null);
      // Focus follows to the neighbour (also from menus and dialogs, which close onto their
      // trigger); with nothing left, to the screen title.
      focusAfter.current = next ?? TITLE_FOCUS;
    },
    reveal: (id) => {
      setView("open");
      setPickedId(id);
      focusAfter.current = id;
    },
  });

  const handled = new Set([...actions.state.done, ...actions.state.later].map((entry) => entry.item.id));
  const laterById = new Map(actions.state.later.map((entry) => [entry.item.id, entry.until]));
  const links: TodayLinks = {
    application: (applicationId) => void navigate({ to: "/tracker", search: { applicationId } }),
    job: (jobId) => void navigate({ to: "/jobs/$jobId", params: { jobId } }),
    mail: (messageId) => void navigate({ to: "/mail/review/$messageId", params: { messageId } }),
    cv: (cvId) => void navigate({ to: "/cvs/$cvId", params: { cvId } }),
  };

  const sections: ListSection[] = !ready
    ? []
    : view === "open"
      ? ready.sections
          .map((section): ListSection => {
            const items = section.items.filter((item) => !handled.has(item.id));
            const reviews = items.filter((item) => item.kind === "review").length;
            return {
              id: section.id,
              title: section.title,
              items,
              count: section.id === "toReview" && reviews > 0 ? reviews : null,
              footer: section.seeAllLabel
                ? { label: section.seeAllLabel, run: () => void navigate({ to: "/jobs" }) }
                : null,
            };
          })
          .filter((section) => section.items.length > 0)
      : actions.state.later.length > 0
        ? [
            {
              id: "later",
              title: intl.formatMessage(messages.snoozedSection),
              items: actions.state.later.map((entry) => entry.item),
              count: null,
              footer: null,
            },
          ]
        : [];
  const items = sections.flatMap((section) => section.items);
  const ids = items.map((item) => item.id);
  useEffect(() => {
    visibleIds.current = ids;
  });
  const selectedId =
    pickedId !== null && ids.includes(pickedId)
      ? pickedId
      : ready?.selectedId && ids.includes(ready.selectedId)
        ? ready.selectedId
        : (ids[0] ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const savedOf = (item: AttentionItemVM) =>
    item.kind === "match" && (actions.state.saved[item.id] ?? item.saved);
  const group = intl.formatMessage(messages.title);

  const nav = useListNavigation({
    containerRef: listRef,
    ids,
    activeId: selectedId,
    onActivate: (id) => {
      setPickedId(id);
      setSnoozeOpen(false);
    },
    group,
  });

  useEffect(() => {
    const id = focusAfter.current;
    if (id === null) return;
    focusAfter.current = null;
    // After the frame: a closing menu (Radix) returns focus to its trigger first.
    requestAnimationFrame(() => {
      if (id === TITLE_FOCUS) document.getElementById(ROUTE_TITLE_ID)?.focus();
      else nav.focusItem(id);
    });
  });

  const untilLabel = (until: SnoozeUntil) =>
    intl.formatMessage(messages.until, {
      preset: until.preset,
      date: until.preset === "pickDate" ? until.date : null,
    });

  const openSource = (item: AttentionItemVM) => {
    switch (item.kind) {
      case "interview":
        return links.application(item.applicationId);
      case "review":
        return links.mail(item.proposal.messageId);
      case "autoUpdate":
        return item.change.mailMessageId
          ? links.mail(item.change.mailMessageId)
          : links.application(item.change.applicationId);
      case "followUp":
        return links.application(item.nudge.applicationId);
      case "deadline":
        if (item.applicationId) return links.application(item.applicationId);
        if (item.jobId) return links.job(item.jobId);
        return undefined;
      case "match":
        return links.job(item.jobId);
    }
  };

  const draftFollowUp = (item: Extract<AttentionItemVM, { kind: "followUp" }>) =>
    item.jobId ? links.job(item.jobId) : links.application(item.nudge.applicationId);

  const openSnooze = (item: AttentionItemVM) => {
    if (item.kind === "review") return actions.snooze(item, { preset: "tomorrow" });
    if (item.kind === "interview" || item.kind === "autoUpdate") return undefined;
    if (!split) setExpandedId(item.id);
    setSnoozeOpen(true);
    return undefined;
  };

  const kind = selected?.kind;
  useKeyBindings([
    {
      id: "today.open",
      keys: "Enter",
      label: intl.formatMessage(messages.keyOpen),
      group,
      enabled: selectedId !== null,
      when: (event) => event.target instanceof HTMLElement && event.target.dataset.navId !== undefined,
      run: () => {
        if (split) detailRef.current?.focus();
        else setExpandedId((current) => (current === selectedId ? null : selectedId));
      },
    },
    {
      id: "today.back",
      keys: "Escape",
      label: intl.formatMessage(messages.keyBack),
      group,
      enabled: selectedId !== null && (split || expandedId !== null),
      when: (event) =>
        !split || (event.target instanceof Node && detailRef.current?.contains(event.target) === true),
      run: () => {
        setExpandedId(null);
        if (selectedId) nav.focusItem(selectedId);
      },
    },
    {
      id: "today.confirm",
      keys: "C",
      label: intl.formatMessage(messages.keyConfirm),
      group,
      enabled: kind === "review",
      run: () => {
        if (selected?.kind === "review") actions.confirm(selected);
      },
    },
    {
      id: "today.change",
      keys: "M",
      label: intl.formatMessage(messages.keyChange),
      group,
      enabled: kind === "review",
      run: () => {
        if (selected?.kind === "review") links.mail(selected.proposal.messageId);
      },
    },
    {
      id: "today.notJobMail",
      keys: "N",
      label: intl.formatMessage(messages.keyNotJobMail),
      group,
      enabled: kind === "review",
      run: () => {
        if (selected?.kind === "review") actions.notJobMail(selected);
      },
    },
    {
      id: "today.done",
      keys: "E",
      label: intl.formatMessage(messages.keyDone),
      group,
      enabled: kind === "autoUpdate" || kind === "deadline",
      run: () => {
        if (selected?.kind === "autoUpdate") actions.acknowledge(selected);
        else if (selected?.kind === "deadline") actions.markDone(selected);
      },
    },
    {
      id: "today.snooze",
      keys: "H",
      label: intl.formatMessage(messages.keySnooze),
      group,
      enabled: kind !== undefined && kind !== "interview" && kind !== "autoUpdate",
      run: () => {
        if (selected) openSnooze(selected);
      },
    },
    {
      id: "today.dismiss",
      keys: "D",
      label: intl.formatMessage(messages.keyDismiss),
      group,
      enabled: kind === "followUp" || kind === "match",
      run: () => {
        if (selected?.kind === "followUp") actions.declineNudge(selected);
        else if (selected?.kind === "match") actions.notForMe(selected);
      },
    },
    {
      id: "today.save",
      keys: "S",
      label: intl.formatMessage(messages.keySave),
      group,
      enabled: kind === "match",
      run: () => {
        if (selected?.kind === "match") actions.toggleSave(selected);
      },
    },
    {
      id: "today.source",
      keys: "O",
      label: intl.formatMessage(messages.keySource),
      group,
      enabled: selected !== null,
      run: () => {
        if (selected) openSource(selected);
      },
    },
  ]);

  const menuFor = (item: AttentionItemVM) => {
    const tomorrow = (
      <MenuItem icon={AlarmClock} onSelect={() => actions.snooze(item, { preset: "tomorrow" })}>
        {intl.formatMessage(messages.snoozeTomorrow)}
      </MenuItem>
    );
    const source = (label: string) => (
      <MenuItem icon={ExternalLink} shortcut="O" onSelect={() => openSource(item)}>
        {label}
      </MenuItem>
    );
    switch (item.kind) {
      case "interview":
        return source(intl.formatMessage(DETAIL_MESSAGES.openApplication));
      case "review":
        return (
          <>
            <MenuItem icon={Check} shortcut="C" onSelect={() => actions.confirm(item)}>
              {intl.formatMessage(messages.confirm)}
            </MenuItem>
            <MenuItem icon={PencilLine} shortcut="M" onSelect={() => links.mail(item.proposal.messageId)}>
              {intl.formatMessage(messages.change)}
            </MenuItem>
            <MenuItem icon={MailX} shortcut="N" onSelect={() => actions.notJobMail(item)}>
              {intl.formatMessage(messages.notJobMail)}
            </MenuItem>
            <MenuItem
              icon={AlarmClock}
              shortcut="H"
              onSelect={() => actions.snooze(item, { preset: "tomorrow" })}
            >
              {intl.formatMessage(messages.reviewLater)}
            </MenuItem>
            {source(intl.formatMessage(DETAIL_MESSAGES.openInMail))}
          </>
        );
      case "autoUpdate":
        return (
          <>
            <MenuItem
              icon={Undo2}
              disabledReason={item.change.undo.available ? null : item.change.undo.reason}
              onSelect={() => actions.undoAutoChange(item)}
            >
              {intl.formatMessage(messages.undo)}
            </MenuItem>
            <MenuItem icon={Check} shortcut="E" onSelect={() => actions.acknowledge(item)}>
              {intl.formatMessage(DETAIL_MESSAGES.markSeen)}
            </MenuItem>
            {item.change.mailMessageId && source(intl.formatMessage(messages.viewSource))}
          </>
        );
      case "followUp":
        return (
          <>
            <MenuItem
              onSelect={() =>
                item.nudge.kind === "noResponse" ? actions.markNoResponse(item) : draftFollowUp(item)
              }
            >
              {item.nudge.primaryLabel}
            </MenuItem>
            <MenuItem icon={X} shortcut="D" onSelect={() => actions.declineNudge(item)}>
              {item.nudge.secondaryLabel}
            </MenuItem>
            {tomorrow}
            {source(intl.formatMessage(DETAIL_MESSAGES.openApplication))}
          </>
        );
      case "deadline":
        return (
          <>
            <MenuItem icon={Check} shortcut="E" onSelect={() => actions.markDone(item)}>
              {intl.formatMessage(DETAIL_MESSAGES.markDone)}
            </MenuItem>
            {tomorrow}
            {item.applicationId
              ? source(intl.formatMessage(DETAIL_MESSAGES.openApplication))
              : item.jobId && source(intl.formatMessage(DETAIL_MESSAGES.openJob))}
          </>
        );
      case "match":
        return (
          <>
            {source(intl.formatMessage(DETAIL_MESSAGES.openInJobs))}
            <MenuItem shortcut="S" onSelect={() => actions.toggleSave(item)}>
              {intl.formatMessage(savedOf(item) ? messages.unsave : DETAIL_MESSAGES.save)}
            </MenuItem>
            <MenuItem icon={X} shortcut="D" onSelect={() => actions.notForMe(item)}>
              {intl.formatMessage(DETAIL_MESSAGES.notForMe)}
            </MenuItem>
            {tomorrow}
          </>
        );
    }
  };

  const renderDetail = (item: AttentionItemVM, headingLevel: 2 | 3) => (
    <ItemDetail
      item={item}
      actions={actions}
      links={links}
      onJoin={(url) => void openExternal(url)}
      onDraftFollowUp={draftFollowUp}
      onPickDate={(target) => {
        setSnoozeOpen(false);
        setDateFor(target);
      }}
      snoozeOpen={snoozeOpen && item.id === selectedId}
      onSnoozeOpenChange={setSnoozeOpen}
      saved={savedOf(item)}
      snoozedUntil={laterById.get(item.id) ?? null}
      offline={offline}
      headingLevel={headingLevel}
    />
  );

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-7 pt-7 pb-5">
      <div className="min-w-0">
        <ScreenTitle title={ready?.title ?? intl.formatMessage(messages.title)} />
        {ready ? (
          <p className="text-callout text-fg-secondary mt-1 flex flex-wrap gap-x-1.5">
            <span>{ready.dateLabel}</span>
            {model.status === "ready" && model.fromCache && (
              <>
                <span aria-hidden="true">·</span>
                <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />
              </>
            )}
          </p>
        ) : (
          model.status === "loading" && <SkeletonText lines={1} widths={[60]} className="mt-2 w-48" />
        )}
      </div>
      {/* Open / Later only once there is something to snooze (first run stays one calm card). */}
      {ready && (ready.items.length > 0 || actions.state.later.length > 0) && (
        <SegmentedControl
          size="sm"
          label={intl.formatMessage(messages.show)}
          value={view}
          onValueChange={(next) => {
            setView(next);
            setPickedId(null);
            setExpandedId(null);
          }}
          options={[
            { value: "open", label: intl.formatMessage(messages.open) },
            { value: "later", label: intl.formatMessage(messages.later) },
          ]}
        />
      )}
    </header>
  );

  let empty = null;
  if (ready && view === "later")
    empty = <EmptyState kind="subArea" body={intl.formatMessage(messages.laterEmpty)} className="px-3" />;
  else if (ready?.firstUse?.connectMail) {
    const { connectMail, findJobs } = ready.firstUse;
    empty = (
      <EmptyState
        kind="firstUse"
        glyph={Mail}
        title={connectMail.message}
        body={connectMail.estimate}
        primary={{ label: connectMail.actionLabel, onClick: () => void navigate({ to: "/mail" }) }}
        {...(findJobs && {
          secondary: { label: findJobs.actionLabel, onClick: () => void navigate({ to: "/jobs" }) },
        })}
      />
    );
  } else if (ready)
    empty = (
      <EmptyState
        kind="caughtUp"
        glyph={Inbox}
        body={ready.caughtUp?.message ?? intl.formatMessage(messages.caughtUp)}
      />
    );

  let content;
  if (model.status === "loading")
    content = (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loading)}
        skeleton={
          <div className="flex flex-col gap-7 px-4">
            {[3, 2].map((rows, index) => (
              <div key={index} className="flex flex-col gap-1">
                <SkeletonText lines={1} widths={[25]} className="px-3 pb-1" />
                {Array.from({ length: rows }, (_, row) => (
                  <AttentionRowSkeleton key={row} />
                ))}
              </div>
            ))}
          </div>
        }
      >
        {null}
      </SkeletonRegion>
    );
  else if (model.status === "error")
    content = (
      <div className="px-7">
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
        />
      </div>
    );
  else if (ready) {
    const done: DoneEntry[] =
      view === "open"
        ? [
            ...actions.state.done.map((entry): DoneEntry => ({ from: "local", entry })),
            ...(ready.doneToday?.items ?? []).map((item): DoneEntry => ({ from: "data", item })),
          ]
        : [];
    content = (
      <AttentionList
        sections={sections}
        containerRef={listRef}
        nav={nav}
        selectedId={selectedId}
        expandedId={split ? null : expandedId}
        inline={!split}
        renderDetail={(item) => renderDetail(item, 3)}
        onRowClick={(id) => {
          setPickedId(id);
          setSnoozeOpen(false);
          if (!split) setExpandedId((current) => (current === id ? null : id));
        }}
        menuFor={menuFor}
        {...(view === "later" && {
          metaFor: (item: AttentionItemVM) => {
            const until = laterById.get(item.id);
            return until ? untilLabel(until) : null;
          },
        })}
        onJoin={(url) => void openExternal(url)}
        done={done}
        empty={empty}
      />
    );
  }

  const rail =
    model.status === "loading" ? (
      <AgendaRailSkeleton />
    ) : ready ? (
      <AgendaRail
        agenda={ready.agenda}
        selectedId={selectedId}
        onSelect={(id) => {
          setView("open");
          setPickedId(id);
          focusAfter.current = id;
        }}
        onOpenApplication={links.application}
      />
    ) : null;
  const railLabel = ready?.agenda.title ?? intl.formatMessage(messages.loading);

  const dateDialog = dateFor && (
    <SnoozeDateDialog
      company={dateFor.company.name}
      open
      onOpenChange={(open) => {
        if (!open) setDateFor(null);
      }}
      onSnooze={(date) => {
        actions.snooze(dateFor, { preset: "pickDate", date });
        setDateFor(null);
      }}
    />
  );

  // Same 300 ms delay / 500 ms minimum as the list's SkeletonRegion.
  const detailSkeleton = useSkeletonGate(model.status === "loading");

  // Loading uses the populated layout too, so the list doesn't jump when data arrives.
  if (split && (model.status === "loading" || items.length > 0))
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SplitView
          listLabel={group}
          detailLabel={intl.formatMessage(messages.details)}
          backLabel={intl.formatMessage(messages.backToToday)}
          detailOpen
          onBack={() => undefined}
          listPane={{ min: 420, default: 480, max: 720 }}
          list={
            <div className="min-h-0 flex-1 overflow-y-auto">
              {header}
              {content}
            </div>
          }
          detail={
            <div
              ref={detailRef}
              tabIndex={-1}
              className="bg-surface-base min-h-0 flex-1 overflow-y-auto outline-none"
            >
              {selected ? (
                <div className="max-w-[44rem] px-8 pt-8 pb-12">{renderDetail(selected, 2)}</div>
              ) : model.status === "loading" ? (
                detailSkeleton && (
                  <div className="flex max-w-[44rem] flex-col gap-4 px-8 pt-8" aria-hidden="true">
                    <SkeletonText lines={2} widths={[40, 70]} />
                    <SkeletonText lines={3} />
                  </div>
                )
              ) : (
                <EmptyState kind="subArea" body={intl.formatMessage(messages.selectItem)} className="p-8" />
              )}
            </div>
          }
          {...(rail && { rail, railLabel })}
        />
        {dateDialog}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[45rem]">
          {header}
          {content}
        </div>
      </div>
      {wide && rail && (
        <aside
          aria-label={railLabel}
          className="border-line-subtle flex min-h-0 w-72 shrink-0 flex-col border-l"
        >
          {rail}
        </aside>
      )}
      {dateDialog}
    </div>
  );
}
