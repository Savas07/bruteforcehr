/**
 * CV Studio on real data: the built app against the Auth + Firestore emulators
 * (scripts/with-emulators.sh). Create → edit (one revision per editing session) → a conflicting
 * save from "another device" → Keep this version → restore from history → export a PDF printed by
 * the OS webview, whose text must read back.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { osName, repoRoot, saveScreenshot, setTheme } from "../capture/helpers";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Key } from "webdriverio";
import { ensureSignedIn, expectHeading, testEmail } from "../support/auth";
import {
  findCv,
  getDoc,
  listRevisions,
  plain,
  remoteEdit,
  summaryOf,
  type FirestoreDoc,
} from "../support/firestore";
const TITLE = `E2E CV ${process.pid}`;
const SHOTS = path.join(repoRoot, "artifacts/screens/desktop", osName, "cv-studio");

/** Real-app capture of the current state in light and dark (critique input). */
async function capture(name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(theme);
    await saveScreenshot(path.join(SHOTS, `${name}-${theme}.png`));
  }
}
const NAME = "Deniz Aksoy";
const isMac = process.platform === "darwin";

async function pressShortcut(...keys: string[]): Promise<void> {
  await browser.keys([isMac ? Key.Command : Key.Ctrl, ...keys]);
}

let cv: FirestoreDoc;
const cvPath = () => cv.name.slice(cv.name.indexOf("/documents/") + "/documents/".length);

async function current(): Promise<{ version: number; revision: FirestoreDoc }> {
  const doc = await getDoc(cvPath());
  const revisionId = String(plain(doc.fields["currentRevisionId"]));
  return {
    version: Number(plain(doc.fields["version"])),
    revision: await getDoc(`${cvPath()}/revisions/${revisionId}`),
  };
}

async function waitForSummary(text: string, timeoutMsg: string): Promise<void> {
  await browser.waitUntil(async () => summaryOf((await current()).revision) === text, {
    timeout: 20_000,
    timeoutMsg,
  });
}

async function openSection(key: string): Promise<void> {
  const field = $(`[data-section-key="${key}"] textarea, [data-section-key="${key}"] input`);
  if (!(await field.isExisting())) await $(`[data-section-key="${key}"] h2 button`).click();
  await field.waitForDisplayed();
}

async function typeSummary(text: string): Promise<void> {
  await openSection("summary");
  const summary = $('[data-section-key="summary"] textarea');
  await summary.click();
  await summary.setValue(text);
}

