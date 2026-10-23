// Gmail API adapter (plain REST, no googleapis SDK).
import { randomUUID } from "node:crypto";
import type { MailFolder } from "@bfhr/core";
import { composeMime } from "./mime";
import { z } from "zod";
import { mapConcurrent, query, RestClient, type RestErrorDialect } from "./rest";
import {
  type AccessTokenSource,
  type ChangesPage,
  type Fetch,
  type FetchedMail,
  MailCursorExpiredError,
  type MailProviderAdapter,
  type MessageRef,
  type OutgoingMail,
  type RefPage,
  type SentMail,
} from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const UPLOAD_BASE = "https://gmail.googleapis.com/upload/gmail/v1/users/me";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const PAGE_SIZE = 500;
/** Refs gathered by one `changesSince` call before it hands back an intermediate cursor. */
const CHANGES_LIMIT = 2000;
const FETCH_CONCURRENCY = 8;
/**
 * Largest base64url `raw` sent through the JSON endpoint. Bigger messages go through the upload
 * endpoint (multipart, up to 35 MB), which has no request-body limit of the metadata endpoint.
 */
const JSON_SEND_LIMIT = 4 * 1024 * 1024;
/** Labels whose messages are never job mail we receive. */
const SKIPPED_LABELS: Record<string, true> = { SENT: true, DRAFT: true, CHAT: true, TRASH: true };

