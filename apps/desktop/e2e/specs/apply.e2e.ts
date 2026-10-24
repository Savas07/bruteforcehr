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

/** A visible, enabled button whose text (or accessible name) starts with `label`. */
async function button(label: string) {
  let found: WebdriverIO.Element | undefined;
  await browser.waitUntil(
    async () => {
      for (const candidate of await $("main").$$("button")) {
        const name = (await candidate.getAttribute("aria-label")) ?? (await candidate.getText()).trim();
        if (name.startsWith(label) && (await candidate.isDisplayed()) && (await candidate.getAttribute("aria-disabled")) !== "true") {
          found = candidate;
          return true;
        }
      }
      return false;
    },
    { timeout: 30_000, timeoutMsg: `no enabled "${label}" button` },
  );
  if (!found) throw new Error(`no "${label}" button`);
  return found;
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

describe("Apply", () => {
  before(async () => {
    await ensureSignedIn(testEmail("apply"));
    uid = await signedInUid();
    const now = new Date();
    await writeDoc(`users/${uid}/cvs/${CV_ID}/revisions/${REV_ID}`, seedRevision(now));
    await writeDoc(`users/${uid}/cvs/${CV_ID}`, seedCv(`E2E Apply CV ${RUN}`, REV_ID, now));
    await writeDoc(`users/${uid}/jobs/${EMAIL_JOB.id}`, seedJob(EMAIL_JOB, { url: null, email: `jobs-${RUN}@example.com` }, now));
    await writeDoc(`users/${uid}/jobs/${SITE_JOB.id}`, seedJob(SITE_JOB, { url: `https://boards.greenhouse.io/e2e/jobs/${RUN}`, email: null }, now));
    // The feed lists jobs through their matches ("the server scored them").
    for (const entry of [EMAIL_JOB, SITE_JOB]) await writeDoc(`users/${uid}/jobMatches/${entry.id}`, seedMatch(now));
    await writeDoc(`users/${uid}/answers/${ANSWER_ID}`, seedAnswer(`Three months (${RUN})`, now));
    await goTo("#/jobs");
    // The feed has the seeded jobs before the spec opens their Apply panels.
    await $(`[data-nav-id="${EMAIL_JOB.id}"]`).waitForDisplayed({ timeout: 30_000 });
    await goTo("#/jobs");
    await useRecordedCallables();
  });

  after(async () => {
    if (uid === "") return;
    for (const company of [EMAIL_JOB.company, SITE_JOB.company]) {
      for (const found of await findDocs("applications", "company", company)) {
        for (const event of await findDocs("applicationEvents", "applicationId", docId(found))) await deleteDoc(event.name);
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
    await (await button("Tailor for this job")).click();
    await (await button("Suggest edits")).click();
    await $("h3=3 suggested edits").waitForDisplayed({ timeout: 20_000 });
    // One decision per card (the rail's "Accept all" would match "Accept" too).
    await $('article[data-card-id="e1"]').$("button*=Accept").click();
    await $('article[data-card-id="e2"]').$("button*=Keep original").click();
    await $('article[data-card-id="e3"]').$("button*=Accept").click();
    await $("p*=2 accepted · 1 kept as it was").waitForDisplayed({ timeout: 10_000 });
    await (await button("Save as new version")).click();

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
    await browser.waitUntil(async () => plain((await application(EMAIL_JOB.company))?.fields["cvRevisionId"]) === docId(tailored as FirestoreDoc), {
      timeout: 20_000,
      timeoutMsg: "the tailored version isn't pinned on the application",
    });
    // The CV itself still points at its own version.
    expect(plain((await getDoc(`users/${uid}/cvs/${CV_ID}`)).fields["currentRevisionId"])).toBe(REV_ID);
  });

  it("drafts the cover letter with AI, fills the field and records the application with it pinned", async () => {
    await $("h2*=Apply to").waitForDisplayed({ timeout: 15_000 });
    await (await $("label*=Attach a cover letter")).click();
    await (await button("Draft with AI")).click();
    await $("p*=Drafted from your CV and this job").waitForDisplayed({ timeout: 15_000 });
    const manager = await field("Hiring manager");
    await manager.setValue("Ms Weber");
    await (await button("Review email")).click();
    await (await button("I sent it")).click();

    await browser.waitUntil(async () => plain((await application(EMAIL_JOB.company))?.fields["status"]) === "applied", {
      timeout: 30_000,
      timeoutMsg: "I sent it didn't reach the emulator",
    });
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
    const copied = () => browser.execute(() => (Reflect.get(window, "__bfhrCopied") as string[] | undefined) ?? []);
    await (await button("Copy Notice period")).click();
    // The toast's message is a span (`*=` alone matches links only).
    await $("span=Notice period copied").waitForDisplayed({ timeout: 10_000 });
    expect(await copied()).toEqual([`Three months (${RUN})`]);
    const cv = await field("CV");
    await cv.selectByAttribute("value", CV_ID);
    await (await button("Copy path")).click();
    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    const kit = path.join(dir, "kit");
    await browser.waitUntil(() => existsSync(kit) && readdirSync(kit).some((name) => name.endsWith(".pdf")), {
      timeout: 30_000,
      timeoutMsg: "the CV PDF wasn't saved to the kit folder",
    });
    // The copied path is the saved PDF's.
    await browser.waitUntil(async () => (await copied()).some((text) => text.startsWith(kit) && text.endsWith(".pdf")), {
      timeout: 10_000,
      timeoutMsg: "Copy path didn't copy the kit file's path",
    });
  });
});
