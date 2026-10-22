import { describe, expect, it } from "vitest";
import { color } from "./color.ts";
import { flattenColors, fluidClamp, kebab, renderTailwindCss, renderTokensCss } from "./css.ts";

const tokensCss = renderTokensCss();
const tailwindCss = renderTailwindCss();

/** Evaluates `clamp(a rem, b rem + c vw, d rem)` at a viewport width, in px. */
function clampAt(expression: string, viewport: number): number {
  const match = /clamp\(([\d.]+)rem, (-?[\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)/.exec(expression);
  if (!match) throw new Error(`Not a fluid clamp: ${expression}`);
  const [min, intercept, slope, max] = match.slice(1).map(Number) as [number, number, number, number];
  return Math.min(Math.max(intercept * 16 + (slope * viewport) / 100, min * 16), max * 16);
}

describe("kebab", () => {
  it("converts camelCase and snake_case token keys", () => {
    expect(kebab("largeTitle")).toBe("large-title");
    expect(kebab("in_progress")).toBe("in-progress");
    expect(kebab("onAccent")).toBe("on-accent");
    expect(kebab("caption1")).toBe("caption1");
  });
});

describe("tokens.css", () => {
  it("declares every color for both schemes", () => {
    for (const [name, value] of Object.entries(flattenColors(color.light))) {
      expect(tokensCss).toContain(`--bfhr-color-${name}: ${value};`);
    }
    for (const [name, value] of Object.entries(flattenColors(color.dark))) {
      expect(tokensCss).toContain(`--bfhr-color-${name}: ${value};`);
    }
  });

  it("switches on the OS setting unless data-theme overrides it", () => {
    expect(tokensCss).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {');
    expect(tokensCss).toContain('[data-theme="dark"] {\n  color-scheme: dark;');
    expect(tokensCss).toContain('[data-theme="light"] {\n  color-scheme: light;');
  });

  it("removes movement under reduced motion", () => {
    expect(tokensCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\n {2}:root \{[^}]*--bfhr-motion-distance: 0px;/,
    );
  });
});

describe("tailwind.css", () => {
  it("only references variables that tokens.css defines", () => {
    const referenced = new Set([...tailwindCss.matchAll(/var\((--bfhr-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect(referenced.size).toBeGreaterThan(100);
    for (const name of referenced) expect(tokensCss).toContain(`${name}:`);
  });

  it("resets Tailwind defaults so only tokens compile", () => {
    for (const namespace of ["--color-*", "--text-*", "--radius-*", "--shadow-*", "--ease-*"]) {
      expect(tailwindCss).toContain(`${namespace}: initial;`);
    }
    expect(tailwindCss).toContain("--color-status-rejected-text: var(--bfhr-color-status-rejected-text);");
    expect(tailwindCss).toContain(
      "--text-large-title--line-height: var(--bfhr-text-large-title-line-height);",
    );
  });
});

describe("fluidClamp", () => {
  it("hits the min size at 375 px and the max size at 1440 px", () => {
    const expression = fluidClamp(36, 56);
    expect(clampAt(expression, 375)).toBeCloseTo(36, 1);
    expect(clampAt(expression, 1440)).toBeCloseTo(56, 1);
    expect(clampAt(expression, 2560)).toBe(56);
  });
});
