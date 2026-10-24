/**
 * Mail review on real data: the built app against the Auth, Firestore and Functions emulators
 * (scripts/with-emulators.sh with BFHR_EMULATORS including `functions`). The spec plays the mail
 * sync: an inbox, an application in Applied and a pending interview invite linked to it. In the
 * app: Confirm in Mail → after the Undo window the app writes the review fields → the deployed
 * `mailMessageReviewed` trigger (running in the Functions emulator) moves the application to
 * Interviewing → Undo on the application's timeline moves it back with a reverting event.
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { $, browser, expect } from "@wdio/globals";
import { osName, repoRoot, saveScreenshot, setTheme } from "../capture/helpers";
import { ensureSignedIn, testEmail } from "../support/auth";
import { findDocs, getDoc, plain } from "../support/firestore";
import { deleteDoc, signedInUid, writeDoc } from "../support/seed";

const RUN = process.pid;
const COMPANY = `Mailwave ${RUN}`;
const ROLE = "Product Engineer";
const APPLICATION_ID = `e2e-mail-app-${RUN}`;
const ACCOUNT_ID = `e2e-mail-account-${RUN}`;
const MESSAGE_ID = `e2e-mail-message-${RUN}`;
const SHOTS = path.join(repoRoot, "artifacts/screens/desktop", osName, "mail");

const goTo = (hash: string) =>
  browser.execute((value) => {
    location.hash = value;
  }, hash);

async function capture(name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(theme);
    await saveScreenshot(path.join(SHOTS, `${name}-${theme}.png`));
  }
}

/** A visible button inside `scope` whose text starts with `label`. */
async function button(label: string, scope = "main") {
  let found: WebdriverIO.Element | undefined;
  await browser.waitUntil(
    async () => {
      for (const candidate of await $(scope).$$("button")) {
        if ((await candidate.getText()).trim().startsWith(label) && (await candidate.isDisplayed())) {
          found = candidate;
          return true;
        }
      }
      return false;
    },
    { timeout: 30_000, timeoutMsg: `no "${label}" button` },
  );
  if (!found) throw new Error(`no "${label}" button`);
  return found;
}

let uid = "";
const applicationPath = () => `users/${uid}/applications/${APPLICATION_ID}`;
const messagePath = () => `users/${uid}/mailMessages/${MESSAGE_ID}`;

async function status(): Promise<unknown> {
  return plain((await getDoc(applicationPath())).fields["status"]);
}

