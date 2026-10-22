/**
 * React Native (iOS) theme.
 *
 * Where the HIG expects system colors (screen and grouped backgrounds, primary
 * labels, separators, fills) the theme uses `PlatformColor`, so Dark Mode,
 * Increase Contrast and elevated sheet backgrounds come from iOS itself. Brand
 * colors (tint, status, feedback, toast) use `DynamicColorIOS` with the token
 * values. Secondary and tertiary text also use brand values: iOS
 * `secondaryLabel` is ≈ 3.4:1 on white in light mode, below WCAG AA for text.
 *
 * The package doesn't depend on `react-native`; the app passes its color APIs:
 *
 * ```ts
 * import { DynamicColorIOS, PlatformColor } from "react-native";
 * import { createNativeTheme } from "@bfhr/ui-tokens/native";
 * export const theme = createNativeTheme({ PlatformColor, DynamicColorIOS });
 * ```
 */
import {
  color,
  phaseKeys,
  statusKeys,
  type ColorScheme,
  type PhaseKey,
  type SemanticColors,
  type StatusKey,
  type Tone,
} from "./color.ts";
import {
  elevation,
  duration,
  easing,
  hitTarget,
  iconSize,
  radius,
  reducedMotion,
  space,
  spring,
  timing,
  type ElevationKey,
  type NativeShadow,
} from "./scales.ts";
import { textStyleKeys, textStyles, type FontWeight, type TextStyleKey } from "./typography.ts";

/** The subset of `react-native`'s color API the theme needs (structurally typed). */
export interface NativeColorApi<C> {
  PlatformColor: (...names: string[]) => C;
  DynamicColorIOS: (tuple: { light: string; dark: string }) => C;
}

/** iOS semantic system colors the theme uses (UIKit names). */
export const iosSystemColorNames = {
  background: "systemBackground",
  secondaryBackground: "secondarySystemBackground",
  tertiaryBackground: "tertiarySystemBackground",
  groupedBackground: "systemGroupedBackground",
  secondaryGroupedBackground: "secondarySystemGroupedBackground",
  tertiaryGroupedBackground: "tertiarySystemGroupedBackground",
  label: "label",
  separator: "separator",
  opaqueSeparator: "opaqueSeparator",
  fill: "systemFill",
  secondaryFill: "secondarySystemFill",
  tertiaryFill: "tertiarySystemFill",
} as const;
export type IosSystemColorKey = keyof typeof iosSystemColorNames;

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

export interface NativeTone<C> {
  text: C;
  subtle: C;
  solid: C;
}

export interface NativeColors<C> extends Record<IosSystemColorKey, C> {
  /** Text buttons, links, icons, selected controls (`tintColor`). */
  tint: C;
  /** Filled primary button. */
  accent: C;
  accentSubtle: C;
  onAccent: C;
  secondaryText: C;
  /** Meta text and `placeholderTextColor`. */
  tertiaryText: C;
  disabledText: C;
  focus: C;
  success: NativeTone<C>;
  warning: NativeTone<C>;
  danger: NativeTone<C> & { fill: C };
  onDanger: C;
  info: NativeTone<C>;
  phase: Record<PhaseKey, NativeTone<C>>;
  status: Record<StatusKey, NativeTone<C>>;
  chart: { series: C; neutral: C; grid: C };
  skeleton: { base: C; highlight: C };
  toast: { bg: C; text: C; action: C };
}

export interface NativeTextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: `${FontWeight}`;
  /** Pass to `<Text dynamicTypeRamp>` so iOS scales the style with Dynamic Type. */
  dynamicTypeRamp: TextStyleKey;
}

/**
 * Haptics by meaning (expo-haptics). Only these moments vibrate; dismissals,
 * hides and rejections stay silent.
 */
export const haptics = {
  /** Confirm a review item, save a job, mark applied. */
  confirm: { kind: "impact", style: "light" },
  /** Drag target changes while moving a tracker row. */
  dragTargetChange: { kind: "selection" },
  /** Long-press value callout on a chart. */
  reveal: { kind: "impact", style: "light" },
  /** Wrong sign-in code, failed send. */
  error: { kind: "notification", type: "error" },
} as const;

