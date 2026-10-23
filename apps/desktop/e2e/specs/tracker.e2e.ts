/**
 * Tracker on real data: the built app against the Auth + Firestore emulators
 * (scripts/with-emulators.sh). Log an application → move it on the board → Undo (a reverting
 * event, the original stays) → the application's page → add an interview round → export it as
 * .ics and check the file (RFC 5545: CRLF, VEVENT with the organiser's zone and a VTIMEZONE).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import { osName, repoRoot, saveScreenshot, setTheme } from "../capture/helpers";
import { ensureSignedIn, testEmail } from "../support/auth";
import { docId, findDocs, plain, type FirestoreDoc } from "../support/firestore";

const COMPANY = `E2E Robotics ${process.pid}`;
const ROLE = "Frontend Engineer";
const SHOTS = path.join(repoRoot, "artifacts/screens/desktop", osName, "tracker");
const isMac = process.platform === "darwin";

async function capture(name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(theme);
    await saveScreenshot(path.join(SHOTS, `${name}-${theme}.png`));
  }
}

const goTo = (hash: string) =>
  browser.execute((value) => {
    location.hash = value;
  }, hash);

async function application(): Promise<FirestoreDoc> {
  let found: FirestoreDoc | undefined;
  await browser.waitUntil(
    async () => {
      found = (await findDocs("applications", "company", COMPANY))[0];
      return found !== undefined;
    },
    { timeout: 20_000, timeoutMsg: `no application for ${COMPANY} reached the emulator` },
  );
  return found as FirestoreDoc;
}

async function events(applicationId: string): Promise<FirestoreDoc[]> {
  return findDocs("applicationEvents", "applicationId", applicationId);
}

async function waitForStatus(status: string, message: string): Promise<void> {
  await browser.waitUntil(async () => plain((await application()).fields["status"]) === status, {
    timeout: 20_000,
    timeoutMsg: message,
  });
}

/**
 * The field labelled `label` inside the open dialog, once it is there (the dialog shows a skeleton
 * until the tracker data has loaded).
 */
async function field(label: string) {
  let id: string | null = null;
  await browser.waitUntil(
    async () => {
      id = await browser.execute((text) => {
        const dialog = document.querySelector('[role="dialog"]');
        const match = [...(dialog?.querySelectorAll("label") ?? [])].find((node) =>
          (node.textContent ?? "").trim().startsWith(text),
        );
        return match?.htmlFor || null;
      }, label);
      return id !== null;
    },
    { timeout: 20_000, timeoutMsg: `no field labelled "${label}" in the dialog` },
  );
  return $(`[id="${id ?? ""}"]`);
}

let applicationId = "";

