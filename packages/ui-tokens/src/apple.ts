/**
 * Apple-platform system colors used by the Swift package.
 *
 * Where the HIG expects system colors (screen and grouped backgrounds, primary
 * labels, separators, fills), SwiftUI code uses these, so Dark Mode, Increase
 * Contrast and elevated sheet backgrounds come from the OS. Brand colors (tint,
 * secondary and tertiary text, status, feedback, toast) come from the token
 * asset catalog. Secondary and tertiary text use brand values because iOS
 * `secondaryLabel` is ≈ 3.4:1 on white in light mode, below WCAG AA for text.
 */
import type { ColorScheme } from "./color.ts";

export interface AppleSystemColor {
  /** `UIColor` class property (iOS). */
  uiKit: string;
  /** `NSColor` class property (macOS: previews and host builds of the package). */
  appKit: string;
}

export const appleSystemColors = {
  background: { uiKit: "systemBackground", appKit: "windowBackgroundColor" },
  secondaryBackground: { uiKit: "secondarySystemBackground", appKit: "controlBackgroundColor" },
  tertiaryBackground: { uiKit: "tertiarySystemBackground", appKit: "textBackgroundColor" },
  groupedBackground: { uiKit: "systemGroupedBackground", appKit: "windowBackgroundColor" },
  secondaryGroupedBackground: { uiKit: "secondarySystemGroupedBackground", appKit: "controlBackgroundColor" },
  tertiaryGroupedBackground: { uiKit: "tertiarySystemGroupedBackground", appKit: "textBackgroundColor" },
  label: { uiKit: "label", appKit: "labelColor" },
  separator: { uiKit: "separator", appKit: "separatorColor" },
  opaqueSeparator: { uiKit: "opaqueSeparator", appKit: "gridColor" },
  fill: { uiKit: "systemFill", appKit: "systemFill" },
  secondaryFill: { uiKit: "secondarySystemFill", appKit: "secondarySystemFill" },
  tertiaryFill: { uiKit: "tertiarySystemFill", appKit: "tertiarySystemFill" },
} as const satisfies Record<string, AppleSystemColor>;
export type AppleSystemColorKey = keyof typeof appleSystemColors;

/**
 * Published sRGB values of the iOS backgrounds brand colors sit on (base and
 * elevated). Used by the contrast test; never rendered.
 */
export const iosReferenceBackgrounds: Record<ColorScheme, Record<string, string>> = {
  light: {
    "ios.systemBackground": "#FFFFFF",
    "ios.systemGroupedBackground": "#F2F2F7",
    "ios.secondarySystemBackground": "#F2F2F7",
  },
  dark: {
    "ios.systemBackground": "#000000",
    "ios.secondarySystemBackground": "#1C1C1E",
    "ios.tertiarySystemBackground": "#2C2C2E",
  },
};
