// @vitest-environment happy-dom
import type { JobImportUrlResponse } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createMemoryJobsStore, type MemoryJobsCallables } from "../../data/jobs/memory";
import { JobsRepositoryContext } from "../../data/jobs/repository";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../../data/tracker/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { createAppIntl } from "../../i18n/intl";
import { type Connectivity, ConnectivityContext } from "../../shared/connectivity";
import { keymap } from "../../shared/keyboard/keymap";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { ImportJobDialog } from ".";
import { TEST_IMPORT_URL, testImportResponse } from "./test-response";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };
const ONLINE: Connectivity = { status: "online", pendingWrites: 0, lastSyncedAt: null };
const OFFLINE: Connectivity = { ...ONLINE, status: "offline" };

let container: HTMLDivElement;
let root: Root;
let tracker: MemoryTrackerStore;
let importUrl: Mock<MemoryJobsCallables["importUrl"]>;
let imported: string[];
/** Every `onOpenChange` call. */
let openChanges: boolean[];

function Keys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => void keymap.dispatch(event, "windows");
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}

function Host({ initialUrl }: { readonly initialUrl?: string }) {
  const [open, setOpen] = useState(true);
  const onOpenChange = (next: boolean) => {
    openChanges.push(next);
    setOpen(next);
  };
  return (
    <ImportJobDialog
      open={open}
      onOpenChange={onOpenChange}
      {...(initialUrl === undefined ? {} : { initialUrl })}
      onImported={(jobId) => imported.push(jobId)}
    />
  );
}

function render({ connectivity = ONLINE, initialUrl }: { connectivity?: Connectivity; initialUrl?: string } = {}) {
  const callables: MemoryJobsCallables = {
    search: () => Promise.reject(new Error("unused")),
    runSavedSearch: () => Promise.reject(new Error("unused")),
    importUrl,
    refreshMatches: () => Promise.resolve(),
    sendEmail: () => Promise.reject(new Error("unused")),
    cancelEmail: () => Promise.reject(new Error("unused")),
    sendEmailNow: () => Promise.reject(new Error("unused")),
    tailorCv: () => Promise.reject(new Error("unused")),
    draftCoverLetter: () => Promise.reject(new Error("unused")),
  };
  const jobs = createMemoryJobsStore(
    tracker,
    { mailAccounts: [], coverLetters: [], renderedFiles: [], jobSources: [] },
    callables,
  );
  act(() => {
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ConnectivityContext.Provider value={connectivity}>
            <ModelEnvironmentContext.Provider value={environment}>
              <TrackerSourceContext.Provider value={tracker.source}>
                <JobsRepositoryContext.Provider value={jobs.repository}>
                  <ToastProvider>
                    <Keys />
                    <Host {...(initialUrl === undefined ? {} : { initialUrl })} />
                    <ToastViewport />
                  </ToastProvider>
                </JobsRepositoryContext.Provider>
              </TrackerSourceContext.Provider>
            </ModelEnvironmentContext.Provider>
          </ConnectivityContext.Provider>
        </Tooltip.Provider>
      </RawIntlProvider>,
    );
  });
}