describe("Tracker", () => {
  before(async () => {
    await ensureSignedIn(testEmail("tracker"));
    await goTo("#/tracker");
    await $("h1=Tracker").waitForDisplayed({ timeout: 20_000 });
  });

  it("logs an application with Mod+N", async () => {
    await browser.keys([isMac ? Key.Command : Key.Ctrl, "n"]);
    await $('[role="dialog"]').waitForDisplayed();
    await (await field("Company")).setValue(COMPANY);
    await (await field("Role")).setValue(ROLE);
    await (await field("Link to the posting")).setValue("https://jobs.example.com/e2e-robotics/frontend");
    await capture("add-dialog");
    await $('[role="dialog"]').$("button=Add application").click();
    await $('[role="dialog"]').waitForDisplayed({ reverse: true });

    const doc = await application();
    applicationId = docId(doc);
    expect(plain(doc.fields["status"])).toBe("applied");
    expect(plain(doc.fields["role"])).toBe(ROLE);
    expect(plain(doc.fields["jobId"])).toEqual(expect.any(String));
    const created = await events(applicationId);
    expect(created.map((event) => [plain(event.fields["type"]), plain(event.fields["toStatus"])])).toEqual([
      ["created", "applied"],
    ]);
    const jobs = await findDocs("jobs", "company", COMPANY);
    expect(plain(jobs[0]?.fields["applyUrl"])).toBe("https://jobs.example.com/e2e-robotics/frontend");
  });

  it("moves it on the board and undoes the move with a reverting event", async () => {
    const card = $(`[data-card-id="${applicationId}"]`);
    await card.waitForDisplayed({ timeout: 20_000 });
    // The corner "Move to…" button shows on hover and focus.
    await card.moveTo();
    await card.$('button[aria-label="Move to…"]').click();
    await $('[role="menuitemradio"]').waitForDisplayed();
    const picked = await browser.execute(() => {
      const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
        (node) => (node.textContent ?? "").trim() === "Screening",
      );
      item?.click();
      return item !== undefined;
    });
    if (!picked) throw new Error("no Screening item in Move to…");
    await waitForStatus("screening", "the move to Screening never reached the emulator");
    await capture("board-moved");

    // The toast's Undo (Mod+Z does the same).
    await browser.keys([isMac ? Key.Command : Key.Ctrl, "z"]);
    await waitForStatus("applied", "Undo didn't move the application back to Applied");
    const history = await events(applicationId);
    const move = history.find((event) => plain(event.fields["toStatus"]) === "screening");
    const undo = history.find((event) => typeof plain(event.fields["revertsEventId"]) === "string");
    expect(move).toBeDefined();
    expect(plain(undo?.fields["revertsEventId"])).toBe(move ? docId(move) : "");
    expect(plain(undo?.fields["actor"])).toBe("user");
    expect(history).toHaveLength(3);
  });

  it("opens the application's page with its timeline", async () => {
    await goTo(`#/tracker/applications/${applicationId}`);
    await $(`h1*=${ROLE}`).waitForDisplayed({ timeout: 20_000 });
    await $("h2=Interview rounds").waitForDisplayed();
    await capture("detail");
  });

  it("adds an interview round and exports it as .ics", async function () {
    this.timeout(180_000);
    await $("button=Add round").click();
    await $('[role="dialog"]').waitForDisplayed();
    await (await field("Title")).setValue("Technical interview");
    await $('[role="dialog"]').$("button=Save round").click();
    await $('[role="dialog"]').waitForDisplayed({ reverse: true });

    let interview: FirestoreDoc | undefined;
    await browser.waitUntil(
      async () => {
        interview = (await findDocs("interviews", "applicationId", applicationId))[0];
        return interview !== undefined;
      },
      { timeout: 20_000, timeoutMsg: "the interview never reached the emulator" },
    );
    const timeZone = String(plain(interview?.fields["timezone"]));
    expect(plain(interview?.fields["title"])).toBe("Technical interview");
    expect(
      (await events(applicationId)).some((event) => plain(event.fields["type"]) === "interview_scheduled"),
    ).toBe(true);

    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    const before = new Set(existsSync(dir) ? readdirSync(dir) : []);
    for (const name of before) if (name.endsWith(".ics")) rmSync(path.join(dir, name), { force: true });
    await $('button[aria-label="Add to calendar (.ics)"]').click();
    let file = "";
    await browser.waitUntil(
      () => {
        file = readdirSync(dir).find((name) => name.endsWith(".ics")) ?? "";
        return file !== "";
      },
      { timeout: 60_000, timeoutMsg: `no .ics file in ${dir}` },
    );
    const ics = readFileSync(path.join(dir, file), "utf8");
    expect(file).toContain("Technical interview");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const lines = ics.replace(/\r\n /g, "").split("\r\n");
    expect(lines).toContain(`UID:${docId(interview as FirestoreDoc)}@bruteforcehr.web.app`);
    expect(lines).toContain(`SUMMARY:Technical interview · ${COMPANY}`);
    if (timeZone === "UTC") {
      expect(lines.some((line) => /^DTSTART:\d{8}T100000Z$/.test(line))).toBe(true);
    } else {
      expect(lines).toContain(`TZID:${timeZone}`);
      expect(
        lines.some((line) => line.startsWith(`DTSTART;TZID=${timeZone}:`) && line.endsWith("T100000")),
      ).toBe(true);
    }
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    await capture("detail-interview");
  });
});
