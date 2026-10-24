/**
 * Jobs on real data: the built app against the Auth + Firestore emulators (scripts/with-emulators.sh).
 * Seeds two jobs with matches for the signed-in user ("the server wrote them"), then triages with
 * the keyboard (J moves, D hides one: the match is dismissed), saves with S (D02: a Saved
 * application + its event + the match saved), opens the detail, applies on the company site and
 * answers "Yes, I applied": the application is Applied with the CV-less external route recorded,
 * and it shows on the Tracker board.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { $, browser, expect } from "@wdio/globals";
import { firebaseConfig } from "../../src/lib/firebase.ts";
import { ensureSignedIn, testEmail } from "../support/auth";
import { docId, findDocs, type FirestoreDoc, getDoc, plain } from "../support/firestore";

const RUN = process.pid;
const EMAIL = testEmail("jobs");
const BASE = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Firestore REST value of a plain JS value (strings that look like ISO dates stay strings). */
function value(input: unknown): unknown {
  if (input === null) return { nullValue: null };
  if (input instanceof Date) return { timestampValue: input.toISOString() };
  if (typeof input === "string") return { stringValue: input };
  if (typeof input === "boolean") return { booleanValue: input };
  if (typeof input === "number")
    return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  return { mapValue: { fields: fields(input as Record<string, unknown>) } };
}
const fields = (input: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(input).map(([key, inner]) => [key, value(inner)]));

