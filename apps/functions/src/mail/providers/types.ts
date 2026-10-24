// The seam between the sync/send engine and a mailbox provider (IMAP, Gmail API, Microsoft
// Graph). Adapters only move bytes: classification, linking and Firestore writes happen in the
// engine, so every provider goes through the same pipeline (docs/adr/0012-mail-sync.md).
import type { MailAddress, MailFolder } from "@bfhr/core";

/** A message known by id, before its body is fetched (dedupe runs on refs). */
export interface MessageRef {
  /** Stable provider id: Gmail message id, Graph message id, IMAP `<path>:<uidvalidity>:<uid>`. */
  id: string;
  threadId: string | null;
  folder: MailFolder;
}

export interface FetchedMail extends MessageRef {
  /** RFC 822 source. */
  raw: Buffer;
  receivedAt: Date;
}

export interface RefPage {
  refs: MessageRef[];
  /** Opaque token for the next page, null on the last page. */
  nextPageToken: string | null;
  /** Total number of messages in the window when the provider reports it (progress bar). */
  total: number | null;
}

export interface ChangesPage {
  /** New messages since the cursor (deletions and flag changes are ignored). */
  refs: MessageRef[];
  /** Cursor to store once `refs` are processed. */
  cursor: string;
  /** More changes are waiting: call again with `cursor`. */
  more: boolean;
}

export interface OutgoingAttachment {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface OutgoingMail {
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
  /** Reply in an existing thread (follow-ups). */
  replyTo: {
    providerMessageId: string;
    providerThreadId: string | null;
    rfc822MessageId: string | null;
    /** References chain of the replied message (oldest first), without the message itself. */
    references: string[];
  } | null;
}

export interface SentMail {
  providerMessageId: string;
  threadId: string | null;
  rfc822MessageId: string | null;
}

export interface MailProviderAdapter {
  /** A cursor meaning "now": incremental sync starts here after the lookback scan. */
  currentCursor(): Promise<string>;
  /** Messages received at or after `since` in inbox and spam/junk (lookback scan), page by page. */
  listSince(since: Date, pageToken: string | null): Promise<RefPage>;
  /** New messages since `cursor`. Throws `MailCursorExpiredError` when the provider forgot it. */
  changesSince(cursor: string): Promise<ChangesPage>;
  /** Raw sources of `refs` (refs that no longer exist are skipped). */
  fetch(refs: readonly MessageRef[]): Promise<FetchedMail[]>;
  /** Sends and files the message in Sent. */
  send(message: OutgoingMail): Promise<SentMail>;
  close(): Promise<void>;
}

/** Credentials or grant no longer valid: the account moves to `needs_reauth`. */
export class MailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailAuthError";
  }
}

/** The grant lacks a scope the operation needs (e.g. send without `gmail.send`). */
export class MailScopeError extends Error {
  constructor(readonly missingScope: string) {
    super(`missing scope ${missingScope}`);
    this.name = "MailScopeError";
  }
}

/** The stored cursor expired (Gmail historyId too old, Graph delta token invalid, UIDVALIDITY changed). */
export class MailCursorExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailCursorExpiredError";
  }
}

/** The send request is over the provider's size limit (Graph ≈ 4 MB); nothing was sent. */
export class MailTooLargeError extends Error {
  constructor(
    /** Attachment total that fits next to this message (`details.limitBytes` for clients). */
    readonly limitBytes: number,
  ) {
    super(`message over the provider size limit (attachments up to ${limitBytes} bytes fit)`);
    this.name = "MailTooLargeError";
  }
}

/** Temporary failure (rate limit, 5xx, network): retry later, the account stays connected. */
export class MailTransientError extends Error {
  constructor(
    message: string,
    /** Seconds the provider asked us to wait, when it said. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "MailTransientError";
  }
}

/** Short-lived OAuth access token for one account; refreshes and persists itself. */
export interface AccessTokenSource {
  /** A token valid for at least 60 s. Throws `MailAuthError` when the refresh token is revoked. */
  get(): Promise<string>;
  /** Forget the cached token after a 401 so the next `get()` refreshes. */
  invalidate(): void;
}

/** `fetch` is injected so tests can replay recorded provider responses. */
export type Fetch = typeof fetch;
