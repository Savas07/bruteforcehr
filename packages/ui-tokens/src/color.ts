/**
 * Semantic color tokens, light and dark. Values are sRGB hex so every target
 * (CSS, Tailwind, the Swift asset catalog, the contrast test) reads them as-is.
 * Contrast rules live in `contrast.ts` and are enforced by the test suite:
 * change a value here and `pnpm --filter @bfhr/ui-tokens test` tells you which
 * pairing broke.
 *
 * Brand direction: calm, trustworthy, focused. One accent family, teal-green
 * (OKLCH hue ≈ 188, chroma at 85 % of the sRGB gamut for the accent), chosen by
 * the user (docs/design/decisions.md U5). Status hues follow
 * docs/design/research/tracker.md: one hue per phase, saturation rising
 * Applied → Offer, neutral grey for closed outcomes (Rejected shows as
 * "Not selected"), gentle green (hue ≈ 150) only for Accepted, and never red
 * for a rejection.
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
const lightInProgressSubtle = "#DDF5F2";
const darkInProgressSubtle = "#0D2A28";

const light: SemanticColors = {
  surface: {
    canvas: "#F6F7F9",
    base: "#FFFFFF",
    sunken: "#EFF1F4",
    elevated: "#FFFFFF",
    hover: "#EBEEF2",
    selected: "#E1F3F1",
    scrim: "#0E101466",
  },
  fg: {
    primary: "#161A22",
    secondary: "#4B5261",
    tertiary: "#5E6573",
    disabled: "#A0A6B0",
    link: "#1F635D",
    onAccent: "#FFFFFF",
    onDanger: "#FFFFFF",
  },
  line: { subtle: "#E1E4EA", control: "#7D8492", focus: "#216863" },
  accent: {
    solid: "#216863",
    hover: "#1B5954",
    pressed: "#154B47",
    subtle: "#D3EFEC",
    text: "#1F635D",
  },
  success: { text: "#1B7B3C", subtle: "#E0F7E4", solid: "#409A59" },
  warning: { text: "#9C5D00", subtle: "#FFEDD7", solid: "#BC7A19" },
  danger: { text: "#BD3838", subtle: "#FFE7E4", solid: "#E25B56", fill: "#BD3838" },
  info: { text: "#2870A5", subtle: "#DDF3FF", solid: "#488EC5" },
  phase: {
    shortlist: { text: "#596D7D", subtle: "#DFF3FF", solid: "#768B9B" },
    in_progress: { text: "#39756F", subtle: lightInProgressSubtle, solid: "#4A958E" },
    closed: lightClosed,
  },
  status: {
    saved: { text: "#636D77", subtle: "#E7F2FC", solid: "#7E8993" },
    preparing: { text: "#536E82", subtle: "#DEF4FF", solid: "#6F8CA0" },
    applied: { text: "#52716E", subtle: lightInProgressSubtle, solid: "#6A908C" },
    acknowledged: { text: "#47736F", subtle: lightInProgressSubtle, solid: "#5B928D" },
    screening: { text: "#39756F", subtle: lightInProgressSubtle, solid: "#4A958E" },
    interviewing: { text: "#267670", subtle: lightInProgressSubtle, solid: "#33968E" },
    offer: { text: "#007973", subtle: lightInProgressSubtle, solid: "#009991" },
    accepted: { text: "#35794B", subtle: "#E1F7E6", solid: "#539666" },
    declined: lightClosed,
    /** Labelled "Not selected" in every locale (decisions.md U2). */
    rejected: lightClosed,
    withdrawn: lightClosed,
    ghosted: lightClosed,
  },
  chart: { series: "#216863", neutral: "#7D8492", grid: "#E1E4EA" },
  skeleton: { base: "#ECEEF2", highlight: "#F5F6F8" },
  toast: { bg: "#1F232B", text: "#F2F4F7", action: "#79CDC5", border: "#1F232B" },
};

