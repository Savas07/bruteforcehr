import { describe, expect, it } from "vitest";
import { fetchStub, stubTokens } from "./fetch-stub";
import { GMAIL_SEND_SCOPE, GmailAdapter } from "./gmail";
import { MailAuthError, MailCursorExpiredError, MailScopeError, MailTransientError, type OutgoingMail } from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const b64url = (text: string) => Buffer.from(text).toString("base64url");

const outgoing = (extra: Partial<OutgoingMail> = {}): OutgoingMail => ({
  from: { name: "Ada", address: "ada@example.com" },
  to: [{ name: null, address: "recruiter@example.org" }],
  cc: [],
  subject: "Application",
  text: "Hello",
  attachments: [],
  replyTo: null,
  ...extra,
});

describe("GmailAdapter", () => {
  it("uses the profile historyId as the current cursor", async () => {
    const stub = fetchStub([{ match: `GET ${BASE}/profile`, responses: [{ body: { emailAddress: "a@b.c", historyId: "777" } }] }]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    expect(await adapter.currentCursor()).toBe("777");
    expect(stub.calls[0]?.headers.get("authorization")).toBe("Bearer token-1");
  });

  it("lists the lookback window page by page with a first-page total", async () => {
    const stub = fetchStub([
      {
        match: `GET ${BASE}/messages`,
        responses: [
          { body: { messages: [{ id: "m1", threadId: "t1" }], nextPageToken: "p2", resultSizeEstimate: 2 } },
          { body: { messages: [{ id: "m2", threadId: "t2" }], resultSizeEstimate: 2 } },
        ],
      },
    ]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const since = new Date("2026-09-01T00:00:00Z");
    const first = await adapter.listSince(since, null);
    expect(first).toEqual({ refs: [{ id: "m1", threadId: "t1", folder: "inbox" }], nextPageToken: "p2", total: 2 });
    const second = await adapter.listSince(since, "p2");
    expect(second).toEqual({ refs: [{ id: "m2", threadId: "t2", folder: "inbox" }], nextPageToken: null, total: null });

    const params = stub.calls[0]?.url.searchParams;
    expect(params?.get("q")).toBe(`after:${since.getTime() / 1000} -in:sent -in:drafts -in:chats -in:trash`);
    expect(params?.get("includeSpamTrash")).toBe("true");
    expect(params?.get("maxResults")).toBe("500");
    expect(params?.has("pageToken")).toBe(false);
    expect(stub.calls[1]?.url.searchParams.get("pageToken")).toBe("p2");
  });

  it("collects added messages across history pages, skipping sent/draft/chat/trash", async () => {
    const stub = fetchStub([
      {
        match: `GET ${BASE}/history`,
        responses: [
          {
            body: {
              historyId: "105",
              nextPageToken: "h2",
              history: [
                { messagesAdded: [{ message: { id: "a", threadId: "ta", labelIds: ["INBOX", "UNREAD"] } }] },
                { messagesAdded: [{ message: { id: "s", threadId: "ts", labelIds: ["SENT"] } }] },
                { messagesAdded: [{ message: { id: "d", threadId: "td", labelIds: ["DRAFT"] } }] },
              ],
            },
          },
          {
            body: {
              historyId: "110",
              history: [
                { messagesAdded: [{ message: { id: "j", threadId: "tj", labelIds: ["SPAM"] } }] },
                { messagesAdded: [{ message: { id: "c", threadId: "tc", labelIds: ["CHAT"] } }] },
                { messagesAdded: [{ message: { id: "x", threadId: "tx", labelIds: ["TRASH", "INBOX"] } }] },
                { messagesAdded: [{ message: { id: "o", threadId: "to", labelIds: ["CATEGORY_UPDATES"] } }] },
              ],
            },
          },
        ],
      },
    ]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const page = await adapter.changesSince("100");
    expect(page).toEqual({
      refs: [
        { id: "a", threadId: "ta", folder: "inbox" },
        { id: "j", threadId: "tj", folder: "spam" },
        { id: "o", threadId: "to", folder: "other" },
      ],
      cursor: "110",
      more: false,
    });
    const first = stub.calls[0]?.url.searchParams;
    expect(first?.get("startHistoryId")).toBe("100");
    expect(first?.get("historyTypes")).toBe("messageAdded");
    expect(first?.get("maxResults")).toBe("500");
    expect(stub.calls[1]?.url.searchParams.get("pageToken")).toBe("h2");
    expect(stub.calls[1]?.url.searchParams.get("startHistoryId")).toBe("100");
  });

  it("hands back an intermediate cursor after 2000 refs and resumes from it", async () => {
    const bigPage = (from: number) => ({
      historyId: "999",
      nextPageToken: `after-${from}`,
      history: Array.from({ length: 500 }, (_, i) => ({
        messagesAdded: [{ message: { id: `m${from + i}`, threadId: "t", labelIds: ["INBOX"] } }],
      })),
    });
    const stub = fetchStub([
      {
        match: `GET ${BASE}/history`,
        responses: [...[0, 500, 1000, 1500].map((from) => ({ body: bigPage(from) })), { body: { historyId: "1000" } }],
      },
    ]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const page = await adapter.changesSince("50");
    expect(page.refs).toHaveLength(2000);
    expect(page.more).toBe(true);
    expect(page.cursor.length).toBeLessThanOrEqual(4000);
    expect(JSON.parse(page.cursor)).toEqual({ historyId: "50", pageToken: "after-1500" });

    const rest = await adapter.changesSince(page.cursor);
    expect(rest).toEqual({ refs: [], cursor: "1000", more: false });
    const resumed = stub.calls[4]?.url.searchParams;
    expect(resumed?.get("startHistoryId")).toBe("50");
    expect(resumed?.get("pageToken")).toBe("after-1500");
  });

  it("maps a 404 on history.list to MailCursorExpiredError", async () => {
    const stub = fetchStub([
      { match: `GET ${BASE}/history`, responses: [{ status: 404, body: { error: { code: 404, status: "NOT_FOUND" } } }] },
    ]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    await expect(adapter.changesSince("1")).rejects.toBeInstanceOf(MailCursorExpiredError);
  });

  it("refreshes the token once on 401, then gives up with MailAuthError", async () => {
    const tokens = stubTokens();
    const ok = fetchStub([
      {
        match: `GET ${BASE}/profile`,
        responses: [{ status: 401, body: { error: { status: "UNAUTHENTICATED" } } }, { body: { historyId: "5" } }],
      },
    ]);
    expect(await new GmailAdapter({ tokens, fetch: ok.fetch }).currentCursor()).toBe("5");
    expect(tokens.invalidations).toBe(1);
    expect(ok.calls.map((call) => call.headers.get("authorization"))).toEqual(["Bearer token-1", "Bearer token-2"]);

    const denied = fetchStub([{ match: `GET ${BASE}/profile`, responses: [{ status: 401, body: { error: { status: "UNAUTHENTICATED" } } }] }]);
    await expect(new GmailAdapter({ tokens: stubTokens(), fetch: denied.fetch }).currentCursor()).rejects.toBeInstanceOf(MailAuthError);
    expect(denied.calls).toHaveLength(2);
  });

  it("maps rate limits to MailTransientError with Retry-After", async () => {
    const limited = fetchStub([{ match: `GET ${BASE}/profile`, responses: [{ status: 429, headers: { "Retry-After": "30" }, body: {} }] }]);
    const error = await new GmailAdapter({ tokens: stubTokens(), fetch: limited.fetch }).currentCursor().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailTransientError);
    expect((error as MailTransientError).retryAfterSeconds).toBe(30);

    const quota = fetchStub([
      {
        match: `GET ${BASE}/profile`,
        responses: [{ status: 403, body: { error: { status: "PERMISSION_DENIED", errors: [{ reason: "userRateLimitExceeded" }] } } }],
      },
    ]);
    await expect(new GmailAdapter({ tokens: stubTokens(), fetch: quota.fetch }).currentCursor()).rejects.toBeInstanceOf(
      MailTransientError,
    );

    const down = fetchStub([{ match: `GET ${BASE}/profile`, responses: [{ status: 503, body: "oops" }] }]);
    const outage = await new GmailAdapter({ tokens: stubTokens(), fetch: down.fetch }).currentCursor().catch((e: unknown) => e);
    expect(outage).toBeInstanceOf(MailTransientError);
    expect((outage as MailTransientError).retryAfterSeconds).toBeNull();
  });

  it("maps network failures to MailTransientError and other 4xx to plain errors without bodies", async () => {
    const offline: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));
    await expect(new GmailAdapter({ tokens: stubTokens(), fetch: offline }).currentCursor()).rejects.toBeInstanceOf(
      MailTransientError,
    );

    const bad = fetchStub([
      {
        match: `GET ${BASE}/profile`,
        responses: [{ status: 400, body: { error: { status: "INVALID_ARGUMENT", message: "secret@example.com bad" } } }],
      },
    ]);
    const error = await new GmailAdapter({ tokens: stubTokens(), fetch: bad.fetch }).currentCursor().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MailTransientError);
    expect((error as Error).message).toBe("gmail 400 INVALID_ARGUMENT");
  });

  it("fetches raw sources with bounded concurrency, folders from labels, skipping 404s", async () => {
    let inFlight = 0;
    let peak = 0;
    const { fetch: base, calls } = fetchStub([
      {
        match: (request) => request.url.pathname.endsWith("/messages/gone"),
        responses: [{ status: 404, body: { error: { status: "NOT_FOUND" } } }],
      },
      {
        match: (request) => request.url.pathname.startsWith("/gmail/v1/users/me/messages/"),
        responses: [{ body: {} }],
      },
    ]);
    const fetch: typeof globalThis.fetch = async (input, init) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Yield a few microtasks so every worker gets its request in flight before any completes.
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      const url = new URL(String(input));
      const id = url.pathname.split("/").pop() ?? "";
      const response = await base(input, init);
      inFlight -= 1;
      if (response.status === 404) return response;
      const labelIds = id === "m0" ? ["SPAM"] : id === "m1" ? ["CATEGORY_SOCIAL"] : ["INBOX"];
      return Response.json({ id, threadId: `t-${id}`, labelIds, internalDate: "1767225600000", raw: b64url(`Subject: ${id}\r\n\r\nbody`) });
    };
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch });
    const refs = [...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, threadId: null, folder: "inbox" as const })), { id: "gone", threadId: null, folder: "inbox" as const }];
    const mails = await adapter.fetch(refs);
    expect(mails).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
    expect(mails[0]).toMatchObject({ id: "m0", threadId: "t-m0", folder: "spam", receivedAt: new Date("2026-01-01T00:00:00Z") });
    expect(mails[0]?.raw.toString()).toBe("Subject: m0\r\n\r\nbody");
    expect(mails[1]?.folder).toBe("other");
    expect(mails[2]?.folder).toBe("inbox");
    expect(calls[0]?.url.searchParams.get("format")).toBe("raw");
  });

  it("sends small messages through the JSON endpoint", async () => {
    const stub = fetchStub([{ match: `POST ${BASE}/messages/send`, responses: [{ body: { id: "sent-1", threadId: "thread-9" } }] }]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const sent = await adapter.send(
      outgoing({ replyTo: { providerMessageId: "orig", providerThreadId: "thread-9", rfc822MessageId: "<orig@x>", references: [] } }),
    );
    const body = JSON.parse(String(stub.calls[0]?.body)) as { raw: string; threadId: string };
    const mime = Buffer.from(body.raw, "base64url").toString();
    expect(body.threadId).toBe("thread-9");
    expect(mime).toContain("In-Reply-To: <orig@x>");
    expect(stub.calls[0]?.headers.get("content-type")).toContain("application/json");
    expect(sent.providerMessageId).toBe("sent-1");
    expect(sent.threadId).toBe("thread-9");
    expect(sent.rfc822MessageId).toMatch(/^<.+@example\.com>$/);
    expect(mime).toContain(`Message-ID: ${sent.rfc822MessageId}`);
  });

  it("sends large messages as a multipart upload", async () => {
    const stub = fetchStub([
      {
        match: "POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send",
        responses: [{ body: { id: "big-1", threadId: "thread-big" } }],
      },
    ]);
    const adapter = new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const content = Buffer.alloc(5 * 1024 * 1024, 7);
    const sent = await adapter.send(
      outgoing({ attachments: [{ fileName: "cv.pdf", contentType: "application/pdf", content }] }),
    );
    const call = stub.calls[0];
    expect(call?.url.searchParams.get("uploadType")).toBe("multipart");
    const boundary = /^multipart\/related; boundary=(.+)$/.exec(call?.headers.get("content-type") ?? "")?.[1];
    expect(boundary).toBeDefined();
    const text = Buffer.from(call?.body as Uint8Array).toString("latin1");
    const parts = text.split(`--${boundary}`);
    expect(parts).toHaveLength(4);
    expect(parts[1]).toBe('\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n');
    expect(parts[2]?.startsWith("\r\nContent-Type: message/rfc822\r\n\r\n")).toBe(true);
    expect(parts[2]).toContain(`Message-ID: ${sent.rfc822MessageId}`);
    expect(parts[3]).toBe("--\r\n");
    expect(sent).toMatchObject({ providerMessageId: "big-1", threadId: "thread-big" });
  });

  it("maps a 403 insufficient scope on send to MailScopeError(gmail.send)", async () => {
    const stub = fetchStub([
      {
        match: `POST ${BASE}/messages/send`,
        responses: [
          {
            status: 403,
            headers: { "WWW-Authenticate": 'Bearer realm="https://accounts.google.com/", error="insufficient_scope"' },
            body: { error: { status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] } },
          },
        ],
      },
    ]);
    const error = await new GmailAdapter({ tokens: stubTokens(), fetch: stub.fetch }).send(outgoing()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailScopeError);
    expect((error as MailScopeError).missingScope).toBe(GMAIL_SEND_SCOPE);
  });
});
