/**
 * Type scale. Every style is named after its iOS Dynamic Type text style so a
 * design reads the same on both platforms:
 * - `ios`: Apple's default ("Large") content-size values in points. React Native
 *   scales them with Dynamic Type through `dynamicTypeRamp`, up to AX5.
 * - `desktop`: px for Electron (rendered as rem so OS/app zoom scales them).
 *   Body is 14 px, the shared desktop size of macOS list content and Windows
 *   Fluent body text.
 * - `family`: `display` for large titles (SF Pro Display / Segoe UI Variable
 *   Display optical sizes), `sans` for everything else.
 */

export const textStyleKeys = [
  "largeTitle",
  "title1",
  "title2",
  "title3",
  "headline",
  "body",
  "callout",
  "subheadline",
  "footnote",
  "caption1",
  "caption2",
] as const;
export type TextStyleKey = (typeof textStyleKeys)[number];

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

export interface TextMetrics {
  size: number;
  lineHeight: number;
  weight: FontWeight;
}

export interface TextStyle {
  family: "sans" | "display";
  ios: TextMetrics & {
    /** Weight for bold/emphasized variants (HIG "emphasized"). */ emphasizedWeight: FontWeight;
  };
  desktop: TextMetrics;
}

export const textStyles: Record<TextStyleKey, TextStyle> = {
  largeTitle: {
    family: "display",
    ios: { size: 34, lineHeight: 41, weight: 400, emphasizedWeight: 700 },
    desktop: { size: 26, lineHeight: 32, weight: 600 },
  },
  title1: {
    family: "display",
    ios: { size: 28, lineHeight: 34, weight: 400, emphasizedWeight: 700 },
    desktop: { size: 22, lineHeight: 28, weight: 600 },
  },
  title2: {
    family: "sans",
    ios: { size: 22, lineHeight: 28, weight: 400, emphasizedWeight: 700 },
    desktop: { size: 18, lineHeight: 24, weight: 600 },
  },
  title3: {
    family: "sans",
    ios: { size: 20, lineHeight: 25, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 16, lineHeight: 22, weight: 600 },
  },
  headline: {
    family: "sans",
    ios: { size: 17, lineHeight: 22, weight: 600, emphasizedWeight: 600 },
    desktop: { size: 14, lineHeight: 20, weight: 600 },
  },
  body: {
    family: "sans",
    ios: { size: 17, lineHeight: 22, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 14, lineHeight: 20, weight: 400 },
  },
  callout: {
    family: "sans",
    ios: { size: 16, lineHeight: 21, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 13, lineHeight: 18, weight: 400 },
  },
  subheadline: {
    family: "sans",
    ios: { size: 15, lineHeight: 20, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 13, lineHeight: 18, weight: 400 },
  },
  footnote: {
    family: "sans",
    ios: { size: 13, lineHeight: 18, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 12, lineHeight: 16, weight: 400 },
  },
  caption1: {
    family: "sans",
    ios: { size: 12, lineHeight: 16, weight: 400, emphasizedWeight: 500 },
    desktop: { size: 12, lineHeight: 16, weight: 400 },
  },
  caption2: {
    family: "sans",
    ios: { size: 11, lineHeight: 13, weight: 400, emphasizedWeight: 600 },
    desktop: { size: 11, lineHeight: 14, weight: 500 },
  },
};

/**
 * Website-only display sizes (Astro). Fluid between the 375 px and 1440 px
 * capture widths (BRIEF §5.5); `min`/`max` are px at those widths.
 */
export const marketingTextKeys = ["display", "headline", "lead", "prose"] as const;
export type MarketingTextKey = (typeof marketingTextKeys)[number];

export interface FluidTextStyle {
  family: "sans" | "display";
  weight: FontWeight;
  min: { size: number; lineHeight: number };
  max: { size: number; lineHeight: number };
}

export const marketingTextStyles: Record<MarketingTextKey, FluidTextStyle> = {
  display: {
    family: "display",
    weight: 600,
    min: { size: 36, lineHeight: 44 },
    max: { size: 56, lineHeight: 64 },
  },
  headline: {
    family: "display",
    weight: 600,
    min: { size: 26, lineHeight: 32 },
    max: { size: 36, lineHeight: 44 },
  },
  lead: { family: "sans", weight: 400, min: { size: 18, lineHeight: 28 }, max: { size: 20, lineHeight: 30 } },
  prose: {
    family: "sans",
    weight: 400,
    min: { size: 16, lineHeight: 26 },
    max: { size: 17, lineHeight: 28 },
  },
};

/** Viewport range the fluid website sizes interpolate over (px). */
export const fluidViewport = { min: 375, max: 1440 } as const;

/**
 * Font stacks. Apple platforms resolve `-apple-system` to SF Pro (Text/Display
 * optical sizes chosen automatically); Windows 11 gets Segoe UI Variable, with
 * Segoe UI as the Windows 10 fallback. iOS uses the system font directly
 * (no `fontFamily` in React Native). No web fonts are downloaded.
 */
export const fontFamily = {
  sans: [
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI Variable Text"',
    '"Segoe UI"',
    "system-ui",
    '"Noto Sans"',
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
  ],
  display: [
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI Variable Display"',
    '"Segoe UI"',
    "system-ui",
    '"Noto Sans"',
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
  ],
  mono: [
    "ui-monospace",
    '"SF Mono"',
    "SFMono-Regular",
    '"Cascadia Mono"',
    "Consolas",
    '"Liberation Mono"',
    "monospace",
  ],
} as const;
export type FontFamilyKey = keyof typeof fontFamily;
