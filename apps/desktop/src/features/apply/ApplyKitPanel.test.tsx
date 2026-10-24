// @vitest-environment happy-dom
import type { Answer } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { JobsProviders } from "../../data/jobs/live";
import { createMemoryJobsStore, type MemoryJobsCallables } from "../../data/jobs/memory";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore } from "../../data/tracker/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { TrackerRepositoryContext } from "../../data/tracker/repository";
import { createAppIntl } from "../../i18n/intl";
import { openKitFile, revealKitFile, saveKitFile } from "../../lib/kitFiles";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { ApplyKitPanel } from ".";
import { applySessions } from "./session";

vi.mock("../../lib/cvExport", () => ({
  printCvPdf: vi.fn(() => Promise.resolve(new Uint8Array(84_000))),
  saveExportFile: vi.fn(() => Promise.resolve("/Users/deniz/Downloads/letter.pdf")),
}));
vi.mock("../../lib/kitFiles", () => ({
  saveKitFile: vi.fn((_bytes: Uint8Array, name: string) => Promise.resolve(`/Users/deniz/Downloads/BruteForceHR/${name}`)),
  openKitFile: vi.fn(() => Promise.resolve()),
  revealKitFile: vi.fn(() => Promise.resolve()),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const JOB_ID = "job-northstar-frontend";

const answer = (id: string, fields: Partial<Answer>): Answer => ({
  id,
  kind: "notice_period",
  label: "Notice period",
  values: [{ language: "en", text: "Three months" }],
  countries: [],
  currency: null,
  position: 0,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  ...fields,
});

let container: HTMLDivElement;
let root: Root;
let router: AnyRouter;
let onSubmitAnswer: Mock;
let writeText: Mock;

async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(answers: readonly Answer[], showSubmitPrompt = false) {
  const tracker = createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
  const unused = vi.fn(() => Promise.reject(new Error("unused")));
  const jobs = createMemoryJobsStore(
    tracker,
    { mailAccounts: [], coverLetters: [], renderedFiles: [], jobSources: [], answers },
    {
      search: unused,
      runSavedSearch: unused,
      importUrl: unused,
      refreshMatches: unused,
      sendEmail: unused,
      cancelEmail: unused,
      sendEmailNow: unused,
      tailorCv: unused,
      draftCoverLetter: unused,
    } as unknown as MemoryJobsCallables,
  );
  onSubmitAnswer = vi.fn();
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <TrackerRepositoryContext.Provider value={tracker.repository}>
          <TrackerSourceContext.Provider value={tracker.source}>
            <ModelEnvironmentContext.Provider value={{ now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" }}>
              <JobsProviders source={jobs.source} repository={jobs.repository}>
                <ApplyKitPanel
                  jobId={JOB_ID}
                  siteUrl="https://boards.greenhouse.io/northstar/jobs/1"
                  showSubmitPrompt={showSubmitPrompt}
                  onOpenSite={vi.fn()}
                  onSubmitAnswer={onSubmitAnswer}
                  onClose={vi.fn()}
                  onTailor={vi.fn()}
                />
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
      createRoute({ getParentRoute: () => rootRoute, path: "/settings/$pane", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/jobs"] }),
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
}

beforeEach(() => {
  applySessions.clear();
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const button = (label: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent.trim() === label,
  );
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const click = async (label: string) => {
  act(() => button(label).click());
  await settle();
};
const text = () => document.body.textContent;

describe("ApplyKitPanel", () => {
  it("copies each answer that fits the job and names it in the toast", async () => {
    await render([
      answer("a1", {}),
      answer("a2", { kind: "link", label: "LinkedIn", values: [{ language: "en", text: "https://linkedin.com/in/deniz" }] }),
      answer("a3", { kind: "work_authorization", label: "Work permit", countries: ["JP"], values: [{ language: "en", text: "Needs a visa" }] }),
    ]);
    expect(text()).toContain("Your application kit");
    expect(text()).toContain("Availability");
    expect(text()).toContain("Links");
    expect(text()).not.toContain("Needs a visa");
    await click("Copy Notice period");
    expect(writeText).toHaveBeenCalledWith("Three months");
    expect(text()).toContain("Notice period copied");
    await click("Copy LinkedIn");
    expect(writeText).toHaveBeenLastCalledWith("https://linkedin.com/in/deniz");
  });

  it("saves the CV PDF to the kit folder once, then opens, reveals and copies its path", async () => {
    await render([]);
    await click("Open");
    expect(saveKitFile).toHaveBeenCalledTimes(1);
    const path = vi.mocked(openKitFile).mock.calls[0]?.[0] ?? "";
    expect(path).toMatch(/^\/Users\/deniz\/Downloads\/BruteForceHR\/.+\.pdf$/u);
    await click("Show in Finder");
    expect(revealKitFile).toHaveBeenCalledWith(path);
    await click("Copy path");
    expect(writeText).toHaveBeenCalledWith(path);
    expect(saveKitFile).toHaveBeenCalledTimes(1);
  });

  it("offers Settings when there are no answers, and asks whether the application went out", async () => {
    await render([], true);
    expect(text()).toContain("Save answers you give often");
    expect(text()).toContain("Did you submit your application to Northstar Maps?");
    await click("Not yet");
    expect(onSubmitAnswer).toHaveBeenCalledWith("notYet", null);
  });
});
