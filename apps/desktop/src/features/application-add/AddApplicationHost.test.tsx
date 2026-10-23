// @vitest-environment happy-dom
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
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
import { AddApplicationHost, openAddApplication } from ".";

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
let router: AnyRouter;

/** Lets the router finish a navigation (the app's TS lib predates `Promise.withResolvers`). */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function Keys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void keymap.dispatch(event, "windows");
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

function Detail() {
  const { applicationId } = useParams({ strict: false });
  return <p data-testid="detail">{applicationId}</p>;
}

function makeRouter(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <Keys />
        <Outlet />
        <TrackerRepositoryContext.Provider value={store.repository}>
          <TrackerSourceContext.Provider value={store.source}>
            <ModelEnvironmentContext.Provider value={environment}>
              <AddApplicationHost />
            </ModelEnvironmentContext.Provider>
          </TrackerSourceContext.Provider>
        </TrackerRepositoryContext.Provider>
        <ToastViewport />
      </ToastProvider>
    ),
  });
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/tracker", component: () => <p>Board</p> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/tracker/applications/$applicationId", component: Detail }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}

async function render(path = "/tracker") {
  router = makeRouter(path);
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
  store = createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const alertDialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

function field<T extends HTMLElement = HTMLInputElement>(label: string): T {
  const labelElement = [...document.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.startsWith(label),
  );
  const control = labelElement ? document.getElementById(labelElement.htmlFor) : null;
  if (!control) throw new Error(`no field ${label}`);
  return control as T;
}

function button(name: string): HTMLButtonElement {
  // Toast actions carry their keycaps after the label ("Undo" + "Ctrl Z").
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.startsWith(name));
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

function type(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function press(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    );
  });
}

function submit() {
  act(() => {
    dialog()?.querySelector("form")?.requestSubmit();
  });
}

const created = () =>
  store.log.filter((write) => write.op === "create").map((write) => (write.op === "create" ? write.collection : ""));

describe("AddApplicationHost", () => {
  it("opens on `add=1`, focuses Company and drops the param when closed with Esc", async () => {
    await render("/tracker?add=1");
    expect(dialog()?.textContent).toContain("Log an application");
    expect(document.activeElement).toBe(field("Company"));
    press("Escape");
    await act(async () => {
      await settle();
    });
    expect(dialog()).toBeNull();
    expect(router.state.location.search).toEqual({});
  });

  it("opens on Mod+N and from `openAddApplication` with prefills", async () => {
    await render();
    expect(dialog()).toBeNull();
    press("n", { ctrlKey: true });
    expect(dialog()).not.toBeNull();
    press("Escape");
    expect(dialog()).toBeNull();

    act(() => openAddApplication({ status: "saved", company: "Acme" }));
    expect(field("Company").value).toBe("Acme");
    expect(field<HTMLSelectElement>("Status").value).toBe("saved");
    // Saved isn't applied yet: no applied date; focus goes to the first empty field.
    expect(() => field("Applied on")).toThrow();
    expect(document.activeElement).toBe(field("Role"));
  });

  it("adds the application with its created event and manual job; Undo deletes it", async () => {
    await render();
    act(() => openAddApplication());
    type(field("Company"), "Acme Robotics");
    type(field("Role"), "Frontend Engineer");
    type(field("Link to the posting"), "https://jobs.acme.example/42");
    type(field<HTMLSelectElement>("Sent via"), "referral");
    type(field<HTMLSelectElement>("CV"), "cv-de");
    expect(field<HTMLSelectElement>("Version").value).toBe("rev-de-2");
    type(field("Applied on"), "2026-10-19");
    type(field<HTMLTextAreaElement>("Notes"), "  Asked Selin for a referral  ");
    submit();

    expect(dialog()).toBeNull();
    expect(created()).toEqual(["jobs", "applications", "applicationEvents"]);
    const state = store.source.getState();
    if (state.status !== "ready") throw new Error("not ready");
    const application = state.data.applications.find((candidate) => candidate.company === "Acme Robotics");
    expect(application).toMatchObject({
      role: "Frontend Engineer",
      status: "applied",
      channel: "referral",
      cvId: "cv-de",
      cvRevisionId: "rev-de-2",
      notes: "Asked Selin for a referral",
      appliedAt: new Date("2026-10-19T06:00:00.000Z"),
    });
    expect(application?.jobId).toMatch(/^mem-jobs-/u);
    const event = state.data.applicationEvents.find((candidate) => candidate.applicationId === application?.id);
    expect(event).toMatchObject({ type: "created", toStatus: "applied", actor: "user" });
    expect(event?.occurredAt).toEqual(new Date("2026-10-19T06:00:00.000Z"));

    expect(document.body.textContent).toContain("Acme Robotics · added to Applied");
    act(() => button("Undo").click());
    const after = store.source.getState();
    expect(after.status === "ready" && after.data.applications.some((candidate) => candidate.id === application?.id)).toBe(
      false,
    );
  });

  it("submits with Mod+Enter from the notes field and stays on the current screen", async () => {
    await render();
    act(() => openAddApplication());
    type(field("Company"), "Acme");
    type(field("Role"), "Engineer");
    act(() => field<HTMLTextAreaElement>("Notes").focus());
    press("Enter", { ctrlKey: true });
    expect(dialog()).toBeNull();
    expect(created()).toEqual(["applications", "applicationEvents"]);
    expect(router.state.location.pathname).toBe("/tracker");
  });

  it("explains what's missing and adds nothing", async () => {
    await render();
    act(() => openAddApplication());
    type(field("Link to the posting"), "acme.example/jobs");
    type(field("Applied on"), "2026-10-25");
    submit();
    expect(store.log).toEqual([]);
    const text = dialog()?.textContent ?? "";
    expect(text).toContain("4 fields need a look");
    expect(text).toContain("Enter the company's name.");
    expect(text).toContain("Enter the role, for example “Frontend Engineer”.");
    expect(text).toContain("Enter the full address, starting with https://");
    expect(text).toContain("Pick today or an earlier day.");
    expect(field("Company").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(field("Company"));
  });

  it("asks before discarding what was entered", async () => {
    await render();
    act(() => openAddApplication());
    type(field("Company"), "Acme");
    press("Escape");
    expect(alertDialog()?.textContent).toContain("Discard this application?");
    act(() => button("Keep editing").click());
    expect(alertDialog()).toBeNull();
    expect(field("Company").value).toBe("Acme");
    act(() => button("Cancel").click());
    act(() => button("Discard").click());
    expect(dialog()).toBeNull();
    expect(store.log).toEqual([]);
  });

  it("points out an open duplicate and opens it; Add and open opens the new one", async () => {
    await render();
    act(() => openAddApplication({ company: "brightwave", role: "Frontend engineer, editor" }));
    expect(dialog()?.textContent).toContain("You're already tracking Frontend Engineer, Editor at Brightwave");
    await act(async () => {
      button("Open it").click();
      await settle();
    });
    expect(document.querySelector('[data-testid="detail"]')?.textContent).toBe("app-brightwave");
    expect(store.log).toEqual([]);

    act(() => openAddApplication({ company: "Brightwave", role: "Staff Engineer" }));
    await act(async () => {
      button("Add and open").click();
      await settle();
    });
    expect(document.querySelector('[data-testid="detail"]')?.textContent).toMatch(/^mem-applications-/u);
  });
});