// Error format and reasons: https://developers.google.com/workspace/gmail/api/guides/handle-errors
const GmailErrorBody = z.object({
  error: z.object({
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});
export const gmailErrorDialect: RestErrorDialect = {
  code(body) {
    const parsed = GmailErrorBody.safeParse(body);
    if (!parsed.success) return null;
    const { error } = parsed.data;
    return error.errors?.[0]?.reason ?? error.status ?? null;
  },
  insufficientScope(_status, code, headers) {
    return (
      code === "insufficientPermissions" ||
      code === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
      (headers.get("www-authenticate") ?? "").includes("insufficient_scope")
    );
  },
  rateLimited(status, code) {
    return status === 403 && (code === "rateLimitExceeded" || code === "userRateLimitExceeded");
  },
};

export function gmailFolder(labelIds: readonly string[] | undefined): MailFolder {
  if (labelIds?.includes("SPAM")) return "spam";
  if (labelIds?.includes("INBOX")) return "inbox";
  return "other";
}

interface GmailMessageStub {
  id: string;
  threadId?: string;
  labelIds?: string[];
}

interface HistoryCursor {
  historyId: string;
  pageToken: string;
}

/** Cursor = bare historyId, or JSON `{ historyId, pageToken }` mid-way through a history listing. */
function parseCursor(cursor: string): { historyId: string; pageToken: string | null } {
  if (!cursor.startsWith("{")) return { historyId: cursor, pageToken: null };
  const parsed = JSON.parse(cursor) as HistoryCursor;
  return { historyId: parsed.historyId, pageToken: parsed.pageToken };
}

export class GmailAdapter implements MailProviderAdapter {
  readonly #client: RestClient;

  constructor(options: { tokens: AccessTokenSource; fetch?: Fetch }) {
    this.#client = new RestClient({
      tokens: options.tokens,
      fetch: options.fetch ?? globalThis.fetch,
      label: "gmail",
      dialect: gmailErrorDialect,
    });
  }

  // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
  async currentCursor(): Promise<string> {
    const profile = await this.#client.json<{ historyId: string }>(`${BASE}/profile`, {
      scope: GMAIL_READ_SCOPE,
    });
    return profile.historyId;
  }

  // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
  // (search operators: https://support.google.com/mail/answer/7190 — `after:` takes epoch seconds)
  async listSince(since: Date, pageToken: string | null): Promise<RefPage> {
    const q = `after:${Math.floor(since.getTime() / 1000)} -in:sent -in:drafts -in:chats -in:trash`;
    const url = `${BASE}/messages${query({ q, includeSpamTrash: true, maxResults: PAGE_SIZE, pageToken })}`;
    const page = await this.#client.json<{
      messages?: GmailMessageStub[];
      nextPageToken?: string;
      resultSizeEstimate?: number;
    }>(url, { scope: GMAIL_READ_SCOPE });
    return {
      // messages.list returns ids only: the folder is provisional and corrected by fetch().
      refs: (page.messages ?? []).map((message) => ({
        id: message.id,
        threadId: message.threadId ?? null,
        folder: "inbox",
      })),
      nextPageToken: page.nextPageToken ?? null,
      total: pageToken === null ? (page.resultSizeEstimate ?? null) : null,
    };
  }

  // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
  // https://developers.google.com/workspace/gmail/api/guides/sync (404 → full sync)
  async changesSince(cursor: string): Promise<ChangesPage> {
    const { historyId, pageToken: startToken } = parseCursor(cursor);
    const refs = new Map<string, MessageRef>();
    let pageToken = startToken;
    for (;;) {
      const url = `${BASE}/history${query({
        startHistoryId: historyId,
        historyTypes: "messageAdded",
        maxResults: PAGE_SIZE,
        pageToken,
      })}`;
      const page = await this.#client.json<{
        history?: { messagesAdded?: { message: GmailMessageStub }[] }[];
        nextPageToken?: string;
        historyId: string;
      }>(url, {
        scope: GMAIL_READ_SCOPE,
        mapError: (status) => (status === 404 ? new MailCursorExpiredError("gmail historyId expired") : null),
      });
      for (const record of page.history ?? []) {
        for (const { message } of record.messagesAdded ?? []) {
          if (message.labelIds?.some((label) => SKIPPED_LABELS[label] === true)) continue;
          refs.set(message.id, {
            id: message.id,
            threadId: message.threadId ?? null,
            folder: gmailFolder(message.labelIds),
          });
        }
      }
      if (page.nextPageToken === undefined)
        return { refs: [...refs.values()], cursor: page.historyId, more: false };
      pageToken = page.nextPageToken;
      if (refs.size >= CHANGES_LIMIT) {
        const next: HistoryCursor = { historyId, pageToken };
        return { refs: [...refs.values()], cursor: JSON.stringify(next), more: true };
      }
    }
  }

  // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
  // (no batch endpoint for raw sources; format=raw returns base64url RFC 822)
  async fetch(refs: readonly MessageRef[]): Promise<FetchedMail[]> {
    const fetched = await mapConcurrent(refs, FETCH_CONCURRENCY, async (ref): Promise<FetchedMail | null> => {
      const response = await this.#client.request(
        `${BASE}/messages/${encodeURIComponent(ref.id)}${query({ format: "raw" })}`,
        {
          scope: GMAIL_READ_SCOPE,
          pass: [404],
        },
      );
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      const message = (await response.json()) as {
        id: string;
        threadId?: string;
        labelIds?: string[];
        internalDate: string;
        raw: string;
      };
      return {
        id: message.id,
        threadId: message.threadId ?? ref.threadId,
        folder: gmailFolder(message.labelIds),
        raw: Buffer.from(message.raw, "base64url"),
        receivedAt: new Date(Number(message.internalDate)),
      };
    });
    return fetched.filter((mail): mail is FetchedMail => mail !== null);
  }

  // https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
  // https://developers.google.com/workspace/gmail/api/guides/uploads (multipart upload)
  // Gmail files the sent message in Sent itself.
  async send(message: OutgoingMail): Promise<SentMail> {
    const { raw, messageId } = await composeMime(message);
    const threadId = message.replyTo?.providerThreadId ?? null;
    const encoded = raw.toString("base64url");
    const request =
      encoded.length <= JSON_SEND_LIMIT
        ? {
            url: `${BASE}/messages/send`,
            contentType: "application/json; charset=UTF-8",
            body: JSON.stringify(threadId === null ? { raw: encoded } : { raw: encoded, threadId }),
          }
        : multipartSend(raw, threadId);
    const sent = await this.#client.json<{ id: string; threadId?: string }>(request.url, {
      method: "POST",
      headers: { "Content-Type": request.contentType },
      body: request.body,
      scope: GMAIL_SEND_SCOPE,
    });
    return { providerMessageId: sent.id, threadId: sent.threadId ?? threadId, rfc822MessageId: messageId };
  }

  async close(): Promise<void> {}
}

/** `multipart/related` upload: JSON metadata part, then the RFC 822 source as `message/rfc822`. */
function multipartSend(raw: Buffer, threadId: string | null) {
  const boundary = `bfhr-${randomUUID()}`;
  const metadata = JSON.stringify(threadId === null ? {} : { threadId });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: message/rfc822\r\n\r\n`,
    ),
    raw,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    url: `${UPLOAD_BASE}/messages/send${query({ uploadType: "multipart" })}`,
    contentType: `multipart/related; boundary=${boundary}`,
    body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
  };
}
