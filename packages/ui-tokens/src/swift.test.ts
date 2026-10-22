import { describe, expect, it } from "vitest";
import { swiftPackageDrift } from "../scripts/swift-package.ts";
import { appleSystemColors } from "./apple.ts";
import { color, increasedContrast, statusKeys } from "./color.ts";
import { flattenColors } from "./css.ts";
import { renderColorSets, renderPackageSwift, renderSwiftPackage, renderTokensSwift } from "./swift.ts";
import { textStyleKeys } from "./typography.ts";

const tokensSwift = renderTokensSwift();
const colorSets = renderColorSets();

interface ColorSet {
  colors: {
    appearances?: { appearance: string; value: string }[];
    color: { "color-space": string; components: Record<"red" | "green" | "blue" | "alpha", string> };
    idiom: string;
  }[];
}

const hexOf = (entry: ColorSet["colors"][number]) => {
  const { red, green, blue, alpha } = entry.color.components;
  const rgb = `#${[red, green, blue].map((channel) => channel.slice(2)).join("")}`;
  return alpha === "1.000"
    ? rgb
    : `${rgb}${Math.round(Number(alpha) * 255)
        .toString(16)
        .toUpperCase()}`;
};
const appearanceKey = (entry: ColorSet["colors"][number]) =>
  (entry.appearances ?? []).map((a) => `${a.appearance}:${a.value}`).join(",");

describe("committed Swift package", () => {
  it("matches the generator (run `pnpm --filter @bfhr/ui-tokens generate:swift` and commit)", async () => {
    expect(await swiftPackageDrift()).toEqual({ missing: [], changed: [], extra: [] });
  });
});

describe("asset catalog", () => {
  it("has one color set per token with its light and dark values", () => {
    const light = flattenColors(color.light);
    const dark = flattenColors(color.dark);
    expect(Object.keys(colorSets)).toEqual(Object.keys(light));
    for (const [name, contents] of Object.entries(colorSets)) {
      const byAppearance = Object.fromEntries(
        (JSON.parse(contents) as ColorSet).colors.map((entry) => [appearanceKey(entry), hexOf(entry)]),
      );
      expect(byAppearance[""], name).toBe(light[name]);
      expect(byAppearance["luminosity:dark"], name).toBe(dark[name]);
    }
  });

  it("adds Increase Contrast variants for the increased-contrast roles only", () => {
    const lightHigh = flattenColors(increasedContrast.light);
    const darkHigh = flattenColors(increasedContrast.dark);
    for (const [name, contents] of Object.entries(colorSets)) {
      const entries = (JSON.parse(contents) as ColorSet).colors;
      const byAppearance = Object.fromEntries(entries.map((entry) => [appearanceKey(entry), hexOf(entry)]));
      if (name in lightHigh) {
        expect(entries, name).toHaveLength(4);
        expect(byAppearance["contrast:high"], name).toBe(lightHigh[name]);
        expect(byAppearance["luminosity:dark,contrast:high"], name).toBe(darkHigh[name]);
      } else {
        expect(entries, name).toHaveLength(2);
      }
    }
  });

  it("keeps alpha for the scrim", () => {
    const scrim = JSON.parse(colorSets["surface-scrim"] ?? "{}") as ColorSet;
    expect(scrim.colors.map(hexOf)).toEqual([color.light.surface.scrim, color.dark.surface.scrim]);
  });
});

describe("Tokens.swift", () => {
  it("references every color set", () => {
    for (const name of Object.keys(colorSets))
      expect(tokensSwift).toContain(`Color("${name}", bundle: .module)`);
  });

  it("uses iOS system colors for backgrounds, labels, separators and fills", () => {
    for (const [key, system] of Object.entries(appleSystemColors)) {
      expect(tokensSwift).toContain(`public static let ${key} = Color(uiColor: .${system.uiKit})`);
      expect(tokensSwift).toContain(`public static let ${key} = Color(nsColor: .${system.appKit})`);
    }
    expect(tokensSwift).toContain("public static let tint = Accent.text");
  });

  it("mirrors the core status and phase enums", () => {
    for (const key of statusKeys) expect(tokensSwift).toContain(`case .${key}: Status.${key}`);
    expect(tokensSwift).toContain('case inProgress = "in_progress"');
  });

  it("maps every text style to a Dynamic Type text style", () => {
    for (const key of textStyleKeys)
      expect(tokensSwift).toMatch(new RegExp(`case \\.${key}: \\.[a-zA-Z0-9]+\\n`));
    expect(tokensSwift).toContain("case .title1: .title\n");
    expect(tokensSwift).toContain("case .caption1: .caption\n");
    expect(tokensSwift).toContain("public var font: Font { .system(textStyle, weight: weight) }");
  });

  it("has Reduce Motion variants for durations, springs, distance and shimmer", () => {
    expect(tokensSwift).toContain("case .fast: reduceMotion ? 0 : 0.12");
    expect(tokensSwift).toContain("case .base: reduceMotion ? 0.1 : 0.2");
    expect(tokensSwift).toContain(".interpolatingSpring(mass: 1, stiffness: 300, damping: 35)");
    expect(tokensSwift).toContain("reduceMotion ? 0 : 8");
    expect(tokensSwift).toContain("public static let minimum: CGFloat = 44");
  });
});

describe("Package.swift", () => {
  it("targets iOS 18 and macOS 15 and bundles the asset catalog", () => {
    const manifest = renderPackageSwift();
    expect(manifest).toContain("platforms: [.iOS(.v18), .macOS(.v15)]");
    expect(manifest).toContain('resources: [.process("Colors.xcassets")]');
    expect(Object.keys(renderSwiftPackage())).toContain("Sources/BFHRDesignTokens/Tokens.swift");
  });
});
