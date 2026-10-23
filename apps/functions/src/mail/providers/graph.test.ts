import { describe, expect, it } from "vitest";
import { fetchStub, stubTokens } from "./fetch-stub";
import { GRAPH_WRITE_SCOPE, GraphAdapter, UPLOAD_CHUNK_SIZE } from "./graph";
import { MailAuthError, MailCursorExpiredError, MailScopeError, MailTransientError, type OutgoingMail } from "./types";

const BASE = "https://graph.microsoft.com/v1.0/me";
const IMMUTABLE = 'IdType="ImmutableId"';

const outgoing = (extra: Partial<OutgoingMail> = {}): OutgoingMail => ({
  from: { name: "Ada", address: "ada@example.com" },
  to: [{ name: "Recruiter", address: "recruiter@example.org" }],
  cc: [{ name: null, address: "cc@example.org" }],
  subject: "Application",
  text: "Hello",
  attachments: [],
  replyTo: null,
  ...extra,
});

const deltaLink = (folder: string, token: string) => `${BASE}/mailFolders('${folder}')/messages/delta?$deltatoken=${token}`;

describe("GraphAdapter", () => {
  it("builds the current cursor from a created-only, recent-only delta per folder", async () => {
    const stub = fetchStub([
      {
        match: `GET ${BASE}/mailFolders/inbox/messages/delta`,
        responses: [{ body: { value: [{ id: "i1" }], "@odata.nextLink": `${BASE}/mailFolders/inbox/messages/delta?$skiptoken=s1` } }, { body: { value: [], "@odata.deltaLink": deltaLink("inbox", "d-in") } }],
      },
      {
        match: `GET ${BASE}/mailFolders/junkemail/messages/delta`,
        responses: [{ body: { value: [], "@odata.deltaLink": deltaLink("junk", "d-junk") } }],
      },
    ]);
    const before = Date.now();
    const cursor = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).currentCursor();
    expect(JSON.parse(cursor)).toEqual({ inbox: deltaLink("inbox", "d-in"), junkemail: deltaLink("junk", "d-junk") });

    const first = stub.calls.find((call) => call.url.pathname.endsWith("/inbox/messages/delta") && !call.url.search.includes("skiptoken"));
    expect(first?.url.searchParams.get("changeType")).toBe("created");
    expect(first?.url.searchParams.get("$select")).toBe("id,conversationId,receivedDateTime");
    const filter = /^receivedDateTime ge (.+)$/.exec(first?.url.searchParams.get("$filter") ?? "");
    const from = Date.parse(filter?.[1] ?? "");
    expect(from).toBeLessThanOrEqual(before);
    expect(from).toBeGreaterThan(before - 60 * 60 * 1000);
    expect(first?.headers.get("prefer")).toBe(`odata.maxpagesize=200, ${IMMUTABLE}`);
    expect(stub.calls.some((call) => call.url.searchParams.get("$skiptoken") === "s1")).toBe(true);
  });

  it("lists inbox then junk with a summed first-page total", async () => {
    const since = new Date("2026-09-01T00:00:00Z");
    const inboxNext = `${BASE}/mailFolders/inbox/messages?$skip=200`;
    const stub = fetchStub([
      {
        match: (request) => request.url.href === inboxNext,
        responses: [{ body: { value: [{ id: "i2", conversationId: "c2", receivedDateTime: "2026-09-02T00:00:00Z" }] } }],
      },
      {
        match: `GET ${BASE}/mailFolders/inbox/messages`,
        responses: [
          {
            body: {
              "@odata.count": 201,
              "@odata.nextLink": inboxNext,
              value: [{ id: "i1", conversationId: "c1", receivedDateTime: "2026-09-03T00:00:00Z" }],
            },
          },
        ],
      },
      {
        match: `GET ${BASE}/mailFolders/junkemail/messages`,
        responses: [
          { body: { "@odata.count": 4, value: [{ id: "j0", conversationId: "cj0", receivedDateTime: "2026-09-01T00:00:00Z" }] } },
          { body: { "@odata.count": 4, value: [{ id: "j1", conversationId: "cj1", receivedDateTime: "2026-09-01T00:00:00Z" }] } },
        ],
      },
    ]);
    const adapter = new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const first = await adapter.listSince(since, null);
    expect(first.refs).toEqual([{ id: "i1", threadId: "c1", folder: "inbox" }]);
    expect(first.total).toBe(205);
    expect(JSON.parse(first.nextPageToken ?? "")).toEqual({ folder: "inbox", nextLink: inboxNext });

    const inboxCall = stub.calls[0];
    expect(inboxCall?.url.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-09-01T00:00:00.000Z");
    expect(inboxCall?.url.searchParams.get("$orderby")).toBe("receivedDateTime desc");
    expect(inboxCall?.url.searchParams.get("$top")).toBe("200");
    expect(inboxCall?.url.searchParams.get("$count")).toBe("true");
    expect(inboxCall?.url.search).toContain("$filter=");
    expect(inboxCall?.headers.get("prefer")).toBe(IMMUTABLE);
    expect(stub.calls[1]?.url.searchParams.get("$top")).toBe("1");

    const second = await adapter.listSince(since, first.nextPageToken);
    expect(second.refs).toEqual([{ id: "i2", threadId: "c2", folder: "inbox" }]);
    expect(second.total).toBeNull();
    expect(JSON.parse(second.nextPageToken ?? "")).toEqual({ folder: "junkemail", nextLink: null });

    const third = await adapter.listSince(since, second.nextPageToken);
    expect(third).toEqual({ refs: [{ id: "j1", threadId: "cj1", folder: "spam" }], nextPageToken: null, total: null });
  });

  it("follows delta links per folder, skipping removals, and stops at 2000 refs", async () => {
    const page = (prefix: string, count: number, extra: Record<string, string>) => ({
      body: {
        value: Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, conversationId: "c", receivedDateTime: "2026-10-01T00:00:00Z" })),
        ...extra,
      },
    });
    const inboxNext = `${BASE}/mailFolders('inbox')/messages/delta?$skiptoken=n1`;
    const stub = fetchStub([
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "in-1",
        responses: [
          {
            body: {
              value: [{ id: "new", conversationId: "c-new", receivedDateTime: "2026-10-01T00:00:00Z" }, { id: "gone", "@removed": { reason: "deleted" } }],
              "@odata.deltaLink": deltaLink("inbox", "in-2"),
            },
          },
        ],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "junk-1",
        responses: [{ body: { value: [{ id: "spam1", conversationId: "c-s" }], "@odata.deltaLink": deltaLink("junkemail", "junk-2") } }],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "big",
        responses: [page("a", 1500, { "@odata.nextLink": `${BASE}/mailFolders('inbox')/messages/delta?$skiptoken=n0` })],
      },
      {
        match: (request) => request.url.searchParams.get("$skiptoken") === "n0",
        responses: [page("b", 600, { "@odata.nextLink": inboxNext })],
      },
    ]);
    const adapter = new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const page1 = await adapter.changesSince(JSON.stringify({ inbox: deltaLink("inbox", "in-1"), junkemail: deltaLink("junkemail", "junk-1") }));
    expect(page1).toEqual({
      refs: [
        { id: "new", threadId: "c-new", folder: "inbox" },
        { id: "spam1", threadId: "c-s", folder: "spam" },
      ],
      cursor: JSON.stringify({ inbox: deltaLink("inbox", "in-2"), junkemail: deltaLink("junkemail", "junk-2") }),
      more: false,
    });
    expect(stub.calls[0]?.headers.get("prefer")).toBe(`odata.maxpagesize=200, ${IMMUTABLE}`);

    const big = await adapter.changesSince(JSON.stringify({ inbox: deltaLink("inbox", "big"), junkemail: deltaLink("junkemail", "junk-1") }));
    expect(big.refs).toHaveLength(2100);
    expect(big.more).toBe(true);
    expect(JSON.parse(big.cursor)).toEqual({ inbox: inboxNext, junkemail: deltaLink("junkemail", "junk-1") });
  });

  it("maps expired delta state to MailCursorExpiredError", async () => {
    const cursor = JSON.stringify({ inbox: deltaLink("inbox", "x"), junkemail: deltaLink("junkemail", "y") });
    for (const response of [
      { status: 410, body: { error: { code: "SyncStateGone" } } },
      { status: 400, body: { error: { code: "syncStateNotFound" } } },
      { status: 400, body: { error: { code: "resyncRequired" } } },
    ]) {
      const stub = fetchStub([{ match: () => true, responses: [response] }]);
      await expect(new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).changesSince(cursor)).rejects.toBeInstanceOf(
        MailCursorExpiredError,
      );
    }
    await expect(new GraphAdapter({ tokens: stubTokens(), fetch: fetchStub([]).fetch }).changesSince("not json")).rejects.toBeInstanceOf(
      MailCursorExpiredError,
    );
  });

  it("fetches $value with listed metadata, falls back to a metadata GET, and skips 404s", async () => {
    const stub = fetchStub([
      { match: `GET ${BASE}/messages/gone/$value`, responses: [{ status: 404, body: { error: { code: "ErrorItemNotFound" } } }] },
      { match: `GET ${BASE}/messages/gone`, responses: [{ status: 404, body: { error: { code: "ErrorItemNotFound" } } }] },
      { match: `GET ${BASE}/messages/listed/$value`, responses: [{ body: "Subject: listed\r\n\r\nx" }] },
      { match: `GET ${BASE}/messages/unknown/$value`, responses: [{ body: "Subject: unknown\r\n\r\ny" }] },
      { match: `GET ${BASE}/messages/unknown`, responses: [{ body: { receivedDateTime: "2026-10-02T08:00:00Z" } }] },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "j0",
        responses: [{ body: { value: [{ id: "listed", conversationId: "c1", receivedDateTime: "2026-10-01T08:00:00Z" }], "@odata.deltaLink": deltaLink("junkemail", "j") } }],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "i0",
        responses: [{ body: { value: [], "@odata.deltaLink": deltaLink("inbox", "i") } }],
      },
    ]);
    const adapter = new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    // The delta round lists "listed" with its receivedDateTime, so fetch() needs no metadata GET.
    await adapter.changesSince(JSON.stringify({ inbox: deltaLink("inbox", "i0"), junkemail: deltaLink("junkemail", "j0") }));
    const before = stub.calls.length;
    const mails = await adapter.fetch([
      { id: "listed", threadId: "c1", folder: "spam" },
      { id: "unknown", threadId: "c2", folder: "inbox" },
      { id: "gone", threadId: null, folder: "inbox" },
    ]);
    expect(mails.map(({ raw, ...rest }) => ({ ...rest, raw: raw.toString() }))).toEqual([
      { id: "listed", threadId: "c1", folder: "spam", raw: "Subject: listed\r\n\r\nx", receivedAt: new Date("2026-10-01T08:00:00Z") },
      { id: "unknown", threadId: "c2", folder: "inbox", raw: "Subject: unknown\r\n\r\ny", receivedAt: new Date("2026-10-02T08:00:00Z") },
    ]);
    const fetchCalls = stub.calls.slice(before).map((call) => call.url.pathname + call.url.search);
    expect(fetchCalls).not.toContain("/v1.0/me/messages/listed?$select=receivedDateTime");
    expect(fetchCalls).toContain("/v1.0/me/messages/unknown?$select=receivedDateTime");
  });

  it("sends via draft, small and chunked large attachments, then send", async () => {
    const uploadUrl = "https://outlook.office.com/api/v2.0/Users('u')/Messages('draft-1')/AttachmentSessions('s')?authtoken=abc";
    const stub = fetchStub([
      { match: `POST ${BASE}/messages`, responses: [{ status: 201, body: { id: "draft-1" } }] },
      { match: `POST ${BASE}/messages/draft-1/attachments`, responses: [{ status: 201, body: { id: "att-1" } }] },
      {
        match: `POST ${BASE}/messages/draft-1/attachments/createUploadSession`,
        responses: [{ status: 201, body: { uploadUrl, expirationDateTime: "2026-10-24T12:00:00Z" } }],
      },
      {
        match: (request) => request.url.origin === "https://outlook.office.com",
        responses: [{ status: 200, body: { nextExpectedRanges: [] } }, { status: 200, body: { nextExpectedRanges: [] } }, { status: 201 }],
      },
      { match: `GET ${BASE}/messages/draft-1`, responses: [{ body: { internetMessageId: "<abc@outlook.com>", conversationId: "conv-1" } }] },
      { match: `POST ${BASE}/messages/draft-1/send`, responses: [{ status: 202 }] },
    ]);
    const large = Buffer.alloc(9 * 1024 * 1024, 1);
    const sent = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).send(
      outgoing({
        attachments: [
          { fileName: "small.txt", contentType: "text/plain", content: Buffer.from("tiny") },
          { fileName: "large.pdf", contentType: "application/pdf", content: large },
        ],
      }),
    );
    expect(sent).toEqual({ providerMessageId: "draft-1", threadId: "conv-1", rfc822MessageId: "<abc@outlook.com>" });

    const [draft, small, session, ...rest] = stub.calls;
    expect(JSON.parse(String(draft?.body))).toEqual({
      subject: "Application",
      body: { contentType: "Text", content: "Hello" },
      toRecipients: [{ emailAddress: { name: "Recruiter", address: "recruiter@example.org" } }],
      ccRecipients: [{ emailAddress: { address: "cc@example.org" } }],
    });
    expect(draft?.headers.get("prefer")).toBe(IMMUTABLE);
    expect(JSON.parse(String(small?.body))).toEqual({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "small.txt",
      contentType: "text/plain",
      contentBytes: Buffer.from("tiny").toString("base64"),
    });
    expect(JSON.parse(String(session?.body))).toEqual({
      AttachmentItem: { attachmentType: "file", name: "large.pdf", size: large.length, contentType: "application/pdf" },
    });

    const puts = rest.filter((call) => call.method === "PUT");
    expect(UPLOAD_CHUNK_SIZE % (320 * 1024)).toBe(0);
    expect(UPLOAD_CHUNK_SIZE).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(puts.map((call) => (call.body as Uint8Array).length)).toEqual([UPLOAD_CHUNK_SIZE, UPLOAD_CHUNK_SIZE, large.length - 2 * UPLOAD_CHUNK_SIZE]);
    expect(puts.map((call) => call.headers.get("content-range"))).toEqual([
      `bytes 0-${UPLOAD_CHUNK_SIZE - 1}/${large.length}`,
      `bytes ${UPLOAD_CHUNK_SIZE}-${2 * UPLOAD_CHUNK_SIZE - 1}/${large.length}`,
      `bytes ${2 * UPLOAD_CHUNK_SIZE}-${large.length - 1}/${large.length}`,
    ]);
    expect(puts.every((call) => call.url.href === uploadUrl && !call.headers.has("authorization"))).toBe(true);

    const meta = rest.find((call) => call.method === "GET");
    expect(meta?.url.searchParams.get("$select")).toBe("internetMessageId,conversationId");
    expect(stub.calls.at(-1)?.url.pathname).toBe("/v1.0/me/messages/draft-1/send");
    expect(stub.calls.filter((call) => call.url.hostname === "graph.microsoft.com").every((call) => call.headers.has("authorization"))).toBe(true);
  });

  it("drafts replies with createReply and replaces body and recipients", async () => {
    const stub = fetchStub([
      { match: `POST ${BASE}/messages/orig-1/createReply`, responses: [{ status: 201, body: { id: "reply-1" } }] },
      { match: `PATCH ${BASE}/messages/reply-1`, responses: [{ body: { id: "reply-1" } }] },
      { match: `GET ${BASE}/messages/reply-1`, responses: [{ body: { internetMessageId: "<r@x>", conversationId: "conv-o" } }] },
      { match: `POST ${BASE}/messages/reply-1/send`, responses: [{ status: 202 }] },
    ]);
    const sent = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).send(
      outgoing({ subject: "Re: Application", replyTo: { providerMessageId: "orig-1", providerThreadId: "conv-o", rfc822MessageId: "<o@x>", references: [] } }),
    );
    expect(sent).toEqual({ providerMessageId: "reply-1", threadId: "conv-o", rfc822MessageId: "<r@x>" });
    expect(stub.calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "POST /v1.0/me/messages/orig-1/createReply",
      "PATCH /v1.0/me/messages/reply-1",
      "GET /v1.0/me/messages/reply-1",
      "POST /v1.0/me/messages/reply-1/send",
    ]);
    expect(JSON.parse(String(stub.calls[1]?.body))).toMatchObject({ subject: "Re: Application", body: { contentType: "Text", content: "Hello" } });
  });

  it("retries once on 401, maps throttling and missing write scope", async () => {
    const tokens = stubTokens();
    const retry = fetchStub([
      {
        match: `GET ${BASE}/mailFolders/inbox/messages`,
        responses: [{ status: 401, body: { error: { code: "InvalidAuthenticationToken" } } }, { body: { value: [] } }],
      },
      { match: `GET ${BASE}/mailFolders/junkemail/messages`, responses: [{ body: { value: [] } }] },
    ]);
    await new GraphAdapter({ tokens, fetch: retry.fetch }).listSince(new Date(), null);
    expect(tokens.invalidations).toBe(1);

    const unauthorized = fetchStub([{ match: () => true, responses: [{ status: 401, body: { error: { code: "InvalidAuthenticationToken" } } }] }]);
    await expect(new GraphAdapter({ tokens: stubTokens(), fetch: unauthorized.fetch }).fetch([{ id: "m", threadId: null, folder: "inbox" }])).rejects.toBeInstanceOf(
      MailAuthError,
    );

    const throttled = fetchStub([{ match: () => true, responses: [{ status: 429, headers: { "Retry-After": "12" }, body: { error: { code: "ApplicationThrottled" } } }] }]);
    const error = await new GraphAdapter({ tokens: stubTokens(), fetch: throttled.fetch }).currentCursor().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailTransientError);
    expect((error as MailTransientError).retryAfterSeconds).toBe(12);

    const denied = fetchStub([{ match: `POST ${BASE}/messages`, responses: [{ status: 403, body: { error: { code: "ErrorAccessDenied" } } }] }]);
    const scope = await new GraphAdapter({ tokens: stubTokens(), fetch: denied.fetch }).send(outgoing()).catch((e: unknown) => e);
    expect(scope).toBeInstanceOf(MailScopeError);
    expect((scope as MailScopeError).missingScope).toBe(GRAPH_WRITE_SCOPE);
  });
});