async function write(path: string, data: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${BASE}/${path}`, {
    method: "PATCH",
    headers: OWNER,
    body: JSON.stringify({ fields: fields({ ...data, schemaVersion: 1 }) }),
  });
  if (!response.ok) throw new Error(`PATCH ${path}: ${response.status} ${await response.text()}`);
}

/** Deletes a document as the emulator's owner (missing documents are fine). */
async function remove(name: string): Promise<void> {
  const path = name.includes("/documents/")
    ? name.slice(name.indexOf("/documents/") + "/documents/".length)
    : name;
  const response = await fetch(`${BASE}/${path}`, { method: "DELETE", headers: OWNER });
  if (!response.ok && response.status !== 404) throw new Error(`DELETE ${path}: ${response.status}`);
}

/**
 * The uid of whoever is signed in (a restored session may belong to another spec's account):
 * Firebase Auth persists the user in the webview's IndexedDB (`firebaseLocalStorageDb`).
 */
async function signedInUid(): Promise<string> {
  const uid = await browser.executeAsync((done: (uid: string | null) => void) => {
    const open = indexedDB.open("firebaseLocalStorageDb");
    open.onerror = () => done(null);
    open.onsuccess = () => {
      const request = open.result
        .transaction("firebaseLocalStorage", "readonly")
        .objectStore("firebaseLocalStorage")
        .getAll();
      request.onerror = () => done(null);
      request.onsuccess = () => {
        const entries = request.result as { fbase_key?: string; value?: { uid?: string } }[];
        const user = entries.find((entry) => entry.fbase_key?.startsWith("firebase:authUser:"));
        done(user?.value?.uid ?? null);
      };
    };
  });
  if (!uid) throw new Error("no signed-in user in the app");
  return uid;
}

function job(id: string, company: string, title: string, score: number) {
  const now = new Date();
  const url = `https://boards.greenhouse.io/${id}/jobs/${RUN}`;
  const source = {
    source: "greenhouse",
    sourceId: `${id}-${RUN}`,
    url,
    applyUrl: url,
    applyEmail: null,
    isDirectFromEmployer: true,
    title,
    locationText: "Berlin, hybrid",
    salary: null,
    postedAt: now,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  return {
    job: {
      sources: [source],
      sourceKeys: [`greenhouse:${id}-${RUN}`],
      applyUrl: url,
      applyEmail: null,
      company,
      companyDomain: null,
      title,
      locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE" }],
      remoteType: "hybrid",
      remoteEligibility: null,
      employmentType: "full_time",
      seniority: "mid",
      salary: null,
      visaSponsorship: null,
      relocationSupport: null,
      language: "en",
      description: `${company} builds things.\n\nYou'll build them with React and TypeScript.`,
      skills: ["react", "typescript"],
      postedAt: now,
      expiresAt: null,
      fingerprint: `${company}|${title}`.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    },
    match: {
      score,
      basedOnCvId: null,
      basedOnCvRevisionId: null,
      reasons: [],
      gaps: [],
      skills: { matched: ["react"], unmatched: [] },
      rationale: null,
      state: "new",
      dismissReasons: [],
      stateChangedAt: null,
      computedAt: now,
    },
  };
}

const KEEP = { id: `e2e-keep-${RUN}`, company: `E2E Lindenhof ${RUN}`, title: "Frontend Engineer" };
const SKIP = { id: `e2e-skip-${RUN}`, company: `E2E Skipco ${RUN}`, title: "Backend Engineer" };

let uid = "";

async function match(jobId: string) {
  return getDoc(`users/${uid}/jobMatches/${jobId}`);
}

describe("Jobs", () => {
  before(async () => {
    await ensureSignedIn(EMAIL);
    uid = await signedInUid();
    for (const [entry, score] of [
      [KEEP, 88],
      [SKIP, 70],
    ] as const) {
      const seeded = job(entry.id, entry.company, entry.title, score);
      await write(`users/${uid}/jobs/${entry.id}`, seeded.job);
      await write(`users/${uid}/jobMatches/${entry.id}`, seeded.match);
    }
    await browser.execute(() => {
      location.hash = "#/jobs";
    });
    await $(`[data-nav-id="${KEEP.id}"]`).waitForDisplayed({ timeout: 30_000 });
  });

  // The account is shared with the tracker specs (a restored session): leave its data as it was,
  // or their row counts include these jobs' applications.
  after(async () => {
    if (uid === "") return;
    for (const entry of [KEEP, SKIP]) {
      for (const application of await findDocs("applications", "company", entry.company)) {
        for (const event of await findDocs("applicationEvents", "applicationId", docId(application)))
          await remove(event.name);
        await remove(application.name);
      }
      await remove(`users/${uid}/jobMatches/${entry.id}`);
      await remove(`users/${uid}/jobs/${entry.id}`);
    }
  });

  it("triages with the keyboard: D hides the second job (the match is dismissed)", async () => {
    // Strong band first: Lindenhof, then Skipco.
    await $(`[data-nav-id="${KEEP.id}"]`).click();
    await browser.keys("j");
    await browser.waitUntil(async () => (await browser.getUrl()).includes(SKIP.id), { timeout: 10_000 });
    await browser.keys("d");
    await browser.waitUntil(async () => plain((await match(SKIP.id)).fields["state"]) === "dismissed", {
      timeout: 20_000,
      timeoutMsg: "Not for me didn't reach the emulator",
    });
    await $(`[data-nav-id="${SKIP.id}"]`).waitForDisplayed({ reverse: true, timeout: 10_000 });
  });

  it("saves with S: a Saved application, its event and the saved match (D02)", async () => {
    await $(`[data-nav-id="${KEEP.id}"]`).click();
    await browser.keys("s");
    await browser.waitUntil(async () => plain((await match(KEEP.id)).fields["state"]) === "saved", {
      timeout: 20_000,
      timeoutMsg: "Save didn't reach the emulator",
    });
    const [application] = await findDocs("applications", "company", KEEP.company);
    expect(plain(application?.fields["status"])).toBe("saved");
    expect(plain(application?.fields["jobId"])).toBe(KEEP.id);
    const events = await findDocs("applicationEvents", "applicationId", docId(application as FirestoreDoc));
    expect(events.map((event) => plain(event.fields["type"]))).toEqual(["created"]);
  });

  it("applies on the company site and records the answer to “Did you apply?”", async () => {
    await $(`[id="job-title-${KEEP.id}"]`).waitForDisplayed({ timeout: 10_000 });
    await browser.keys("a");
    // E2E builds record the URL instead of launching the browser (src-tauri `open`), so the app
    // keeps the focus the following specs type into.
    const dir = process.env["BFHR_E2E_EXPORT_DIR"];
    if (!dir) throw new Error("BFHR_E2E_EXPORT_DIR is not set (desktop.yml sets it)");
    const opened = path.join(dir, "opened-urls.txt");
    await browser.waitUntil(
      () =>
        existsSync(opened) &&
        readFileSync(opened, "utf8").includes(`https://boards.greenhouse.io/${KEEP.id}/jobs/${RUN}`),
      { timeout: 10_000, timeoutMsg: "Apply didn't open the posting's apply link" },
    );
    // Evidence for the focus problem this avoids (CI log); not asserted, runners differ on focus.
    console.log(
      `jobs.e2e: app window focused after Apply: ${String(await browser.execute(() => document.hasFocus()))}`,
    );
    // Partial text: the button also shows its keycap.
    const yes = $("button*=Yes, I applied");
    await yes.waitForDisplayed({ timeout: 10_000 });
    await yes.click();
    await browser.waitUntil(
      async () =>
        plain((await findDocs("applications", "company", KEEP.company))[0]?.fields["status"]) === "applied",
      { timeout: 20_000, timeoutMsg: "Yes, I applied didn't reach the emulator" },
    );
    const [application] = await findDocs("applications", "company", KEEP.company);
    expect(plain(application?.fields["channel"])).toBe("external_link");
    expect(plain(application?.fields["appliedAt"])).toEqual(expect.any(String));
    const events = await findDocs("applicationEvents", "applicationId", docId(application as FirestoreDoc));
    expect(events.map((event) => [plain(event.fields["type"]), plain(event.fields["toStatus"])])).toEqual(
      expect.arrayContaining([
        ["created", "saved"],
        ["status_changed", "applied"],
      ]),
    );
  });

  it("shows the application on the Tracker board", async () => {
    const [application] = await findDocs("applications", "company", KEEP.company);
    await browser.execute(() => {
      location.hash = "#/tracker";
    });
    await $(`[data-card-id="${docId(application as FirestoreDoc)}"]`).waitForDisplayed({ timeout: 20_000 });
  });
});
