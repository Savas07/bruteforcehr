// @vitest-environment happy-dom
import { FIXTURE_NOW } from "@bfhr/fixtures";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailProviders } from "../../data/mail/live";
import { createMemoryMailStore, type MemoryMailStore } from "../../data/mail/memory";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { createAppIntl } from "../../i18n/intl";
import type { MailConnectResult } from "../../lib/desktop";
import { ToastProvider } from "../../shared/ui/Toast";
import { MailConnectHost, openMailConnect } from ".";

const desktop = vi.hoisted(() => ({
  pending: null as MailConnectResult | null,
  listener: null as (() => void) | null,
  opened: [] as string[],
}));

vi.mock(import("../../lib/desktop"), async (original) => ({
  ...(await original()),
  openExternal: (url: string) => {
    desktop.opened.push(url);
    return Promise.resolve();
  },
  takeMailConnect: () => {
    const result = desktop.pending;
    desktop.pending = null;
    return Promise.resolve(result);
  },
  onMailConnect: (listener: () => void) => {
    desktop.listener = listener;
    return () => {
      desktop.listener = null;
    };
  },
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const environment = { now: () => FIXTURE_NOW, timeZone: "Europe/Istanbul" };
let container: HTMLDivElement;
let root: Root;
let store: MemoryMailStore;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(oauthConfigured = false) {
  store = createMemoryMailStore({ accounts: [], messages: [], now: () => FIXTURE_NOW, oauthConfigured });
  const rootRoute = createRootRoute({
    component: () => (
      <ToastProvider>
        <ModelEnvironmentContext.Provider value={environment}>
          <MailProviders source={store.source} repository={store.repository}>
            <Outlet />
            <MailConnectHost />
          </MailProviders>
        </ModelEnvironmentContext.Provider>
      </ToastProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: () => <p>Settings</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
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
  act(() => openMailConnect());
}

function dialog(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!found) throw new Error("no dialog");
  return found;
}

function button(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent.startsWith(name),
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

function click(name: string) {
  act(() => button(name).click());
}

function field(label: string): HTMLInputElement {
  const found = [...dialog().querySelectorAll("label")].find((candidate) =>
    candidate.textContent.startsWith(label),
  );
  const input = found ? document.getElementById(found.htmlFor) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`no field ${label}`);
  return input;
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  desktop.pending = null;
  desktop.listener = null;
  desktop.opened = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Connect your email", () => {
  it("connects iCloud with an app password and shows the scan", async () => {
    await render();
    expect(dialog().textContent).toContain("Connect your email");
    type(field("Email address"), "deniz@icloud.com");
    // Domain detection selected the iCloud tile.
    expect(dialog().querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain(
      "iCloud Mail",
    );
    click("Continue");
    expect(dialog().textContent).toContain("Create an app password");
    type(field("App password"), "abcd-efgh-ijkl-mnop");
    click("Test and connect");
    await settle();
    expect(store.log).toContainEqual({ kind: "connectImap", address: "deniz@icloud.com", accountId: null });
    expect(dialog().textContent).toContain("Connected to deniz@icloud.com");
    expect(dialog().textContent).toContain("Checking the last 90 days");
  });

  it("marks the password field when the server refuses it", async () => {
    await render();
    act(() => dialog().querySelectorAll<HTMLButtonElement>('[role="radio"]')[3]?.click()); // Yahoo Mail
    click("Continue");
    type(field("Email address"), "deniz@yahoo.com");
    type(field("App password"), "wrong");
    click("Test and connect");
    await settle();
    const password = field("App password");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(`${password.id}-message`)?.textContent).toContain(
      "We couldn't sign in with this password",
    );
  });

  it("says calmly that Google sign-in comes later and offers an app password", async () => {
    await render();
    click("Continue"); // Gmail is the first tile.
    click("Continue to Google");
    await settle();
    expect(store.log).toContainEqual({ kind: "connectStart", provider: "google" });
    expect(dialog().textContent).toContain("Gmail sign-in is coming in an update");
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
    click("Use an app password instead");
    expect(dialog().textContent).toContain("Connect Gmail");
    expect(field("App password").value).toBe("");
  });

  it("finishes the browser sign-in on the matching return link", async () => {
    await render(true);
    click("Continue");
    click("Continue to Google");
    await settle();
    expect(desktop.opened).toEqual([
      "https://bruteforcehr.web.app/connect/google?nonce=memory-nonce-0000000000",
    ]);
    expect(dialog().textContent).toContain("Finish in your browser");
    desktop.pending = {
      nonce: "another-nonce-000000",
      provider: "google",
      intent: "read",
      ok: false,
      reason: "failed",
    };
    await act(async () => desktop.listener?.());
    expect(dialog().textContent).toContain("Finish in your browser");
    desktop.pending = {
      nonce: "memory-nonce-0000000000",
      provider: "google",
      intent: "read",
      ok: false,
      reason: "scope_missing",
    };
    await act(async () => desktop.listener?.());
    expect(dialog().textContent).toContain("didn't get permission to read your email");
  });
});
