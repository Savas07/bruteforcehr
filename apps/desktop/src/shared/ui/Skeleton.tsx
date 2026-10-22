/**
 * Skeletons for cold loads with no cache (states.md "Cross-platform rules" 3, "Decision — Desktop"):
 * shape-matched placeholders shown only after `timing.skeletonDelay` (300 ms, no flash on fast
 * loads) and then kept for at least `timing.skeletonMin` (500 ms, no flicker). A refresh with
 * cached data never shows a skeleton. The soft pulse runs only under `motion-safe:`; with reduced
 * motion the shapes are static. Every shape is decorative (`aria-hidden`): `SkeletonRegion` sets
 * `aria-busy` on the pane and announces its label ("Loading applications").
 */
import { timing } from "@bfhr/ui-tokens";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../cx";

// ─── Gate (pure state machine + timer driver) ─────────────────────────────────────────────────

/** Where the skeleton gate is. `since` is when loading started (hidden) or the skeleton appeared (visible). */
export interface SkeletonGateState {
  /** The skeleton is on screen. */
  readonly visible: boolean;
  /** Epoch ms: loading start while waiting to show, skeleton start while visible; null when idle. */
  readonly since: number | null;
}

/** Not loading, nothing shown. */
export const SKELETON_GATE_IDLE: SkeletonGateState = { visible: false, since: null };

/** One evaluation of the gate: the next state and when to evaluate again (null: only on the next change). */
export interface SkeletonGateStep {
  readonly state: SkeletonGateState;
  /** Epoch ms at which the state can change without `loading` changing. */
  readonly wakeAt: number | null;
}

/**
 * The skeleton timing rule as a pure function of the previous state, the current `loading` flag
 * and the time. Returns the same `state` object when nothing changes.
 *
 * - Hidden + loading: wait `timing.skeletonDelay` from the loading start, then show.
 * - Hidden + not loading: idle (a load shorter than the delay never shows a skeleton).
 * - Visible + loading: stay.
 * - Visible + not loading: keep it until `timing.skeletonMin` has passed since it appeared.
 */
export function stepSkeletonGate(state: SkeletonGateState, loading: boolean, now: number): SkeletonGateStep {
  if (!state.visible) {
    if (!loading) return { state: state.since === null ? state : SKELETON_GATE_IDLE, wakeAt: null };
    if (state.since === null)
      return { state: { visible: false, since: now }, wakeAt: now + timing.skeletonDelay };
    const showAt = state.since + timing.skeletonDelay;
    if (now >= showAt) return { state: { visible: true, since: now }, wakeAt: null };
    return { state, wakeAt: showAt };
  }
  if (loading) return { state, wakeAt: null };
  const hideAt = (state.since ?? now) + timing.skeletonMin;
  if (now >= hideAt) return { state: SKELETON_GATE_IDLE, wakeAt: null };
  return { state, wakeAt: hideAt };
}

/** Drives `stepSkeletonGate` with real timers. */
export interface SkeletonGate {
  /** Report the current loading flag; re-evaluates and reschedules the next wake-up. */
  update(loading: boolean): void;
  /** Cancel the pending wake-up (the state is kept, so a later `update` resumes it). */
  dispose(): void;
}

/**
 * Timer driver for the gate: calls `onVisibleChange` whenever the skeleton should appear or go.
 * Uses `Date.now()` and `setTimeout`, so tests drive it with fake timers.
 */
export function createSkeletonGate(onVisibleChange: (visible: boolean) => void): SkeletonGate {
  let state = SKELETON_GATE_IDLE;
  let loading = false;
  let cancel: (() => void) | null = null;

  const evaluate = () => {
    cancel?.();
    cancel = null;
    const step = stepSkeletonGate(state, loading, Date.now());
    const wasVisible = state.visible;
    state = step.state;
    if (state.visible !== wasVisible) onVisibleChange(state.visible);
    if (step.wakeAt !== null) {
      const id = setTimeout(evaluate, Math.max(0, step.wakeAt - Date.now()));
      cancel = () => clearTimeout(id);
    }
  };

  return {
    update(next) {
      loading = next;
      evaluate();
    },
    dispose() {
      cancel?.();
      cancel = null;
    },
  };
}

/**
 * Whether to show the skeleton for `loading`: true only after 300 ms of loading, then for at
 * least 500 ms. While it returns false during a load, render nothing (not the stale content).
 */
export function useSkeletonGate(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const [gate] = useState(() => createSkeletonGate(setVisible));
  useEffect(() => {
    gate.update(loading);
  }, [gate, loading]);
  useEffect(() => () => gate.dispose(), [gate]);
  return visible;
}

// ─── Region ───────────────────────────────────────────────────────────────────────────────────

/**
 * A pane's loading boundary: `aria-busy` while loading, the label announced politely, the
 * skeleton through `useSkeletonGate`, then `children`. Wrap the smallest region that owns the
 * data; headers, filters and column titles stay outside and render for real.
 */
