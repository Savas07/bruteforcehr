/**
 * Window-width breakpoints (decisions.md D04, `layout.breakpoint` in @bfhr/ui-tokens). Screens
 * degrade through the same five widths: below `compact` the sidebar is a rail, below `narrow`
 * detail panes push instead of splitting, below `preview` previews become a toggle, from `detail`
 * Today gets its detail pane, from `wide` the agenda / details rails appear.
 */
import { layout } from "@bfhr/ui-tokens";
import { useSyncExternalStore } from "react";

export interface Breakpoints {
  /** < 640: sidebar is the 60 px icon rail. */
  readonly compact: boolean;
  /** < 980: list/detail push (one pane at a time) instead of splitting. */
  readonly narrow: boolean;
  /** < 1100: CV and email previews become a toggle (Mod+Shift+P). */
  readonly previewToggle: boolean;
  /** ≥ 1200: Today detail pane, one-line filter bar. */
  readonly detail: boolean;
  /** ≥ 1440: agenda rail (Today), details rail (Mail). */
  readonly wide: boolean;
}

const { compact, narrow, preview, detail, wide } = layout.breakpoint;
// min/max-width rather than range syntax: WKWebView on macOS 13 (Safari 16.0) lacks ranges.
const queries = {
  compact: `(max-width: ${compact - 0.02}px)`,
  narrow: `(max-width: ${narrow - 0.02}px)`,
  previewToggle: `(max-width: ${preview - 0.02}px)`,
  detail: `(min-width: ${detail}px)`,
  wide: `(min-width: ${wide}px)`,
} as const satisfies Record<keyof Breakpoints, string>;

let snapshot: Breakpoints | null = null;

function read(): Breakpoints {
  const next: Breakpoints = {
    compact: matchMedia(queries.compact).matches,
    narrow: matchMedia(queries.narrow).matches,
    previewToggle: matchMedia(queries.previewToggle).matches,
    detail: matchMedia(queries.detail).matches,
    wide: matchMedia(queries.wide).matches,
  };
  // Keep the identity while nothing changed, as useSyncExternalStore requires.
  if (snapshot && (Object.keys(next) as (keyof Breakpoints)[]).every((key) => snapshot?.[key] === next[key]))
    return snapshot;
  snapshot = next;
  return next;
}

function subscribe(onChange: () => void): () => void {
  const lists = Object.values(queries).map((query) => matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/** The D04 breakpoints for the current window width; re-renders when one flips. */
export function useBreakpoints(): Breakpoints {
  return useSyncExternalStore(subscribe, read);
}
