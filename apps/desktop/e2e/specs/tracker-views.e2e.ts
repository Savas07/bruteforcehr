/**
 * Tracker table + CSV import on real data: the built app against the Auth + Firestore emulators
 * (scripts/with-emulators.sh). Import a messy Turkish Excel export (Windows-1254, semicolons, a
 * title row, a quoted newline, an unknown status word) → the table shows the rows → bulk move
 * every row to Screening (one batch, one event each) → export the view as CSV, which reads back
 * to the same rows.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { guessColumnMapping, guessedStatusMap, planImport, readSpreadsheet, statusValues } from "@bfhr/core";
import { $, $$, browser, expect } from "@wdio/globals";
import { type ChainablePromiseElement, Key } from "webdriverio";
import { osName, repoRoot, saveScreenshot, setTheme } from "../capture/helpers";
import { ensureSignedIn, testEmail } from "../support/auth";
import { firebaseConfig } from "../../src/lib/firebase.ts";

const FIXTURE = path.join(repoRoot, "packages/fixtures/csv/tr-excel-windows-1254.csv");
const SHOTS = path.join(repoRoot, "artifacts/screens/desktop", osName, "tracker-views");
const COMPANIES = [
  "Anadolu Yazılım",
  "Boğaziçi Fintech",
  "Ege Lojistik",
  "Kervan Teknoloji",
  "Kuzey Oyun",
  "Marmara Bank",
  "Trakya Medya",
];
const isMac = process.platform === "darwin";

const BASE = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
type RestValue = {
  stringValue?: string;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, RestValue> };
};
interface RestDoc {
  readonly name: string;
  readonly fields: Record<string, RestValue>;
}

/** Every document of a collection group whose `field` is one of `values` (emulator owner access). */
async function queryGroup(
  collectionId: string,
  field: string,
  values: readonly string[],
): Promise<RestDoc[]> {
  const response = await fetch(`${BASE}:runQuery`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "IN",
            value: { arrayValue: { values: values.map((value) => ({ stringValue: value })) } },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`runQuery ${collectionId}: ${response.status} ${await response.text()}`);
  const results = (await response.json()) as { document?: RestDoc }[];
  return results.flatMap((result) => (result.document ? [result.document] : []));
}

const importedApplications = () => queryGroup("applications", "company", COMPANIES);
const text = (value: RestValue | undefined) => value?.stringValue ?? null;

/**
 * Opens a Radix dropdown: its trigger opens on `pointerdown`, which the embedded WebDriver's
 * click doesn't produce in WKWebView or WebView2.
 */
async function openMenu(trigger: ChainablePromiseElement): Promise<void> {
  await trigger.waitForDisplayed();
  await browser.execute(
    (element: HTMLElement) => {
      element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "mouse" }),
      );
    },
    await trigger.getElement(),
  );
  await $('[role="menu"]').waitForDisplayed();
}

async function capture(name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(theme);
    await saveScreenshot(path.join(SHOTS, `${name}-${theme}.png`));
  }
}

/**
 * Chooses `value` in the native select labelled `label` (the label's `for` names it). WebDriver's
 * option clicks don't reach React's `onChange` in WKWebView or WebView2, so set the value and
 * dispatch `change` as the browser does after a real pick.
 */
