// @vitest-environment happy-dom
import type { JobsSearchResponse, SavedSearchFilters } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, type FixtureDataset, populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { JobsProviders } from "../../data/jobs/live";
import { createMemoryJobsStore, type MemoryJobsCallables, type MemoryJobsStore } from "../../data/jobs/memory";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../../data/tracker/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { TrackerRepositoryContext } from "../../data/tracker/repository";
import { createAppIntl } from "../../i18n/intl";
import { type Connectivity, ConnectivityContext } from "../../shared/connectivity";
import { keymap } from "../../shared/keyboard/keymap";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { NO_FILTERS } from "../job-detail/filters";
import { SavedSearchesDialog, SaveSearchButton } from ".";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };
const online: Connectivity = { status: "online", pendingWrites: 0, lastSyncedAt: null };

const response: JobsSearchResponse = {
  jobIds: [],
  counts: { found: 30, created: 12, updated: 0, matched: 12 },
  sources: [
    { source: "remotive", status: "ok", reason: null, count: 30 },
    { source: "adzuna", status: "skipped", reason: "no_key", count: 0 },
  ],
};

let container: HTMLDivElement;
let root: Root;
let tracker: MemoryTrackerStore;
let jobs: MemoryJobsStore;
let runSavedSearch: Mock<MemoryJobsCallables["runSavedSearch"]>;

function Keys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void keymap.dispatch(event, "windows");
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

function setup(dataset: FixtureDataset) {
  tracker = createMemoryTrackerStore(dataset, () => FIXTURE_NOW);
  runSavedSearch = vi.fn<MemoryJobsCallables["runSavedSearch"]>(() => Promise.resolve(response));
  const unused = () => Promise.reject(new Error("not used"));
  jobs = createMemoryJobsStore(
    tracker,
    {
      mailAccounts: [],
      coverLetters: [],
      renderedFiles: [],
      jobSources: [
        {
          id: "adzuna",
          label: "Adzuna",
          kind: "keyed",
          markets: [],
          state: "skipped",
          reason: "no_key",
          lastRunAt: null,
          lastSuccessAt: null,
          lastError: null,
          lastResultCount: null,
          quota: null,
          attribution: { label: "Adzuna", url: "https://www.adzuna.com", minSize: null },
          updatedAt: FIXTURE_NOW,
        },
      ],
    },
    {
      search: unused,
      runSavedSearch,
      refreshMatches: unused,
      importUrl: unused,
      sendEmail: unused,
      cancelEmail: unused,
      sendEmailNow: unused,
      tailorCv: unused,
      draftCoverLetter: unused,
    },
  );
}

function render(children: ReactNode, connectivity: Connectivity = online) {
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ConnectivityContext.Provider value={connectivity}>
            <ToastProvider>
              <Keys />
              <TrackerRepositoryContext.Provider value={tracker.repository}>
                <TrackerSourceContext.Provider value={tracker.source}>
                  <ModelEnvironmentContext.Provider value={environment}>
                    <JobsProviders source={jobs.source} repository={jobs.repository}>
                      {children}
                    </JobsProviders>
                  </ModelEnvironmentContext.Provider>
                </TrackerSourceContext.Provider>
              </TrackerRepositoryContext.Provider>
              <ToastViewport />
            </ToastProvider>
          </ConnectivityContext.Provider>
        </Tooltip.Provider>
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

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.startsWith(name));
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

const click = (element: HTMLElement) => act(() => element.click());
const saved = () => tracker.savedSearches();
const popover = () => document.querySelector<HTMLElement>('[role="dialog"]');

function press(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    );
  });
}

function radio(label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((candidate) =>
    candidate.closest("label")?.textContent.startsWith(label),
  );
  if (!found) throw new Error(`no radio ${label}`);
  return found;
}

const remote: SavedSearchFilters = { ...NO_FILTERS, remoteTypes: ["remote"] };

