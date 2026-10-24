import { describe, expect, it } from "vitest";
import { fetchStub, stubTokens } from "./fetch-stub";
import { MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES, MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES } from "@bfhr/core";
import { GRAPH_SEND_SCOPE, GraphAdapter, graphSendOverLimit } from "./graph";
import {
  MailAuthError,
  MailCursorExpiredError,
  MailScopeError,
  MailTooLargeError,
  MailTransientError,
  type OutgoingMail,
} from "./types";

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

const deltaLink = (folder: string, token: string) =>
  `${BASE}/mailFolders('${folder}')/messages/delta?$deltatoken=${token}`;

describe("GraphAdapter", () => {
  it("builds the current cursor from a created-only, recent-only delta per folder", async () => {
    const stub = fetchStub([
      {
        match: `GET ${BASE}/mailFolders/inbox/messages/delta`,
        responses: [
          {
            body: {
              value: [{ id: "i1" }],
              "@odata.nextLink": `${BASE}/mailFolders/inbox/messages/delta?$skiptoken=s1`,
            },
          },
          { body: { value: [], "@odata.deltaLink": deltaLink("inbox", "d-in") } },
        ],
      },
      {
        match: `GET ${BASE}/mailFolders/junkemail/messages/delta`,
        responses: [{ body: { value: [], "@odata.deltaLink": deltaLink("junk", "d-junk") } }],
      },
    ]);
    const before = Date.now();
    const cursor = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).currentCursor();
    expect(JSON.parse(cursor)).toEqual({
      inbox: deltaLink("inbox", "d-in"),
      junkemail: deltaLink("junk", "d-junk"),
    });

    const first = stub.calls.find(
      (call) => call.url.pathname.endsWith("/inbox/messages/delta") && !call.url.search.includes("skiptoken"),
    );
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
        responses: [
          { body: { value: [{ id: "i2", conversationId: "c2", receivedDateTime: "2026-09-02T00:00:00Z" }] } },
        ],
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
          {
            body: {
              "@odata.count": 4,
              value: [{ id: "j0", conversationId: "cj0", receivedDateTime: "2026-09-01T00:00:00Z" }],
            },
          },
          {
            body: {
              "@odata.count": 4,
              value: [{ id: "j1", conversationId: "cj1", receivedDateTime: "2026-09-01T00:00:00Z" }],
            },
          },
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
    expect(third).toEqual({
      refs: [{ id: "j1", threadId: "cj1", folder: "spam" }],
      nextPageToken: null,
      total: null,
    });
  });

  it("follows delta links per folder, skipping removals, and stops at 2000 refs", async () => {
    const page = (prefix: string, count: number, extra: Record<string, string>) => ({
      body: {
        value: Array.from({ length: count }, (_, i) => ({
          id: `${prefix}${i}`,
          conversationId: "c",
          receivedDateTime: "2026-10-01T00:00:00Z",
        })),
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
              value: [
                { id: "new", conversationId: "c-new", receivedDateTime: "2026-10-01T00:00:00Z" },
                { id: "gone", "@removed": { reason: "deleted" } },
              ],
              "@odata.deltaLink": deltaLink("inbox", "in-2"),
            },
          },
        ],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "junk-1",
        responses: [
          {
            body: {
              value: [{ id: "spam1", conversationId: "c-s" }],
              "@odata.deltaLink": deltaLink("junkemail", "junk-2"),
            },
          },
        ],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "big",
        responses: [
          page("a", 1500, { "@odata.nextLink": `${BASE}/mailFolders('inbox')/messages/delta?$skiptoken=n0` }),
        ],
      },
      {
        match: (request) => request.url.searchParams.get("$skiptoken") === "n0",
        responses: [page("b", 600, { "@odata.nextLink": inboxNext })],
      },
    ]);
    const adapter = new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    const page1 = await adapter.changesSince(
      JSON.stringify({ inbox: deltaLink("inbox", "in-1"), junkemail: deltaLink("junkemail", "junk-1") }),
    );
    expect(page1).toEqual({
      refs: [
        { id: "new", threadId: "c-new", folder: "inbox" },
        { id: "spam1", threadId: "c-s", folder: "spam" },
      ],
      cursor: JSON.stringify({
        inbox: deltaLink("inbox", "in-2"),
        junkemail: deltaLink("junkemail", "junk-2"),
      }),
      more: false,
    });
    expect(stub.calls[0]?.headers.get("prefer")).toBe(`odata.maxpagesize=200, ${IMMUTABLE}`);

    const big = await adapter.changesSince(
      JSON.stringify({ inbox: deltaLink("inbox", "big"), junkemail: deltaLink("junkemail", "junk-1") }),
    );
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
      await expect(
        new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).changesSince(cursor),
      ).rejects.toBeInstanceOf(MailCursorExpiredError);
    }
    await expect(
      new GraphAdapter({ tokens: stubTokens(), fetch: fetchStub([]).fetch }).changesSince("not json"),
    ).rejects.toBeInstanceOf(MailCursorExpiredError);
  });

  it("fetches $value with listed metadata, falls back to a metadata GET, and skips 404s", async () => {
    const stub = fetchStub([
      {
        match: `GET ${BASE}/messages/gone/$value`,
        responses: [{ status: 404, body: { error: { code: "ErrorItemNotFound" } } }],
      },
      {
        match: `GET ${BASE}/messages/gone`,
        responses: [{ status: 404, body: { error: { code: "ErrorItemNotFound" } } }],
      },
      { match: `GET ${BASE}/messages/listed/$value`, responses: [{ body: "Subject: listed\r\n\r\nx" }] },
      { match: `GET ${BASE}/messages/unknown/$value`, responses: [{ body: "Subject: unknown\r\n\r\ny" }] },
      {
        match: `GET ${BASE}/messages/unknown`,
        responses: [{ body: { receivedDateTime: "2026-10-02T08:00:00Z" } }],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "j0",
        responses: [
          {
            body: {
              value: [{ id: "listed", conversationId: "c1", receivedDateTime: "2026-10-01T08:00:00Z" }],
              "@odata.deltaLink": deltaLink("junkemail", "j"),
            },
          },
        ],
      },
      {
        match: (request) => request.url.searchParams.get("$deltatoken") === "i0",
        responses: [{ body: { value: [], "@odata.deltaLink": deltaLink("inbox", "i") } }],
      },
    ]);
    const adapter = new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch });
    // The delta round lists "listed" with its receivedDateTime, so fetch() needs no metadata GET.
    await adapter.changesSince(
      JSON.stringify({ inbox: deltaLink("inbox", "i0"), junkemail: deltaLink("junkemail", "j0") }),
    );
    const before = stub.calls.length;
    const mails = await adapter.fetch([
      { id: "listed", threadId: "c1", folder: "spam" },
      { id: "unknown", threadId: "c2", folder: "inbox" },
      { id: "gone", threadId: null, folder: "inbox" },
    ]);
    expect(mails.map(({ raw, ...rest }) => ({ ...rest, raw: raw.toString() }))).toEqual([
      {
        id: "listed",
        threadId: "c1",
        folder: "spam",
        raw: "Subject: listed\r\n\r\nx",
        receivedAt: new Date("2026-10-01T08:00:00Z"),
      },
      {
        id: "unknown",
        threadId: "c2",
        folder: "inbox",
        raw: "Subject: unknown\r\n\r\ny",
        receivedAt: new Date("2026-10-02T08:00:00Z"),
      },
    ]);
    const fetchCalls = stub.calls.slice(before).map((call) => call.url.pathname + call.url.search);
    expect(fetchCalls).not.toContain("/v1.0/me/messages/listed?$select=receivedDateTime");
    expect(fetchCalls).toContain("/v1.0/me/messages/unknown?$select=receivedDateTime");
  });

  it("sends new mail in one sendMail request with inline base64 attachments and our Message-ID", async () => {
    const stub = fetchStub([{ match: `POST ${BASE}/sendMail`, responses: [{ status: 202 }] }]);
    const pdf = Buffer.from("%PDF-1.7 cv");
    const sent = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).send(
      outgoing({
        attachments: [
          { fileName: "cv.pdf", contentType: "application/pdf", content: pdf },
          { fileName: "note.txt", contentType: "text/plain", content: Buffer.from("tiny") },
        ],
      }),
    );
    expect(sent.rfc822MessageId).toMatch(/^<[0-9a-f-]{36}@example\.com>$/);
    expect(sent).toEqual({
      providerMessageId: sent.rfc822MessageId,
      threadId: null,
      rfc822MessageId: sent.rfc822MessageId,
    });

    expect(stub.calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "POST /v1.0/me/sendMail",
    ]);
    const [call] = stub.calls;
    expect(call?.headers.get("content-type")).toBe("application/json");
    expect(call?.headers.has("authorization")).toBe(true);
    expect(JSON.parse(String(call?.body))).toEqual({
      message: {
        subject: "Application",
        body: { contentType: "Text", content: "Hello" },
        toRecipients: [{ emailAddress: { name: "Recruiter", address: "recruiter@example.org" } }],
        ccRecipients: [{ emailAddress: { address: "cc@example.org" } }],
        attachments: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: "cv.pdf",
            contentType: "application/pdf",
            contentBytes: pdf.toString("base64"),
          },
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: "note.txt",
            contentType: "text/plain",
            contentBytes: Buffer.from("tiny").toString("base64"),
          },
        ],
        singleValueExtendedProperties: [{ id: "String 0x1035", value: sent.rfc822MessageId }],
      },
      saveToSentItems: true,
    });
  });

  it("sends follow-ups with reply on the original message, so Exchange threads them", async () => {
    const stub = fetchStub([{ match: `POST ${BASE}/messages/orig-1/reply`, responses: [{ status: 202 }] }]);
    const sent = await new GraphAdapter({ tokens: stubTokens(), fetch: stub.fetch }).send(
      outgoing({
        subject: "Re: Application",
        replyTo: {
          providerMessageId: "orig-1",
          providerThreadId: "conv-o",
          rfc822MessageId: "<o@x>",
          references: [],
        },
      }),
    );
    expect(sent).toEqual({
      providerMessageId: sent.rfc822MessageId,
      threadId: "conv-o",
      rfc822MessageId: expect.stringMatching(/^<.+@example\.com>$/) as string,
    });
    expect(stub.calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "POST /v1.0/me/messages/orig-1/reply",
    ]);
    expect(stub.calls[0]?.headers.get("prefer")).toBe(IMMUTABLE);
    // `reply` always files the sent copy; `saveToSentItems` belongs to sendMail only.
    expect(JSON.parse(String(stub.calls[0]?.body))).toEqual({
      message: {
        subject: "Re: Application",
        body: { contentType: "Text", content: "Hello" },
        toRecipients: [{ emailAddress: { name: "Recruiter", address: "recruiter@example.org" } }],
        ccRecipients: [{ emailAddress: { address: "cc@example.org" } }],
        singleValueExtendedProperties: [{ id: "String 0x1035", value: sent.rfc822MessageId }],
      },
    });
  });

  it("refuses a request over Graph's limit before calling Graph, sized exactly from file sizes", async () => {
    const pdf = (size: number) => ({
      fileName: "cv.pdf",
      contentType: "application/pdf",
      content: Buffer.alloc(size, 7),
    });
    // The request with a 3-byte file (4 base64 characters), as sent.
    const probe = fetchStub([{ match: `POST ${BASE}/sendMail`, responses: [{ status: 202 }] }]);
    await new GraphAdapter({ tokens: stubTokens(), fetch: probe.fetch }).send(
      outgoing({ attachments: [pdf(3)] }),
    );
    const withoutContent = Buffer.byteLength(String(probe.calls[0]?.body)) - 4;
    // The largest file that fits: every 3 more bytes add 4 to the request.
    const fits = 3 * Math.floor((MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES - withoutContent) / 4);
    const sizes = (size: number) => ({
      ...outgoing(),
      attachments: [{ fileName: "cv.pdf", contentType: "application/pdf", sizeBytes: size }],
    });
    expect(graphSendOverLimit(sizes(fits))).toBeNull();
    expect(graphSendOverLimit(sizes(fits + 1))).toBe(
      Math.min(fits, MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES),
    );
    expect(graphSendOverLimit(sizes(5_000_000))).toBe(MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES);

    const atLimit = fetchStub([{ match: `POST ${BASE}/sendMail`, responses: [{ status: 202 }] }]);
    await new GraphAdapter({ tokens: stubTokens(), fetch: atLimit.fetch }).send(
      outgoing({ attachments: [pdf(fits)] }),
    );
    expect(Buffer.byteLength(String(atLimit.calls[0]?.body))).toBe(withoutContent + (4 * fits) / 3);
    expect(Buffer.byteLength(String(atLimit.calls[0]?.body))).toBeLessThanOrEqual(
      MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES,
    );

    const over = fetchStub([{ match: () => true, responses: [{ status: 202 }] }]);
    const refused = await new GraphAdapter({ tokens: stubTokens(), fetch: over.fetch })
      .send(outgoing({ attachments: [pdf(fits + 1)] }))
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(MailTooLargeError);
    expect((refused as MailTooLargeError).limitBytes).toBe(
      Math.min(fits, MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES),
    );
    expect(over.calls).toHaveLength(0);
  });

  it("retries once on 401, maps throttling and missing send scope", async () => {
    const tokens = stubTokens();
    const retry = fetchStub([
      {
        match: `GET ${BASE}/mailFolders/inbox/messages`,
        responses: [
          { status: 401, body: { error: { code: "InvalidAuthenticationToken" } } },
          { body: { value: [] } },
        ],
      },
      { match: `GET ${BASE}/mailFolders/junkemail/messages`, responses: [{ body: { value: [] } }] },
    ]);
    await new GraphAdapter({ tokens, fetch: retry.fetch }).listSince(new Date(), null);
    expect(tokens.invalidations).toBe(1);

    const unauthorized = fetchStub([
      {
        match: () => true,
        responses: [{ status: 401, body: { error: { code: "InvalidAuthenticationToken" } } }],
      },
    ]);
    await expect(
      new GraphAdapter({ tokens: stubTokens(), fetch: unauthorized.fetch }).fetch([
        { id: "m", threadId: null, folder: "inbox" },
      ]),
    ).rejects.toBeInstanceOf(MailAuthError);

    const throttled = fetchStub([
      {
        match: () => true,
        responses: [
          {
            status: 429,
            headers: { "Retry-After": "12" },
            body: { error: { code: "ApplicationThrottled" } },
          },
        ],
      },
    ]);
    const error = await new GraphAdapter({ tokens: stubTokens(), fetch: throttled.fetch })
      .currentCursor()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailTransientError);
    expect((error as MailTransientError).retryAfterSeconds).toBe(12);

    const denied = fetchStub([
      {
        match: `POST ${BASE}/sendMail`,
        responses: [{ status: 403, body: { error: { code: "ErrorAccessDenied" } } }],
      },
    ]);
    const scope = await new GraphAdapter({ tokens: stubTokens(), fetch: denied.fetch })
      .send(outgoing())
      .catch((e: unknown) => e);
    expect(scope).toBeInstanceOf(MailScopeError);
    expect((scope as MailScopeError).missingScope).toBe(GRAPH_SEND_SCOPE);
  });
});
