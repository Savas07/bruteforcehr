import { describe, expect, it } from "vitest";
import { color, colorSchemes, statusKeys } from "./color.ts";
import { contrastMinimum, contrastPairs, contrastRatio, type ContrastPair } from "./contrast.ts";
import { flattenColors } from "./css.ts";
import { iosReferenceBackgrounds } from "./native.ts";

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
    expect(contrastRatio("#2F54C8", "#2F54C8")).toBe(1);
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
});

describe("token structure", () => {
  it("defines the same tokens in light and dark", () => {
    expect(Object.keys(flattenColors(color.dark))).toEqual(Object.keys(flattenColors(color.light)));
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

  it("has a tone for every status", () => {
    for (const scheme of colorSchemes) {
      expect(Object.keys(color[scheme].status).sort()).toEqual([...statusKeys].sort());
    }
  });
});
