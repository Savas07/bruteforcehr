// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppIntl } from "../i18n/intl";
import { SidebarChildItem, SidebarChildren } from "../shared/ui/SidebarChildren";
import { Sidebar } from "./Sidebar";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
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

/** The shell sidebar on `/mail` with 30 nested rows (more than fit at 1280×800). */
async function renderMailSidebar(): Promise<HTMLElement> {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Sidebar onOpenPalette={() => undefined} onOpenShortcuts={() => undefined} />
        <Outlet />
      </>
    ),
  });
  const mail = createRoute({
    getParentRoute: () => rootRoute,
    path: "/mail",
    component: () => (
      <SidebarChildren destination="mail" label="Mail folders">
        {Array.from({ length: 30 }, (_, index) => (
          <SidebarChildItem key={index} current={index === 0} onSelect={() => undefined}>
            {`Folder ${index + 1}`}
          </SidebarChildItem>
        ))}
      </SidebarChildren>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([mail]),
    history: createMemoryHistory({ initialEntries: ["/mail"] }),
  });
  await act(async () => {
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <RouterProvider router={router} />
        </Tooltip.Provider>
      </RawIntlProvider>,
    );
    await router.load();
  });
  const nav = container.querySelector<HTMLElement>("nav");
  if (!nav) throw new Error("Sidebar didn't render");
  return nav;
}

describe("Sidebar", () => {
  it("scrolls the destinations and nested rows while the footer stays pinned", async () => {
    const nav = await renderMailSidebar();
    const scroller = nav.querySelector<HTMLElement>("[data-sidebar-scroll]");
    const footer = nav.querySelector<HTMLElement>("[data-sidebar-footer]");
    const classes = (element: HTMLElement | null) => element?.className.split(/\s+/) ?? [];

    // The nested list sits inside the scrolling block, under the Mail row.
    const nested = nav.querySelector('ul[aria-label="Mail folders"]');
    expect(scroller?.contains(nested ?? null)).toBe(true);
    expect(nested?.querySelectorAll("button")).toHaveLength(30);

    // The block takes the leftover height and scrolls; the column itself may shrink.
    expect(classes(nav)).toContain("min-h-0");
    expect(classes(scroller)).toEqual(expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto"]));
    // The footer (Keyboard shortcuts + sync line) is outside it and never shrinks.
    expect(scroller?.contains(footer ?? null)).toBe(false);
    expect(classes(footer)).toContain("shrink-0");
    expect(footer?.textContent).toContain("Keyboard shortcuts");
    // Focus rings (2 px outline) stay inside the scroll box's padding, so they aren't clipped.
    expect(classes(scroller)).toEqual(expect.arrayContaining(["px-3", "py-1"]));
  });
});