beforeEach(() => {
  tracker = createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
  importUrl = vi.fn<MemoryJobsCallables["importUrl"]>();
  imported = [];
  openChanges = [];
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
  const labelElement = [...document.querySelectorAll("label")].find((candidate) => candidate.textContent === label);
  const control = labelElement ? document.getElementById(labelElement.htmlFor) : null;
  if (!control) throw new Error(`no field ${label}`);
  return control as T;
}

function button(name: string): HTMLButtonElement {
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

function submit() {
  act(() => {
    dialog()?.querySelector("form")?.requestSubmit();
  });
}

function press(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    );
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A promise settled by the test (the app's TS lib predates `Promise.withResolvers`). */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const createdJobs = () => tracker.log.filter((write) => write.op === "create" && write.collection === "jobs");

describe("ImportJobDialog", () => {
  it("checks the link locally before calling the server", () => {
    render();
    expect(document.activeElement).toBe(field("Link to the posting"));
    type(field("Link to the posting"), "http://jobs.acme.com/42");
    submit();
    expect(importUrl).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("Only secure links can be read.");
    expect(field("Link to the posting").getAttribute("aria-invalid")).toBe("true");
  });

  it("reads the posting, shows the draft with its source and flags, and saves the edits", async () => {
    const answer = deferred<JobImportUrlResponse>();
    importUrl.mockReturnValue(answer.promise);
    render({ initialUrl: TEST_IMPORT_URL });
    submit();
    expect(importUrl).toHaveBeenCalledWith(TEST_IMPORT_URL);
    expect(dialog()?.textContent).toContain("Reading the posting…");

    answer.resolve(testImportResponse());
    await settle();
    expect(field("Role").value).toBe("Senior Frontend Engineer");
    expect(field("Location").value).toBe("Berlin · Munich");
    expect(dialog()?.textContent).toContain("Read from the page's job data · boards.example-ats.com");
    // Salary was read with 0.72 confidence: the group says "Check this" until it's edited.
    expect(dialog()?.querySelector("legend")?.textContent).toContain("Check this");

    type(field("Role"), "Staff Frontend Engineer");
    type(field("From"), "75.000");
    expect(dialog()?.querySelector("legend")?.textContent).not.toContain("Check this");
    press("Enter", { ctrlKey: true });

    expect(dialog()).toBeNull();
    expect(openChanges).toEqual([false]);
    const [write] = createdJobs();
    if (write?.op !== "create" || write.collection !== "jobs") throw new Error("no job created");
    expect(imported).toEqual([write.entity.id]);
    expect(write.entity).toMatchObject({
      title: "Staff Frontend Engineer",
      salary: { min: 75_000, max: 85_000 },
      sourceKeys: [`url_import:${TEST_IMPORT_URL}`],
    });
    expect(write.entity.sources[0]).toMatchObject({ title: "Staff Frontend Engineer", salary: { min: 75_000 } });
  });

  it("adds the link to an existing job", async () => {
    importUrl.mockResolvedValue(testImportResponse({ existingJobId: "job-existing" }));
    render({ initialUrl: TEST_IMPORT_URL });
    submit();
    await settle();
    expect(dialog()?.textContent).toContain("You already have this job. We'll add this link to it.");
    submit();
    expect(imported).toEqual(["job-existing"]);
    expect(tracker.log.at(-1)).toMatchObject({ op: "update", collection: "jobs", id: "job-existing" });
  });

  it("offers Enter it yourself when the site blocks reading, prefilled with the link", async () => {
    importUrl.mockRejectedValue(
      Object.assign(new Error("blocked"), { code: "functions/failed-precondition", details: { reason: "blocked_by_site" } }),
    );
    render();
    type(field("Link to the posting"), "jobs.blocked.example/7");
    submit();
    await settle();
    expect(importUrl).toHaveBeenCalledWith("https://jobs.blocked.example/7");
    expect(dialog()?.textContent).toContain("This site doesn't let us read its pages.");
    act(() => button("Enter it yourself").click());

    expect(field("Link to the posting").value).toBe("https://jobs.blocked.example/7");
    expect(field("Apply link").value).toBe("https://jobs.blocked.example/7");
    expect(document.activeElement).toBe(field("Role"));
    submit();
    expect(dialog()?.textContent).toContain("2 fields need a look");
    expect(createdJobs()).toEqual([]);

    type(field("Role"), "Product Designer");
    type(field("Company"), "Acme Robotics");
    submit();
    const [write] = createdJobs();
    if (write?.op !== "create" || write.collection !== "jobs") throw new Error("no job created");
    expect(write.entity).toMatchObject({
      title: "Product Designer",
      company: "Acme Robotics",
      language: "und",
      fingerprint: "manual|acme robotics|product designer",
      sourceKeys: ["url_import:https://jobs.blocked.example/7"],
    });
    expect(imported).toEqual([write.entity.id]);
  });

  it("offline: says reading needs a connection, and entering it yourself still saves", () => {
    render({ connectivity: OFFLINE, initialUrl: TEST_IMPORT_URL });
    expect(dialog()?.textContent).toContain("Reading a link needs a connection.");
    submit();
    expect(importUrl).not.toHaveBeenCalled();
    act(() => button("Enter it yourself").click());
    type(field("Role"), "Frontend Engineer");
    type(field("Company"), "Lindenhof Mobility");
    expect(dialog()?.textContent).toContain("You're offline. It's saved on this device");
    submit();
    expect(createdJobs()).toHaveLength(1);
  });

  it("closing while reading drops the answer; closing with edits asks first", async () => {
    const answer = deferred<JobImportUrlResponse>();
    importUrl.mockReturnValue(answer.promise);
    render({ initialUrl: TEST_IMPORT_URL });
    submit();
    act(() => button("Cancel").click());
    expect(dialog()).toBeNull();
    answer.resolve(testImportResponse());
    await settle();
    expect(createdJobs()).toEqual([]);

    act(() => root.unmount());
    root = createRoot(container);
    importUrl.mockResolvedValue(testImportResponse());
    render({ initialUrl: TEST_IMPORT_URL });
    submit();
    await settle();
    type(field("Company"), "Lindenhof");
    press("Escape");
    expect(alertDialog()?.textContent).toContain("Discard this job?");
    act(() => button("Discard").click());
    expect(openChanges.at(-1)).toBe(false);
    expect(createdJobs()).toEqual([]);
  });
});
