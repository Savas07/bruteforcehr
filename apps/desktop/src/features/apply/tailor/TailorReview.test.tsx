// @vitest-environment happy-dom
import type { CvTailorResponse } from "@bfhr/core";
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
import { JobsProviders } from "../../../data/jobs/live";
import { createMemoryJobsStore, type MemoryJobsCallables, type MemoryJobsStore } from "../../../data/jobs/memory";
import { TrackerSourceContext } from "../../../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../../../data/tracker/memory";
import { TrackerRepositoryContext } from "../../../data/tracker/repository";
import { designTailorEdits } from "../../../design/apply";
import { createAppIntl } from "../../../i18n/intl";
import { ToastProvider, ToastViewport } from "../../../shared/ui/Toast";
import { TailorHost } from "./TailorHost";
import { tailorSessions } from "./TailorReview";

vi.mock("../../cv-editor/PreviewPane", () => ({ PreviewPane: () => null }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const JOB_ID = "job-fernweh-frontend";
const CV_ID = "cv-en";

let container: HTMLDivElement;
let root: Root;
let tracker: MemoryTrackerStore;
let jobs: MemoryJobsStore;
let tailorCv: Mock;
let onClose: Mock<() => void>;
let router: AnyRouter;

const revision = populatedDataset.cvRevisions.find((candidate) => candidate.id === "rev-en-3");
if (!revision) throw new Error("fixture revision missing");
/** Three recorded edits: a reworded bullet, a new bullet order, a keyword moved forward. */
const response: CvTailorResponse = {
  edits: designTailorEdits(revision.content, "en").slice(0, 3),
  dropped: 1,
  model: "recorded",
  promptVersion: "recorded",
};

async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render({ aiEnabled = true } = {}) {
  const dataset = {
    ...populatedDataset,
    profile: populatedDataset.profile && { ...populatedDataset.profile, aiEnabled },
  };
  tracker = createMemoryTrackerStore(dataset, () => FIXTURE_NOW);
  tailorCv = vi.fn(() => Promise.resolve(response));
  const unused = vi.fn(() => Promise.reject(new Error("unused")));
  jobs = createMemoryJobsStore(
    tracker,
    { mailAccounts: [], coverLetters: [], renderedFiles: [], jobSources: [] },
    {
      search: unused,
      runSavedSearch: unused,
      importUrl: unused,
      refreshMatches: unused,
      sendEmail: unused,
      cancelEmail: unused,
      sendEmailNow: unused,
      tailorCv,
      draftCoverLetter: unused,
    } as unknown as MemoryJobsCallables,
  );
  onClose = vi.fn();
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <TrackerRepositoryContext.Provider value={tracker.repository}>
          <TrackerSourceContext.Provider value={tracker.source}>
            <JobsProviders source={jobs.source} repository={jobs.repository}>
              <TailorHost jobId={JOB_ID} cvId={CV_ID} revisionId={null} onClose={onClose as () => void} />
            </JobsProviders>
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
  tailorSessions.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const buttons = (name: string) =>
  [...document.querySelectorAll("button")].filter((candidate) => candidate.textContent.trim() === name);
const click = async (element: HTMLElement | undefined) => {
  if (!element) throw new Error("no element");
  act(() => element.click());
  await settle();
};
const text = () => document.body.textContent;

describe("TailorReview", () => {
  it("asks with the chosen intensity, then accepting 2 of 3 saves an ai_tailor revision pinned on the application", async () => {
    await render();
    act(() => document.querySelector<HTMLInputElement>('input[value="thorough"]')?.click());
    await click(buttons("Suggest edits")[0]);
    expect(tailorCv).toHaveBeenCalledWith({ cvId: CV_ID, revisionId: "rev-en-3", jobId: JOB_ID, locale: "en", intensity: "thorough" });
    expect(text()).toContain("3 suggested edits");
    expect(text()).toContain("1 suggestion was left out");
    expect(text()).toContain("Why: ");

    await click(buttons("Accept")[0]);
    await click(buttons("Keep original")[0]);
    await click(buttons("Accept")[0]);
    expect(text()).toContain("2 accepted · 1 kept as it was");

    await click(buttons("Save as new version")[0]);
    const saved = tracker
      .cvRevisions()
      .find((candidate) => candidate.source === "ai_tailor" && candidate.cvId === CV_ID && candidate.jobId === JOB_ID);
    expect(saved).toMatchObject({ cvId: CV_ID, jobId: JOB_ID, basedOnRevisionId: "rev-en-3" });
    expect(saved?.content.work?.[0]?.highlights?.[1]).toMatch(/^Made checkout faster/u);
    expect(saved?.content.skills?.[0]?.keywords?.[0]).toBe("TypeScript");
    // The second edit (a new bullet order) was kept as it was.
    expect(saved?.content.work?.[0]?.highlights?.[0]).toBe(revision.content.work?.[0]?.highlights?.[0]);
    const state = tracker.source.getState();
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.data.applications.find((candidate) => candidate.jobId === JOB_ID)).toMatchObject({
      cvId: CV_ID,
      cvRevisionId: saved?.id,
    });
    // The CV itself still points at its own current version.
    expect(state.data.cvs.find((cv) => cv.id === CV_ID)?.currentRevisionId).toBe("rev-en-3");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows AI-off calmly and doesn't ask", async () => {
    await render({ aiEnabled: false });
    expect(text()).toContain("AI features are off in Settings.");
    const suggest = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.startsWith("Suggest edits"));
    expect(suggest?.getAttribute("aria-disabled")).toBe("true");
    expect(tailorCv).not.toHaveBeenCalled();
  });

  it("says when the daily AI limit is reached", async () => {
    await render();
    tailorCv.mockRejectedValueOnce(Object.assign(new Error("cap"), { code: "functions/resource-exhausted", details: { reason: "daily_cap" } }));
    await click(buttons("Suggest edits")[0]);
    expect(text()).toContain("You've reached today's AI limit.");
  });
});
