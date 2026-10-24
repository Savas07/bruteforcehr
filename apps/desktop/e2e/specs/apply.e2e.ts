/**
 * Apply on real data (BRIEF §4.4): the built app against the Auth, Firestore and Storage emulators,
 * with the Apply AI callables answered from recorded responses (e2e/support/recorded.ts).
 *
 * 1. Tailor for this job: Accept two of the three suggested edits, keep one, save → a revision
 *    with `source: ai_tailor`, the job and the base version, pinned on the job's application.
 * 2. Cover letter: draft it with AI, fill the unresolved `{hiring_manager}`, Review, "I sent it"
 *    (no sending account: the mail-app path) → Applied with the tailored CV version and the AI
 *    letter pinned.
 * 3. External kit: copy an answer row and copy the CV's path (the PDF lands in the kit folder).
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { ensureSignedIn, testEmail } from "../support/auth";
import { docId, findDocs, type FirestoreDoc, getDoc, listRevisions, plain } from "../support/firestore";
import { seedAnswer, seedCv, seedJob, seedMatch, seedRevision } from "../support/applySeed";
import { useRecordedCallables } from "../support/recorded";
import { deleteDoc, signedInUid, writeDoc } from "../support/seed";

const RUN = process.pid;
const CV_ID = `e2e-apply-cv-${RUN}`;
const REV_ID = `e2e-apply-rev-${RUN}`;
const EMAIL_JOB = { id: `e2e-apply-mail-${RUN}`, company: `E2E Fernweh ${RUN}` };
const SITE_JOB = { id: `e2e-apply-site-${RUN}`, company: `E2E Northstar ${RUN}` };
const ANSWER_ID = `e2e-apply-answer-${RUN}`;

let uid = "";

const goTo = (hash: string) =>
  browser.execute((value) => {
    location.hash = value;
  }, hash);

/**
 * Clicks the visible, enabled button whose accessible name (aria-label, else its text) starts with
 * `label`. Each attempt finds it in one in-page query and tags that node, then WebDriver clicks
 * exactly it; a node replaced in between (a re-render) fails only that attempt. Scanning every
 * button with WebDriver calls instead (three round trips each) failed whenever any button in the
 * window was re-rendered during the scan: the element went stale and every poll threw.
 */