const dark: SemanticColors = {
  surface: {
    canvas: "#0E1014",
    base: "#16191F",
    sunken: "#0A0C0F",
    elevated: "#1E2229",
    hover: "#232730",
    selected: "#0D302D",
    scrim: "#00000099",
  },
  fg: {
    primary: "#ECEEF2",
    secondary: "#A8AFBB",
    tertiary: "#8F97A4",
    disabled: "#5C6370",
    link: "#43BEB4",
    onAccent: "#FFFFFF",
    onDanger: "#FFFFFF",
  },
  line: { subtle: "#2A2F38", control: "#707887", focus: "#43BEB4" },
  accent: {
    solid: "#2B827B",
    hover: "#277972",
    pressed: "#236E68",
    subtle: "#0D302D",
    text: "#43BEB4",
  },
  success: { text: "#67AA76", subtle: "#152D1A", solid: "#2D8949" },
  warning: { text: "#C18C4C", subtle: "#34220B", solid: "#A96800" },
  danger: { text: "#E1756E", subtle: "#3A1D1B", solid: "#CF4946", fill: "#CD4845" },
  info: { text: "#689ECB", subtle: "#12283B", solid: "#377DB4" },
  phase: {
    shortlist: { text: "#899BA9", subtle: "#182835", solid: "#667A8B" },
    in_progress: { text: "#53A59E", subtle: darkInProgressSubtle, solid: "#40837D" },
    closed: darkClosed,
  },
  status: {
    saved: { text: "#909AA2", subtle: "#1F282F", solid: "#6E7983" },
    preparing: { text: "#849CAE", subtle: "#122938", solid: "#5F7B90" },
    applied: { text: "#759F9B", subtle: darkInProgressSubtle, solid: "#5B7E7A" },
    acknowledged: { text: "#65A39D", subtle: darkInProgressSubtle, solid: "#50817D" },
    screening: { text: "#53A59E", subtle: darkInProgressSubtle, solid: "#40837D" },
    interviewing: { text: "#3AA79F", subtle: darkInProgressSubtle, solid: "#2C857E" },
    offer: { text: "#00AAA0", subtle: darkInProgressSubtle, solid: "#00857E" },
    accepted: { text: "#6FA87E", subtle: "#162C1C", solid: "#428557" },
    declined: darkClosed,
    /** Labelled "Not selected" in every locale (decisions.md U2). */
    rejected: darkClosed,
    withdrawn: darkClosed,
    ghosted: darkClosed,
  },
  chart: { series: "#38A29B", neutral: "#707887", grid: "#2A2F38" },
  skeleton: { base: "#1E2229", highlight: "#262B33" },
  toast: { bg: "#2E333D", text: "#F2F4F7", action: "#79CDC5", border: "#3A404B" },
};

export const color: Record<ColorScheme, SemanticColors> = { light, dark };

/**
 * Increased-contrast overrides (iOS / macOS "Increase Contrast"). Only the
 * roles where a stronger value helps: secondary text, links, accent text and
 * the lines that identify controls. Text reaches 7:1 (WCAG AAA) on every
 * surface, control borders and the focus ring 4.5:1, dividers become visible.
 * Every other token keeps its value. Emitted as `contrast: high` appearances in
 * the Swift asset catalog; the contrast test enforces the minimums above.
 */
export interface IncreasedContrastColors {
  fg: Pick<SemanticColors["fg"], "secondary" | "tertiary" | "link">;
  line: SemanticColors["line"];
  accent: Pick<SemanticColors["accent"], "text">;
}

export const increasedContrast: Record<ColorScheme, IncreasedContrastColors> = {
  light: {
    fg: { secondary: "#3C424F", tertiary: "#474E5C", link: "#19544F" },
    line: { subtle: "#B7BECD", control: "#626B7C", focus: "#19544F" },
    accent: { text: "#19544F" },
  },
  dark: {
    fg: { secondary: "#C7CCD3", tertiary: "#B4BAC2", link: "#49CCC2" },
    line: { subtle: "#444C59", control: "#8E95A0", focus: "#49CCC2" },
    accent: { text: "#49CCC2" },
  },
};
