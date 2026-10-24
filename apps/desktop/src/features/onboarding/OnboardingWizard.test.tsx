// @vitest-environment happy-dom
import type { Profile } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW } from "@bfhr/fixtures";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from "@tanstack/react-router";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { createMemoryCvStore } from "../cv-editor/memoryBackend";
import { createMemoryOnboardingStore, type MemoryOnboardingStore } from "./memory";
import { newProfile, type OnboardingStep } from "./model";
import { OnboardingWizard } from "./OnboardingWizard";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const EMAIL = "new.person@example.com";

let container: HTMLDivElement;
let root: Root;
let memory: MemoryOnboardingStore;
let router: AnyRouter;

function render(options: { step?: OnboardingStep; profile?: Profile | null; failSetup?: boolean } = {}) {
  memory = createMemoryOnboardingStore({ uid: "uid-new", failSetup: options.failSetup ?? false });
  const cvStore = createMemoryCvStore("uid-new", emptyDataset, () => FIXTURE_NOW);
  const profile =
    options.profile === undefined
      ? newProfile(
          "uid-new",
          { email: EMAIL, fullName: "New Person", timezone: "Europe/Istanbul", uiLanguage: "en" },
          FIXTURE_NOW,
        )
      : options.profile;
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <Outlet />
        <ToastViewport />
      </ToastProvider>
    ),
  });
  router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/",
        component: () => (
          <OnboardingWizard
            store={memory.store}
            cvBackend={cvStore.backend}
            email={EMAIL}
            profile={profile}
            cvs={[]}
            initialStep={options.step ?? "cv"}
            onSignOut={() => undefined}
          />
        ),
      }),
      createRoute({ getParentRoute: () => rootRoute, path: "/today", component: () => <h1>Today</h1> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <RouterProvider router={router} />
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const heading = () => document.querySelector("h1")?.textContent;

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent.trim().startsWith(name),
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

function click(name: string) {
  act(() => button(name).click());
}

function type(control: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value")?.set;
  act(() => {
    setter?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function input(label: string): HTMLInputElement {
  const byLabel = [...document.querySelectorAll("label")].find(
    (candidate) => candidate.textContent === label,
  );
  const id = byLabel?.getAttribute("for");
  const found = id ? document.getElementById(id) : null;
  if (!(found instanceof HTMLInputElement)) throw new Error(`no input ${label}`);
  return found;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OnboardingWizard", () => {
  it("creates the profile first and labels the step", async () => {
    render();
    await settle();
    expect(heading()).toBe("Add your CV");
    expect(document.body.textContent).toContain("Step 1 of 3");
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("CV");
    expect(memory.log[0]).toEqual({
      kind: "ensureProfile",
      seed: { email: EMAIL, fullName: "New Person", timezone: expect.any(String), uiLanguage: "en" },
    });
  });

  it("skips every step and still finishes: no preferences written, no saved search, lands on Today", async () => {
    render();
    await settle();
    click("Skip for now");
    expect(heading()).toBe("What are you looking for?");
    expect(localStorage.getItem("bfhr.onboarding.step.uid-new")).toBe("preferences");
    click("Skip for now");
    expect(heading()).toBe("Start your first search");
    // Nothing to search for: the way on is Today, plus a way back.
    expect(button("Back to preferences")).toBeDefined();
    click("Go to Today");
    await settle();
    await settle();
    expect(memory.log.map((entry) => entry.kind)).toEqual(["ensureProfile", "refresh", "complete"]);
    expect(router.state.location.pathname).toBe("/today");
    expect(document.body.textContent).toContain("You're set up. Your preferences are saved in Settings.");
    expect(localStorage.getItem("bfhr.onboarding.step.uid-new")).toBeNull();
  });

  it("saves the preferences, creates the first saved search from them and completes", async () => {
    render({ step: "preferences" });
    await settle();
    const role = document.querySelector<HTMLInputElement>('input[placeholder="Type a role and press Enter"]');
    if (!role) throw new Error("no role input");
    type(role, "Backend Engineer");
    act(() => {
      role.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    click("Germany");
    click("Remote");
    click("Continue");
    expect(heading()).toBe("Start your first search");
    expect(document.querySelector("dl")?.textContent).toContain("Backend Engineer");
    expect(document.querySelector("dl")?.textContent).toContain("Germany");
    click("Start searching");
    await settle();
    await settle();
    const profile = memory.log.find((entry) => entry.kind === "profile");
    expect(profile?.kind === "profile" && profile.patch).toMatchObject({
      fullName: "New Person",
      preferences: {
        targetRoles: ["Backend Engineer"],
        locations: [{ label: "Germany", city: null, countryCode: "DE", relocation: false }],
        remotePreferences: ["remote"],
        salaryFloor: null,
      },
    });
    const search = memory.log.find((entry) => entry.kind === "savedSearch");
    expect(search?.kind === "savedSearch" && search.input).toMatchObject({
      name: "Backend Engineer",
      query: "Backend Engineer",
      filters: { countryCodes: ["DE"], remoteTypes: ["remote"] },
      schedule: "daily",
      alertThreshold: 65,
      enabled: true,
    });
    expect(memory.log.map((entry) => entry.kind).slice(-2)).toEqual(["refresh", "complete"]);
    expect(router.state.location.pathname).toBe("/today");
  });

  it("asks work authorization per place and stores the answer", async () => {
    render({ step: "preferences" });
    await settle();
    click("United Kingdom");
    const no = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (radio) => radio.value === "no",
    );
    expect(document.body.textContent).toContain("Can you work in United Kingdom without visa sponsorship?");
    act(() => no?.click());
    click("Continue");
    await settle();
    const profile = memory.log.find((entry) => entry.kind === "profile");
    expect(profile?.kind === "profile" && profile.patch.preferences?.workAuthorization).toEqual([
      { region: "GB", status: "needs_sponsorship" },
    ]);
  });

  it("needs a name to continue from preferences", async () => {
    render({ step: "preferences" });
    await settle();
    type(input("Your name"), "  ");
    click("Continue");
    expect(heading()).toBe("What are you looking for?");
    expect(document.body.textContent).toContain("Enter your name. It goes on your CVs and emails.");
    expect(memory.log.some((entry) => entry.kind === "profile")).toBe(false);
  });

  it("says when the profile couldn't be created and retries", async () => {
    render({ failSetup: true });
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "We couldn't set up your account",
    );
    click("Try again");
    expect(memory.log.filter((entry) => entry.kind === "ensureProfile")).toHaveLength(2);
  });

  it("starts an empty CV and uses it for matching", async () => {
    render();
    await settle();
    click("Start from scratch");
    await settle();
    expect(document.body.textContent).toContain("Empty CV, ready to fill in under CVs");
    expect(memory.log.some((entry) => entry.kind === "matchingCv")).toBe(true);
    click("Continue");
    expect(heading()).toBe("What are you looking for?");
  });
});