async function clickButton(label: string, timeout = 30_000): Promise<void> {
  await browser
    .waitUntil(
      async () => {
        const tag = await browser.execute((wanted: string) => {
          for (const node of document.querySelectorAll<HTMLButtonElement>(
            "main button, [role=dialog] button",
          )) {
            const name = (node.getAttribute("aria-label") ?? node.innerText).trim();
            if (!name.startsWith(wanted) || node.getAttribute("aria-disabled") === "true") continue;
            if (node.getClientRects().length === 0) continue;
            const id = `pick-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            node.setAttribute("data-e2e-pick", id);
            return id;
          }
          return null;
        }, label);
        if (tag === null) return false;
        try {
          await $(`[data-e2e-pick="${tag}"]`).click();
          return true;
        } catch {
          // Replaced before the click landed: find it again.
          return false;
        }
      },
      { timeout, timeoutMsg: `no enabled "${label}" button` },
    )
    .catch(async (error: unknown) => {
      // Say why: the panel's one-line blocker (or PDF status) and the buttons it shows.
      const status = await browser.execute(() =>
        [...document.querySelectorAll("main [role=status], main [role=alert], main footer")]
          .map((node) => node.textContent)
          .join(" | "),
      );
      throw new Error(`${String(error)} — panel says: ${status}`);
    });
}

/** Counts buttons removed from the DOM per accessible name (CI evidence for re-render churn). */
async function watchRemovedButtons(): Promise<void> {
  await browser.execute(() => {
    const removed = new Map<string, number>();
    const name = (node: Element) =>
      (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().slice(0, 50);
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes) {
          if (!(node instanceof Element)) continue;
          for (const removedButton of [
            ...(node.matches("button") ? [node] : []),
            ...node.querySelectorAll("button"),
          ])
            removed.set(name(removedButton), (removed.get(name(removedButton)) ?? 0) + 1);
        }
    }).observe(document.body, { subtree: true, childList: true });
    Object.assign(window, { __bfhrRemovedButtons: removed });
  });
}

async function reportRemovedButtons(test: string): Promise<void> {
  const removed = await browser.execute(() => {
    const counts = Reflect.get(window, "__bfhrRemovedButtons") as Map<string, number> | undefined;
    const top = [...(counts ?? [])].toSorted((a, b) => b[1] - a[1]).slice(0, 8);
    counts?.clear();
    return top;
  });
  console.log(`apply.e2e removed buttons during "${test}": ${JSON.stringify(removed)}`);
}

async function field(label: string) {
  const element = $(`label*=${label}`);
  await element.waitForDisplayed({ timeout: 15_000 });
  return $(`[id="${await element.getAttribute("for")}"]`);
}

const application = async (company: string) => (await findDocs("applications", "company", company))[0];
/** The seeded CV's revisions (`listRevisions` takes a REST document name). */
const revisions = () => listRevisions(`/documents/users/${uid}/cvs/${CV_ID}`);

/**
 * Selects the job's row (on narrow windows that also opens the detail) and presses A, as a user
 * would: the email composer, or the kit beside the posting's site (E2E builds record the URL).
 */
async function openApply(jobId: string): Promise<void> {
  await goTo("#/jobs");
  await $(`[data-nav-id="${jobId}"]`).click();
  await $(`[id="job-title-${jobId}"]`).waitForDisplayed({ timeout: 15_000 });
  await browser.keys("a");
}

describe("Apply", function () {
  // Printing the CV and letter PDFs in the webview takes up to a few minutes on hosted macOS runners.
  this.timeout(600_000);
  before(async () => {
    await ensureSignedIn(testEmail("apply"));
    uid = await signedInUid();
    const now = new Date();
    await writeDoc(`users/${uid}/cvs/${CV_ID}/revisions/${REV_ID}`, seedRevision(now));
    await writeDoc(`users/${uid}/cvs/${CV_ID}`, seedCv(`E2E Apply CV ${RUN}`, REV_ID, now));
    await writeDoc(
      `users/${uid}/jobs/${EMAIL_JOB.id}`,
      seedJob(EMAIL_JOB, { url: null, email: `jobs-${RUN}@example.com` }, now),
    );
    await writeDoc(
      `users/${uid}/jobs/${SITE_JOB.id}`,
      seedJob(SITE_JOB, { url: `https://boards.greenhouse.io/e2e/jobs/${RUN}`, email: null }, now),
    );
    // The feed lists jobs through their matches ("the server scored them").
    for (const entry of [EMAIL_JOB, SITE_JOB])
      await writeDoc(`users/${uid}/jobMatches/${entry.id}`, seedMatch(now));
    await writeDoc(`users/${uid}/answers/${ANSWER_ID}`, seedAnswer(`Three months (${RUN})`, now));
    await goTo("#/jobs");
    // The feed has the seeded jobs before the spec opens their Apply panels.
    await $(`[data-nav-id="${EMAIL_JOB.id}"]`).waitForDisplayed({ timeout: 30_000 });
    await goTo("#/jobs");
    await useRecordedCallables();
    await watchRemovedButtons();
  });

  afterEach(async function () {
    await reportRemovedButtons(this.currentTest?.title ?? "");
  });

  after(async () => {
    if (uid === "") return;
    for (const company of [EMAIL_JOB.company, SITE_JOB.company]) {
      for (const found of await findDocs("applications", "company", company)) {
        for (const event of await findDocs("applicationEvents", "applicationId", docId(found)))
          await deleteDoc(event.name);
        await deleteDoc(found.name);
      }
    }
    for (const letter of await findDocs("coverLetters", "jobId", EMAIL_JOB.id)) await deleteDoc(letter.name);
    for (const revision of await revisions()) await deleteDoc(revision.name);
    await deleteDoc(`users/${uid}/cvs/${CV_ID}`);
    await deleteDoc(`users/${uid}/jobs/${EMAIL_JOB.id}`);
    await deleteDoc(`users/${uid}/jobs/${SITE_JOB.id}`);
    await deleteDoc(`users/${uid}/jobMatches/${EMAIL_JOB.id}`);
    await deleteDoc(`users/${uid}/jobMatches/${SITE_JOB.id}`);
    await deleteDoc(`users/${uid}/answers/${ANSWER_ID}`);
  });

  it("tailors: accepting 2 of 3 edits saves an ai_tailor revision pinned on the application", async () => {
    await openApply(EMAIL_JOB.id);
    const cv = await field("CV");
    await cv.selectByAttribute("value", CV_ID);
    await clickButton("Tailor for this job");
    await clickButton("Suggest edits");
    await $("h3=3 suggested edits").waitForDisplayed({ timeout: 20_000 });
    // One decision per card (the rail's "Accept all" would match "Accept" too).
    await $('article[data-card-id="e1"]').$("button*=Accept").click();
    await $('article[data-card-id="e2"]').$("button*=Keep original").click();
    await $('article[data-card-id="e3"]').$("button*=Accept").click();
    await $("p*=2 accepted · 1 kept as it was").waitForDisplayed({ timeout: 10_000 });
    await clickButton("Save as new version");

    let tailored: FirestoreDoc | undefined;
    await browser.waitUntil(
      async () => {
        tailored = (await revisions()).find((revision) => plain(revision.fields["source"]) === "ai_tailor");
        return tailored !== undefined;
      },
      { timeout: 20_000, timeoutMsg: "the tailored revision didn't reach the emulator" },
    );
    expect(plain(tailored?.fields["jobId"])).toBe(EMAIL_JOB.id);
    expect(plain(tailored?.fields["basedOnRevisionId"])).toBe(REV_ID);
    await browser.waitUntil(
      async () =>
        plain((await application(EMAIL_JOB.company))?.fields["cvRevisionId"]) ===
        docId(tailored as FirestoreDoc),
      {
        timeout: 20_000,
        timeoutMsg: "the tailored version isn't pinned on the application",
      },
    );
    // The CV itself still points at its own version.
    expect(plain((await getDoc(`users/${uid}/cvs/${CV_ID}`)).fields["currentRevisionId"])).toBe(REV_ID);
  });

  it("drafts the cover letter with AI, fills the field and records the application with it pinned", async () => {
    await $("h2*=Apply to").waitForDisplayed({ timeout: 15_000 });
    await (await $("label*=Attach a cover letter")).click();
    await clickButton("Draft with AI");
    await $("p*=Drafted from your CV and this job").waitForDisplayed({ timeout: 15_000 });
    const manager = await field("Hiring manager");
    await manager.setValue("Ms Weber");
    await clickButton("Review email");
    // Enabled once the CV and letter PDFs are printed (slow on the hosted macOS runners).
    await clickButton("I sent it", 240_000);

    await browser.waitUntil(
      async () => plain((await application(EMAIL_JOB.company))?.fields["status"]) === "applied",
      {
        timeout: 30_000,
        timeoutMsg: "I sent it didn't reach the emulator",
      },
    );
    const applied = await application(EMAIL_JOB.company);
    const tailored = (await revisions()).find((revision) => plain(revision.fields["source"]) === "ai_tailor");
    expect(plain(applied?.fields["cvRevisionId"])).toBe(docId(tailored as FirestoreDoc));
    const letterId = plain(applied?.fields["coverLetterId"]);
    expect(letterId).toEqual(expect.any(String));
    const letter = await getDoc(`users/${uid}/coverLetters/${String(letterId)}`);
    expect(plain(letter.fields["author"])).toBe("ai");
    expect(String(plain(letter.fields["body"]))).toMatch(/^Dear Ms Weber,/u);
  });

  it("copies answers and the CV's path from the application kit", async () => {
    await openApply(SITE_JOB.id);
    await $("h2=Your application kit").waitForDisplayed({ timeout: 15_000 });
    // The webview's clipboard needs a real user gesture on some runners: record what the kit
    // writes instead, so the spec checks the row's text and the toast, not the OS clipboard.
    await browser.execute(() => {
      const copied: string[] = [];
      Object.assign(window, { __bfhrCopied: copied });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (text: string) => Promise.resolve(void copied.push(text)) },
      });
    });
    const copied = () =>
      browser.execute(() => (Reflect.get(window, "__bfhrCopied") as string[] | undefined) ?? []);
    await clickButton("Copy Notice period");
    // The toast's message is a span (`*=` alone matches links only).
    await $("span=Notice period copied").waitForDisplayed({ timeout: 10_000 });
    expect(await copied()).toEqual([`Three months (${RUN})`]);
    const cv = await field("CV");
    await cv.selectByAttribute("value", CV_ID);
    // Enabled once the CV's PDF is printed.
    await clickButton("Copy path", 240_000);
    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    const kit = path.join(dir, "kit");
    await browser.waitUntil(() => existsSync(kit) && readdirSync(kit).some((name) => name.endsWith(".pdf")), {
      timeout: 30_000,
      timeoutMsg: "the CV PDF wasn't saved to the kit folder",
    });
    // The copied path is the saved PDF's.
    // The app's path and Node's may spell the temp folder differently (8.3 names, symlinks).
    await browser.waitUntil(
      async () => (await copied()).some((text) => /[\\/]kit[\\/][^\\/]+\.pdf$/u.test(text)),
      {
        timeout: 10_000,
        timeoutMsg: "Copy path didn't copy the kit file's path",
      },
    );
  });
});
