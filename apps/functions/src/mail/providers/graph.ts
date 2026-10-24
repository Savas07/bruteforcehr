// Microsoft Graph mail adapter (plain REST, no Graph SDK).
import type { MailAddress, MailFolder } from "@bfhr/core";
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
  type OutgoingAttachment,
  type OutgoingMail,
  type RefPage,
  type SentMail,
} from "./types";

const BASE = "https://graph.microsoft.com/v1.0/me";
export const GRAPH_READ_SCOPE = "https://graph.microsoft.com/Mail.Read";
export const GRAPH_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";
/** Drafts, replies and attachments need write access to the mailbox (Mail.Send only sends). */
export const GRAPH_WRITE_SCOPE = "https://graph.microsoft.com/Mail.ReadWrite";

/** Well-known folder names we sync, in listing order. */
const FOLDERS = ["inbox", "junkemail"] as const;
type GraphFolder = (typeof FOLDERS)[number];
const FOLDER_KIND: Record<GraphFolder, MailFolder> = { inbox: "inbox", junkemail: "spam" };

const PAGE_SIZE = 200;
const CHANGES_LIMIT = 2000;
const FETCH_CONCURRENCY = 8;
/** Attachments at or above this size go through an upload session (the POST must stay < 4 MB). */
const SMALL_ATTACHMENT_LIMIT = 3_000_000;
/** Upload-session chunk: a multiple of 320 KiB and at most 4 MiB (12 × 320 KiB). */
export const UPLOAD_CHUNK_SIZE = 12 * 320 * 1024;
/**
 * The "now" cursor's delta query only tracks mail received after (now − skew); the lookback scan
 * covers everything before, and the overlap is deduped on refs.
 */
const CURSOR_SKEW_MS = 15 * 60 * 1000;
const MESSAGE_FIELDS = "id,conversationId,receivedDateTime";

// Immutable ids survive moves between folders and keep a sent draft's id valid in Sent Items:
// https://learn.microsoft.com/graph/outlook-immutable-id
const IMMUTABLE_ID = 'IdType="ImmutableId"';

// Error format: https://learn.microsoft.com/graph/errors
const GraphErrorBody = z.object({ error: z.object({ code: z.string() }) });
export const graphErrorDialect: RestErrorDialect = {
  code(body) {
    const parsed = GraphErrorBody.safeParse(body);
    return parsed.success ? parsed.data.error.code : null;
  },
  insufficientScope(_status, code) {
    return code === "ErrorAccessDenied" || code === "AccessDenied" || code === "Authorization_RequestDenied";
  },
  rateLimited() {
    return false;
  },
};

interface GraphMessageStub {
  id: string;
  conversationId?: string;
  receivedDateTime?: string;
  "@removed"?: unknown;
}

interface GraphPage {
  value: GraphMessageStub[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
  "@odata.count"?: number;
}

/** Lookback listing position: the folder being listed and its next page (null = first page). */
interface ListToken {
  folder: GraphFolder;
  nextLink: string | null;
}

/** Per-folder delta position: a deltaLink, or a nextLink while a round is unfinished. */
type DeltaCursor = Record<GraphFolder, string>;

// Delta query: https://learn.microsoft.com/graph/api/message-delta and
// https://learn.microsoft.com/graph/delta-query-overview (410 Gone / syncStateNotFound → full resync)
const expiredDelta = (status: number, code: string | null) =>
  status === 410 || code === "syncStateNotFound" || code === "resyncRequired"
    ? new MailCursorExpiredError("graph delta token expired")
    : null;

function parseDeltaCursor(cursor: string): DeltaCursor {
  try {
    const parsed = JSON.parse(cursor) as Partial<DeltaCursor>;
    if (typeof parsed.inbox === "string" && typeof parsed.junkemail === "string") {
      return { inbox: parsed.inbox, junkemail: parsed.junkemail };
    }
  } catch {
    // fall through
  }
  throw new MailCursorExpiredError("graph cursor unreadable");
}

function recipients(addresses: readonly MailAddress[]) {
  return addresses.map(({ name, address }) => ({
    emailAddress: name === null ? { address } : { name, address },
  }));
}

export class GraphAdapter implements MailProviderAdapter {
  readonly #client: RestClient;
  /** receivedDateTime of refs listed by this adapter, so fetch() only downloads `$value`. */
  readonly #receivedAt = new Map<string, Date>();

