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
  /** Filters open over the list (the on-demand search with the filter popovers). */
  "jobs-search": "/jobs?q=react&filters=1",
  /** Saved searches: the manage dialog over the list. */
  "saved-searches": "/jobs?searches=manage",
  /** Paste a link: the import dialog over the list. */
  "jobs-import": "/jobs?import=1",
  /** Apply by email: the composer over a posting that asks for email (design build: src/design/jobs.tsx). */
  apply: "/jobs/job-fernweh-frontend?apply=1",
  /** Tailor for this job: the review, partly decided (src/features/apply/designState.ts). */
  "tailor-review": "/jobs/job-fernweh-frontend?apply=1&tailor=cv-de&tailor-step=review",
  /** The composer with an AI-drafted cover letter, an unresolved field and an extra attachment. */
  "cover-letter": "/jobs/job-fernweh-frontend?apply=1&letter=ai",
  /** "From your files…" over the composer. */
  "attachment-picker": "/jobs/job-fernweh-frontend?apply=1&letter=ai&attach=files",
  /** External apply: the kit beside a posting on a company site, with "Did you submit?". */
  "apply-kit": "/jobs/job-northstar-frontend?apply=1",
  /** Settings › Application answers with an answer open. */
  "answers-settings": "/settings/answers?answer=answer-auth-eu",
  "cv-editor": "/cvs",
  "tracker-board": "/tracker",
  /** An application with an automatic move (Undo), an interview, a contact and a pinned CV. */
  "application-detail": "/tracker/applications/app-brightwave",
  /** Log an application, open over the board. */
  "application-add": "/tracker?add=1",
  "tracker-table": "/tracker?view=table",
  "tracker-calendar": "/tracker?view=calendar",
  "mail-review": "/mail",
  /** Connect your email (`?connect=` picks the step, src/design/mail-connect.tsx). */
  "mail-connect": "/settings/mail-accounts?connect=picker",
  insights: "/insights",
  "settings-mail-accounts": "/settings/mail-accounts",
  "settings-job-preferences": "/settings/job-preferences",
  "settings-notifications": "/settings/notifications",
  "settings-job-sources": "/settings/job-sources",
  "settings-companies": "/settings/companies",
  "settings-ai": "/settings/ai",
  "settings-general": "/settings/general",
  /** Data & privacy; `?privacy=` forces the export and delete states (src/design/data-privacy.tsx). */
  "settings-data-privacy": "/settings/data-privacy",
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
  "link-invite-only",
  /** After Settings › Delete account: the email step with the one-time "deleted" notice. */
  "account-deleted",
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

/**
 * CSV import steps (`?csv=<state>` over the table, src/design/tracker-views.tsx) with the Turkish
 * Excel sample: the picker, a workbook dropped by mistake, column mapping, status words, review.
 */
export const csvDesignStates = ["pick", "workbook", "columns", "statuses", "preview"] as const;
export type CsvDesignState = (typeof csvDesignStates)[number];

/** The hash route of a CSV import step (the populated table plus `csv=`). */
export function csvDesignHash(state: CsvDesignState, extra: Readonly<Record<string, string>> = {}): string {
  return designHash("tracker-table", "populated", { csv: state, ...extra });
}

/** `tracker-csv-<state>-<theme>-<w>x<h>.png`. */
export function csvCaptureFileName(
  state: CsvDesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `tracker-csv-${state}-${theme}-${size.width}x${size.height}.png`;
}

/**
 * First-run wizard states (`?onboarding=<state>`, src/design/onboarding.tsx), over Today, which
 * stays hidden until onboarding finishes: each step, the CV step after an import and for a user
 * who already has CVs, preferences empty / pre-filled from a CV / complete, Finish with and
 * without something to search for, and the profile that couldn't be created.
 */
export const onboardingDesignStates = [
  "cv",
  "cv-imported",
  "cv-existing",
  "preferences",
  "preferences-cv",
  "preferences-filled",
  "finish",
  "finish-empty",
  "setup-failed",
] as const;
export type OnboardingDesignState = (typeof onboardingDesignStates)[number];

export function onboardingDesignHash(
  state: OnboardingDesignState,
  extra: Readonly<Record<string, string>> = {},
): string {
  return designHash("today", "populated", { onboarding: state, ...extra });
}

/** `onboarding-<state>-<theme>-<w>x<h>.png`. */
export function onboardingCaptureFileName(
  state: OnboardingDesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `onboarding-${state}-${theme}-${size.width}x${size.height}.png`;
}

/**
 * Settings › Data & privacy states (`?privacy=<state>`, src/design/data-privacy.tsx) in the Settings
 * shell: the export section (idle, working, ready, saved, each failure, offline) and the delete
 * dialog (typing, re-authenticating, deleting, failures, offline).
 */
export const privacyDesignStates = [
  "idle",
  "preparing",
  "ready",
  "saving",
  "saved",
  "download-failed",
  "too-soon",
  "daily-limit",
  "too-large",
  "export-failed",
  "offline",
  "delete-empty",
  "delete-typed",
  "delete-reauth",
  "delete-reauth-sent",
  "delete-reauth-failed",
  "delete-reauth-done",
  "delete-deleting",
  "delete-failed",
  "delete-offline",
] as const;
export type PrivacyDesignState = (typeof privacyDesignStates)[number];

/** The Settings pane the states render in. */
export const PRIVACY_DESIGN_PATH = "/settings/data-privacy";

/** The hash route of a Data & privacy state; the two offline states also force the connection. */
export function privacyDesignHash(
  state: PrivacyDesignState,
  extra: Readonly<Record<string, string>> = {},
): string {
  const offline = state === "offline" || state === "delete-offline";
  const params = new URLSearchParams({
    ...designSearchByState[offline ? "offline" : "populated"],
    privacy: state,
    ...extra,
  });
  return `#${PRIVACY_DESIGN_PATH}?${params.toString()}`;
}

/** `data-privacy-<state>-<theme>-<w>x<h>.png`. */
export function privacyCaptureFileName(
  state: PrivacyDesignState,
  theme: CaptureTheme,
  size: { readonly width: number; readonly height: number },
): string {
  return `data-privacy-${state}-${theme}-${size.width}x${size.height}.png`;
}
