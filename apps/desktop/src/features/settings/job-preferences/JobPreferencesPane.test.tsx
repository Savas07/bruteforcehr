// @vitest-environment happy-dom
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppIntl } from "../../../i18n/intl";
import { createMemorySettingsStore, type MemorySettingsStore } from "../memory";
import { settingsProfile, SettingsStoreContext } from "../store";
import { JobPreferencesPane } from "./JobPreferencesPane";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
let container: HTMLDivElement;
let root: Root;
let memory: MemorySettingsStore;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  memory = createMemorySettingsStore({ watchlist: [], jobSources: [], now: () => FIXTURE_NOW });
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <SettingsStoreContext.Provider value={memory.store}>
            <JobPreferencesPane profile={settingsProfile(populatedDataset.profile, null)} />
          </SettingsStoreContext.Provider>
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent.trim() === name,
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

describe("Settings › Job preferences", () => {
  it("shows the saved preferences", () => {
    expect(button("Mid-level").getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Frontend Engineer");
    expect(document.body.textContent).toContain("Berlin, Germany");
    expect(document.body.textContent).toContain("Can you work in the EU / EEA");
  });

  it("autosaves only the section that changed", async () => {
    act(() => button("Senior").click());
    act(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label="Remove Product Engineer"]')?.click(),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(memory.log).toEqual([
      { kind: "profile", patch: { preferences: { seniority: "senior" } } },
      {
        kind: "profile",
        patch: {
          preferences: {
            targetRoles: ["Frontend Engineer", "Senior Frontend Engineer", "Design Systems Engineer"],
          },
        },
      },
    ]);
    expect(document.body.textContent).toContain("Saved");
  });
});
