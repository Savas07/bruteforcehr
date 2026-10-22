import { describe, expect, it } from "vitest";
import { iosReferenceBackgrounds } from "./apple.ts";
import { color, colorSchemes, increasedContrast, statusKeys } from "./color.ts";
import {
  contrastMinimum,
  contrastPairs,
  contrastRatio,
  increasedContrastPairs,
  type ContrastPair,
} from "./contrast.ts";
import { flattenColors } from "./css.ts";

const failures = (pairs: ContrastPair[]) =>
  pairs
    .map((pair) => ({
      ...pair,
      ratio: Number(contrastRatio(pair.foregroundValue, pair.backgroundValue).toFixed(2)),
    }))
    .filter((pair) => pair.ratio < contrastMinimum[pair.kind])
    .map(
      (pair) =>
        `${pair.foreground} ${pair.foregroundValue} on ${pair.background} ${pair.backgroundValue}: ${pair.ratio} < ${contrastMinimum[pair.kind]} (${pair.kind})`,
    );

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#216863", "#216863")).toBe(1);
  });

  it("rejects colors with alpha", () => {
    expect(() => contrastRatio("#0E101466", "#FFFFFF")).toThrow(/opaque/);
  });
});

describe.each(colorSchemes)("%s scheme meets WCAG 2.1 AA", (scheme) => {
  it("for every text/background and UI/background pair on token surfaces", () => {
    const pairs = contrastPairs(color[scheme]);
    expect(pairs.length).toBeGreaterThan(300);
    expect(failures(pairs)).toEqual([]);
  });

  it("for brand colors on iOS system backgrounds", () => {
    expect(failures(contrastPairs(color[scheme], iosReferenceBackgrounds[scheme]))).toEqual([]);
  });

  it("keeps white text on every accent fill (primary button states)", () => {
    const { accent, fg } = color[scheme];
    for (const fill of [accent.solid, accent.hover, accent.pressed]) {
      expect(contrastRatio(fg.onAccent, fill)).toBeGreaterThanOrEqual(contrastMinimum.text);
    }
  });
});

describe.each(colorSchemes)("%s increased-contrast overrides", (scheme) => {
  const ic = increasedContrast[scheme];

  it("reach 7:1 for text and 4.5:1 for control lines on token surfaces", () => {
    const pairs = increasedContrastPairs(color[scheme], ic);
    expect(pairs.length).toBe(6 * 6 + 1);
    expect(failures(pairs)).toEqual([]);
  });

  it("reach the same minimums on iOS system backgrounds", () => {
    expect(failures(increasedContrastPairs(color[scheme], ic, iosReferenceBackgrounds[scheme]))).toEqual([]);
  });

  it("only ever raise contrast against the base surface", () => {
    const base = color[scheme].surface.base;
    const defaults = flattenColors(color[scheme]);
    for (const [name, value] of Object.entries(flattenColors(ic))) {
      const original = defaults[name];
      expect(original, name).toBeDefined();
      expect(contrastRatio(value, base), name).toBeGreaterThan(contrastRatio(original ?? value, base));
    }
  });
});

describe("token structure", () => {
  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(flattenColors(color.dark))).toEqual(Object.keys(flattenColors(color.light)));
    expect(Object.keys(flattenColors(increasedContrast.dark))).toEqual(
      Object.keys(flattenColors(increasedContrast.light)),
    );
  });

  it("never colors a rejection like an error", () => {
    for (const scheme of colorSchemes) {
      const { status, danger, warning, phase } = color[scheme];
      for (const value of Object.values(status.rejected)) {
        expect(Object.values(danger)).not.toContain(value);
        expect(Object.values(warning)).not.toContain(value);
      }
      expect(status.rejected).toEqual(phase.closed);
    }
  });

  it("keeps every closed outcome except Accepted on the neutral Closed tone", () => {
    for (const scheme of colorSchemes) {
      const { status, phase } = color[scheme];
      for (const key of ["declined", "rejected", "withdrawn", "ghosted"] as const) {
        expect(status[key]).toEqual(phase.closed);
      }
    }
  });

  it("has a tone for every status", () => {
    for (const scheme of colorSchemes) {
      expect(Object.keys(color[scheme].status).sort()).toEqual([...statusKeys].sort());
    }
  });
});
