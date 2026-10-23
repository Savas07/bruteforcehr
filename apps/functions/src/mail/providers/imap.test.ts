// IMAP/SMTP adapter against in-process servers (imapkit over implicit TLS, smtp-server with STARTTLS).
import { simpleParser } from "mailparser";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { classifyConnectError, ImapAdapter, ImapConnectError } from "./imap";
import { resolvePublicHost } from "./net-guard";
import { rfc822, startTestMailServers, TEST_USER, type TestMailServers } from "./test-servers";
import { MailAuthError, MailCursorExpiredError } from "./types";

// Real TLS sockets and SMTP handshakes: generous under a parallel `turbo test`.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
let servers: TestMailServers;
const adapters: ImapAdapter[] = [];
const open = () => {
  const adapter = new ImapAdapter(servers.credentials, TEST_USER, servers.test);
  adapters.push(adapter);
  return adapter;
};

beforeAll(async () => {
  servers = await startTestMailServers();
});
afterEach(async () => {
  await Promise.all(adapters.splice(0).map((adapter) => adapter.close()));
  servers.imap.control.reset();
});
afterAll(async () => {
  await servers.stop();
});

describe("credential check", () => {
  it("accepts the app password over TLS and SMTP STARTTLS", async () => {
    await expect(ImapAdapter.verifyImap(servers.credentials, servers.test)).resolves.toBeUndefined();
    await expect(ImapAdapter.verifySmtp(servers.credentials, servers.test)).resolves.toBeUndefined();
  });

  it("reports a wrong password as auth_failed on each side", async () => {
    const wrong = { ...servers.credentials, password: "wrong" };
    await expect(ImapAdapter.verifyImap(wrong, servers.test)).rejects.toMatchObject({
      reason: "auth_failed",
      side: "imap",
    });
    await expect(ImapAdapter.verifySmtp(wrong, servers.test)).rejects.toMatchObject({
      reason: "auth_failed",
      side: "smtp",
    });
  });

  it("reports a closed port as host_unreachable", async () => {
    const closed = { ...servers.credentials, imap: { host: "127.0.0.1", port: 1, security: "tls" as const } };
    await expect(ImapAdapter.verifyImap(closed, servers.test)).rejects.toMatchObject({
      reason: "host_unreachable",
    });
  });

  it("reports an untrusted certificate as tls_failed", async () => {
    await expect(
      ImapAdapter.verifyImap(servers.credentials, { allowPrivateHosts: true }),
    ).rejects.toMatchObject({
      reason: "tls_failed",
    });
  });

  it("refuses private and metadata addresses before connecting", async () => {
    await expect(resolvePublicHost("127.0.0.1")).rejects.toThrow("non-public");
    await expect(resolvePublicHost("169.254.169.254")).rejects.toThrow("non-public");
    await expect(resolvePublicHost("10.1.2.3")).rejects.toThrow("non-public");
    await expect(resolvePublicHost("::1")).rejects.toThrow("non-public");
    await expect(resolvePublicHost("::ffff:10.1.2.3")).rejects.toThrow("non-public");
    await expect(resolvePublicHost("::ffff:169.254.169.254")).rejects.toThrow("non-public");
    const blocked = { ...servers.credentials };
    await expect(
      ImapAdapter.verifyImap(blocked, { tls: { rejectUnauthorized: false } }),
    ).rejects.toMatchObject({
      reason: "host_unreachable",
    });
  });

  it("maps provider texts for disabled IMAP", () => {
    const error = Object.assign(new Error("Command failed"), {
      response: "NO [ALERT] IMAP access is disabled for this account",
    });
    expect(classifyConnectError(error, "imap")).toEqual(
      new ImapConnectError("imap_disabled", "imap", "access disabled at the provider"),
    );
  });
});