export interface NativeTheme<C> {
  colors: NativeColors<C>;
  text: Record<TextStyleKey, NativeTextStyle>;
  emphasizedWeight: Record<TextStyleKey, `${FontWeight}`>;
  space: typeof space;
  radius: typeof radius;
  hitTarget: number;
  iconSize: typeof iconSize;
  elevation: Record<ColorScheme, Record<ElevationKey, NativeShadow>>;
  motion: {
    duration: typeof duration;
    reducedDuration: typeof reducedMotion.duration;
    easing: typeof easing;
    spring: typeof spring;
  };
  timing: typeof timing;
  haptics: typeof haptics;
}

export function createNativeTheme<C>(rn: NativeColorApi<C>): NativeTheme<C> {
  const { light, dark } = color;
  const dynamic = (pick: (scheme: SemanticColors) => string) =>
    rn.DynamicColorIOS({ light: pick(light), dark: pick(dark) });
  const tone = (pick: (scheme: SemanticColors) => Tone): NativeTone<C> => ({
    text: dynamic((s) => pick(s).text),
    subtle: dynamic((s) => pick(s).subtle),
    solid: dynamic((s) => pick(s).solid),
  });

  const system = Object.fromEntries(
    Object.entries(iosSystemColorNames).map(([key, name]) => [key, rn.PlatformColor(name)]),
  ) as Record<IosSystemColorKey, C>;

  const colors: NativeColors<C> = {
    ...system,
    tint: dynamic((s) => s.accent.text),
    accent: dynamic((s) => s.accent.solid),
    accentSubtle: dynamic((s) => s.accent.subtle),
    onAccent: dynamic((s) => s.fg.onAccent),
    secondaryText: dynamic((s) => s.fg.secondary),
    tertiaryText: dynamic((s) => s.fg.tertiary),
    disabledText: dynamic((s) => s.fg.disabled),
    focus: dynamic((s) => s.line.focus),
    success: tone((s) => s.success),
    warning: tone((s) => s.warning),
    danger: { ...tone((s) => s.danger), fill: dynamic((s) => s.danger.fill) },
    onDanger: dynamic((s) => s.fg.onDanger),
    info: tone((s) => s.info),
    phase: Object.fromEntries(phaseKeys.map((key) => [key, tone((s) => s.phase[key])])) as Record<
      PhaseKey,
      NativeTone<C>
    >,
    status: Object.fromEntries(statusKeys.map((key) => [key, tone((s) => s.status[key])])) as Record<
      StatusKey,
      NativeTone<C>
    >,
    chart: {
      series: dynamic((s) => s.chart.series),
      neutral: dynamic((s) => s.chart.neutral),
      grid: dynamic((s) => s.chart.grid),
    },
    skeleton: { base: dynamic((s) => s.skeleton.base), highlight: dynamic((s) => s.skeleton.highlight) },
    toast: {
      bg: dynamic((s) => s.toast.bg),
      text: dynamic((s) => s.toast.text),
      action: dynamic((s) => s.toast.action),
    },
  };

  const text = Object.fromEntries(
    textStyleKeys.map((key) => {
      const { size, lineHeight, weight } = textStyles[key].ios;
      return [key, { fontSize: size, lineHeight, fontWeight: `${weight}`, dynamicTypeRamp: key }];
    }),
  ) as Record<TextStyleKey, NativeTextStyle>;

  const emphasizedWeight = Object.fromEntries(
    textStyleKeys.map((key) => [key, `${textStyles[key].ios.emphasizedWeight}`]),
  ) as Record<TextStyleKey, `${FontWeight}`>;

  const nativeElevation = (scheme: ColorScheme) =>
    Object.fromEntries(
      Object.entries(elevation[scheme]).map(([key, level]) => [key, level.native]),
    ) as Record<ElevationKey, NativeShadow>;

  return {
    colors,
    text,
    emphasizedWeight,
    space,
    radius,
    hitTarget: hitTarget.ios,
    iconSize,
    elevation: { light: nativeElevation("light"), dark: nativeElevation("dark") },
    motion: { duration, reducedDuration: reducedMotion.duration, easing, spring },
    timing,
    haptics,
  };
}
