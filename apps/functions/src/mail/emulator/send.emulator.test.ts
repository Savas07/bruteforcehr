// Email apply (scheduleSend → cancelSend / dispatch) against the Firestore and Storage emulators,
// sending through the in-process SMTP server. The Cloud Tasks queue is an in-memory recorder.
import { firestorePaths, serverOnlyPaths, storagePaths } from "@bfhr/api";
import {
  MAIL_DAILY_SEND_CAP_MAX,
  MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES,
  type MailSendRequest,
  MailSendRequestSchema,
} from "@bfhr/core";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { simpleParser } from "mailparser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setImapTestOptions } from "../accounts";
import { startTestMailServers, TEST_USER, type TestMailServers } from "../providers/test-servers";
import { cancelSend, dispatch, type DispatchQueue, scheduleSend } from "../send";
import {
  application,
  clearFirestore,
  listEvents,
  readAccount,
  readApplication,
  seedApplication,
  seedImapAccount,
  seedProfile,
} from "./helpers";

const UID = "user-send";
const ACCOUNT = "acc-imap";
const ATTACHMENT_PATH = `users/${UID}/mail-attachments/cv-upload`;
const ATTACHMENT = Buffer.from("%PDF-1.7 Deniz Arslan CV");

let servers: TestMailServers;

function recordingQueue(): DispatchQueue & {
  enqueued: { data: { uid: string; sendId: string }; scheduleTime: Date; id: string }[];
  deleted: string[];
} {
  const enqueued: { data: { uid: string; sendId: string }; scheduleTime: Date; id: string }[] = [];
  const deleted: string[] = [];
  return {
    enqueued,
    deleted,
    async enqueue(data, options) {
      enqueued.push({ data, ...options });
    },
    async delete(id) {
      deleted.push(id);
    },
  };
}

function request(applicationId: string, overrides: Partial<MailSendRequest> = {}) {
  return MailSendRequestSchema.parse({
    accountId: ACCOUNT,
    applicationId,
    jobId: null,
    to: [{ name: "Initech Jobs", address: "jobs@initech.example" }],
    subject: "Application: Backend Engineer",
    bodyText: "Hello,\n\nplease find my CV attached.\n\nDeniz",
    attachments: [
      {
        kind: "upload",
        storagePath: ATTACHMENT_PATH,
        fileName: "Deniz-Arslan-CV.pdf",
        contentType: "application/pdf",
      },
    ],
    pins: {
      cvId: "cv-1",
      cvRevisionId: "rev-1",
      cvFileId: null,
      coverLetterId: "cl-new",
      coverLetterFileId: null,
    },
    ...overrides,
  });
}

/** A `renderedFiles` document as a client could write it (Admin SDK: no rules). */
async function seedRenderedFile(id: string, fields: { storagePath: string; sizeBytes: number }) {
  await getFirestore()
    .doc(firestorePaths.renderedFile(UID, id))
    .set({
      kind: "pdf",
      cvId: "cv-1",
      cvRevisionId: "rev-1",
      coverLetterId: null,
      fileName: "Deniz-Arslan-CV.pdf",
      sha256: "a".repeat(64),
      createdAt: Timestamp.now(),
      schemaVersion: 1,
      ...fields,
    });
}

function renderedRequest(applicationId: string, renderedFileId: string) {
  return request(applicationId, {
    attachments: [{ kind: "rendered", renderedFileId }],
    pins: { cvId: "cv-1", cvRevisionId: "rev-1", cvFileId: renderedFileId, coverLetterId: null, coverLetterFileId: null },
  });
}

const sendDayCount = async () => {
  const day = new Date().toISOString().slice(0, 10);
  return (await getFirestore().doc(serverOnlyPaths.mailSendDay(UID, day)).get()).get("count") as
    number | undefined;
};
const outboxExists = async (sendId: string) =>
  (await getFirestore().doc(serverOnlyPaths.mailOutbox(UID, sendId)).get()).exists;