describe("sync", () => {
  it("lists the lookback window in INBOX and Junk, newest first, with a total", async () => {
    const old = new Date("2026-06-01T10:00:00Z");
    servers.imap.control.addMessage("INBOX", {
      raw: rfc822({ from: "old@acme.example", subject: "old", body: "x" }),
      internaldate: old,
    });
    for (let i = 0; i < 3; i++)
      servers.imap.control.addMessage("INBOX", {
        raw: rfc822({ from: "jobs@acme.example", subject: `new ${i}`, body: "x" }),
      });
    servers.imap.control.addMessage("Junk", {
      raw: rfc822({ from: "no-reply@us.greenhouse-mail.io", subject: "spam", body: "x" }),
    });

    const adapter = open();
    const since = new Date(Date.now() - 90 * 86_400_000);
    const first = await adapter.listSince(since, null);
    expect(first.total).toBe(4);
    expect(first.refs.map((ref) => ref.folder)).toEqual(["inbox", "inbox", "inbox"]);
    expect(first.nextPageToken).not.toBeNull();
    const second = await adapter.listSince(since, first.nextPageToken);
    expect(second.refs).toHaveLength(1);
    expect(second.refs[0]?.folder).toBe("spam");
    expect(second.nextPageToken).toBeNull();

    const fetched = await adapter.fetch([...first.refs, ...second.refs]);
    expect(fetched).toHaveLength(4);
    const parsed = await simpleParser(fetched.find((mail) => mail.folder === "spam")?.raw ?? Buffer.alloc(0));
    expect(parsed.subject).toBe("spam");
  });

  it("reports only new messages since the cursor, and nothing when unchanged", async () => {
    servers.imap.control.addMessage("INBOX", {
      raw: rfc822({ from: "a@acme.example", subject: "before", body: "x" }),
    });
    const adapter = open();
    const cursor = await adapter.currentCursor();
    expect(JSON.parse(cursor)).toMatchObject({
      v: 1,
      folders: { INBOX: { uidNext: 2 }, Junk: { uidNext: 1 } },
    });

    const idle = await adapter.changesSince(cursor);
    expect(idle.refs).toEqual([]);
    expect(idle.more).toBe(false);

    servers.imap.control.addMessage("INBOX", {
      raw: rfc822({ from: "b@acme.example", subject: "after", body: "x" }),
    });
    servers.imap.control.addMessage("Junk", {
      raw: rfc822({ from: "c@acme.example", subject: "junk after", body: "x" }),
    });
    const changes = await adapter.changesSince(cursor);
    expect(changes.refs.map((ref) => ref.folder).sort()).toEqual(["inbox", "spam"]);
    const fetched = await adapter.fetch(changes.refs);
    const subjects = await Promise.all(fetched.map(async (mail) => (await simpleParser(mail.raw)).subject));
    expect(subjects.sort()).toEqual(["after", "junk after"]);

    const again = await adapter.changesSince(changes.cursor);
    expect(again.refs).toEqual([]);
  });

  it("throws MailCursorExpiredError when UIDVALIDITY changes", async () => {
    const adapter = open();
    const cursor = await adapter.currentCursor();
    servers.imap.control.resetUidValidity("INBOX", {});
    await expect(adapter.changesSince(cursor)).rejects.toBeInstanceOf(MailCursorExpiredError);
  });

  it("turns a revoked app password into MailAuthError", async () => {
    const adapter = new ImapAdapter({ ...servers.credentials, password: "revoked" }, TEST_USER, servers.test);
    adapters.push(adapter);
    await expect(adapter.currentCursor()).rejects.toBeInstanceOf(MailAuthError);
  });
});

describe("send", () => {
  it("sends over SMTP with attachments and files a copy in Sent", async () => {
    const adapter = open();
    const sent = await adapter.send({
      from: { name: "Deniz Arslan", address: TEST_USER },
      to: [{ name: "Acme Jobs", address: "jobs@acme.example" }],
      cc: [{ name: null, address: TEST_USER }],
      subject: "Application: Backend Engineer",
      text: "Hello,\n\nplease find my CV attached.\n\nDeniz",
      attachments: [
        {
          fileName: "Deniz-Arslan-CV-Acme.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF-1.7 test"),
        },
      ],
      replyTo: null,
    });
    expect(sent.rfc822MessageId).toMatch(/^<.+@mail\.example>$/);
    expect(sent.providerMessageId).toMatch(/^Sent:\d+:1$/);

    const delivered = servers.smtpReceived.at(-1);
    expect(delivered?.to.sort()).toEqual(["deniz@mail.example", "jobs@acme.example"]);
    const parsed = await simpleParser(delivered?.raw ?? Buffer.alloc(0));
    expect(parsed.subject).toBe("Application: Backend Engineer");
    expect(parsed.attachments.map((attachment) => attachment.filename)).toEqual(["Deniz-Arslan-CV-Acme.pdf"]);
    expect(parsed.messageId).toBe(sent.rfc822MessageId);

    const sentCopies = servers.imap.control.listMessages("Sent", { raw: true });
    expect(sentCopies).toHaveLength(1);
    expect(servers.imap.control.listMessages("INBOX")).toHaveLength(1);
  });

  it("threads a reply with In-Reply-To and References", async () => {
    const adapter = open();
    await adapter.send({
      from: { name: null, address: TEST_USER },
      to: [{ name: null, address: "jobs@acme.example" }],
      cc: [],
      subject: "Re: Your application",
      text: "Thanks!",
      attachments: [],
      replyTo: {
        providerMessageId: "INBOX:1:1",
        providerThreadId: null,
        rfc822MessageId: "<b@acme.example>",
        references: ["<a@acme.example>"],
      },
    });
    const parsed = await simpleParser(servers.smtpReceived.at(-1)?.raw ?? Buffer.alloc(0));
    expect(parsed.inReplyTo).toBe("<b@acme.example>");
    expect(parsed.references).toEqual(["<a@acme.example>", "<b@acme.example>"]);
  });

  it("skips the Sent copy when the provider saves SMTP mail itself", async () => {
    const adapter = new ImapAdapter({ ...servers.credentials, smtpSavesSent: true }, TEST_USER, servers.test);
    adapters.push(adapter);
    await adapter.send({
      from: { name: null, address: TEST_USER },
      to: [{ name: null, address: "jobs@acme.example" }],
      cc: [],
      subject: "No copy",
      text: "x",
      attachments: [],
      replyTo: null,
    });
    expect(servers.imap.control.listMessages("Sent")).toHaveLength(0);
  });
});
