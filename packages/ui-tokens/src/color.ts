/**
 * Semantic color tokens, light and dark. Values are sRGB hex so every target
 * (CSS, Tailwind, React Native `DynamicColorIOS`, the contrast test) reads them
 * as-is. Contrast rules live in `contrast.ts` and are enforced by the test suite:
 * change a value here and `pnpm --filter @bfhr/ui-tokens test` tells you which
 * pairing broke.
 *
 * Brand direction: calm, trustworthy, focused. One accent family (indigo-blue,
 * OKLCH hue ≈ 264). Status hues follow docs/design/research/tracker.md: one hue
 * per phase, saturation rising Applied → Offer, neutral grey for closed outcomes,
 * gentle green only for Accepted, and never red for a rejection.
 */

export const colorSchemes = ["light", "dark"] as const;
export type ColorScheme = (typeof colorSchemes)[number];

/**
 * Application statuses, mirroring `ApplicationStatus` in `@bfhr/core`
 * (packages/core/src/enums.ts). Kept local so tokens stay platform- and
 * domain-free; apps assert the two lists match (see docs/design/system.md).
 */
export const statusKeys = [
  "saved",
  "preparing",
  "applied",
  "acknowledged",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type StatusKey = (typeof statusKeys)[number];

/** Phases, mirroring `StatusPhase` in `@bfhr/core` (`statusPhase()`). */
export const phaseKeys = ["shortlist", "in_progress", "closed"] as const;
export type PhaseKey = (typeof phaseKeys)[number];

/**
 * A tinted family used for chips, pills, dots and callouts.
 * - `text`: labels and icons, ≥ 4.5:1 on `subtle` and on every surface.
 * - `subtle`: chip / callout background.
 * - `solid`: dots, bars, column accents, focus-free UI marks, ≥ 3:1 on every surface.
 */
export interface Tone {
  text: string;
  subtle: string;
  solid: string;
}

export interface SemanticColors {
  surface: {
    /** Window / screen background behind cards and panes. */
    canvas: string;
    /** Default content surface: cards, panes, list rows. */
    base: string;
    /** Wells, inputs on cards, board columns, code/checksum blocks. */
    sunken: string;
    /** Popovers, menus, dialogs, palette (pairs with an elevation shadow). */
    elevated: string;
    /** Hovered row / control on desktop. */
    hover: string;
    /** Selected row, active nav item, accent-tinted highlight. */
    selected: string;
    /** Modal backdrop (alpha). Not a text background. */
    scrim: string;
  };
  fg: {
    primary: string;
    secondary: string;
    /** Meta text, placeholders, captions. Still AA. */
    tertiary: string;
    /** Disabled controls only (WCAG 1.4.3 exempts inactive components). */
    disabled: string;
    link: string;
    onAccent: string;
    onDanger: string;
  };
  line: {
    /** Decorative dividers and card hairlines (no contrast requirement). */
    subtle: string;
    /** Borders that identify a control: inputs, checkboxes, outlined buttons. */
    control: string;
    /** Focus ring. */
    focus: string;
  };
  accent: {
    /** Primary button fill, selected switch track, progress. */
    solid: string;
    hover: string;
    pressed: string;
    /** Tinted backgrounds: selected chips, matched-skill chips, added text in diffs. */
    subtle: string;
    /** Accent-colored text and icons on surfaces (text buttons, tint). */
    text: string;
  };
  success: Tone;
  /** Attention / uncertainty ("Needs a look", "Needs reconnecting"). Amber, never red. */
  warning: Tone;
  /** Errors and destructive actions only. Never used for job outcomes. */
  danger: Tone & { fill: string };
  info: Tone;
  phase: Record<PhaseKey, Tone>;
  status: Record<StatusKey, Tone>;
  /** Insights charts: one brand hue + neutral grey; status hues are not reused. */
  chart: { series: string; neutral: string; grid: string };
  skeleton: { base: string; highlight: string };
  /** Dark snackbar used in both schemes (Undo toast). */
  toast: { bg: string; text: string; action: string; border: string };
}

const lightClosed: Tone = { text: "#686C70", subtle: "#EDF1F5", solid: "#84888C" };
const darkClosed: Tone = { text: "#95999C", subtle: "#24272A", solid: "#74787C" };
const lightInProgressSubtle = "#E5F1FF";
const darkInProgressSubtle = "#1C263A";

const light: SemanticColors = {
  surface: {
    canvas: "#F6F7F9",
    base: "#FFFFFF",
    sunken: "#EFF1F4",
    elevated: "#FFFFFF",
    hover: "#EBEEF2",
    selected: "#EBF0FC",
    scrim: "#0E101466",
  },
  fg: {
    primary: "#161A22",
    secondary: "#4B5261",
    tertiary: "#5E6573",
    disabled: "#A0A6B0",
    link: "#2B4FC0",
    onAccent: "#FFFFFF",
    onDanger: "#FFFFFF",
  },
  line: { subtle: "#E1E4EA", control: "#7D8492", focus: "#2F54C8" },
  accent: {
    solid: "#2F54C8",
    hover: "#2847AE",
    pressed: "#213C95",
    subtle: "#E3EAFB",
    text: "#2B4FC0",
  },
  success: { text: "#1B7B3C", subtle: "#E0F7E4", solid: "#409A59" },
  warning: { text: "#9C5D00", subtle: "#FFEDD7", solid: "#BC7A19" },
  danger: { text: "#BD3838", subtle: "#FFE7E4", solid: "#E25B56", fill: "#BD3838" },
  info: { text: "#2870A5", subtle: "#DDF3FF", solid: "#488EC5" },
  phase: {
    shortlist: { text: "#596D7D", subtle: "#DFF3FF", solid: "#768B9B" },
    in_progress: { text: "#4B6AAB", subtle: lightInProgressSubtle, solid: "#6788CC" },
    closed: lightClosed,
  },
  status: {
    saved: { text: "#636D77", subtle: "#E7F2FC", solid: "#7E8993" },
    preparing: { text: "#536E82", subtle: "#DEF4FF", solid: "#6F8CA0" },
    applied: { text: "#576B95", subtle: lightInProgressSubtle, solid: "#7489B4" },
    acknowledged: { text: "#516BA0", subtle: lightInProgressSubtle, solid: "#6D88C0" },
    screening: { text: "#4B6AAB", subtle: lightInProgressSubtle, solid: "#6788CC" },
    interviewing: { text: "#4468B6", subtle: lightInProgressSubtle, solid: "#6086D8" },
    offer: { text: "#3F68C3", subtle: lightInProgressSubtle, solid: "#5B86E5" },
    accepted: { text: "#35794B", subtle: "#E1F7E6", solid: "#539666" },
    declined: lightClosed,
    rejected: lightClosed,
    withdrawn: lightClosed,
    ghosted: lightClosed,
  },
  chart: { series: "#2F54C8", neutral: "#7D8492", grid: "#E1E4EA" },
  skeleton: { base: "#ECEEF2", highlight: "#F5F6F8" },
  toast: { bg: "#1F232B", text: "#F2F4F7", action: "#A9BCFF", border: "#1F232B" },
};

const dark: SemanticColors = {
  surface: {
    canvas: "#0E1014",
    base: "#16191F",
    sunken: "#0A0C0F",
    elevated: "#1E2229",
    hover: "#232730",
    selected: "#1F2A44",
    scrim: "#00000099",
  },
  fg: {
    primary: "#ECEEF2",
    secondary: "#A8AFBB",
    tertiary: "#8F97A4",
    disabled: "#5C6370",
    link: "#8FA8FF",
    onAccent: "#FFFFFF",
    onDanger: "#FFFFFF",
  },
  line: { subtle: "#2A2F38", control: "#707887", focus: "#8FA8FF" },
  accent: {
    solid: "#4A6CE3",
    hover: "#4263DB",
    pressed: "#3A59CC",
    subtle: "#1F2A44",
    text: "#8FA8FF",
  },
  success: { text: "#67AA76", subtle: "#152D1A", solid: "#2D8949" },
  warning: { text: "#C18C4C", subtle: "#34220B", solid: "#A96800" },
  danger: { text: "#E1756E", subtle: "#3A1D1B", solid: "#CF4946", fill: "#CD4845" },
  info: { text: "#689ECB", subtle: "#12283B", solid: "#377DB4" },
  phase: {
    shortlist: { text: "#899BA9", subtle: "#182835", solid: "#667A8B" },
    in_progress: { text: "#7B98D3", subtle: darkInProgressSubtle, solid: "#5777BA" },
    closed: darkClosed,
  },
  status: {
    saved: { text: "#909AA2", subtle: "#1F282F", solid: "#6E7983" },
    preparing: { text: "#849CAE", subtle: "#122938", solid: "#5F7B90" },
    applied: { text: "#8698BE", subtle: darkInProgressSubtle, solid: "#6277A1" },
    acknowledged: { text: "#8098C8", subtle: darkInProgressSubtle, solid: "#5E78AE" },
    screening: { text: "#7B98D3", subtle: darkInProgressSubtle, solid: "#5777BA" },
    interviewing: { text: "#7597DD", subtle: darkInProgressSubtle, solid: "#5176C5" },
    offer: { text: "#7096E7", subtle: darkInProgressSubtle, solid: "#4A74D1" },
    accepted: { text: "#6FA87E", subtle: "#162C1C", solid: "#428557" },
    declined: darkClosed,
    rejected: darkClosed,
    withdrawn: darkClosed,
    ghosted: darkClosed,
  },
  chart: { series: "#6F8EF0", neutral: "#707887", grid: "#2A2F38" },
  skeleton: { base: "#1E2229", highlight: "#262B33" },
  toast: { bg: "#2E333D", text: "#F2F4F7", action: "#A9BCFF", border: "#3A404B" },
};

export const color: Record<ColorScheme, SemanticColors> = { light, dark };
