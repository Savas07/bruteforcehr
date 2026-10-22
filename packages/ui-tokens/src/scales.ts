import type { ColorScheme } from "./color.ts";

/** 4-pt grid. Keys are grid steps (`space[4]` = 16). Values in px / pt. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;
export type SpaceKey = keyof typeof space;

/** Grid unit (px). Tailwind's `--spacing` is set to this, so `p-3` = 12 px. */
export const gridUnit = 4;

/**
 * Corner radius (px / pt). On Apple platforms, draw `lg`/`xl` with a continuous
 * corner curve (`BFHRRadius.shape(_:)` in the Swift package).
 * - `xs` checkboxes, keycaps · `sm` chips in dense tables, tooltips
 * - `md` buttons, inputs, menu items · `lg` cards, popovers, toasts
 * - `xl` dialogs, sheets, palette · `full` pills, avatars, status dots
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
export type RadiusKey = keyof typeof radius;

/** Border widths (px). `hairline` renders 1 device pixel where supported. */
export const borderWidth = { hairline: 0.5, thin: 1, thick: 2 } as const;

export const elevationKeys = ["raised", "overlay", "modal", "drag"] as const;
export type ElevationKey = (typeof elevationKeys)[number];

/** Apple-platform shadow (SwiftUI `.shadow(color:radius:x:y:)`, CALayer). */
export interface AppleShadow {
  /** Opaque `#RRGGBB`; `opacity` applies on top. */
  color: string;
  opacity: number;
  /** Blur radius (pt). */
  radius: number;
  x: number;
  y: number;
}

export interface Elevation {
  /** CSS `box-shadow`. Dark mode adds a 1 px light ring because shadows read poorly on dark canvases. */
  shadow: string;
  /** iOS / macOS shadow (Swift package). */
  apple: AppleShadow;
}

/**
 * Elevation levels:
 * - `raised`: hovered cards, sticky bars.
 * - `overlay`: popovers, menus, toasts, tooltips.
 * - `modal`: dialogs, command palette, pop-out kit window chrome.
 * - `drag`: a lifted board card / list row while dragging.
 * Surfaces: `raised` sits on `surface.base`; `overlay` and `modal` use `surface.elevated`.
 */
export const elevation: Record<ColorScheme, Record<ElevationKey, Elevation>> = {
  light: {
    raised: {
      shadow: "0 1px 2px rgb(16 24 40 / 0.06), 0 1px 3px rgb(16 24 40 / 0.10)",
      apple: { color: "#101828", opacity: 0.1, radius: 3, x: 0, y: 1 },
    },
    overlay: {
      shadow: "0 4px 6px -2px rgb(16 24 40 / 0.05), 0 12px 16px -4px rgb(16 24 40 / 0.10)",
      apple: { color: "#101828", opacity: 0.12, radius: 12, x: 0, y: 6 },
    },
    modal: {
      shadow: "0 8px 8px -4px rgb(16 24 40 / 0.04), 0 20px 24px -4px rgb(16 24 40 / 0.12)",
      apple: { color: "#101828", opacity: 0.16, radius: 20, x: 0, y: 12 },
    },
    drag: {
      shadow: "0 12px 24px -6px rgb(16 24 40 / 0.18), 0 2px 4px rgb(16 24 40 / 0.06)",
      apple: { color: "#101828", opacity: 0.2, radius: 16, x: 0, y: 8 },
    },
  },
  dark: {
    raised: {
      shadow: "0 0 0 1px rgb(255 255 255 / 0.05), 0 1px 3px rgb(0 0 0 / 0.40)",
      apple: { color: "#000000", opacity: 0.4, radius: 3, x: 0, y: 1 },
    },
    overlay: {
      shadow: "0 0 0 1px rgb(255 255 255 / 0.07), 0 12px 24px -4px rgb(0 0 0 / 0.55)",
      apple: { color: "#000000", opacity: 0.5, radius: 12, x: 0, y: 6 },
    },
    modal: {
      shadow: "0 0 0 1px rgb(255 255 255 / 0.08), 0 24px 48px -8px rgb(0 0 0 / 0.65)",
      apple: { color: "#000000", opacity: 0.6, radius: 24, x: 0, y: 12 },
    },
    drag: {
      shadow: "0 0 0 1px rgb(255 255 255 / 0.08), 0 16px 32px -8px rgb(0 0 0 / 0.70)",
      apple: { color: "#000000", opacity: 0.6, radius: 16, x: 0, y: 8 },
    },
  },
};

/** Durations in ms. */
export const duration = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 300,
  slower: 400,
} as const;
export type DurationKey = keyof typeof duration;