  constructor(options: { tokens: AccessTokenSource; fetch?: Fetch }) {
    this.#client = new RestClient({
      tokens: options.tokens,
      fetch: options.fetch ?? globalThis.fetch,
      label: "graph",
      dialect: graphErrorDialect,
    });
  }

  // Delta `$filter` supports only `receivedDateTime ge|gt`, `$select` and `changeType=created`
  // are kept in the deltaLink: https://learn.microsoft.com/graph/api/message-delta
  // (`$deltatoken=latest` exists for Entra resources only, so we filter to "recent" instead of
  // paging through the whole folder.)
  async currentCursor(): Promise<string> {
    const from = new Date(Date.now() - CURSOR_SKEW_MS).toISOString();
    const links = await Promise.all(
      FOLDERS.map(async (folder) => {
        let url = `${BASE}/mailFolders/${folder}/messages/delta${query({
          changeType: "created",
          $select: MESSAGE_FIELDS,
          $filter: `receivedDateTime ge ${from}`,
        })}`;
        for (;;) {
          const page = await this.#delta(url);
          if (page["@odata.deltaLink"] !== undefined) return page["@odata.deltaLink"];
          url = this.#nextLink(page);
        }
      }),
    );
    const cursor: DeltaCursor = { inbox: links[0] as string, junkemail: links[1] as string };
    return JSON.stringify(cursor);
  }

  // https://learn.microsoft.com/graph/api/mailfolder-list-messages ($filter + $orderby on the
  // same property, $count: https://learn.microsoft.com/graph/query-parameters)
  async listSince(since: Date, pageToken: string | null): Promise<RefPage> {
    const token: ListToken =
      pageToken === null ? { folder: "inbox", nextLink: null } : (JSON.parse(pageToken) as ListToken);
    const firstPageUrl = (folder: GraphFolder, top: number) =>
      `${BASE}/mailFolders/${folder}/messages${query({
        $filter: `receivedDateTime ge ${since.toISOString()}`,
        $select: MESSAGE_FIELDS,
        $orderby: "receivedDateTime desc",
        $top: top,
        $count: true,
      })}`;
    const request = { headers: { Prefer: IMMUTABLE_ID }, scope: GRAPH_READ_SCOPE };
    const [page, junkCount] = await Promise.all([
      this.#client.json<GraphPage>(token.nextLink ?? firstPageUrl(token.folder, PAGE_SIZE), request),
      // The very first page reports the whole window: count junk alongside the inbox page.
      pageToken === null
        ? this.#client
            .json<GraphPage>(firstPageUrl("junkemail", 1), request)
            .then((junk) => junk["@odata.count"] ?? null)
        : Promise.resolve(null),
    ]);
    const nextPage = page["@odata.nextLink"];
    const next: ListToken | null =
      nextPage !== undefined
        ? { folder: token.folder, nextLink: nextPage }
        : token.folder === "inbox"
          ? { folder: "junkemail", nextLink: null }
          : null;
    const inboxCount = page["@odata.count"];
    return {
      refs: this.#refs(page, token.folder),
      nextPageToken: next === null ? null : JSON.stringify(next),
      total:
        pageToken === null && inboxCount !== undefined && junkCount !== null ? inboxCount + junkCount : null,
    };
  }

  async changesSince(cursor: string): Promise<ChangesPage> {
    const links = parseDeltaCursor(cursor);
    const refs = new Map<string, MessageRef>();
    let more = false;
    for (const folder of FOLDERS) {
      if (refs.size >= CHANGES_LIMIT) {
        more = true;
        break;
      }
      let url = links[folder];
      for (;;) {
        const page = await this.#delta(url);
        for (const ref of this.#refs(page, folder)) refs.set(ref.id, ref);
        const deltaLink = page["@odata.deltaLink"];
        if (deltaLink !== undefined) {
          links[folder] = deltaLink;
          break;
        }
        url = this.#nextLink(page);
        if (refs.size >= CHANGES_LIMIT) {
          links[folder] = url;
          more = true;
          break;
        }
      }
    }
    return { refs: [...refs.values()], cursor: JSON.stringify(links), more };
  }

  // Raw MIME: https://learn.microsoft.com/graph/outlook-get-mime-message
  async fetch(refs: readonly MessageRef[]): Promise<FetchedMail[]> {
    const fetched = await mapConcurrent(refs, FETCH_CONCURRENCY, async (ref): Promise<FetchedMail | null> => {
      const id = encodeURIComponent(ref.id);
      const request = { headers: { Prefer: IMMUTABLE_ID }, scope: GRAPH_READ_SCOPE, pass: [404] };
      const known = this.#receivedAt.get(ref.id);
      const [source, receivedAt] = await Promise.all([
        this.#client.request(`${BASE}/messages/${id}/$value`, request),
        known !== undefined
          ? Promise.resolve(known)
          : this.#client
              .request(`${BASE}/messages/${id}${query({ $select: "receivedDateTime" })}`, request)
              .then(async (response) => {
                if (response.status === 404) return null;
                const metadata = (await response.json()) as { receivedDateTime: string };
                return new Date(metadata.receivedDateTime);
              }),
      ]);
      if (source.status === 404 || receivedAt === null) {
        await source.body?.cancel();
        return null;
      }
      this.#receivedAt.delete(ref.id);
      return { ...ref, raw: Buffer.from(await source.arrayBuffer()), receivedAt };
    });
    return fetched.filter((mail): mail is FetchedMail => mail !== null);
  }

  // Draft, attach, send: https://learn.microsoft.com/graph/api/user-post-messages,
  // https://learn.microsoft.com/graph/api/message-createreply,
  // https://learn.microsoft.com/graph/api/message-send (the sent copy lands in Sent Items).
  async send(message: OutgoingMail): Promise<SentMail> {
    const content = {
      subject: message.subject,
      body: { contentType: "Text", content: message.text },
      toRecipients: recipients(message.to),
      ccRecipients: recipients(message.cc),
    };
    const write = {
      headers: { Prefer: IMMUTABLE_ID, "Content-Type": "application/json" },
      scope: GRAPH_WRITE_SCOPE,
    };
    let draftId: string;
    if (message.replyTo === null) {
      draftId = (
        await this.#client.json<{ id: string }>(`${BASE}/messages`, {
          ...write,
          method: "POST",
          body: JSON.stringify(content),
        })
      ).id;
    } else {
      const replyTo = encodeURIComponent(message.replyTo.providerMessageId);
      draftId = (
        await this.#client.json<{ id: string }>(`${BASE}/messages/${replyTo}/createReply`, {
          ...write,
          method: "POST",
          body: "{}",
        })
      ).id;
      // createReply fills in a quoted HTML body and the original recipients: replace both.
      await this.#client.json(`${BASE}/messages/${encodeURIComponent(draftId)}`, {
        ...write,
        method: "PATCH",
        body: JSON.stringify(content),
      });
    }
    const draft = `${BASE}/messages/${encodeURIComponent(draftId)}`;
    for (const attachment of message.attachments) await this.#attach(draft, attachment);
    const sent = await this.#client.json<{ internetMessageId?: string; conversationId?: string }>(
      `${draft}${query({ $select: "internetMessageId,conversationId" })}`,
      { headers: { Prefer: IMMUTABLE_ID }, scope: GRAPH_WRITE_SCOPE },
    );
    const response = await this.#client.request(`${draft}/send`, {
      headers: { Prefer: IMMUTABLE_ID },
      method: "POST",
      scope: GRAPH_SEND_SCOPE,
    });
    await response.body?.cancel();
    return {
      providerMessageId: draftId,
      threadId: sent.conversationId ?? null,
      rfc822MessageId: sent.internetMessageId ?? null,
    };
  }

  async close(): Promise<void> {}

  // < 3 MB: https://learn.microsoft.com/graph/api/message-post-attachments
  // ≥ 3 MB: https://learn.microsoft.com/graph/outlook-large-attachments and
  // https://learn.microsoft.com/graph/api/attachment-createuploadsession (pre-authenticated
  // uploadUrl: no Authorization header; ranges in multiples of 320 KiB, ≤ 4 MB each).
  async #attach(draft: string, attachment: OutgoingAttachment): Promise<void> {
    const write = {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      scope: GRAPH_WRITE_SCOPE,
    };
    if (attachment.content.length < SMALL_ATTACHMENT_LIMIT) {
      await this.#client.json(`${draft}/attachments`, {
        ...write,
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.fileName,
          contentType: attachment.contentType,
          contentBytes: attachment.content.toString("base64"),
        }),
      });
      return;
    }
    const total = attachment.content.length;
    const session = await this.#client.json<{ uploadUrl: string }>(
      `${draft}/attachments/createUploadSession`,
      {
        ...write,
        body: JSON.stringify({
          AttachmentItem: {
            attachmentType: "file",
            name: attachment.fileName,
            size: total,
            contentType: attachment.contentType,
          },
        }),
      },
    );
    for (let start = 0; start < total; start += UPLOAD_CHUNK_SIZE) {
      const chunk = attachment.content.subarray(start, Math.min(start + UPLOAD_CHUNK_SIZE, total));
      const response = await this.#client.unauthenticated(session.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${start}-${start + chunk.length - 1}/${total}`,
        },
        body: chunk,
        scope: GRAPH_WRITE_SCOPE,
      });
      await response.body?.cancel();
    }
  }

  async #delta(url: string): Promise<GraphPage> {
    return this.#client.json<GraphPage>(url, {
      headers: { Prefer: `odata.maxpagesize=${PAGE_SIZE}, ${IMMUTABLE_ID}` },
      scope: GRAPH_READ_SCOPE,
      mapError: expiredDelta,
    });
  }

  #nextLink(page: GraphPage): string {
    const next = page["@odata.nextLink"];
    if (next === undefined) throw new Error("graph delta page without nextLink or deltaLink");
    return next;
  }

  #refs(page: GraphPage, folder: GraphFolder): MessageRef[] {
    const refs: MessageRef[] = [];
    for (const message of page.value) {
      if (message["@removed"] !== undefined) continue;
      if (message.receivedDateTime !== undefined)
        this.#receivedAt.set(message.id, new Date(message.receivedDateTime));
      refs.push({ id: message.id, threadId: message.conversationId ?? null, folder: FOLDER_KIND[folder] });
    }
    return refs;
  }
}