beforeAll(async () => {
  servers = await startTestMailServers();
  setImapTestOptions(servers.test);
  await getStorage().bucket().file(ATTACHMENT_PATH).save(ATTACHMENT, { contentType: "application/pdf" });
});
afterAll(async () => {
  setImapTestOptions({});
  await servers.stop();
});
beforeEach(async () => {
  await clearFirestore();
  servers.imap.control.reset();
  servers.smtpReceived.splice(0);
  await seedProfile(UID, { dailySendCap: 2 });
  await seedImapAccount(UID, ACCOUNT, servers);
  for (const id of ["app-initech", "app-hooli", "app-umbrella"]) {
    await seedApplication(
      UID,
      application({
        id,
        company: "Initech",
        role: "Backend Engineer",
        status: "preparing",
        coverLetterId: "cl-existing",
      }),
    );
  }
});

describe("email apply", () => {
  it("schedules, then dispatch sends over SMTP and records the send", async () => {
    const queue = recordingQueue();
    const scheduledAt = Date.now();
    const response = await scheduleSend(UID, request("app-initech"), queue);
    expect(response).toMatchObject({ applicationId: "app-initech", state: "scheduled" });
    const sendAt = new Date(response.sendAt).getTime();
    expect(sendAt - scheduledAt).toBeGreaterThanOrEqual(9_000);
    expect(sendAt - scheduledAt).toBeLessThanOrEqual(15_000);

    const scheduled = await readApplication(UID, "app-initech");
    const sendId = scheduled.emailSend?.sendId ?? "";
    expect(scheduled.emailSend).toMatchObject({ state: "scheduled", accountId: ACCOUNT, sentAt: null });
    expect(queue.enqueued).toEqual([
      { data: { uid: UID, sendId }, scheduleTime: new Date(sendAt), id: `send-${sendId}` },
    ]);
    expect(await outboxExists(sendId)).toBe(true);
    expect(await sendDayCount()).toBe(1);

    expect(await dispatch(UID, sendId)).toBe("sent");

    const delivered = servers.smtpReceived.at(-1);
    expect(delivered?.to).toEqual(["jobs@initech.example"]);
    const parsed = await simpleParser(delivered?.raw ?? Buffer.alloc(0));
    expect(parsed.subject).toBe("Application: Backend Engineer");
    expect(parsed.from?.value[0]).toMatchObject({ name: "Deniz Arslan", address: TEST_USER });
    expect(parsed.attachments.map((file) => [file.filename, file.content.toString()])).toEqual([
      ["Deniz-Arslan-CV.pdf", ATTACHMENT.toString()],
    ]);
    // No provider-side copy for this preset: the adapter files one in Sent.
    expect(servers.imap.control.listMessages("Sent")).toHaveLength(1);

    const sent = await readApplication(UID, "app-initech");
    expect(sent.emailSend).toMatchObject({
      state: "sent",
      sendId,
      rfc822MessageId: parsed.messageId,
      error: null,
    });
    expect(sent.emailSend?.providerMessageId).toMatch(/^Sent:\d+:1$/);
    expect(sent).toMatchObject({
      status: "applied",
      channel: "email",
      fromAccountId: ACCOUNT,
      cvId: "cv-1",
      cvRevisionId: "rev-1",
      // Pins are only filled when empty.
      coverLetterId: "cl-existing",
    });
    expect(sent.appliedAt).not.toBeNull();
    expect(sent.threadRefs).toEqual([
      { accountId: ACCOUNT, provider: "imap", threadId: parsed.messageId, rfc822MessageId: parsed.messageId },
    ]);
    const events = await listEvents(UID, "app-initech");
    expect(events.map((event) => [event.type, event.actor, event.toStatus]).sort()).toEqual([
      ["mail_sent", "user", null],
      ["status_changed", "user", "applied"],
    ]);
    expect(await outboxExists(sendId)).toBe(false);
    expect(await sendDayCount()).toBe(1);

    // No double send, and nothing left to cancel.
    expect(await dispatch(UID, sendId)).toBeNull();
    expect(servers.smtpReceived).toHaveLength(1);
    await expect(cancelSend(UID, "app-initech", queue)).rejects.toMatchObject({ reason: "already_sent" });
  });

  it("cancels inside the undo window", async () => {
    const queue = recordingQueue();
    await scheduleSend(UID, request("app-initech"), queue);
    const sendId = (await readApplication(UID, "app-initech")).emailSend?.sendId ?? "";

    expect(await cancelSend(UID, "app-initech", queue)).toEqual({ state: "cancelled" });

    expect(queue.deleted).toEqual([`send-${sendId}`]);
    const cancelled = await readApplication(UID, "app-initech");
    expect(cancelled.emailSend?.state).toBe("cancelled");
    expect(cancelled.status).toBe("preparing");
    expect(await outboxExists(sendId)).toBe(false);
    expect(await sendDayCount()).toBe(0);
    // The task may still fire: it finds nothing to send.
    expect(await dispatch(UID, sendId)).toBeNull();
    expect(servers.smtpReceived).toEqual([]);
  });

  it("records a rejected password as failed and asks to reconnect", async () => {
    await seedImapAccount(UID, ACCOUNT, servers, { password: "revoked" });
    await scheduleSend(UID, request("app-initech"), recordingQueue());
    const sendId = (await readApplication(UID, "app-initech")).emailSend?.sendId ?? "";

    expect(await dispatch(UID, sendId)).toBe("failed");

    expect(servers.smtpReceived).toEqual([]);
    const failed = await readApplication(UID, "app-initech");
    expect(failed.emailSend).toMatchObject({ state: "failed", error: { code: "needs_reauth" } });
    expect(failed.status).toBe("preparing");
    expect(await outboxExists(sendId)).toBe(false);
    expect(await sendDayCount()).toBe(0);
    const account = await readAccount(UID, ACCOUNT);
    expect(account.status).toBe("needs_reauth");
    expect(account.lastError?.code).toBe("needs_reauth");
    await expect(scheduleSend(UID, request("app-hooli"), recordingQueue())).rejects.toMatchObject({
      reason: "needs_reauth",
    });
  });

  it("enforces the daily send cap; cancelled mail doesn't count", async () => {
    const queue = recordingQueue();
    await scheduleSend(UID, request("app-initech"), queue);
    await scheduleSend(UID, request("app-hooli"), queue);
    await expect(scheduleSend(UID, request("app-umbrella"), queue)).rejects.toMatchObject({
      code: "resource-exhausted",
      reason: "daily_send_cap",
    });
    expect((await readApplication(UID, "app-umbrella")).emailSend).toBeNull();
    expect(queue.enqueued).toHaveLength(2);

    await cancelSend(UID, "app-hooli", queue);
    await expect(scheduleSend(UID, request("app-umbrella"), queue)).resolves.toMatchObject({
      state: "scheduled",
    });
    expect(await sendDayCount()).toBe(2);
  });

  it("refuses a second send while one is scheduled", async () => {
    await scheduleSend(UID, request("app-initech"), recordingQueue());
    await expect(scheduleSend(UID, request("app-initech"), recordingQueue())).rejects.toMatchObject({
      reason: "send_in_progress",
    });
    const stored = await getFirestore().doc(firestorePaths.application(UID, "app-initech")).get();
    expect(stored.get("emailSend.state")).toBe("scheduled");
  });

  it("refuses attachments over Graph's request limit for a Microsoft account before scheduling", async () => {
    const largePath = `users/${UID}/mail-attachments/cv-large`;
    await getStorage()
      .bucket()
      .file(largePath)
      .save(Buffer.alloc(3_000_000, 1), { contentType: "application/pdf" });
    await seedImapAccount(UID, ACCOUNT, servers, {
      account: { provider: "microsoft", address: "deniz@outlook.example", server: null },
    });
    const queue = recordingQueue();
    const large = request("app-initech", {
      attachments: [
        { kind: "upload", storagePath: largePath, fileName: "CV.pdf", contentType: "application/pdf" },
      ],
    });
    await expect(scheduleSend(UID, large, queue)).rejects.toMatchObject({
      code: "invalid-argument",
      reason: "attachments_too_large",
      details: { reason: "attachments_too_large", limitBytes: MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES },
    });
    expect(queue.enqueued).toEqual([]);
    expect((await readApplication(UID, "app-initech")).emailSend).toBeNull();
    expect(await sendDayCount()).toBeUndefined();

    // The small CV fits in one request.
    await expect(scheduleSend(UID, request("app-initech"), queue)).resolves.toMatchObject({
      state: "scheduled",
    });
  });

  it("attaches a rendered file only from its own object, sized by Storage", async () => {
    const own = storagePaths.renderedFile(UID, "file-own");
    await getStorage().bucket().file(own).save(ATTACHMENT, { contentType: "application/pdf" });
    await seedRenderedFile("file-own", { storagePath: own, sizeBytes: 1 });
    const queue = recordingQueue();
    await expect(scheduleSend(UID, renderedRequest("app-initech", "file-own"), queue)).resolves.toMatchObject({
      state: "scheduled",
    });
    const sendId = (await readApplication(UID, "app-initech")).emailSend?.sendId ?? "";
    const outbox = await getFirestore().doc(serverOnlyPaths.mailOutbox(UID, sendId)).get();
    expect(outbox.get("attachments")).toEqual([
      expect.objectContaining({ storagePath: own, sizeBytes: ATTACHMENT.byteLength }),
    ]);

    // Another user's object (or any other path) named in the client-written document.
    const victim = storagePaths.renderedFile("user-victim", "file-secret");
    await getStorage().bucket().file(victim).save(ATTACHMENT, { contentType: "application/pdf" });
    for (const storagePath of [victim, `users/${UID}/cv-imports/file-own`, own]) {
      await seedRenderedFile("file-forged", { storagePath, sizeBytes: 1 });
      await expect(scheduleSend(UID, renderedRequest("app-hooli", "file-forged"), queue)).rejects.toMatchObject({
        reason: "attachment_not_found",
      });
    }
    // The document's path is right but the object was never uploaded.
    await seedRenderedFile("file-missing", { storagePath: storagePaths.renderedFile(UID, "file-missing"), sizeBytes: 1 });
    await expect(scheduleSend(UID, renderedRequest("app-hooli", "file-missing"), queue)).rejects.toMatchObject({
      reason: "attachment_not_found",
    });
    expect((await readApplication(UID, "app-hooli")).emailSend).toBeNull();
    expect(queue.enqueued).toHaveLength(1);
  });

  it("checks the size limit against the stored bytes, not the document", async () => {
    const large = storagePaths.renderedFile(UID, "file-large");
    await getStorage()
      .bucket()
      .file(large)
      .save(Buffer.alloc(19 * 1024 * 1024, 1), { contentType: "application/pdf" });
    await seedRenderedFile("file-large", { storagePath: large, sizeBytes: 1 });
    await expect(scheduleSend(UID, renderedRequest("app-initech", "file-large"), recordingQueue())).rejects.toMatchObject({
      reason: "attachments_too_large",
    });
  });

  it("clamps a client-written send cap", async () => {
    await seedProfile(UID, { dailySendCap: -5 });
    await expect(scheduleSend(UID, request("app-initech"), recordingQueue())).rejects.toMatchObject({
      reason: "daily_send_cap",
    });
    await seedProfile(UID, { dailySendCap: 10_000 });
    await expect(scheduleSend(UID, request("app-initech"), recordingQueue())).resolves.toMatchObject({
      state: "scheduled",
    });
    // At MAIL_DAILY_SEND_CAP_MAX sends today the stored 10 000 doesn't help.
    const day = new Date().toISOString().slice(0, 10);
    await getFirestore().doc(serverOnlyPaths.mailSendDay(UID, day)).set({ count: MAIL_DAILY_SEND_CAP_MAX }, { merge: true });
    await expect(scheduleSend(UID, request("app-hooli"), recordingQueue())).rejects.toMatchObject({
      reason: "daily_send_cap",
    });
  });
});
