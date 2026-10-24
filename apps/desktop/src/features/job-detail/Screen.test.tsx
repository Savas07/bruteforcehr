// @vitest-environment happy-dom
// The Jobs screen's route-driven parts: the search field follows `?q`, the sort menu and the
// zero-results chips navigate with the filter params, and `?filters` opens a filter popover.
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobsProviders } from "../../data/jobs/live";
import { createMemoryJobsStore, type MemoryJobsCallables } from "../../data/jobs/memory";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore } from "../../data/tracker/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { TrackerRepositoryContext } from "../../data/tracker/repository";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { buildJobDetailModel } from "./model";
import JobDetailScreen from "./Screen";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const ctx = fixtureContext(populatedDataset);
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };

let container: HTMLDivElement;
let root: Root;
let router: AnyRouter;

/** The screen as its route renders it: the model built from the fixture and the search params. */
function JobsRoute() {
  const params = useSearch({ strict: false }) as Record<string, string | undefined>;
  return (
    <JobDetailScreen
      params={params}
      model={{
        status: "ready",
        data: buildJobDetailModel(populatedDataset, ctx, params),
        fromCache: false,
        updatedAt: { label: "now", iso: FIXTURE_NOW.toISOString(), absolute: "now" },
        updatedClock: "12:00",
      }}
    />
  );
}

/** How long a condition may take to hold (generous: CI runs every package's tests at once). */
const WAIT = { timeout: 15_000, interval: 50 };

async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function render(entry: string) {
  const tracker = createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
  const unused = () => Promise.reject(new Error("not used"));
  const jobs = createMemoryJobsStore(
    tracker,
    { mailAccounts: [], coverLetters: [], renderedFiles: [], jobSources: [] },
    {
      search: vi.fn(unused),
      runSavedSearch: vi.fn(unused),
      importUrl: vi.fn(unused),
      refreshMatches: vi.fn(() => Promise.resolve()),
      sendEmail: vi.fn(unused),
      cancelEmail: vi.fn(unused),
      sendEmailNow: vi.fn(unused),
    } as unknown as MemoryJobsCallables,
  );
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <TrackerRepositoryContext.Provider value={tracker.repository}>
          <TrackerSourceContext.Provider value={tracker.source}>
            <ModelEnvironmentContext.Provider value={environment}>
              <JobsProviders source={jobs.source} repository={jobs.repository}>
                <JobsRoute />
              </JobsProviders>
            </ModelEnvironmentContext.Provider>
          </TrackerSourceContext.Provider>
        </TrackerRepositoryContext.Provider>
        <ToastViewport />
      </ToastProvider>
    ),
  });
  router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/jobs", component: () => null }),
      createRoute({ getParentRoute: () => rootRoute, path: "/jobs/$jobId", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: [entry] }),
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
  await settle();
  // Under load (the whole monorepo's tests at once) the router and listeners need more turns.
  await vi.waitFor(() => expect(container.querySelector('input[type="search"]')).not.toBeNull(), WAIT);
}

/** Polls `assertion` while letting React and the router run (load-independent, unlike a fixed number of turns). */
async function eventually(assertion: () => void): Promise<void> {
  await vi.waitFor(async () => {
    await settle();
    assertion();
  }, WAIT);
}

const search = () => router.state.location.search as Record<string, unknown>;
const searchField = () => container.querySelector<HTMLInputElement>('input[type="search"]');

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// The whole Jobs screen over the populated fixtures renders slowly while the monorepo's tests run in parallel.
describe("Jobs screen", { timeout: 30_000 }, () => {
  it("shows the route's search text, also when it changes while the screen stays open", async () => {
    await render("/jobs");
    expect(searchField()?.value).toBe("");
    await act(async () => {
      await router.navigate({ to: "/jobs", search: { q: "react" } });
    });
    await eventually(() => expect(searchField()?.value).toBe("react"));
  });

  it("sorts by newest from the list header's menu", async () => {
    await render("/jobs");
    await eventually(() => expect(container.querySelector("[data-sort-trigger]")).not.toBeNull());
    const trigger = container.querySelector<HTMLButtonElement>("[data-sort-trigger]");
    act(() => {
      trigger?.focus();
      trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const newestItem = () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
        (item) => item.textContent === "Newest",
      );
    await eventually(() => expect(newestItem()).toBeDefined());
    const newest = newestItem();
    act(() => newest?.click());
    await eventually(() => {
      expect(search()["sort"]).toBe("newest");
      expect(trigger?.textContent).toBe("Sorted by Newest");
    });
  });

  it("removes one filter from its zero-results chip and keeps the others", async () => {
    await render("/jobs?posted=1&match=strong&level=intern");
    await eventually(() => expect(container.querySelector('[data-remove-facet="seniority"]')).not.toBeNull());
    const chip = container.querySelector<HTMLButtonElement>('[data-remove-facet="seniority"]');
    expect(chip?.getAttribute("aria-label")).toBe("Remove filter: Seniority: Intern");
    act(() => chip?.click());
    await eventually(() => {
      expect(search()).toMatchObject({ posted: "1", match: "strong" });
      expect(search()["level"]).toBeUndefined();
    });
  });

  it("opens a filter popover from ?filters and clears the param when it closes", async () => {
    await render("/jobs?filters=1");
    await eventually(() =>
      expect(document.querySelector('[role="dialog"]')?.querySelector("h2")?.textContent).toBe("Work mode"),
    );
    const dialog = document.querySelector('[role="dialog"]');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await eventually(() => {
      expect(search()["filters"]).toBeUndefined();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
  });
});