export function SkeletonRegion({
  loading,
  label,
  skeleton,
  children,
  className,
}: {
  /** Cold load in progress (no cached data). A refresh with cache passes false. */
  loading: boolean;
  /** What is loading, for screen readers: "Loading applications". */
  label: string;
  /** Shape-matched placeholder, at most one viewport of rows. */
  skeleton: ReactNode;
  /** The loaded content, rendered once loading ends and the minimum skeleton time has passed. */
  children: ReactNode;
  /** Layout classes for the region element. */
  className?: string;
}) {
  const visible = useSkeletonGate(loading);
  const busy = loading || visible;
  return (
    <div aria-busy={busy} className={className}>
      <span role="status" className="sr-only">
        {busy ? label : ""}
      </span>
      {visible ? skeleton : loading ? null : children}
    </div>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────────────────────

const shape = "bg-skeleton-base motion-safe:animate-pulse";

/** Lines of text: 12 px bars 8 px apart; the last line is shorter unless `widths` says otherwise. */
export function SkeletonText({
  lines = 1,
  widths,
  className,
}: {
  /** Number of lines. Default 1. */
  lines?: number;
  /** Width of each line in percent of the container; missing entries default to 100 (last line 60). */
  widths?: readonly number[];
  /** Layout classes (width, margins). */
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cx(shape, "h-3 rounded-xs")}
          style={{ width: `${widths?.[index] ?? (lines > 1 && index === lines - 1 ? 60 : 100)}%` }}
        />
      ))}
    </div>
  );
}

/** A rectangle (pill, input, card, image). Size it with token spacing classes: `h-8 w-24`. */
export function SkeletonBlock({
  className,
}: {
  /** Size and radius classes; default radius `rounded-sm`. */
  className?: string;
}) {
  return <div aria-hidden="true" className={cx(shape, "rounded-sm", className)} />;
}

const circleSize: Record<"sm" | "md" | "lg", string> = { sm: "size-6", md: "size-8", lg: "size-10" };

/** A circle: monogram, avatar, sender. */
export function SkeletonCircle({
  size = "md",
}: {
  /** 24 / 32 / 40 px, matching `Monogram` sizes. Default `md`. */
  size?: "sm" | "md" | "lg";
}) {
  return <div aria-hidden="true" className={cx(shape, "shrink-0 rounded-full", circleSize[size])} />;
}

// ─── Composites (shape-matched to the real components) ────────────────────────────────────────

/** Today `AttentionRow`: company circle, two lines, trailing chip. */
export function AttentionRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 px-3 py-3">
      <SkeletonCircle size="md" />
      <SkeletonText lines={2} widths={[55, 35]} className="min-w-0 flex-1" />
      <SkeletonBlock className="h-6 w-20 rounded-full" />
    </div>
  );
}

/** Jobs list row: monogram, title + company/location lines, trailing match pill. */
export function JobRowSkeleton() {
  return (
    <div aria-hidden="true" className="border-line-subtle flex items-center gap-3 border-b px-3 py-3">
      <SkeletonCircle size="md" />
      <SkeletonText lines={2} widths={[70, 45]} className="min-w-0 flex-1" />
      <SkeletonBlock className="h-5 w-16 rounded-full" />
    </div>
  );
}

/** Job detail body below the real header: match block, then description paragraphs. */
export function JobDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6 p-6">
      <div className="border-line-subtle flex flex-col gap-3 rounded-lg border p-4">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-2 w-full rounded-full" />
        <SkeletonText lines={3} widths={[80, 70, 50]} />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonText lines={5} />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonText lines={4} />
      </div>
    </div>
  );
}

/** Tracker board card: company line, title line, status pill. */
export function BoardCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-surface-base border-line-subtle flex flex-col gap-3 rounded-md border p-3"
    >
      <div className="flex items-center gap-2">
        <SkeletonCircle size="sm" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <SkeletonText lines={2} widths={[85, 50]} />
      <SkeletonBlock className="h-5 w-20 rounded-full" />
    </div>
  );
}

/** Mail review queue row: sender circle, two lines, trailing time. */
export function MailRowSkeleton() {
  return (
    <div aria-hidden="true" className="border-line-subtle flex items-start gap-3 border-b px-3 py-3">
      <SkeletonCircle size="md" />
      <SkeletonText lines={2} widths={[60, 85]} className="min-w-0 flex-1" />
      <SkeletonBlock className="h-3 w-10" />
    </div>
  );
}

/** CV editor form: section headings with labelled fields. */
export function CvFormSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8 p-6">
      {[3, 2, 4].map((fields, section) => (
        <div key={section} className="flex flex-col gap-4">
          <SkeletonBlock className="h-5 w-36" />
          {Array.from({ length: fields }, (_, field) => (
            <div key={field} className="flex flex-col gap-2">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** CV live preview: an A4-shaped page with heading and text blocks. */
export function CvPreviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-surface-base shadow-raised mx-auto flex aspect-[210/297] w-full max-w-150 flex-col gap-6 rounded-xs p-10"
    >
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-6 w-1/2" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
      {[4, 3, 3].map((lines, index) => (
        <div key={index} className="flex flex-col gap-3">
          <SkeletonBlock className="h-4 w-1/4" />
          <SkeletonText lines={lines} />
        </div>
      ))}
    </div>
  );
}

/**
 * Table row aligned to the real columns (Tracker table, backfill, Insights breakdown). Pass the
 * same width classes the table uses so the bars line up with the real headers.
 */
export function TableRowSkeleton({
  columns = 5,
}: {
  /** Equal columns (`5`), or one width class per cell (`["w-48", "flex-1", "w-24"]`). Default 5. */
  columns?: number | readonly string[];
}) {
  const cells = typeof columns === "number" ? Array.from({ length: columns }, () => "flex-1") : columns;
  return (
    <div aria-hidden="true" className="border-line-subtle flex h-9 items-center gap-4 border-b px-3">
      {cells.map((width, index) => (
        <div key={index} className={cx("min-w-0", width)}>
          <div className={cx(shape, "h-3 rounded-xs", index === 0 ? "w-4/5" : "w-3/5")} />
        </div>
      ))}
    </div>
  );
}