describe("Mail review", () => {
  before(async () => {
    await ensureSignedIn(testEmail("mail"));
    uid = await signedInUid();
    const now = new Date();
    const applied = new Date(now.getTime() - 9 * 86_400_000);
    await writeDoc(`users/${uid}/mailAccounts/${ACCOUNT_ID}`, {
      provider: "imap",
      address: `e2e-${RUN}@gmx.de`,
      displayName: null,
      status: "connected",
      syncCursor: null,
      secretRef: `mail/users/${uid}/mailTokens/${ACCOUNT_ID}`,
      scopes: [],
      canSend: false,
      lastSyncedAt: now,
      lastError: null,
      server: {
        preset: "gmx",
        username: `e2e-${RUN}@gmx.de`,
        imap: { host: "imap.gmx.net", port: 993, security: "tls" },
        smtp: null,
      },
      backfill: null,
      connectedAt: applied,
      createdAt: applied,
      updatedAt: now,
    });
    await writeDoc(applicationPath(), {
      jobId: null,
      company: COMPANY,
      companyDomain: "mailwave.example",
      role: ROLE,
      location: null,
      status: "applied",
      statusChangedAt: applied,
      channel: null,
      source: null,
      appliedAt: applied,
      cvId: null,
      cvRevisionId: null,
      cvFileId: null,
      coverLetterId: null,
      coverLetterFileId: null,
      fromAccountId: null,
      threadRefs: [],
      nextAction: null,
      nextActionAt: null,
      priority: "normal",
      notes: "",
      followUpSnoozedUntil: null,
      followUpDismissedAt: null,
      ghostedSnoozedUntil: null,
      ghostedDismissedAt: null,
      emailSend: null,
      createdAt: applied,
      updatedAt: applied,
    });
    await writeDoc(`users/${uid}/applicationEvents/e2e-mail-created-${RUN}`, {
      applicationId: APPLICATION_ID,
      type: "created",
      fromStatus: null,
      toStatus: "applied",
      actor: "user",
      confidence: null,
      evidence: null,
      text: null,
      revertsEventId: null,
      occurredAt: applied,
      createdAt: applied,
    });
    await writeDoc(messagePath(), {
      accountId: ACCOUNT_ID,
      providerMessageId: `imap:1:${RUN}`,
      providerThreadId: null,
      rfc822MessageId: `<${RUN}@mailwave.example>`,
      inReplyTo: null,
      folder: "inbox",
      from: { name: "Mailwave Talent", address: "talent@mailwave.example" },
      subject: `Interview: ${ROLE}`,
      snippet: "We'd love to talk about the Product Engineer role next week.",
      language: "en",
      receivedAt: new Date(now.getTime() - 3_600_000),
      category: "interview_invite",
      confidence: 0.72,
      extracted: {
        company: COMPANY,
        role: ROLE,
        contactName: null,
        contactEmail: null,
        dates: [],
        meetingUrls: [],
      },
      applicationId: APPLICATION_ID,
      linkStrength: "company_domain",
      suggestedStatus: "interviewing",
      appliedEventId: null,
      reviewState: "pending",
      reviewedAt: null,
      bodyText: "Hi, we'd love to talk about the Product Engineer role next week. Which times work for you?",
      bodyPurgeAt: null,
      interviewSuggestion: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  // Later specs may run in the same session (a restored sign-in): leave nothing of ours behind.
  after(async () => {
    const events = await findDocs("applicationEvents", "applicationId", APPLICATION_ID);
    await Promise.all(events.map((event) => deleteDoc(event.name)));
    await deleteDoc(applicationPath());
    await deleteDoc(messagePath());
    await deleteDoc(`users/${uid}/mailAccounts/${ACCOUNT_ID}`);
  });

  it("confirms the invite: the server moves the application to Interviewing", async () => {
    await goTo(`#/mail/review/${MESSAGE_ID}`);
    await $("h1=Mail").waitForDisplayed({ timeout: 30_000 });
    await browser.waitUntil(async () => (await $("main").getText()).includes(`Interview: ${ROLE}`), {
      timeout: 30_000,
      timeoutMsg: "the seeded email didn't show in Mail",
    });
    await capture("review-pending");
    await (await button("Confirm")).click();
    // The decision is held for the toast's Undo window, then written; the trigger does the rest.
    await browser.waitUntil(async () => (await status()) === "interviewing", {
      timeout: 90_000,
      timeoutMsg: "mailMessageReviewed didn't move the application to Interviewing",
    });
    const message = await getDoc(messagePath());
    expect(plain(message.fields["reviewState"])).toBe("confirmed");
    expect(plain(message.fields["appliedEventId"])).toEqual(expect.any(String));
    const events = await findDocs("applicationEvents", "applicationId", APPLICATION_ID);
    const types = events.map((event) => plain(event.fields["type"]));
    expect(types).toContain("mail_received");
    expect(types).toContain("status_changed");
  });

  it("shows the email on the application and undoes the move from its timeline", async () => {
    await goTo(`#/tracker/applications/${APPLICATION_ID}`);
    await browser.waitUntil(async () => (await $("main").getText()).includes(`Interview: ${ROLE}`), {
      timeout: 30_000,
      timeoutMsg: "the linked email isn't on the application",
    });
    await capture("application-linked");
    await (await button("Undo")).click();
    await browser.waitUntil(async () => (await status()) === "applied", {
      timeout: 30_000,
      timeoutMsg: "Undo didn't move the application back to Applied",
    });
    const events = await findDocs("applicationEvents", "applicationId", APPLICATION_ID);
    expect(events.some((event) => plain(event.fields["revertsEventId"]) !== null)).toBe(true);
  });
});
