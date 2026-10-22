/**
 * The design-critique matrix: which screens, states, themes and sizes exist and how a route
 * forces each one. Shared by the design build (src/design/), the browser harness
 * (scripts/capture-design.ts) and the real-app capture (e2e/capture/capture-design.e2e.ts), so
 * it is plain data with no imports (Node runs it through type stripping).
 */

/** The five states every core screen renders on demand (docs/design/research/states.md). */
export const designStates = ["populated", "empty", "loading", "error", "offline"] as const;
export type DesignState = (typeof designStates)[number];

/** Route search params: `fixture` picks the dataset, `state` forces a load or connection state. */
export interface DesignSearch {
  readonly fixture: "populated" | "empty";
  readonly state: "ready" | "loading" | "error" | "offline";
}

export const designSearchByState: Readonly<Record<DesignState, DesignSearch>> = {
  populated: { fixture: "populated", state: "ready" },
  empty: { fixture: "empty", state: "ready" },
  loading: { fixture: "populated", state: "loading" },
  error: { fixture: "populated", state: "error" },
  offline: { fixture: "populated", state: "offline" },
};

/** Capturable screens and the route each opens on. `demo` is the shared-component demo. */
export const designScreenPaths = {
  demo: "/design/demo",
  today: "/today",
  "job-detail": "/jobs",
  "cv-editor": "/cvs",
  "tracker-board": "/tracker",
  "mail-review": "/mail",
} as const;
export type DesignScreenName = keyof typeof designScreenPaths;

export const captureThemes = ["light", "dark"] as const;
export type CaptureTheme = (typeof captureThemes)[number];

/** CSS viewports (BRIEF §5.5): a 13" laptop and a 1080p desktop. */
export const captureSizes = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const;

/**
 * The hash route that renders `screen` in `state`, e.g. `#/today?fixture=empty&state=ready`.
 * `extra` adds params (`platform=windows` makes a browser render the Windows chrome).
 */
export function designHash(
  screen: DesignScreenName,
  state: DesignState,
  extra: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams({ ...designSearchByState[state], ...extra });
  return `#${designScreenPaths[screen]}?${params.toString()}`;
}

/** `<screen>-<state>-<theme>-<w>x<h>.png`: one name scheme for every capture tool. */
export function captureFileName(
  screen: DesignScreenName,
  state: DesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `${screen}-${state}-${theme}-${size.width}x${size.height}.png`;
}

/** Set on `<html>` once the forced state has rendered (skeletons included), for capture tools. */
export const DESIGN_READY_ATTRIBUTE = "data-design-ready";