describe("SaveSearchButton", () => {
  it("saves at once with the default alert, opens the alert settings and offers Undo", async () => {
    setup(emptyDataset);
    render(<SaveSearchButton query="react" filters={remote} />);
    click(button("Save search"));

    expect(saved()).toHaveLength(1);
    expect(saved()[0]).toMatchObject({
      name: "react · Remote",
      query: "react",
      filters: remote,
      schedule: "daily",
      alertThreshold: 65,
      dailyDigest: true,
      enabled: true,
    });
    expect(button("Saved · Edit alert")).toBeTruthy();
    expect(popover()?.textContent).toContain("Alert settings");
    expect(document.body.textContent).toContain("Search saved");

    click(radio("Weekly"));
    expect(saved()[0]).toMatchObject({ schedule: "weekly", dailyDigest: false, enabled: true });
    click(button("Strong matches"));
    expect(saved()[0]?.alertThreshold).toBe(80);
    click(radio("Off"));
    expect(saved()[0]).toMatchObject({ enabled: false, schedule: "weekly", nextRunAt: null });

    click(button("Undo"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(saved()).toHaveLength(0);
    expect(button("Save search")).toBeTruthy();
    expect(popover()).toBeNull();
  });

  it("shows an existing search as saved instead of creating a duplicate (Mod+S opens its settings)", () => {
    setup(populatedDataset);
    const existing = populatedDataset.savedSearches[0];
    if (!existing) throw new Error("fixture");
    render(<SaveSearchButton query={`  ${existing.query.toUpperCase()} `} filters={existing.filters} />);
    expect(button("Saved · Edit alert")).toBeTruthy();
    press("s", { ctrlKey: true });
    expect(saved()).toHaveLength(populatedDataset.savedSearches.length);
    expect(popover()?.textContent).toContain("Alert settings");
  });

  it("explains why it is unavailable", () => {
    setup(emptyDataset);
    render(<SaveSearchButton query="" filters={NO_FILTERS} disabled />);
    expect(button("Save search").getAttribute("aria-disabled")).toBe("true");
    press("s", { ctrlKey: true });
    expect(saved()).toHaveLength(0);
    expect(document.body.textContent).toContain("Type a search or pick a filter first");
  });
});

describe("SavedSearchesDialog", () => {
  const onShowResults = vi.fn<(savedSearchId: string) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const dialog = (focus: string | null = null) => (
    <SavedSearchesDialog open onOpenChange={onOpenChange} focusSavedSearchId={focus} onShowResults={onShowResults} />
  );

  it("lists the searches and edits the focused one", () => {
    setup(populatedDataset);
    render(dialog("search-istanbul-hybrid"));
    const rows = [...document.querySelectorAll("li")];
    expect(rows.map((row) => row.querySelector("button")?.textContent)).toEqual([
      expect.stringContaining("Berlin & Amsterdam · visa sponsorship"),
      expect.stringContaining("React · Remote Europe"),
      expect.stringContaining("Istanbul · hybrid"),
    ]);
    expect(document.querySelector('[aria-current="true"]')?.textContent).toContain("Istanbul · hybrid");
    expect(radio("Off").getAttribute("aria-checked")).toBe("true");

    // The row switch turns alerts back on with the kept schedule.
    const toggle = rows[2]?.querySelector<HTMLElement>('[role="switch"]');
    if (!toggle) throw new Error("switch");
    click(toggle);
    expect(saved().find((search) => search.id === "search-istanbul-hybrid")).toMatchObject({
      enabled: true,
      schedule: "weekly",
      nextRunAt: FIXTURE_NOW,
    });

    click(button("Edit filters in Jobs"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onShowResults).toHaveBeenCalledWith("search-istanbul-hybrid");
  });

  it("runs a search now and shows what it found", async () => {
    setup(populatedDataset);
    render(dialog("search-react-europe-remote"));
    click(button("Run now"));
    expect(runSavedSearch).toHaveBeenCalledWith("search-react-europe-remote");
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("12 new jobs · Adzuna skipped: no key");
  });

  it("needs a connection to run now", () => {
    setup(populatedDataset);
    render(dialog(), { ...online, status: "offline" });
    expect(button("Run now").getAttribute("aria-disabled")).toBe("true");
    expect(document.body.textContent).toContain("Needs a connection");
    click(button("Run now"));
    expect(runSavedSearch).not.toHaveBeenCalled();
  });

  it("deletes with an inline Undo that restores the search", async () => {
    setup(populatedDataset);
    render(dialog("search-react-europe-remote"));
    click(button("Delete"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(saved().map((search) => search.id)).not.toContain("search-react-europe-remote");
    const notice = [...document.querySelectorAll('[role="dialog"] [role="status"]')].find((element) =>
      element.textContent.startsWith("Deleted"),
    );
    expect(notice?.textContent).toContain("Deleted “React · Remote Europe”");
    const undo = notice?.querySelector("button");
    if (!undo) throw new Error("undo");
    click(undo);
    await act(async () => {
      await Promise.resolve();
    });
    expect(saved().map((search) => search.id)).toContain("search-react-europe-remote");
  });

  it("edits the name and refuses an empty query", () => {
    setup(populatedDataset);
    render(dialog("search-react-europe-remote"));
    const input = (label: string) => {
      const element = [...document.querySelectorAll("label")].find((candidate) => candidate.textContent === label);
      const control = element ? document.getElementById(element.htmlFor) : null;
      if (!(control instanceof HTMLInputElement)) throw new Error(`no field ${label}`);
      return control;
    };
    const type = (control: HTMLInputElement, value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(control, value);
        control.dispatchEvent(new Event("input", { bubbles: true }));
      });
    type(input("Name"), "  React remote  ");
    act(() => input("Name").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(saved().find((search) => search.id === "search-react-europe-remote")?.name).toBe("React remote");

    type(input("Search for"), "   ");
    act(() => input("Search for").dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(document.body.textContent).toContain("Enter what to search for.");
    expect(saved().find((search) => search.id === "search-react-europe-remote")?.query).toBe("react typescript frontend");
  });

  it("says how searches get here when there are none", () => {
    setup(emptyDataset);
    render(dialog());
    expect(document.body.textContent).toContain("No saved searches yet");
    expect(document.body.textContent).toContain("Save a search from Jobs to get new matches here.");
  });
});
