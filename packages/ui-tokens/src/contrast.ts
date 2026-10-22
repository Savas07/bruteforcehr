import type { SemanticColors, Tone } from "./color.ts";
import { phaseKeys, statusKeys } from "./color.ts";

/** WCAG 2.1 AA minimums. */
export const contrastMinimum = {
  /** SC 1.4.3, normal text. */
  text: 4.5,
  /** SC 1.4.3, large text: ≥ 24 px regular or ≥ 18.66 px bold. */
  largeText: 3,
  /** SC 1.4.11, UI components and meaningful graphics. */
  ui: 3,
} as const;
export type ContrastKind = keyof typeof contrastMinimum;

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque `#RRGGBB` color. */
export function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Expected an opaque #RRGGBB color, got ${hex}`);
  }
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** WCAG contrast ratio between two opaque colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function meetsContrast(foreground: string, background: string, kind: ContrastKind): boolean {
  return contrastRatio(foreground, background) >= contrastMinimum[kind];
}

export interface ContrastPair {
  /** Token paths, e.g. `fg.secondary` on `surface.sunken`. */
  foreground: string;
  background: string;
  foregroundValue: string;
  backgroundValue: string;
  kind: ContrastKind;
}

/**
 * Every foreground/background combination the system allows (see
 * docs/design/system.md "Color usage"). A pairing not listed here is not
 * allowed in product UI.
 *
 * `surfaces` defaults to the token surfaces a foreground may sit on; pass
 * platform backgrounds (e.g. iOS system backgrounds) to check brand colors
 * used on them.
 */
export function contrastPairs(
  c: SemanticColors,
  surfaces: Record<string, string> = {
    "surface.canvas": c.surface.canvas,
    "surface.base": c.surface.base,
    "surface.sunken": c.surface.sunken,
    "surface.elevated": c.surface.elevated,
    "surface.hover": c.surface.hover,
    "surface.selected": c.surface.selected,
  },
): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  const add = (
    foreground: string,
    foregroundValue: string,
    background: string,
    backgroundValue: string,
    kind: ContrastKind,
  ) => {
    pairs.push({ foreground, background, foregroundValue, backgroundValue, kind });
  };
  const onSurfaces = (foreground: string, value: string, kind: ContrastKind) => {
    for (const [background, backgroundValue] of Object.entries(surfaces)) {
      add(foreground, value, background, backgroundValue, kind);
    }
  };

  onSurfaces("fg.primary", c.fg.primary, "text");
  onSurfaces("fg.secondary", c.fg.secondary, "text");
  onSurfaces("fg.tertiary", c.fg.tertiary, "text");
  onSurfaces("fg.link", c.fg.link, "text");
  onSurfaces("accent.text", c.accent.text, "text");
  onSurfaces("line.control", c.line.control, "ui");
  onSurfaces("line.focus", c.line.focus, "ui");
  onSurfaces("accent.solid", c.accent.solid, "ui");
  onSurfaces("chart.series", c.chart.series, "ui");
  onSurfaces("chart.neutral", c.chart.neutral, "ui");

  add("fg.onAccent", c.fg.onAccent, "accent.solid", c.accent.solid, "text");
  add("fg.onAccent", c.fg.onAccent, "accent.hover", c.accent.hover, "text");
  add("fg.onAccent", c.fg.onAccent, "accent.pressed", c.accent.pressed, "text");
  add("fg.primary", c.fg.primary, "accent.subtle", c.accent.subtle, "text");
  add("accent.text", c.accent.text, "accent.subtle", c.accent.subtle, "text");
  add("fg.onDanger", c.fg.onDanger, "danger.fill", c.danger.fill, "text");
  onSurfaces("danger.fill", c.danger.fill, "ui");

  add("toast.text", c.toast.text, "toast.bg", c.toast.bg, "text");
  add("toast.action", c.toast.action, "toast.bg", c.toast.bg, "text");

  const tone = (name: string, t: Tone) => {
    add(`${name}.text`, t.text, `${name}.subtle`, t.subtle, "text");
    onSurfaces(`${name}.text`, t.text, "text");
    onSurfaces(`${name}.solid`, t.solid, "ui");
  };
  tone("success", c.success);
  tone("warning", c.warning);
  tone("danger", c.danger);
  tone("info", c.info);
  for (const key of phaseKeys) tone(`phase.${key}`, c.phase[key]);
  for (const key of statusKeys) tone(`status.${key}`, c.status[key]);

  return pairs;
}
