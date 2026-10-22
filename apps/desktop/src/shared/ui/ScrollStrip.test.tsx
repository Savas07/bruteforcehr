// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScrollStrip } from "./ScrollStrip";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A strip 300 px wide holding 900 px of content (happy-dom has no layout, so sizes are stubbed). */
function renderStrip(label?: string): HTMLElement {
  act(() =>
    root.render(
      <ScrollStrip {...(label !== undefined && { label })}>
        <button type="button">Edit</button>
        <button type="button">Preview</button>
      </ScrollStrip>,
    ),
  );
  const strip = container.firstElementChild;
  if (!(strip instanceof HTMLElement)) throw new Error("no strip");
  Object.defineProperty(strip, "scrollWidth", { value: 900 });
  Object.defineProperty(strip, "clientWidth", { value: 300 });
  return strip;
}

const wheel = (strip: HTMLElement, deltaY: number, deltaX = 0) => {
  const event = new WheelEvent("wheel", { deltaY, deltaX, bubbles: true, cancelable: true });
  strip.dispatchEvent(event);
  return event;
};

describe("ScrollStrip", () => {
  it("hides the bar but scrolls sideways with a vertical wheel", () => {
    const strip = renderStrip();
    expect(strip.className.split(" ")).toEqual(
      expect.arrayContaining(["scrollbar-hidden", "overflow-x-auto"]),
    );
    const event = wheel(strip, 120);
    expect(strip.scrollLeft).toBe(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the wheel to the page at its edges and for horizontal gestures", () => {
    const strip = renderStrip();
    expect(wheel(strip, -50).defaultPrevented).toBe(false); // already at the start
    expect(wheel(strip, 10, 80).defaultPrevented).toBe(false); // trackpad swipe: native
    strip.scrollLeft = 600;
    expect(wheel(strip, 50).defaultPrevented).toBe(false); // at the end
  });

  it("is a focusable, named region only when its content can't take focus", () => {
    const withButtons = renderStrip();
    expect(withButtons.hasAttribute("tabindex")).toBe(false);
    expect(withButtons.hasAttribute("role")).toBe(false);
    const region = renderStrip("Board columns");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Board columns");
    expect(region.tabIndex).toBe(0);
  });
});

describe("scrollbar styles (app.css)", () => {
  // Vitest runs from apps/desktop (happy-dom gives `import.meta.url` an http scheme).
  const css = readFileSync(path.join(process.cwd(), "src/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("restyles scrollbars on Windows only, keeping macOS overlay scrollbars", () => {
    const webkitRules = [...css.matchAll(/^\s*([^{}\n]*::-webkit-scrollbar[^{]*)\{/gm)].map((match) =>
      match[1]?.trim(),
    );
    expect(webkitRules.length).toBeGreaterThan(3);
    for (const selector of webkitRules) {
      const scoped =
        selector?.split(",").every((part) => part.trim().startsWith(':root[data-platform="windows"]')) ??
        false;
      // The only unscoped rule is the `scrollbar-hidden` utility's nested `&::-webkit-scrollbar`.
      expect(scoped || selector === "&::-webkit-scrollbar", selector).toBe(true);
    }
  });

  it("never mixes the standard properties into the Windows rules (Chromium would ignore the rest)", () => {
    const windowsBlock = css.slice(css.indexOf(':root[data-platform="windows"]'), css.indexOf("@media"));
    expect(windowsBlock).not.toMatch(/scrollbar-(width|color)\s*:/);
  });
});
