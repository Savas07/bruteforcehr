/**
 * Tracker board (`/tracker`, research/tracker.md "Decision — Desktop"): the 7 active stages as
 * 272 px columns that scroll horizontally with the next column peeking, empty columns collapsed to
 * rails, the Closed rail pinned right, and the application in a right panel (Enter; the detail's
 * `ApplicationPanel`). Cards move by drag (dnd-kit), "Move to…" (`M`) or one stage at a time
 * (Mod+Shift+→ / ←); every move goes through `useTrackerActions` (core state machine, one batch with
 * its event, applied locally at once, durable Undo from the toast, Mod+Z or the timeline).
 */
import type { ApplicationStatus } from "@bfhr/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useNavigate } from "@tanstack/react-router";
import { Inbox, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useTrackerActions } from "../../data/tracker/useTrackerActions";
import { destinationMessages } from "../../lib/destinations";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { StatusVM } from "../../shared/model/types";
import { PHASE_MESSAGES } from "../../shared/model/vocabulary";
import type { ScreenProps } from "../../shared/screen";
import { Button } from "../../shared/ui/Button";
import { EmptyState, GhostRow } from "../../shared/ui/EmptyState";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { BoardCardSkeleton, useSkeletonGate } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { ApplicationCard, CardBody, DropPlaceholder } from "./ApplicationCard";
import { BoardColumn, type DropRole } from "./BoardColumn";
import { ClosedRail } from "./ClosedRail";
import { openAddApplication } from "../application-add";
import { ApplicationPanel } from "../application-detail/ApplicationPanel";
import {
  boardStatuses,
  previewDrop,
  type TrackerBoardModel,
  type TrackerCardVM,
  type TrackerColumnVM,
} from "./model";

const messages = defineMessages({
  boardLabel: { id: "tracker-board.screen.boardLabel", defaultMessage: "Application board" },
  summary: {
    id: "tracker-board.screen.summary",
    defaultMessage:
      "{active, plural, one {# active application} other {# active applications}} · {closed} closed",
    description: "Line under the title; {closed} is a number",
  },
  loading: { id: "tracker-board.screen.loading", defaultMessage: "Loading applications" },
  errorTitle: { id: "tracker-board.screen.errorTitle", defaultMessage: "We couldn't load your applications" },
  errorBody: {
    id: "tracker-board.screen.errorBody",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  instructions: {
    id: "tracker-board.screen.instructions",
    defaultMessage:
      "Press Enter for details, M to move to another stage, or Command or Control with Shift and an arrow key to move one stage.",
    description: "Screen-reader description of every board card",
  },
  addApplication: { id: "tracker-board.toolbar.add", defaultMessage: "Add application" },
  groupTracker: { id: "tracker-board.keys.group", defaultMessage: "Tracker" },
  keyNextColumn: { id: "tracker-board.keys.nextColumn", defaultMessage: "Next column" },
  keyPreviousColumn: { id: "tracker-board.keys.previousColumn", defaultMessage: "Previous column" },
  keyNextCard: { id: "tracker-board.keys.nextCard", defaultMessage: "Next card" },
  keyPreviousCard: { id: "tracker-board.keys.previousCard", defaultMessage: "Previous card" },
  keyMoveTo: { id: "tracker-board.keys.moveTo", defaultMessage: "Move to…" },
  keyStepForward: { id: "tracker-board.keys.stepForward", defaultMessage: "Move one stage forward" },
  keyStepBack: { id: "tracker-board.keys.stepBack", defaultMessage: "Move one stage back" },
  pickedUp: { id: "tracker-board.drag.pickedUp", defaultMessage: "Picked up {company}, in {status}." },
  over: { id: "tracker-board.drag.over", defaultMessage: "{from} → {to}" },
  overNone: { id: "tracker-board.drag.overNone", defaultMessage: "Not over a stage." },
  dropped: { id: "tracker-board.drag.dropped", defaultMessage: "Dropped on {status}." },
  cancelled: {
    id: "tracker-board.drag.cancelled",
    defaultMessage: "Move cancelled. {company} stays in {status}.",
  },
});

/** Skeleton cards per column while loading (states.md: 2–3 per column). */
const SKELETON_CARDS = [3, 2, 3, 2, 2, 3, 1] as const;

type Model = ScreenProps<TrackerBoardModel>["model"];

export default function TrackerBoardScreen({ model }: ScreenProps<TrackerBoardModel>) {
  const intl = useIntl();
  const title = intl.formatMessage(destinationMessages.tracker);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar title={title} model={model} />
      {model.status === "ready" ? (
        <ReadyBoard key="ready" model={model.data} />
      ) : (
        <StaticBoard
          loading={model.status === "loading"}
          onRetry={model.status === "error" ? model.retry : null}
        />
      )}
    </div>
  );
}

