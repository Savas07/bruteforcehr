/**
 * Mail as every screen sees it: the signed-in user's mail accounts and job emails (`MailSource`,
 * read-only for the client except the review fields) and the mail actions (`MailRepository`):
 * review decisions written to `mailMessages` (`MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS`, the
 * `mailMessageReviewed` trigger turns them into tracker changes) and the connect, scan and
 * disconnect callables (docs/runbooks/mail.md). The app implements both on Firestore
 * (`firestore.ts`), the design build and tests in memory (`memory.ts`).
 */
import type {
  MailAccount,
  MailCategory,
  MailConnectFinishRequest,
  MailConnectFinishResponse,
  MailConnectImapRequest,
  MailConnectImapResponse,
  MailConnectStartRequest,
  MailConnectStartResponse,
  MailDisconnectResponse,
  MailMessage,
} from "@bfhr/core";
import { createContext, useContext } from "react";
import type { PendingWrite } from "../tracker/repository";

export interface MailData {
  /** Every account document, `disconnected` ones too (screens hide those). */
  readonly mailAccounts: readonly MailAccount[];
  readonly mailMessages: readonly MailMessage[];
  /** Ids of messages with a review write the server hasn't confirmed yet. */
  readonly pendingWrites: ReadonlySet<string>;
  readonly fromCache: boolean;
}

export type LiveMailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | { readonly status: "ready"; readonly data: MailData };

export interface MailSource {
  subscribe(listener: () => void): () => void;
  /** The current state; the same object until something changes. */
  getState(): LiveMailState;
}

/**
 * One review act on a message (all four client fields, ADR 0002):
 * - Confirm keeps the message's category and link (`confirmed`); on an automatically applied
 *   invite it creates the suggested interview ("Add interview").
 * - Change sets another category and/or application (`corrected`); category `not_job` makes the
 *   server forget the message ("Not job mail").
 * - Undo of an automatic change writes `corrected` with the same fields, after the reverting event.
 */
export interface MailReviewDecision {
  readonly messageId: string;
  readonly reviewState: "confirmed" | "corrected";
  readonly category: MailCategory;
  readonly applicationId: string | null;
}

export interface MailRepository {
  readonly uid: string;
  review(decision: MailReviewDecision): PendingWrite;
  /** Gmail / Microsoft: the `/connect/{provider}` URL to open in the browser. */
  connectStart(request: MailConnectStartRequest): Promise<MailConnectStartResponse>;
  /**
   * Gmail / Microsoft, after the `bruteforcehr://connected?…&status=ok` return link: saves the
   * account (only for the user who started the connect) and names the connected mailbox.
   */
  connectFinish(request: MailConnectFinishRequest): Promise<MailConnectFinishResponse>;
  /** App password: tested server-side, then stored encrypted (also Reconnect with `accountId`). */
  connectImap(request: MailConnectImapRequest): Promise<MailConnectImapResponse>;
  /** Revokes access and deletes the account's stored mail. */
  disconnect(accountId: string): Promise<MailDisconnectResponse>;
  /** A new lookback scan ("Try the scan again", "Scan the last 180 days"). */
  backfillStart(accountId: string, lookbackDays: 30 | 90 | 180): Promise<void>;
  /** An immediate incremental check ("Check now"). */
  syncNow(accountId: string): Promise<void>;
}

export const MailSourceContext = createContext<MailSource | null>(null);
export const MailRepositoryContext = createContext<MailRepository | null>(null);

/** The mail actions of the signed-in user (provided by `MailProviders`). */
export function useMailRepository(): MailRepository {
  const repository = useContext(MailRepositoryContext);
  if (!repository) throw new Error("useMailRepository outside MailProviders");
  return repository;
}
