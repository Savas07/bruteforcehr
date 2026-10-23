// Lookback scan and incremental sync (runSync) of an IMAP account against imapkit, with Firestore
// in the emulator. Rules-only classification: the profile has AI off, so nothing leaves the process.
import { serverOnlyPaths } from "@bfhr/api";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadBackfillProgress, setImapTestOptions } from "../accounts";
import { ImapAdapter } from "../providers/imap";
import { rfc822, startTestMailServers, type TestMailServers } from "../providers/test-servers";
import { runSync, startBackfill } from "../sync";
import {
  application,
  clearFirestore,
  listEvents,
  listMessages,
  readAccount,
  readApplication,
  recordingSyncEnqueue,
  seedApplication,
  seedImapAccount,
  seedProfile,
} from "./helpers";

const UID = "user-sync";
const ACCOUNT = "acc-imap";
/** Message-ID of the application email sent to Globex; the rejection replies to it. */
const SENT_TO_GLOBEX = "<sent-globex@mail.example>";
const DAY_MS = 86_400_000;

const receipt = rfc822({
  from: "Acme Robotics <no-reply@us.greenhouse-mail.io>",
  subject: "Thank you for applying to Acme Robotics",
  body: "Hi Deniz,\n\nThank you for applying for the Backend Engineer role at Acme Robotics. We have received your application and our team will review your application shortly.\n\nAcme Robotics Recruiting",
  messageId: "<receipt-acme@greenhouse-mail.io>",
});
const rejection = rfc822({
  from: "Globex Talent <talent@globex.example>",
  subject: "Re: Application: Platform Engineer",
  body: "Hi Deniz,\n\nThank you for your time. Unfortunately we have decided not to move forward with your application for the Platform Engineer position.\n\nBest,\nGlobex Talent",
  messageId: "<rejection-globex@globex.example>",
  headers: { "In-Reply-To": SENT_TO_GLOBEX, References: SENT_TO_GLOBEX },
});
const newsletter = rfc822({
  from: "Weekly Deals <news@shop.example>",
  subject: "This week's deals",
  body: "Save 20% on garden furniture this weekend only.",
  messageId: "<deals-42@shop.example>",
  headers: { "List-Unsubscribe": "<mailto:unsubscribe@shop.example>" },
});
const invite = rfc822({
  from: "Acme Robotics <no-reply@us.greenhouse-mail.io>",
  subject: "Interview invitation: Backend Engineer at Acme Robotics",
  body: "Hi Deniz,\n\nWe would like to invite you to a technical interview for the Backend Engineer role at Acme Robotics. Please schedule an interview using the link below.\n\nAcme Robotics Recruiting",
  messageId: "<invite-acme@greenhouse-mail.io>",
});

let servers: TestMailServers;
const fetchSpy = vi.spyOn(ImapAdapter.prototype, "fetch");
const fetchedCount = () => fetchSpy.mock.calls.reduce((sum, [refs]) => sum + refs.length, 0);

const statusEvents = async (applicationId: string) =>
  (await listEvents(UID, applicationId)).filter((event) => event.type === "status_changed");

beforeAll(async () => {
  servers = await startTestMailServers();
  setImapTestOptions(servers.test);
});
afterAll(async () => {
  setImapTestOptions({});
  await servers.stop();
});

