import { describe, expect, it } from "vitest";
import { color, statusKeys } from "./color.ts";
import { createNativeTheme, iosSystemColorNames } from "./native.ts";
import { textStyleKeys } from "./typography.ts";

type FakeColor = { platform: string[] } | { light: string; dark: string };

const theme = createNativeTheme<FakeColor>({
  PlatformColor: (...names) => ({ platform: names }),
  DynamicColorIOS: (tuple) => ({ ...tuple }),
});

describe("createNativeTheme", () => {
  it("uses iOS semantic system colors for backgrounds, labels and separators", () => {
    for (const [key, name] of Object.entries(iosSystemColorNames)) {
      expect(theme.colors[key as keyof typeof iosSystemColorNames]).toEqual({ platform: [name] });
    }
  });

  it("uses brand values for tint, secondary text and statuses", () => {
    expect(theme.colors.tint).toEqual({ light: color.light.accent.text, dark: color.dark.accent.text });
    expect(theme.colors.secondaryText).toEqual({
      light: color.light.fg.secondary,
      dark: color.dark.fg.secondary,
    });
    for (const key of statusKeys) {
      expect(theme.colors.status[key].text).toEqual({
        light: color.light.status[key].text,
        dark: color.dark.status[key].text,
      });
    }
  });

  it("maps every text style to its Dynamic Type ramp", () => {
    for (const key of textStyleKeys) expect(theme.text[key].dynamicTypeRamp).toBe(key);
    expect(theme.text.body).toEqual({
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "400",
      dynamicTypeRamp: "body",
    });
    expect(theme.hitTarget).toBe(44);
  });
});
