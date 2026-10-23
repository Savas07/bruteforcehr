// @vitest-environment happy-dom
/**
 * Today on the tracker store as production M3 sees it (no mail, jobs or matches): every action
 * the data supports is written through `useTrackerActions` and its Undo restores the documents.
 */
import type { Application } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Tooltip } from "radix-ui";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../../data/tracker/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { TrackerRepositoryContext } from "../../data/tracker/repository";
import { createAppIntl } from "../../i18n/intl";
import { keymap } from "../../shared/keyboard/keymap";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import LiveToday from "./Live";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };
let container: HTMLDivElement;
let root: Root;
let store: MemoryTrackerStore;

function Keys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void keymap.dispatch(event, "windows");
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

function press(key: string) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

async function render() {
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <Keys />
        <TrackerRepositoryContext.Provider value={store.repository}>
          <TrackerSourceContext.Provider value={store.source}>
            <ModelEnvironmentContext.Provider value={environment}>
              <Outlet />
            </ModelEnvironmentContext.Provider>
          </TrackerSourceContext.Provider>
        </TrackerRepositoryContext.Provider>
        <ToastViewport />
      </ToastProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/today", component: LiveToday }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/today"] }),
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
}

beforeEach(() => {
  // Production M3 has no automatic changes yet (they come from mail, M4): user events only.
  store = createMemoryTrackerStore(
    {
      ...populatedDataset,
      applicationEvents: populatedDataset.applicationEvents.filter((event) => event.actor === "user"),
    },
    () => FIXTURE_NOW,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function application(id: string): Application {
  const state = store.source.getState();
  const found = state.status === "ready" ? state.data.applications.find((candidate) => candidate.id === id) : null;
  if (!found) throw new Error(`no application ${id}`);
  return found;
}

function buttons(name: string): HTMLButtonElement[] {
  // Buttons carry their keycaps after the label ("Undo" + "Ctrl Z").
  return [...document.querySelectorAll("button")].filter((candidate) => candidate.textContent.startsWith(name));
}

function click(name: string) {
  const [found] = buttons(name);
  if (!found) throw new Error(`no button ${name}`);
  act(() => found.click());
}

/** Opens a row's detail (inline below 1200 px, the pane above). */
function open(rowTitle: string) {
  const row = [...document.querySelectorAll<HTMLButtonElement>("button[data-nav-id]")].find((candidate) =>
    candidate.textContent.includes(rowTitle),
  );
  if (!row) throw new Error(`no row ${rowTitle}`);
  act(() => row.click());
}

const rowIds = () =>
  [...document.querySelectorAll<HTMLElement>("[data-nav-id]")].map((row) => row.dataset.navId);

describe("Today on live data", () => {
  it("shows no review or match sections without mail and jobs (M3)", async () => {
    await render();
    const headings = [...document.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings.some((text) => text.startsWith("To review"))).toBe(false);
    expect(headings.some((text) => text.startsWith("New matches"))).toBe(false);
    expect(headings.some((text) => text.startsWith("Follow-ups"))).toBe(true);
    expect(rowIds()).toContain("deadline:reminder:app-northstar");
  });

  it("stores Not needed on the follow-up, lists it in Done today, and Undo brings it back", async () => {
    await render();
    open("Quill Docs");
    click("Not needed");
    expect(application("app-quill").followUpDismissedAt).toEqual(FIXTURE_NOW);
    expect(rowIds()).not.toContain("followUp:app-quill");
    click("Done today");
    expect(document.body.textContent).toContain("Follow-up not needed");

    click("Undo");
    expect(application("app-quill").followUpDismissedAt).toBeNull();
    expect(rowIds()).toContain("followUp:app-quill");
  });

  it("logs I followed up on the timeline: the suggestion starts a new round", async () => {
    await render();
    open("Quill Docs");
    click("I followed up");
    const state = store.source.getState();
    const events = state.status === "ready" ? state.data.applicationEvents : [];
    expect(
      events.some(
        (event) => event.applicationId === "app-quill" && event.type === "mail_sent" && event.actor === "user",
      ),
    ).toBe(true);
    expect(rowIds()).not.toContain("followUp:app-quill");
  });

  it("moves to No response from the suggestion, and Undo moves it back", async () => {
    await render();
    open("Kiez Health");
    const before = application("app-kiez").status;
    click("Mark as no response");
    expect(application("app-kiez").status).toBe("ghosted");
    click("Undo");
    expect(application("app-kiez").status).toBe(before);
  });

  it("clears a reminder with Mark as done; Undo restores its text and date", async () => {
    await render();
    const { nextAction, nextActionAt } = application("app-northstar");
    open("Tailor CV for the map platform role");
    click("Mark as done");
    expect(application("app-northstar")).toMatchObject({ nextAction: null, nextActionAt: null });
    expect(rowIds()).not.toContain("deadline:reminder:app-northstar");
    click("Undo");
    expect(application("app-northstar")).toMatchObject({ nextAction, nextActionAt });
    expect(rowIds()).toContain("deadline:reminder:app-northstar");
  });

  it("snoozes a follow-up to Later and moves it back now", async () => {
    await render();
    open("Quill Docs");
    press("h");
    const tomorrow = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
      item.textContent.includes("Tomorrow"),
    );
    if (!tomorrow) throw new Error("no Tomorrow item");
    act(() => tomorrow.click());
    expect(application("app-quill").followUpSnoozedUntil).not.toBeNull();
    expect(rowIds()).not.toContain("followUp:app-quill");

    const later = document.querySelector<HTMLElement>('[role="radio"][aria-checked="false"]');
    if (!later) throw new Error("no Later segment");
    act(() => later.click());
    expect(rowIds()).toEqual(["later:app-quill"]);
    expect(document.body.textContent).toMatch(/Back on \w{3} \d+ \w{3}/);

    open("Quill Docs");
    click("Move back now");
    expect(application("app-quill").followUpSnoozedUntil).toBeNull();
  });
});