describe("runSync on an IMAP account", () => {
  beforeAll(async () => {
    await clearFirestore();
    servers.imap.control.reset();
    await seedProfile(UID);
    await seedApplication(
      UID,
      application({
        id: "app-acme",
        company: "Acme Robotics",
        companyDomain: "acmerobotics.example",
        role: "Backend Engineer",
        status: "applied",
      }),
    );
    await seedApplication(
      UID,
      application({
        id: "app-globex",
        company: "Globex",
        companyDomain: "globex.example",
        role: "Platform Engineer",
        status: "acknowledged",
        channel: "email",
        fromAccountId: ACCOUNT,
        threadRefs: [
          { accountId: ACCOUNT, provider: "imap", threadId: SENT_TO_GLOBEX, rfc822MessageId: SENT_TO_GLOBEX },
        ],
      }),
    );
    await seedImapAccount(UID, ACCOUNT, servers);
    servers.imap.control.addMessage("INBOX", { raw: receipt });
    servers.imap.control.addMessage("INBOX", { raw: newsletter });
    servers.imap.control.addMessage("Junk", { raw: rejection });
  });

  it("scans the lookback window: stores job mail, applies strong changes, hashes the rest", async () => {
    const enqueue = recordingSyncEnqueue();
    await startBackfill(UID, ACCOUNT, 90, enqueue);
    expect(enqueue.calls).toEqual([{ uid: UID, accountId: ACCOUNT, mode: "backfill" }]);
    expect((await readAccount(UID, ACCOUNT)).backfill).toMatchObject({ state: "queued", lookbackDays: 90 });

    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "backfill" })).toBe(false);

    const messages = await listMessages(UID);
    expect(messages).toHaveLength(2);
    const acme = messages.find((message) => message.rfc822MessageId === "<receipt-acme@greenhouse-mail.io>");
    const globex = messages.find(
      (message) => message.rfc822MessageId === "<rejection-globex@globex.example>",
    );
    expect(acme).toMatchObject({
      accountId: ACCOUNT,
      folder: "inbox",
      category: "application_received",
      applicationId: "app-acme",
      linkStrength: "ats_company_role",
      suggestedStatus: "acknowledged",
      reviewState: "auto_applied",
      bodyPurgeAt: null,
      from: { address: "no-reply@us.greenhouse-mail.io", name: "Acme Robotics" },
    });
    expect(acme?.bodyText).toContain("We have received your application");
    expect(globex).toMatchObject({
      folder: "spam",
      category: "rejection",
      applicationId: "app-globex",
      linkStrength: "thread",
      suggestedStatus: "rejected",
      reviewState: "auto_applied",
      inReplyTo: SENT_TO_GLOBEX,
    });

    // Auto-applied: one status_changed event per application, the message's Undo target.
    const acmeApp = await readApplication(UID, "app-acme");
    expect(acmeApp.status).toBe("acknowledged");
    const [acmeEvent, ...moreAcme] = await statusEvents("app-acme");
    expect(moreAcme).toEqual([]);
    expect(acmeEvent).toMatchObject({
      id: acme?.appliedEventId,
      fromStatus: "applied",
      toStatus: "acknowledged",
      actor: "rule",
      confidence: acme?.confidence,
      evidence: { mailMessageId: acme?.id },
    });
    const globexApp = await readApplication(UID, "app-globex");
    expect(globexApp.status).toBe("rejected");
    const [globexEvent] = await statusEvents("app-globex");
    expect(globexEvent).toMatchObject({ id: globex?.appliedEventId, toStatus: "rejected", actor: "rule" });
    // Closed by the rejection: the retention clock starts at the status change.
    expect(globex?.bodyPurgeAt?.getTime()).toBe(globexApp.statusChangedAt.getTime() + 180 * DAY_MS);

    // The newsletter left only a dedupe hash with a TTL beyond the longest lookback.
    const seen = await getFirestore().collection(serverOnlyPaths.mailSeenCollection(UID)).get();
    expect(seen.size).toBe(1);
    expect(seen.docs[0]?.get("accountId")).toBe(ACCOUNT);
    const expireAt = (seen.docs[0]?.get("expireAt") as Timestamp).toMillis();
    expect(expireAt).toBeGreaterThan(Date.now() + 199 * DAY_MS);

    const account = await readAccount(UID, ACCOUNT);
    expect(account.status).toBe("connected");
    expect(account.lastSyncedAt).not.toBeNull();
    expect(account.backfill).toMatchObject({
      state: "done",
      stage: "preparing",
      scanned: 3,
      total: 3,
      jobMessages: 2,
      applications: 2,
      interviewInvites: 0,
      jobAlerts: 0,
      pendingReview: 0,
      error: null,
    });
    expect(account.backfill?.finishedAt).not.toBeNull();
    expect(JSON.parse(account.syncCursor ?? "null")).toMatchObject({
      v: 1,
      folders: { INBOX: { uidNext: 3 }, Junk: { uidNext: 2 } },
    });
    expect(await loadBackfillProgress(UID, ACCOUNT)).toBeNull();
    const token = await getFirestore().doc(serverOnlyPaths.mailToken(UID, ACCOUNT)).get();
    expect(token.get("leaseUntil")).toBeUndefined();
  });

  it("processes only new mail incrementally", async () => {
    fetchSpy.mockClear();
    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "incremental" })).toBe(false);
    expect(fetchedCount()).toBe(0);

    servers.imap.control.addMessage("INBOX", { raw: invite });
    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "incremental" })).toBe(false);
    expect(fetchedCount()).toBe(1);

    const messages = await listMessages(UID);
    expect(messages).toHaveLength(3);
    const message = messages.find((item) => item.rfc822MessageId === "<invite-acme@greenhouse-mail.io>");
    expect(message).toMatchObject({
      category: "interview_invite",
      applicationId: "app-acme",
      linkStrength: "ats_company_role",
      reviewState: "auto_applied",
    });
    expect((await readApplication(UID, "app-acme")).status).toBe("interviewing");
    expect((await statusEvents("app-acme")).map((event) => event.toStatus).sort()).toEqual([
      "acknowledged",
      "interviewing",
    ]);
    const account = await readAccount(UID, ACCOUNT);
    expect(JSON.parse(account.syncCursor ?? "null")).toMatchObject({ folders: { INBOX: { uidNext: 4 } } });
    // The finished lookback scan is left as it was.
    expect(account.backfill).toMatchObject({ state: "done", scanned: 3 });
  });

  it("rescans after a UIDVALIDITY reset without storing anything twice", async () => {
    const before = await readAccount(UID, ACCOUNT);
    const eventsBefore = await listEvents(UID);
    servers.imap.control.resetUidValidity("INBOX", {});

    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "incremental" })).toBe(false);

    expect(await listMessages(UID)).toHaveLength(3);
    expect((await listEvents(UID)).map((event) => event.id).sort()).toEqual(
      eventsBefore.map((event) => event.id).sort(),
    );
    expect((await readApplication(UID, "app-acme")).status).toBe("interviewing");
    expect((await readApplication(UID, "app-globex")).status).toBe("rejected");
    const account = await readAccount(UID, ACCOUNT);
    expect(account.status).toBe("connected");
    const cursor = JSON.parse(account.syncCursor ?? "null") as {
      folders: Record<string, { uidValidity: string }>;
    };
    const previous = JSON.parse(before.syncCursor ?? "null") as typeof cursor;
    expect(cursor.folders["INBOX"]?.uidValidity).not.toBe(previous.folders["INBOX"]?.uidValidity);
    expect(cursor.folders["Junk"]?.uidValidity).toBe(previous.folders["Junk"]?.uidValidity);

    // The fresh cursor works: the next run finds nothing new.
    fetchSpy.mockClear();
    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "incremental" })).toBe(false);
    expect(fetchedCount()).toBe(0);
  });
});

describe("runSync with revoked credentials", () => {
  it("moves the account to needs_reauth and fails the scan", async () => {
    await clearFirestore();
    servers.imap.control.reset();
    await seedProfile(UID);
    await seedImapAccount(UID, ACCOUNT, servers, { password: "revoked" });
    await startBackfill(UID, ACCOUNT, 30, recordingSyncEnqueue());

    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "backfill" })).toBe(false);

    const account = await readAccount(UID, ACCOUNT);
    expect(account.status).toBe("needs_reauth");
    expect(account.lastError?.code).toBe("auth_failed");
    expect(account.backfill).toMatchObject({ state: "failed", error: { code: "auth_failed" } });
    // needs_reauth stops further runs until the user reconnects.
    expect(await runSync({ uid: UID, accountId: ACCOUNT, mode: "incremental" })).toBe(false);
    expect(await listMessages(UID)).toEqual([]);
  });
});
