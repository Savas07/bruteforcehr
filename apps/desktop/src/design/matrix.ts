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

/**
 * Capturable screens and the route each opens on (with its own search params, if any). `demo` is
 * the shared-component demo.
 */
export const designScreenPaths = {
  demo: "/design/demo",
  today: "/today",
  "job-detail": "/jobs",
  "cv-editor": "/cvs",
  "tracker-board": "/tracker",
  /** An application with an automatic move (Undo), an interview, a contact and a pinned CV. */
  "application-detail": "/tracker/applications/app-brightwave",
  /** Log an application, open over the board. */
  "application-add": "/tracker?add=1",
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
 * Locale and time zone every capture tool pins (`?locale=&tz=`), so macOS, Windows and the browser
 * harness render the same text whatever the machine's settings. Captures in another UI language
 * replace `locale` (`tr-TR`, `de-DE`) and keep the zone. The persona lives in Istanbul.
 */
export const CAPTURE_PIN = { locale: "en-GB", tz: "Europe/Istanbul" } as const;

/** Formatting locale for each UI language a capture can be taken in. */
export const CAPTURE_LOCALES = { en: "en-GB", tr: "tr-TR", de: "de-DE" } as const;
export type CaptureLanguage = keyof typeof CAPTURE_LOCALES;

/**
 * The hash route that renders `screen` in `state`, e.g. `#/today?fixture=empty&state=ready`.
 * `extra` adds params (`platform=windows` makes a browser render the Windows chrome).
 */
export function designHash(
  screen: DesignScreenName,
  state: DesignState,
  extra: Readonly<Record<string, string>> = {},
): string {
  // A screen path may carry its own params (`/tracker?add=1`); the state's and `extra` come after.
  const [path, own = ""] = designScreenPaths[screen].split("?");
  const params = new URLSearchParams({
    ...Object.fromEntries(new URLSearchParams(own)),
    ...designSearchByState[state],
    ...extra,
  });
  return `#${path}?${params.toString()}`;
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

/**
 * Update UI states (`?update=<state>`, src/design/updates.tsx), rendered over Today: the sidebar
 * card (ready, collapsed by "Later", the narrow rail, a failed install), the restart flow, every
 * step of "Check for Updates…" and the blocking "Update required" screen.
 */
export const updateDesignStates = [
  "ready",
  "ready-later",
  "ready-rail",
  "notes",
  "save-first",
  "restarting",
  "install-failed",
  "checking",
  "up-to-date",
  "downloading",
  "check-ready",
  "check-failed",
  "download-failed",
  "required-downloading",
  "required-ready",
  "required-failed",
  "required-unavailable",
] as const;
export type UpdateDesignState = (typeof updateDesignStates)[number];

/** The hash route of an update state (Today, populated, plus `update=`). */
export function updateDesignHash(
  state: UpdateDesignState,
  extra: Readonly<Record<string, string>> = {},
): string {
  return designHash("today", "populated", { update: state, ...extra });
}

/** `ready-rail` needs the narrow rail (`narrow` is < 640 px wide); the rest use the laptop size. */
export function updateCaptureSize(state: UpdateDesignState): {
  readonly width: number;
  readonly height: number;
} {
  return state === "ready-rail" ? { width: 600, height: 800 } : captureSizes[0];
}

/** `update-<state>-<theme>-<w>x<h>.png`. */
export function updateCaptureFileName(
  state: UpdateDesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `update-${state}-${theme}-${size.width}x${size.height}.png`;
}

/**
 * Sign-in states (`?auth=<state>`, src/design/auth.tsx): the window while signed out. Without
 * `?auth=` the persona is signed in.
 */
export const authDesignStates = [
  "email",
  "email-returning",
  "email-invalid",
  "email-sending",
  "send-offline",
  "send-rate-limited",
  "check-email",
  "check-email-ready",
  "check-email-resent",
  "check-email-resend-failed",
  "completing",
  "confirm-email",
  "confirm-wrong-email",
  "link-invalid",
  "link-expired",
  "link-offline",
  "link-unavailable",
  "link-disabled",
] as const;
export type AuthDesignState = (typeof authDesignStates)[number];

/** The hash route of a sign-in state (over Today, which stays hidden until sign-in). */
export function authDesignHash(state: AuthDesignState, extra: Readonly<Record<string, string>> = {}): string {
  return designHash("today", "populated", { auth: state, ...extra });
}

/** `sign-in-<state>-<theme>-<w>x<h>.png`. */
export function authCaptureFileName(
  state: AuthDesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `sign-in-${state}-${theme}-${size.width}x${size.height}.png`;
}