function Toolbar({ title, model }: { title: string; model: Model }) {
  const intl = useIntl();
  const data = model.status === "ready" ? model.data : null;
  const active = data?.columns.reduce((sum, column) => sum + column.count, 0) ?? 0;
  return (
    <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 px-6 pt-5 pb-4">
      <ScreenTitle title={title} />
      {data && data.firstUse === null && (
        <p className="text-fg-secondary text-callout tabular-nums">
          {intl.formatMessage(messages.summary, { active, closed: data.closedRail.count })}
        </p>
      )}
      <span className="ms-auto flex items-center gap-3 self-center">
        {model.status === "ready" && model.fromCache && (
          <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />
        )}
        <Button
          variant="secondary"
          size="md"
          icon={Plus}
          shortcut="Mod+N"
          onClick={() => openAddApplication()}
        >
          {intl.formatMessage(messages.addApplication)}
        </Button>
      </span>
    </div>
  );
}

/** Loading and error: real column headers with "–" counts (states.md "Tracker board"). */
function StaticBoard({ loading, onRetry }: { loading: boolean; onRetry: (() => void) | null }) {
  const intl = useIntl();
  const showSkeleton = useSkeletonGate(loading);
  const statuses = boardStatuses(intl).active;
  const none: DropRole = { kind: "none" };
  return (
    <div aria-busy={loading} className="relative flex min-h-0 flex-1 gap-2 ps-6 pe-4 pb-4">
      <span role="status" className="sr-only">
        {loading ? intl.formatMessage(messages.loading) : ""}
      </span>
      {/* Loading keeps the real 272 px columns (the board that arrives scrolls the same way); with
          nothing focusable inside, the scroller itself takes focus for keyboard scrolling. After an
          error there is nothing to scroll to, so the columns share the width instead. */}
      <div
        role="group"
        tabIndex={loading ? 0 : undefined}
        aria-label={intl.formatMessage(messages.boardLabel)}
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
      >
        {statuses.map((status, index) => (
          <BoardColumn
            key={status.key}
            status={status}
            countLabel={null}
            accessibleLabel={status.label}
            oldest={null}
            collapsed={false}
            fluid={!loading}
            drop={none}
          >
            {showSkeleton &&
              Array.from({ length: SKELETON_CARDS[index] ?? 2 }, (_, card) => (
                <li key={card}>
                  <BoardCardSkeleton />
                </li>
              ))}
          </BoardColumn>
        ))}
      </div>
      <ClosedRail
        rail={null}
        expanded={false}
        onExpandedChange={() => undefined}
        dragging={null}
        overId={null}
        fallbackLabel={intl.formatMessage(PHASE_MESSAGES.closed)}
      />
      {onRetry && (
        <div className="absolute inset-x-0 top-20 flex justify-center px-6">
          <div className="bg-surface-base border-line-subtle shadow-raised w-full max-w-120 rounded-lg border">
            <PaneError
              title={intl.formatMessage(messages.errorTitle)}
              body={intl.formatMessage(messages.errorBody)}
              onRetry={onRetry}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const inCard = (event: KeyboardEvent) =>
  event.target instanceof Element && event.target.closest("[data-card-id]") !== null;

function ReadyBoard({ model }: { model: TrackerBoardModel }) {
  const intl = useIntl();
  const actions = useTrackerActions();
  const navigate = useNavigate();
  const instructionsId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  // Which board edges have more columns beyond them (the fades). Re-measured on scroll, on resize
  // and after every render (collapsing a column or opening the panel changes the overflow).
  const [edges, setEdges] = useState({ start: false, end: false });
  const measureEdges = () => {
    const element = boardRef.current;
    if (!element) return;
    const start = element.scrollLeft > 1;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEdges((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
  };
  useEffect(measureEdges);
  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    // `measureEdges` only reads the ref and the state setter, so the first render's copy stays valid.
    const observer = new ResizeObserver(measureEdges);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  const [collapsed, setCollapsed] = useState<Readonly<Partial<Record<ApplicationStatus, boolean>>>>({});
  const [closedExpanded, setClosedExpanded] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const board = model;
  const allColumns = [...board.columns, ...board.closedRail.outcomes];
  const allCards = allColumns.flatMap((column) => column.cards);
  const findCard = (id: string | null) => allCards.find((card) => card.applicationId === id) ?? null;
  const isCollapsed = (column: TrackerColumnVM) => collapsed[column.status.key] ?? column.collapsedByDefault;
  const isClosed = (status: ApplicationStatus) =>
    board.closedRail.outcomes.some((outcome) => outcome.status.key === status);

  // Keyboard lanes: visible columns with cards, left to right.
  const lanes = [...board.columns, ...(closedExpanded ? board.closedRail.outcomes : [])].filter(
    (column) => !isCollapsed(column) && column.cards.length > 0,
  );
  const laneOf = (id: string | null) => {
    for (const [lane, column] of lanes.entries()) {
      const index = column.cards.findIndex((card) => card.applicationId === id);
      if (index !== -1) return { lane, index };
    }
    return null;
  };
  const tabbableId = laneOf(focusedId) ? focusedId : (lanes[0]?.cards[0]?.applicationId ?? null);

  /**
   * Makes `id` the active card and focuses it after the next paint. A card that left the board (into
   * the folded Closed rail) is skipped; the focus event of whatever does get focus wins.
   */
  const focusCard = (id: string) => {
    setFocusedId(id);
    requestAnimationFrame(() => {
      const element = cardRefs.current.get(id);
      element?.focus();
      element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const select = (id: string | null) =>
    void navigate({
      to: ".",
      search: (previous: Readonly<Record<string, unknown>>) => ({
        ...previous,
        applicationId: id ?? undefined,
      }),
    });
  const selected = board.selected;
  // The panel's record (deep link, J / K in the panel) stays visible on the board beside it.
  const selectedId = selected?.applicationId ?? null;
  useEffect(() => {
    if (selectedId) cardRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  const commitMove = (
    card: TrackerCardVM,
    to: ApplicationStatus,
    options: { readonly keepFocus?: boolean } = {},
  ) => {
    // Where focus goes if the card leaves the visible board (into the folded Closed rail).
    const position = laneOf(card.applicationId);
    const sourceCards = position ? (lanes[position.lane]?.cards ?? []) : [];
    const neighbor =
      sourceCards[(position?.index ?? 0) + 1]?.applicationId ??
      sourceCards[(position?.index ?? 0) - 1]?.applicationId;
    if (!actions.move(card.applicationId, to, { openAfterUndo: () => focusCard(card.applicationId) })) return;
    if (!isClosed(to)) setCollapsed((previous) => ({ ...previous, [to]: false }));
    if (options.keepFocus) {
      if (!isClosed(to) || closedExpanded) focusCard(card.applicationId);
      else if (neighbor) focusCard(neighbor);
    }
  };

  const inPanel = (event: KeyboardEvent) =>
    event.target instanceof Node && panelRef.current?.contains(event.target) === true;
  /** The card a keyboard move acts on: the focused card on the board, the selected one in the panel. */
  const keyTarget = (event: KeyboardEvent) =>
    inCard(event) ? findCard(focusedId) : inPanel(event) ? findCard(selected?.applicationId ?? null) : null;
  const step = (event: KeyboardEvent, direction: "forward" | "back") => {
    const card = keyTarget(event);
    const target = direction === "forward" ? card?.stepForward : card?.stepBack;
    if (card && target) commitMove(card, target.key, { keepFocus: inCard(event) });
  };
  const moveFocus = (lane: number, index: number) => {
    const column = lanes[lane];
    const card = column?.cards[Math.min(index, column.cards.length - 1)];
    if (card) focusCard(card.applicationId);
  };
  const group = intl.formatMessage(messages.groupTracker);
  useKeyBindings([
    {
      id: "tracker.nextColumn",
      keys: "ArrowRight",
      label: intl.formatMessage(messages.keyNextColumn),
      group,
      when: inCard,
      run: () => {
        const at = laneOf(focusedId);
        if (at) moveFocus(at.lane + 1, at.index);
      },
    },
    {
      id: "tracker.previousColumn",
      keys: "ArrowLeft",
      label: intl.formatMessage(messages.keyPreviousColumn),
      group,
      when: inCard,
      run: () => {
        const at = laneOf(focusedId);
        if (at && at.lane > 0) moveFocus(at.lane - 1, at.index);
      },
    },
    {
      id: "tracker.nextCard",
      keys: ["J", "ArrowDown"],
      label: intl.formatMessage(messages.keyNextCard),
      group,
      when: inCard,
      run: () => {
        const at = laneOf(focusedId);
        const card = at ? lanes[at.lane]?.cards[at.index + 1] : undefined;
        if (card) focusCard(card.applicationId);
      },
    },
    {
      id: "tracker.previousCard",
      keys: ["K", "ArrowUp"],
      label: intl.formatMessage(messages.keyPreviousCard),
      group,
      when: inCard,
      run: () => {
        const at = laneOf(focusedId);
        const card = at && at.index > 0 ? lanes[at.lane]?.cards[at.index - 1] : undefined;
        if (card) focusCard(card.applicationId);
      },
    },
    {
      id: "tracker.moveTo",
      keys: "M",
      label: intl.formatMessage(messages.keyMoveTo),
      group,
      when: inCard,
      run: () => {
        if (focusedId) setMenuFor(focusedId);
      },
    },
    {
      id: "tracker.stepForward",
      keys: "Mod+Shift+ArrowRight",
      label: intl.formatMessage(messages.keyStepForward),
      group,
      inTextFields: false,
      when: (event) => keyTarget(event) !== null,
      run: (event) => step(event, "forward"),
    },
    {
      id: "tracker.stepBack",
      keys: "Mod+Shift+ArrowLeft",
      label: intl.formatMessage(messages.keyStepBack),
      group,
      inTextFields: false,
      when: (event) => keyTarget(event) !== null,
      run: (event) => step(event, "back"),
    },
  ]);

  // ─── Drag ───────────────────────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeCard = findCard(activeId);
  const statusLabel = (id: string | number | undefined) =>
    allColumns.find((column) => column.status.key === id)?.status.label ?? null;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const card = findCard(String(active.id));
      return card
        ? intl.formatMessage(messages.pickedUp, { company: card.company.name, status: card.status.label })
        : undefined;
    },
    onDragOver: ({ active, over }) => {
      const card = findCard(String(active.id));
      const to = statusLabel(over?.id);
      if (!card) return undefined;
      return to === null
        ? intl.formatMessage(messages.overNone)
        : intl.formatMessage(messages.over, { from: card.status.label, to });
    },
    onDragEnd: ({ over }) => {
      const to = statusLabel(over?.id);
      return to === null ? undefined : intl.formatMessage(messages.dropped, { status: to });
    },
    onDragCancel: ({ active }) => {
      const card = findCard(String(active.id));
      return card
        ? intl.formatMessage(messages.cancelled, { company: card.company.name, status: card.status.label })
        : undefined;
    },
  };
  const endDrag = (event: DragEndEvent) => {
    const card = findCard(String(event.active.id));
    const to = allColumns.find((column) => column.status.key === event.over?.id)?.status.key;
    setActiveId(null);
    setOverId(null);
    if (card && to && to !== card.status.key) commitMove(card, to);
  };

  const dropRole = (status: StatusVM): DropRole => {
    if (!activeCard) return { kind: "none" };
    if (status.key === activeCard.status.key) return { kind: "source" };
    const target = activeCard.moves.find((move) => move.status.key === status.key);
    const over = overId === status.key;
    return target?.disabledReason
      ? { kind: "invalid", over, reason: target.disabledReason }
      : { kind: "valid", over, from: activeCard.status };
  };
  // The hovered target as it would look after the drop: the placeholder sits where the card lands.
  const preview =
    activeCard && overId !== null
      ? previewDrop(board, activeCard.applicationId, overId as ApplicationStatus, intl)
      : null;

  // ─── Columns ────────────────────────────────────────────────────────────────────────────────
  const firstUse = board.firstUse;
  const renderColumn = (column: TrackerColumnVM) => {
    const target = preview?.status.key === column.status.key ? preview : null;
    const shown = target ?? column;
    const closed = isClosed(column.status.key);
    return (
      <BoardColumn
        key={column.status.key}
        status={column.status}
        countLabel={shown.countLabel}
        accessibleLabel={shown.accessibleLabel}
        oldest={
          column.oldestLabel !== null && column.oldestAccessibleLabel !== null
            ? { label: column.oldestLabel, accessibleLabel: column.oldestAccessibleLabel }
            : null
        }
        collapsed={isCollapsed(column)}
        // An empty first-use board shares the width and has nothing to fold away.
        {...(firstUse
          ? { fluid: true }
          : {
              onCollapsedChange: (value: boolean) =>
                setCollapsed((previous) => ({ ...previous, [column.status.key]: value })),
            })}
        drop={dropRole(column.status)}
        emptyLine={shown.emptyLine}
        footer={
          firstUse ? (
            <div className="px-2 pb-2">
              <GhostRow
                label={firstUse.columnAddLabel}
                onClick={() => openAddApplication({ status: column.status.key })}
              />
            </div>
          ) : undefined
        }
      >
        {shown.cards.map((card) =>
          target && card.applicationId === activeId ? (
            <DropPlaceholder key={card.applicationId} card={card} />
          ) : (
            <ApplicationCard
              key={card.applicationId}
              ref={(node) => {
                if (node) cardRefs.current.set(card.applicationId, node);
                else cardRefs.current.delete(card.applicationId);
              }}
              card={card}
              tabbable={card.applicationId === tabbableId}
              selected={card.applicationId === selected?.applicationId}
              ghost={card.applicationId === activeId}
              muted={closed}
              instructionsId={instructionsId}
              menuOpen={menuFor === card.applicationId}
              onMenuOpenChange={(open) => setMenuFor(open ? card.applicationId : null)}
              onMove={(to) => commitMove(card, to, { keepFocus: true })}
              onActivate={() =>
                select(selected?.applicationId === card.applicationId ? null : card.applicationId)
              }
              onFocus={() => setFocusedId(card.applicationId)}
            />
          ),
        )}
      </BoardColumn>
    );
  };

  // ─── Panel ──────────────────────────────────────────────────────────────────────────────────
  const panel = selected ? (
    <div ref={panelRef} className="contents">
      <ApplicationPanel
        applicationId={selected.applicationId}
        nav={selected.position}
        onSelect={select}
        onClose={() => {
          select(null);
          // The record's card, even if a move re-mounted it in another column since it opened.
          focusCard(selected.applicationId);
        }}
      />
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-0 flex-1">
      <p id={instructionsId} hidden>
        {intl.formatMessage(messages.instructions)}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        // Only the board scrolls while dragging; the shell and the window never move.
        autoScroll={{ canScroll: (element) => element === boardRef.current }}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: intl.formatMessage(messages.instructions) },
        }}
        onDragStart={({ active }) => {
          setActiveId(String(active.id));
          setMenuFor(null);
        }}
        onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
        onDragEnd={endDrag}
        onDragCancel={() => {
          setActiveId(null);
          setOverId(null);
        }}
      >
        <div className="relative flex min-w-0 flex-1 gap-2 ps-6 pe-4 pb-4">
          <div className="relative flex min-w-0 flex-1">
            <div
              ref={boardRef}
              role="group"
              aria-label={intl.formatMessage(messages.boardLabel)}
              onScroll={measureEdges}
              className="flex min-w-0 flex-1 gap-2 overflow-x-auto"
            >
              {board.columns.map(renderColumn)}
              {closedExpanded && board.closedRail.outcomes.map(renderColumn)}
            </div>
            {/* The board fades into the page where columns continue, so a column cut at the edge
                reads as "scroll for more", not as hidden behind the Closed rail. */}
            {edges.start && (
              <div
                aria-hidden="true"
                className="from-surface-base pointer-events-none absolute inset-y-0 start-0 w-6 bg-linear-to-r to-transparent"
              />
            )}
            {edges.end && (
              <div
                aria-hidden="true"
                className="from-surface-base pointer-events-none absolute inset-y-0 end-0 w-16 bg-linear-to-l to-transparent"
              />
            )}
          </div>
          <ClosedRail
            rail={board.closedRail}
            expanded={closedExpanded}
            onExpandedChange={(expanded) => {
              setClosedExpanded(expanded);
              if (expanded)
                requestAnimationFrame(() =>
                  boardRef.current?.scrollTo({ left: boardRef.current.scrollWidth, behavior: "smooth" }),
                );
            }}
            dragging={activeCard}
            overId={overId}
            fallbackLabel={board.closedRail.label}
          />
          {firstUse && (
            <div className="absolute inset-x-0 top-24 flex justify-center px-6">
              <EmptyState
                kind="firstUse"
                glyph={Inbox}
                title={firstUse.title}
                body={firstUse.body}
                primary={{
                  label: firstUse.primary.label,
                  keys: firstUse.primary.shortcut,
                  onClick: () => openAddApplication(),
                }}
                className="bg-surface-base border-line-subtle shadow-raised w-full max-w-120 rounded-lg border"
              />
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard && (
            <div className="bg-surface-base border-line-subtle shadow-drag flex w-64 flex-col gap-1.5 rounded-md border p-3">
              <CardBody card={activeCard} muted={false} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {panel}
    </div>
  );
}