/** Cubic-bezier control points; `css()` in css.ts formats them. */
export const easing = {
  /** Most UI transitions (color, size, position within the same view). */
  standard: [0.2, 0, 0, 1],
  /** Elements entering: decelerate into place. */
  enter: [0, 0, 0, 1],
  /** Elements leaving: accelerate away. */
  exit: [0.3, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type EasingKey = keyof typeof easing;

/**
 * Spring for iOS gestures (SwiftUI `.interpolatingSpring(mass:stiffness:damping:)`):
 * critically damped (damping ≈ 2·√(stiffness·mass)), no overshoot, so drags and
 * sheets settle calmly.
 */
export const spring = {
  standard: { damping: 35, stiffness: 300, mass: 1 },
} as const;

/**
 * Reduced motion (iOS / macOS Reduce Motion, `prefers-reduced-motion: reduce`):
 * movement is replaced by a cross-fade; nothing slides, scales or shimmers.
 */
export const reducedMotion = {
  duration: { instant: 0, fast: 0, base: 100, slow: 100, slower: 100 },
  /** Slide / scale distance multiplier. */
  movement: 0,
  shimmer: false,
} as const satisfies { duration: Record<DurationKey, number>; movement: number; shimmer: boolean };

/** Default slide distance (px) for entering toasts, popovers and rows. */
export const motionDistance = 8;

/**
 * Haptics by meaning (iOS, SwiftUI `sensoryFeedback`). Only these moments
 * vibrate; dismissals, hides and rejections stay silent.
 */
export const haptics = {
  /** Confirm a review item, save a job, mark applied. */
  confirm: "impactLight",
  /** Drag target changes while moving a tracker row. */
  dragTargetChange: "selection",
  /** Long-press value callout on a chart. */
  reveal: "impactLight",
  /** Wrong sign-in code, failed send. */
  error: "error",
} as const satisfies Record<string, "impactLight" | "selection" | "error">;
export type HapticKey = keyof typeof haptics;

/**
 * Behavioral timings shared by every client (ms). Sources: states.md,
 * tracker.md, connect-email.md; reconciled in docs/design/decisions.md.
 */
export const timing = {
  /** Undo toast visible time. Undo itself stays available in history after it hides. */
  toast: 6000,
  /** Toast time with a screen reader on, text > 60 chars, or a bulk action. */
  toastExtended: 10000,
  /** Delay before a skeleton appears on a cold load. */
  skeletonDelay: 300,
  /** Minimum skeleton time once shown (avoids flashes). */
  skeletonMin: 500,
  /** Offline banner debounce. */
  offlineDebounce: 2000,
  /** "Back online" message. */
  backOnline: 3000,
  /** A labelled wait adds "This can take up to a minute…" after this. */
  longWait: 10000,
  /** Highlight on rows that just arrived (imports, auto-applied changes). */
  arrivalHighlight: 2000,
  /** Desktop tooltip open delay. */
  tooltipDelay: 500,
} as const;

/** Minimum interactive target sizes (px / pt). */
export const hitTarget = {
  /** iOS (HIG): every tappable element. */
  ios: 44,
  /** Website: touch-first breakpoints (WCAG 2.5.5 AAA size, used as our floor). */
  web: 44,
  /** Desktop floor (WCAG 2.2 SC 2.5.8 AA): icon buttons in dense rows. */
  desktopMin: 24,
  /** Desktop default control height. */
  desktop: 32,
} as const;

/** Desktop control heights (px). */
export const controlHeight = { sm: 24, md: 32, lg: 40 } as const;

/** Icon sizes (px / pt). */
export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28, empty: 48 } as const;

/**
 * Desktop layout constants (px), reconciled in docs/design/decisions.md.
 * Breakpoints are window widths. The window minimum follows Microsoft's Snap
 * guidance (desktop-chrome.md); screens degrade through the breakpoints below.
 */
export const layout = {
  windowMin: { width: 480, height: 360 },
  /** Title-bar row: macOS hidden-inset toolbar, Windows title-bar overlay. */
  chrome: { macos: 52, windows: 40 },
  sidebar: 232,
  /** Icon-only sidebar below `breakpoint.compact`. */
  sidebarRail: 60,
  listPane: { default: 400, min: 340, max: 440 },
  detailPaneMin: 480,
  sidePanel: { default: 480, min: 400, max: 640 },
  boardColumn: 272,
  boardColumnCollapsed: 40,
  settingsNav: 220,
  readingMax: 720,
  breakpoint: {
    /** Below: the sidebar becomes the icon rail. */
    compact: 640,
    /** Below: detail panes push instead of splitting. */
    narrow: 980,
    /** Below: previews (CV, email compose) become a toggle. */
    preview: 1100,
    /** At or above: Today detail pane, filter bar on one line. */
    detail: 1200,
    /** At or above: agenda rail (Today), details rail (Mail). */
    wide: 1440,
  },
  /** Website max content width (px). */
  webContentMax: 1152,
} as const;

/**
 * Stacking order (CSS z-index). Menus, selects and popovers share `popover` so
 * they also open above dialogs.
 */
export const layer = {
  base: 0,
  sticky: 10,
  modal: 50,
  popover: 60,
  toast: 70,
  palette: 80,
  tooltip: 90,
} as const;