async function selectByLabel(label: string, value: string): Promise<void> {
  const id = await $(`label=${label}`).getAttribute("for");
  if (id === null) throw new Error(`no select labelled "${label}"`);
  await browser.execute(
    (selectId: string, next: string) => {
      const select = document.getElementById(selectId);
      if (!(select instanceof HTMLSelectElement)) throw new Error(`no select #${selectId}`);
      select.value = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    id,
    value,
  );
  await browser.waitUntil(async () => (await $(`[id="${id}"]`).getValue()) === value, {
    timeoutMsg: `"${label}" didn't change to ${value}`,
  });
}

describe("Tracker table + CSV import", () => {
  before(async () => {
    await ensureSignedIn(testEmail("tracker-views"));
    await browser.execute(() => {
      location.hash = "#/tracker?view=table";
    });
  });

  it("imports a Turkish Excel export", async () => {
    await $("button*=Import CSV").waitForDisplayed({ timeout: 20_000 });
    await $("button*=Import CSV").click();
    await $('[data-testid="csv-import"]').waitForDisplayed();
    await capture("import-pick");

    // A picked file, as the system dialog would hand it over.
    const bytes = readFileSync(FIXTURE).toString("base64");
    await browser.execute(
      (data: string, name: string) => {
        const file = new File([Uint8Array.from(atob(data), (char) => char.charCodeAt(0))], name, {
          type: "text/csv",
        });
        const input = document.querySelector<HTMLInputElement>('[data-testid="csv-file-input"]');
        if (!input) throw new Error("no file input");
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
      bytes,
      "takip.csv",
    );

    // Columns: Turkish headers guessed, Windows-1254 and semicolons detected.
    await $("p*=takip.csv · 9 rows").waitForDisplayed();
    expect(await $("label=Şirket").isExisting()).toBe(true);
    const encoding = await $("label=Characters").getAttribute("for");
    expect(await $(`[id="${encoding}"]`).getValue()).toBe("windows-1254");
    expect(await $(`[id="${await $("label=Şirket").getAttribute("for")}"]`).getValue()).toBe("company");
    await capture("import-columns");
    await $("button=Continue").click();

    // Statuses: "Belki" (maybe) is unknown until the user says what it means.
    await $("label=Belki").waitForDisplayed();
    await capture("import-statuses");
    await selectByLabel("Belki", "saved");
    await $("button=Continue").click();

    // Review: the row without a company is left out, the repeated row starts unticked.
    await $("p*=8 of 9 rows are ready to import.").waitForDisplayed();
    await capture("import-review");
    await $("button*=Import 7 applications").click();

    await browser.waitUntil(async () => (await importedApplications()).length === 7, {
      timeout: 20_000,
      timeoutMsg: "the imported applications never reached Firestore",
    });
    const applications = await importedApplications();
    const kervan = applications.find((doc) => text(doc.fields["company"]) === "Kervan Teknoloji");
    expect(text(kervan?.fields["status"])).toBe("interviewing");
    expect(kervan?.fields["appliedAt"]?.timestampValue).toBe("2026-09-12T12:00:00Z");

    const events = await queryGroup(
      "applicationEvents",
      "applicationId",
      applications.map((doc) => doc.name.slice(doc.name.lastIndexOf("/") + 1)),
    );
    expect(events).toHaveLength(7);
    for (const event of events) {
      expect(text(event.fields["type"])).toBe("created");
      expect(text(event.fields["actor"])).toBe("user");
      expect(text(event.fields["evidence"]?.mapValue?.fields?.["reason"])).toMatch(
        /^Imported from takip\.csv · row \d+$/,
      );
    }
  });

  it("shows the imported rows in the table", async () => {
    // WebdriverIO's text selectors don't combine with CSS: find the segment inside its group.
    await $('[aria-label="Show"]').$("button*=All").click();
    await browser.waitUntil(
      async () => (await $('[aria-label="Show"]').$("button*=All").getAttribute("data-state")) === "on",
    );
    await browser.waitUntil(async () => (await $$("tr[data-row-id]").length) === 7, {
      timeout: 20_000,
      timeoutMsg: "the table never showed the 7 imported rows",
    });
    const names = await browser.execute(() =>
      // The visible company name; the button's text also holds the monogram and an sr-only role.
      [...document.querySelectorAll("tr[data-row-id] [data-open-id] span[title]")].map(
        (cell) => cell.getAttribute("title") ?? "",
      ),
    );
    expect([...names].sort()).toEqual(COMPANIES);
    await capture("table");
  });

  it("moves every row to Screening in one bulk change", async () => {
    await $('input[aria-label^="Select all"]').click();
    await $('[role="toolbar"]*=7 selected').waitForDisplayed();
    await capture("table-bulk");
    await openMenu($("button*=Set status"));
    await $('[role="menuitem"]*=Screening').click();
    await browser.waitUntil(
      async () => (await importedApplications()).every((doc) => text(doc.fields["status"]) === "screening"),
      { timeout: 20_000, timeoutMsg: "the bulk move never reached Firestore" },
    );
    const applications = await importedApplications();
    const moves = await queryGroup(
      "applicationEvents",
      "applicationId",
      applications.map((doc) => doc.name.slice(doc.name.lastIndexOf("/") + 1)),
    );
    expect(moves.filter((event) => text(event.fields["type"]) === "status_changed")).toHaveLength(7);
    await browser.keys(Key.Escape);
  });

  it("exports the view as a CSV that reads back to the same rows", async function () {
    this.timeout(120_000);
    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    mkdirSync(dir, { recursive: true });
    const exported = () =>
      readdirSync(dir).filter(
        (name) => name.startsWith("BruteForceHR applications") && name.endsWith(".csv"),
      );
    for (const name of exported()) rmSync(path.join(dir, name));

    await browser.keys([isMac ? Key.Command : Key.Ctrl, "e"]);
    await $('[role="menuitem"]*=CSV').click();
    await browser.waitUntil(() => exported().length === 1, {
      timeout: 60_000,
      timeoutMsg: "no CSV export landed",
    });
    const [file] = exported();
    const table = readSpreadsheet(
      new Uint8Array(readFileSync(path.join(dir, file as string))),
      file as string,
    );
    expect(table.encoding).toBe("utf-8");
    expect(table.rows).toHaveLength(7);

    const mapping = guessColumnMapping(table);
    const plan = planImport(table, {
      mapping,
      statusMap: guessedStatusMap(statusValues(table, mapping)),
      defaultStatus: "applied",
      dateOrder: "dmy",
      keepUnmappedInNotes: false,
      now: new Date(),
      existing: [],
    });
    expect(plan.blocked).toBe(0);
    expect(plan.rows.map((row) => row.draft?.company).sort()).toEqual(COMPANIES);
    expect(plan.rows.every((row) => row.draft?.status === "screening")).toBe(true);
    const kervan = plan.rows.find((row) => row.draft?.company === "Kervan Teknoloji");
    expect(kervan?.draft?.appliedAt?.toISOString()).toBe("2026-09-12T12:00:00.000Z");
    expect(existsSync(path.join(dir, file as string))).toBe(true);
  });
});
