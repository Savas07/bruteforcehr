// @vitest-environment happy-dom
import type { MailSendRequest } from "@bfhr/core";
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
import { act, useEffect } from "react";
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
import type * as Desktop from "../../lib/desktop";
import { openMailto } from "../../lib/desktop";
import { keymap } from "../../shared/keyboard/keymap";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { EmailApplyPanel } from ".";
import { applySessions } from "./session";

vi.mock("../../lib/cvExport", () => ({
  printCvPdf: vi.fn(() => Promise.resolve(new Uint8Array(84_000))),
  saveExportFile: vi.fn(() => Promise.resolve("/Users/deniz/Downloads/cv.pdf")),
}));
vi.mock("../../lib/desktop", async (original) => ({
  ...(await original<typeof Desktop>()),
  openMailto: vi.fn(() => Promise.resolve()),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };
const JOB_ID = "job-fernweh-frontend";
const ADDRESS = "bewerbung@fernweh-reisen.de";

let container: HTMLDivElement;
let root: Root;
let tracker: MemoryTrackerStore;
let jobs: MemoryJobsStore;
let callables: Record<keyof MemoryJobsCallables, Mock>;
let onClose: Mock<() => void>;
const onTailor = vi.fn<(cvId: string, revisionId: string | null) => void>();
let router: AnyRouter;

async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function Keys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void keymap.dispatch(event, "windows");
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

async function render({ canSend = true } = {}) {
  const dataset = {
    ...populatedDataset,
    jobs: populatedDataset.jobs.map((job) => (job.id === JOB_ID ? { ...job, applyUrl: null, applyEmail: ADDRESS } : job)),
  };
  tracker = createMemoryTrackerStore(dataset, () => FIXTURE_NOW);
  callables = {
    search: vi.fn(),
    runSavedSearch: vi.fn(),
    importUrl: vi.fn(),
    refreshMatches: vi.fn(() => Promise.resolve()),
    sendEmail: vi.fn((request: MailSendRequest) =>
      Promise.resolve({
        applicationId: request.applicationId ?? "app-new",
        sendAt: new Date(Date.now() + 10_000).toISOString(),
        state: "scheduled" as const,
      }),
    ),
    cancelEmail: vi.fn(() => Promise.resolve()),
    sendEmailNow: vi.fn(() => Promise.resolve()),
    tailorCv: vi.fn(),
    draftCoverLetter: vi.fn(() =>
      Promise.resolve({
        subject: null,
        body: "Sehr geehrte/r {hiring_manager},\n\nbei Pazarbox habe ich das Designsystem neu aufgebaut.\n\nMit freundlichen Grüßen\nDeniz Aksoy",
        placeholders: [],
        unresolvedFields: ["hiring_manager"],
        droppedSentences: 1,
        model: "recorded",
        promptVersion: "recorded",
      }),
    ),
  };
  jobs = createMemoryJobsStore(
    tracker,
    {
      mailAccounts: canSend ? dataset.mailAccounts : [],
      coverLetters: dataset.coverLetters,
      renderedFiles: [],
      jobSources: [],
    },
    callables as unknown as MemoryJobsCallables,
  );
  onClose = vi.fn();
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <Keys />
        <TrackerRepositoryContext.Provider value={tracker.repository}>
          <TrackerSourceContext.Provider value={tracker.source}>
            <ModelEnvironmentContext.Provider value={environment}>
              <JobsProviders source={jobs.source} repository={jobs.repository}>
                <EmailApplyPanel jobId={JOB_ID} onClose={onClose as () => void} onTailor={onTailor} />
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
      createRoute({ getParentRoute: () => rootRoute, path: "/tracker/applications/$applicationId", component: () => null }),
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function field<T extends HTMLElement = HTMLInputElement>(label: string): T {
  const element = [...document.querySelectorAll("label")].find((candidate) => candidate.textContent === label);
  const control = element ? document.getElementById(element.htmlFor) : null;
  if (!control) throw new Error(`no field ${label}`);
  return control as T;
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.startsWith(name));
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

function type(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  });
}

const click = async (name: string) => {
  act(() => button(name).click());
  await settle();
};

const text = () => document.body.textContent;

function application() {
  const state = tracker.source.getState();
  if (state.status !== "ready") throw new Error("not ready");
  return state.data.applications.find((candidate) => candidate.jobId === JOB_ID) ?? null;
}

describe("EmailApplyPanel", () => {
  it("prefills the posting's address, a German subject and the matched CV", async () => {
    await render();
    expect(document.querySelector("h2")?.textContent).toBe("Apply to Fernweh Reisen");
    expect(field("To").value).toBe(ADDRESS);
    expect(text()).toContain("From the job posting");
    expect(field("Subject").value).toBe("Bewerbung: Frontend-Entwickler:in (Vue.js)");
    expect(field<HTMLSelectElement>("From").value).toBe("acc-gmail");
    expect(field<HTMLSelectElement>("CV").value).toBe("cv-de");
    expect(text()).toContain("Written in German, the language of the posting.");
  });

  it("explains a blocked Review in one line and lets the user fix it", async () => {
    await render();
    type(field("To"), "");
    expect(text()).toContain("Add the address to send your application to.");
    expect(button("Review email").getAttribute("aria-disabled")).toBe("true");
    type(field("To"), ADDRESS);
    expect(button("Review email").getAttribute("aria-disabled")).toBeNull();
  });

  it("reviews with sized PDFs, sends with a 10 s undo and Undo cancels with the draft kept", async () => {
    await render();
    press("Enter", { ctrlKey: true });
    await settle();
    expect(text()).toContain("Sending details");
    expect(text()).toContain("Deniz-Aksoy-CV-Fernweh-Reisen.pdf");
    expect(text()).toContain("84 kB");

    await click(`Send to ${ADDRESS}`);
    expect(callables.sendEmail).toHaveBeenCalledTimes(1);
    const request = callables.sendEmail.mock.calls[0]?.[0] as MailSendRequest;
    expect(request).toMatchObject({
      accountId: "acc-gmail",
      applicationId: null,
      jobId: JOB_ID,
      to: [{ name: null, address: ADDRESS }],
      subject: "Bewerbung: Frontend-Entwickler:in (Vue.js)",
      pins: { cvId: "cv-de", cvRevisionId: "rev-de-2", coverLetterId: null, coverLetterFileId: null },
    });
    expect(request.attachments).toEqual([{ kind: "rendered", renderedFileId: request.pins.cvFileId }]);
    expect(text()).toContain(`Sending to ${ADDRESS}`);
    expect(text()).toMatch(/Sends in (9|10) s/u);

    await click("Undo");
    expect(callables.cancelEmail).toHaveBeenCalledWith("app-new");
    expect(text()).toContain("Not sent. Your draft is saved.");
    expect(text()).toContain("Sending details");
  });

  it("maps a refused send to one calm sentence", async () => {
    await render();
    callables.sendEmail.mockRejectedValueOnce(
      Object.assign(new Error("cap"), { code: "functions/resource-exhausted", details: { reason: "daily_send_cap" } }),
    );
    press("Enter", { ctrlKey: true });
    await settle();
    press("Enter", { ctrlKey: true });
    await settle();
    expect(text()).toContain("Daily limit reached. Your draft is saved, and you can send it tomorrow.");
  });

  it("without a sending account: mail app, then 'I sent it' records Applied with the files pinned", async () => {
    await render({ canSend: false });
    expect(() => field("From")).toThrow();
    expect(text()).toContain("Connect an email account to send from the app.");
    type(field("To"), `${ADDRESS}, lena@fernweh-reisen.de`);
    press("Enter", { ctrlKey: true });
    await settle();

    await click("Open in your mail app");
    expect(openMailto).toHaveBeenCalledWith({
      to: [ADDRESS, "lena@fernweh-reisen.de"],
      subject: "Bewerbung: Frontend-Entwickler:in (Vue.js)",
      body: expect.stringContaining("hiermit bewerbe ich mich") as string,
    });

    await click("I sent it");
    const applied = application();
    expect(applied).toMatchObject({ status: "applied", channel: "email", cvId: "cv-de", cvRevisionId: "rev-de-2" });
    expect(applied?.cvFileId).toMatch(/^mem-renderedFiles-/u);
    expect(text()).toContain("Marked as applied: Fernweh Reisen");
    expect(callables.sendEmail).not.toHaveBeenCalled();

    // Undo deletes the application the record created.
    await click("Undo");
    expect(application()).toBeNull();
  });

  it("drafts the letter with AI, blocks on the unresolved field, then sends the filled letter", async () => {
    await render();
    act(() => field("Attach a cover letter").click());
    await click("Draft with AI");
    expect(callables.draftCoverLetter).toHaveBeenCalledWith({
      cvId: "cv-de",
      revisionId: "rev-de-2",
      jobId: JOB_ID,
      tone: "formal",
      language: "de",
      templateId: "starter-de",
    });
    expect(text()).toContain("Drafted from your CV and this job. Edit anything.");
    expect(text()).toContain("1 sentence was left out");
    expect(text()).toContain("Fill in “Hiring manager” before sending: {hiring_manager} is still in your text.");
    type(field("Hiring manager {hiring_manager}"), "Frau Weber");
    press("Enter", { ctrlKey: true });
    await settle();
    press("Enter", { ctrlKey: true });
    await settle();
    const request = callables.sendEmail.mock.calls[0]?.[0] as MailSendRequest;
    expect(request.attachments).toHaveLength(2);
    const state = jobs.source.getState();
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.data.coverLetters.find((candidate) => candidate.id === request.pins.coverLetterId)).toMatchObject({
      author: "ai",
      body: expect.stringMatching(/^Sehr geehrte\/r Frau Weber,/u) as string,
    });
  });

  it("saves the cover letter and attaches it when turned on", async () => {
    await render();
    act(() => field("Attach a cover letter").click());
    const letter = field<HTMLTextAreaElement>("Cover letter");
    expect(letter.value).toContain("[Warum dich die Stelle reizt]");
    expect(text()).toContain("Fill in [Warum dich die Stelle reizt] before sending.");
    type(letter, "Sehr geehrte Damen und Herren,\n\nich reise gern nachhaltig.\n\nMit freundlichen Grüßen\nDeniz Aksoy");
    press("Enter", { ctrlKey: true });
    await settle();
    expect(text()).toContain("Deniz-Aksoy-Anschreiben-Fernweh-Reisen.pdf");
    press("Enter", { ctrlKey: true });
    await settle();
    const request = callables.sendEmail.mock.calls[0]?.[0] as MailSendRequest;
    expect(request.attachments).toHaveLength(2);
    expect(request.pins.coverLetterId).toMatch(/^mem-coverLetters-/u);
    const state = jobs.source.getState();
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.data.coverLetters.find((candidate) => candidate.id === request.pins.coverLetterId)).toMatchObject({
      jobId: JOB_ID,
      language: "de",
      title: "Fernweh Reisen — Frontend-Entwickler:in (Vue.js)",
    });
  });

  it("closes on Esc and keeps the draft for the session", async () => {
    await render();
    type(field("Subject"), "Bewerbung als Frontend-Entwicklerin");
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(
        <RawIntlProvider value={intl}>
          <Tooltip.Provider>
            <RouterProvider router={router} />
          </Tooltip.Provider>
        </RawIntlProvider>,
      );
    });
    await settle();
    expect(field("Subject").value).toBe("Bewerbung als Frontend-Entwicklerin");
  });
});
