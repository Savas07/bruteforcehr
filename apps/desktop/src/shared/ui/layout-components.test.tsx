// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tooltip } from "radix-ui";
import type { DetachedWindowAPI } from "happy-dom";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { SidebarChildItem, SidebarChildren, SidebarChildrenOutlet } from "./SidebarChildren";
import { Monogram } from "./Company";
import { DetailSidePanel, SplitView } from "./SplitView";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  interface Window {
    /** happy-dom's test API (this file runs in `@vitest-environment happy-dom`). */
    readonly happyDOM: DetachedWindowAPI;
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
let container: HTMLDivElement;
let root: Root;

function render(node: ReactNode) {
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>{node}</Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SidebarChildren", () => {
  it("portals a screen's nested list under the active destination's outlet", () => {
    const select = vi.fn();
    render(
      <>
        <nav aria-label="Sections">
          <SidebarChildrenOutlet destination="mail" />
        </nav>
        <main>
          <SidebarChildren destination="mail" label="Mail folders">
            <SidebarChildItem current count={3} onSelect={select}>
              To review
            </SidebarChildItem>
            <SidebarChildItem current={false} onSelect={select}>
              Updates
            </SidebarChildItem>
          </SidebarChildren>
        </main>
      </>,
    );
    const list = container.querySelector('nav ul[aria-label="Mail folders"]');
    expect(list).not.toBeNull();
    expect(container.querySelector("main ul")).toBeNull();
    const [toReview, updates] = [...(list?.querySelectorAll("button") ?? [])];
    expect(toReview?.getAttribute("aria-current")).toBe("page");
    expect(toReview?.textContent).toBe("To review3");
    expect(updates?.hasAttribute("aria-current")).toBe(false);
    act(() => updates?.click());
    expect(select).toHaveBeenCalledOnce();
  });

  it("renders nothing while its destination has no outlet (another section is active)", () => {
    render(
      <>
        <SidebarChildrenOutlet destination="jobs" />
        <SidebarChildren destination="mail" label="Mail folders">
          <SidebarChildItem current onSelect={() => undefined}>
            To review
          </SidebarChildItem>
        </SidebarChildren>
      </>,
    );
    expect(container.querySelector("ul")).toBeNull();
  });
});

describe("SplitView", () => {
  const section = () => container.querySelector<HTMLElement>('section[aria-label="Mail"]');
  const splitter = () => container.querySelector<HTMLElement>('[role="separator"]');
  const splitView = (listPane?: { min: number; default: number; max: number }) => (
    <SplitView
      listLabel="Mail"
      detailLabel="Email"
      list={<p>list</p>}
      detail={<p>detail</p>}
      detailOpen={false}
      onBack={() => undefined}
      backLabel="Back to Mail"
      {...(listPane && { listPane })}
    />
  );
  const remount = () => {
    act(() => root.unmount());
    root = createRoot(container);
  };

  it("uses the 340–440 px list pane starting at 400 by default", () => {
    render(splitView());
    expect(section()?.style.width).toBe("400px");
    expect(splitter()?.getAttribute("aria-valuemin")).toBe("340");
    expect(splitter()?.getAttribute("aria-valuemax")).toBe("440");
  });

  it("narrows the left list with ← and widens it with →", () => {
    render(splitView());
    act(() => {
      splitter()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(section()?.style.width).toBe("392px");
    expect(splitter()?.getAttribute("aria-valuenow")).toBe("392");
  });

  it("takes a section's own bounds (Today 420–720) and clamps the start into them", () => {
    render(splitView({ min: 420, default: 480, max: 720 }));
    expect(section()?.style.width).toBe("480px");
    expect(splitter()?.getAttribute("aria-valuemax")).toBe("720");
    remount();
    render(splitView({ min: 360, default: 300, max: 440 }));
    expect(section()?.style.width).toBe("360px");
  });
});

/** Sets the window width for the D04 media queries (happy-dom evaluates them against innerWidth). */
function setWindowWidth(width: number) {
  window.happyDOM.setInnerWidth(width);
}

describe("DetailSidePanel", () => {
  const panelWidth = () =>
    container.querySelector<HTMLElement>('aside[aria-label="Application details"]')?.style.width;
  const panel = (width?: { min: number; default: number; max: number }) => (
    <DetailSidePanel
      open
      label="Application details"
      keysGroup="Application panel"
      onClose={() => undefined}
      {...(width && { width })}
    >
      <p>details</p>
    </DetailSidePanel>
  );

  it("starts at 400 px below 1440 px windows and 480 px from 1440", () => {
    setWindowWidth(1280);
    render(panel());
    expect(panelWidth()).toBe("400px");
    act(() => root.unmount());
    root = createRoot(container);
    setWindowWidth(1920);
    render(panel());
    expect(panelWidth()).toBe("480px");
  });

  it("widens with ← and narrows with → (the divider moves toward the panel); aria-valuenow is its width", () => {
    setWindowWidth(1280);
    render(panel());
    const separator = container.querySelector<HTMLElement>('[role="separator"]');
    const press = (key: string) =>
      act(() => {
        separator?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    press("ArrowLeft");
    expect(panelWidth()).toBe("408px");
    expect(separator?.getAttribute("aria-valuenow")).toBe("408");
    press("ArrowRight");
    press("ArrowRight");
    expect(panelWidth()).toBe("400px");
    expect(separator?.getAttribute("aria-valuenow")).toBe("400");
    press("End");
    expect(panelWidth()).toBe("640px");
  });

  it("follows the pointer: dragging the divider left widens the panel", () => {
    setWindowWidth(1280);
    render(panel());
    const separator = container.querySelector<HTMLElement>('[role="separator"]');
    if (!separator) throw new Error("no separator");
    separator.setPointerCapture = () => undefined;
    const pointer = (type: string, clientX: number) =>
      act(() => {
        separator.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 1, bubbles: true }));
      });
    pointer("pointerdown", 800);
    pointer("pointermove", 740);
    pointer("pointerup", 740);
    expect(panelWidth()).toBe("460px");
  });

  it("takes caller bounds and clamps the start into them", () => {
    setWindowWidth(1280);
    render(panel({ min: 360, default: 300, max: 520 }));
    expect(panelWidth()).toBe("360px");
    expect(container.querySelector('[role="separator"]')?.getAttribute("aria-valuemax")).toBe("520");
  });
});

describe("Monogram badge", () => {
  const company = { name: "Acme Robotics", domain: null, monogram: "AR" };
  const badge = <span aria-label="Moved automatically">•</span>;
  const badgeClasses = () =>
    container.querySelector<HTMLElement>("[data-monogram-badge]")?.className.split(/\s+/) ?? [];

  it("sits after the 20 px tile instead of covering the initials", () => {
    render(<Monogram company={company} size="sm" badge={badge} />);
    expect(badgeClasses()).not.toContain("absolute");
    const tile = container.querySelector('[aria-hidden="true"]');
    expect(tile?.nextElementSibling?.hasAttribute("data-monogram-badge")).toBe(true);
    expect(container.querySelector('[aria-label="Moved automatically"]')).not.toBeNull();
  });

  it("overlaps the corner on larger tiles", () => {
    render(<Monogram company={company} size="md" badge={badge} />);
    expect(badgeClasses()).toContain("absolute");
  });
});