describe("CV Studio", () => {
  before(async () => {
    await ensureSignedIn(testEmail("cv"));
    await browser.execute(() => {
      location.hash = "#/cvs";
    });
  });

  it("creates a CV", async () => {
    const scratch = $("button*=Start from scratch");
    await browser.waitUntil(
      async () => (await scratch.isExisting()) || (await $('nav[aria-label="Your CVs"]').isExisting()),
    );
    if (await scratch.isExisting()) {
      await scratch.click();
    } else {
      await $('button[aria-label="New CV"]').click();
      await $("[role=menuitem]*=Start a new CV").click();
    }
    const name = $('[role="dialog"] input[maxlength="120"]');
    await name.waitForDisplayed();
    await name.setValue(TITLE);
    await $('[role="dialog"] button[type="submit"]').click();
    await expectHeading(TITLE, 20_000);
    await browser.waitUntil(async () => (await findCv(TITLE)) !== null, {
      timeoutMsg: "the CV never reached Firestore",
    });
    cv = (await findCv(TITLE)) as FirestoreDoc;
    expect((await current()).version).toBe(1);
  });

  it("saves one revision per editing session", async () => {
    await openSection("header");
    const fullName = $("label*=Full name").$("input");
    await fullName.setValue(NAME);
    await typeSummary("Builds reliable desktop apps.");
    // Nothing is written while the session is open…
    expect(await listRevisions(cv.name)).toHaveLength(1);
    // …and one revision when it ends (Mod+S).
    await capture("editor-editing");
    await pressShortcut("s");
    await waitForSummary("Builds reliable desktop apps.", "the session's revision never arrived");
    expect(await listRevisions(cv.name)).toHaveLength(2);
    expect((await current()).version).toBe(2);
  });

  it("resolves a conflict with Keep this version", async () => {
    await typeSummary("Local change.");
    await remoteEdit(cv.name, "Remote change.");
    await $("p*=This CV changed on another device")
      .waitForDisplayed({ timeout: 20_000 })
      .catch(async (error: unknown) => {
        const page = await browser.execute(() => document.querySelector("header")?.textContent ?? "");
        const doc = await getDoc(cvPath());
        throw new Error(
          `no conflict banner (${String(error)}); header: ${page}; cv version ${String(plain(doc.fields["version"]))}, current ${String(plain(doc.fields["currentRevisionId"]))}`,
        );
      });
    await capture("conflict-banner");
    await $("button=Compare").click();
    await $('[role="dialog"]').waitForDisplayed();
    await capture("conflict-compare");
    await expect($('[role="dialog"]*=Remote change.')).toBeDisplayed();
    await browser.keys(Key.Escape);
    await $("button=Keep this version").click();
    await waitForSummary("Local change.", "Keep this version didn't win");
    await expect($("p*=This CV changed on another device")).not.toBeExisting();
  });

  it("restores an older version as a new revision", async () => {
    const before = (await listRevisions(cv.name)).length;
    await pressShortcut("Shift", "h");
    const restore = $("button*=Restore this version");
    await restore.waitForDisplayed();
    await capture("history");
    await restore.click();
    await $('[role="alertdialog"]').$("button=Restore").click();
    await browser.waitUntil(async () => (await listRevisions(cv.name)).length === before + 1, {
      timeout: 20_000,
      timeoutMsg: "restore wrote no revision",
    });
    const { revision } = await current();
    expect(plain(revision.fields["basedOnRevisionId"])).not.toBeNull();
    expect(summaryOf(revision)).not.toBe("Local change.");
  });

  it("exports a PDF whose text reads back", async function () {
    // Printing through the OS webview plus the file write can take a while on CI runners.
    this.timeout(180_000);
    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    const file = path.join(dir, "Deniz-Aksoy-CV-Acme.pdf");
    rmSync(file, { force: true });
    await pressShortcut("e");
    await $('[role="dialog"]').waitForDisplayed();
    await $('[role="dialog"] input:not([type])').setValue("Acme");
    await capture("export-dialog");
    await $('[role="dialog"] button[type="submit"]').click();
    await browser
      .waitUntil(() => existsSync(file), { timeout: 120_000 })
      .catch(async () => {
        const dialog = await browser.execute(
          () => document.querySelector('[role="dialog"]')?.textContent ?? "(no dialog)",
        );
        throw new Error(`no PDF at ${file}; dialog: ${dialog}`);
      });

    const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
    let text = "";
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }
    expect(text).toContain(NAME);
    const { revision } = await current();
    const summary = summaryOf(revision);
    if (summary) expect(text.replace(/\s+/gu, " ")).toContain(summary);
  });

  it("shows the template gallery and reads the PDF back in the ATS check", async () => {
    const inspector = $('aside[aria-label="Inspector"]');
    if (!(await inspector.isExisting())) await pressShortcut("Shift", "d");
    await $('[role="tab"]=Design').click();
    await $("legend=Template").waitForDisplayed();
    await capture("template-gallery");
    await $('[role="tab"]=Check').click();
    // The app's console warnings and errors (worker fallback, failure causes) for the test output.
    await browser.execute(() => {
      const log: string[] = [];
      for (const level of ["warn", "error"] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
          const parts = args.map((arg) =>
            arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg),
          );
          log.push(`${level}: ${parts.join(" ")}`);
          document.documentElement.dataset["e2eConsole"] = log.join("\n");
          original(...args);
        };
      }
    });
    const appConsole = () =>
      browser.execute(() => document.documentElement.dataset["e2eConsole"] ?? "(none)");
    await $("button=Run check").click();
    // The outcome: the readback summary, or one of the panel's failure titles.
    const outcome =
      /read back from the PDF|Couldn't create the PDF|Couldn't read the PDF's text|No text found in the PDF/u;
    const inspectorText = () =>
      browser.execute(
        () => document.querySelector('aside[aria-label="Inspector"]')?.textContent ?? "(no inspector)",
      );
    await browser
      .waitUntil(async () => outcome.test(await inspectorText()), { timeout: 60_000 })
      .catch(async () => {
        throw new Error(
          `the ATS check showed no outcome; inspector: ${await inspectorText()}; console: ${await appConsole()}`,
        );
      });
    const text = await inspectorText();
    console.log(`ATS check console: ${await appConsole()}`);
    if (!/read back from the PDF/u.test(text))
      throw new Error(`the ATS check failed; inspector: ${text}; console: ${await appConsole()}`);
    // This CV has a header and a summary only (created from scratch, nothing else filled in).
    expect(text).toContain("Name and contact details · Read back");
    expect(text).toContain("Summary · Read back");
    await capture("ats-check");
  });
});
