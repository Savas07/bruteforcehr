// Microsoft Graph mail adapter (plain REST, no Graph SDK).
import {
  type MailAddress,
  type MailFolder,
  MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES,
  MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES,
} from "@bfhr/core";
import { z } from "zod";
import { newMessageId } from "./mime";
import { mapConcurrent, query, RestClient, type RestErrorDialect } from "./rest";
import {
  type AccessTokenSource,
  type ChangesPage,
  type Fetch,
  type FetchedMail,
  MailCursorExpiredError,
  type MailProviderAdapter,
  MailTooLargeError,
  type MessageRef,
  type OutgoingMail,
  type RefPage,
  type SentMail,
} from "./types";

const BASE = "https://graph.microsoft.com/v1.0/me";
export const GRAPH_READ_SCOPE = "https://graph.microsoft.com/Mail.Read";
/** The only scope sending needs: `sendMail` and `reply` take the whole message in one request. */
export const GRAPH_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";

/** Well-known folder names we sync, in listing order. */
const FOLDERS = ["inbox", "junkemail"] as const;
type GraphFolder = (typeof FOLDERS)[number];
const FOLDER_KIND: Record<GraphFolder, MailFolder> = { inbox: "inbox", junkemail: "spam" };

const PAGE_SIZE = 200;
const CHANGES_LIMIT = 2000;
const FETCH_CONCURRENCY = 8;
// PidTagInternetMessageId (MS-OXPROPS): sendMail and reply answer 202 without an id, so we choose
// the Message-ID; incoming replies link to the application through it (In-Reply-To / References).
const MESSAGE_ID_PROPERTY = "String 0x1035";
/**
 * The "now" cursor's delta query only tracks mail received after (now − skew); the lookback scan
 * covers everything before, and the overlap is deduped on refs.
 */
const CURSOR_SKEW_MS = 15 * 60 * 1000;
const MESSAGE_FIELDS = "id,conversationId,receivedDateTime";

// Immutable ids survive moves between folders, so a stored message id stays valid for `reply`:
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

type SendFields = Pick<OutgoingMail, "from" | "to" | "cc" | "subject" | "text" | "replyTo">;

/** What a Graph send request is built from; attachments by size, so it can be sized before download. */
export type GraphSendDraft = SendFields & {
  attachments: readonly { fileName: string; contentType: string; sizeBytes: number }[];
};

/**
 * JSON body of `POST /me/sendMail` (new mail; the one copy lands in Sent Items) or
 * `POST /me/messages/{id}/reply` (follow-ups: Exchange sets In-Reply-To, References and the
 * conversation; our body replaces the quoted original). `contentBytes` gives an attachment's base64.
 */
function sendRequestBody<A extends { fileName: string; contentType: string }>(
  draft: SendFields & { attachments: readonly A[] },
  messageId: string,
  contentBytes: (attachment: A) => string,
): string {
  const message = {
    subject: draft.subject,
    body: { contentType: "Text", content: draft.text },
    toRecipients: recipients(draft.to),
    ccRecipients: recipients(draft.cc),
    ...(draft.attachments.length === 0
      ? {}
      : {
          attachments: draft.attachments.map((attachment) => ({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachment.fileName,
            contentType: attachment.contentType,
            contentBytes: contentBytes(attachment),
          })),
        }),
    singleValueExtendedProperties: [{ id: MESSAGE_ID_PROPERTY, value: messageId }],
  };
  return JSON.stringify(draft.replyTo === null ? { message, saveToSentItems: true } : { message });
}

/**
 * Null when the send request for `draft` fits Graph's request limit, else the attachment total that
 * would fit next to this message. Sized from file sizes (base64 needs no JSON escaping, and every
 * Message-ID from `newMessageId` has the same length), so `mailSend` refuses before scheduling.
 */
export function graphSendOverLimit(draft: GraphSendDraft): number | null {
  const message = Buffer.byteLength(sendRequestBody(draft, newMessageId(draft.from.address), () => ""));
  const encoded = draft.attachments.reduce((sum, file) => sum + 4 * Math.ceil(file.sizeBytes / 3), 0);
  if (message + encoded <= MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES) return null;
  const room = Math.floor(Math.max(0, MAIL_SEND_MICROSOFT_MAX_REQUEST_BYTES - message) / 4) * 3;
  return Math.min(room, MAIL_SEND_MICROSOFT_MAX_ATTACHMENT_BYTES);
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

  // One request with Mail.Send only: https://learn.microsoft.com/graph/api/user-sendmail (JSON,
  // file attachments inline, `saveToSentItems`) and https://learn.microsoft.com/graph/api/message-reply
  // (follow-ups; always saved to Sent Items). Both answer 202 without the sent message's id.
  async send(message: OutgoingMail): Promise<SentMail> {
    const limitBytes = graphSendOverLimit({
      ...message,
      attachments: message.attachments.map(({ fileName, contentType, content }) => ({
        fileName,
        contentType,
        sizeBytes: content.length,
      })),
    });
    if (limitBytes !== null) throw new MailTooLargeError(limitBytes);
    const messageId = newMessageId(message.from.address);
    const url =
      message.replyTo === null
        ? `${BASE}/sendMail`
        : `${BASE}/messages/${encodeURIComponent(message.replyTo.providerMessageId)}/reply`;
    const response = await this.#client.request(url, {
      method: "POST",
      headers: { Prefer: IMMUTABLE_ID, "Content-Type": "application/json" },
      body: sendRequestBody(message, messageId, (attachment) => attachment.content.toString("base64")),
      scope: GRAPH_SEND_SCOPE,
    });
    await response.body?.cancel();
    return {
      providerMessageId: messageId,
      threadId: message.replyTo?.providerThreadId ?? null,
      rfc822MessageId: messageId,
    };
  }

  async close(): Promise<void> {}

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
