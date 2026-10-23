// @vitest-environment happy-dom
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrackerSourceContext } from "../../data/tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../../data/tracker/memory";
import { TrackerRepositoryContext } from "../../data/tracker/repository";
import { createAppIntl } from "../../i18n/intl";
import { ToastProvider, ToastViewport } from "../../shared/ui/Toast";
import { CsvImportHost } from "./CsvImportHost";
import { openCsvImport } from "./store";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const bytes = new Uint8Array(
  readFileSync(
    path.join(import.meta.dirname, "../../../../../packages/fixtures/csv/tr-excel-windows-1254.csv"),
  ),
);
let container: HTMLDivElement;
let root: Root;
let store: MemoryTrackerStore;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // An existing "Kuzey Oyun · Frontend Engineer" makes that row a duplicate.
  store = createMemoryTrackerStore(
    {
      ...emptyDataset,
      profile: populatedDataset.profile,
      applications: populatedDataset.applications
        .slice(0, 1)
        .map((application) => ({ ...application, company: "Kuzey Oyun", role: "Frontend Engineer" })),
    },
    () => FIXTURE_NOW,
  );
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <TrackerRepositoryContext.Provider value={store.repository}>
            <TrackerSourceContext.Provider value={store.source}>
              <ToastProvider>
                <CsvImportHost />
                <ToastViewport />
              </ToastProvider>
            </TrackerSourceContext.Provider>
          </TrackerRepositoryContext.Provider>
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const dialog = () => document.querySelector<HTMLElement>('[data-testid="csv-import"]');
const button = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
const select = (label: string) => {
  const target = [...(dialog()?.querySelectorAll("label") ?? [])].find(
    (candidate) => candidate.textContent === label,
  );
  return document.getElementById(target?.htmlFor ?? "") as HTMLSelectElement | null;
};
const change = (element: HTMLSelectElement | null, value: string) =>
  act(() => {
    if (!element) throw new Error("no select");
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
const applications = () => {
  const state = store.source.getState();
  return state.status === "ready" ? state.data.applications : [];
};

describe("CsvImportHost", () => {
  it("walks a Turkish Excel export from columns to an undoable import", () => {
    act(() => openCsvImport({ file: { name: "takip.csv", bytes } }));
    expect(dialog()?.textContent).toContain("takip.csv · 9 rows");
    expect(select("Characters")?.value).toBe("windows-1254");
    expect(select("Separated by")?.value).toBe(";");
    expect(select("Şirket")?.value).toBe("company");
    expect(select("Maaş Beklentisi")?.value).toBe("");

    // Without a company column, Continue says why.
    change(select("Şirket"), "");
    expect(dialog()?.textContent).toContain("Choose the columns for Company.");
    expect(button("Continue")?.getAttribute("aria-disabled")).toBe("true");
    change(select("Şirket"), "company");

    act(() => button("Continue")?.click());
    expect(dialog()?.textContent).toContain("1 word has no status yet.");
    expect(select("Mülakat")?.value).toBe("interviewing");
    change(select("Belki"), "saved");
    expect(dialog()?.textContent).not.toContain("no status yet");

    act(() => button("Continue")?.click());
    expect(dialog()?.textContent).toContain("8 of 9 rows are ready to import.");
    expect(dialog()?.textContent).toContain("1 needs a fix and is left out.");
    expect(dialog()?.textContent).toContain("2 look like ones you already track, so they start unticked.");
    act(() => button("Import 6 applications")?.click());

    expect(dialog()).toBeNull();
    const imported = applications().filter((application) => application.id.startsWith("mem-"));
    expect(imported.map((application) => application.company).sort()).toEqual([
      "Anadolu Yazılım",
      "Boğaziçi Fintech",
      "Ege Lojistik",
      "Kervan Teknoloji",
      "Marmara Bank",
      "Trakya Medya",
    ]);
    const toast = [...document.querySelectorAll("li")].find((item) =>
      item.textContent?.includes("imported from takip.csv"),
    );
    expect(toast?.textContent).toContain("6 applications imported from takip.csv");

    // Undo deletes exactly the imported applications.
    act(() =>
      [...(toast?.querySelectorAll("button") ?? [])]
        .find((candidate) => candidate.textContent?.includes("Undo"))
        ?.click(),
    );
    expect(applications().filter((application) => application.id.startsWith("mem-"))).toEqual([]);
    expect(applications()).toHaveLength(1);
  });

  it("explains a workbook picked by mistake", () => {
    act(() =>
      openCsvImport({
        file: { name: "Applications.xlsx", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]) },
      }),
    );
    expect(dialog()?.textContent).toContain("This is a spreadsheet workbook, not a CSV file");
    expect(dialog()?.textContent).toContain("Choose file…");
  });
});
