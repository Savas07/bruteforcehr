/**
 * Opens "Connect an email account" from anywhere (Settings › Mail accounts, the Mail empty state,
 * Today): a module-level request the mounted `MailConnectHost` picks up. With no host mounted
 * (signed out) a request does nothing.
 */
import type { MailCallFailure } from "../../data/mail/errors";
import type { ConnectView, ImapDraft } from "./model";

export interface MailConnectOptions {
  /** Reconnect this account: IMAP opens the form with its saved settings, Gmail / Outlook sign in again. */
  readonly accountId?: string;
}

/**
 * Where the dialog starts, for the design build's states and tests (src/design/mail-connect.tsx):
 * a view, a prefilled form, a submit as soon as it opens, or a server answer already shown.
 */
export interface MailConnectInitial {
  readonly view: ConnectView;
  readonly draft?: Partial<ImapDraft>;
  readonly submit?: boolean;
  readonly failure?: MailCallFailure;
}

export interface MailConnectRequest extends MailConnectOptions {
  readonly initial?: MailConnectInitial;
}

type Opener = (request: MailConnectRequest) => void;

const openers: Opener[] = [];

/** Opens the dialog over the current screen: the provider picker, or Reconnect with `accountId`. */
export function openMailConnect(options: MailConnectOptions = {}): void {
  openers.at(-1)?.(options);
}

/** Opens the dialog on a given step (design build and tests). */
export function openMailConnectAt(request: MailConnectRequest): void {
  openers.at(-1)?.(request);
}

/** The host's subscription; the latest mounted host handles requests. */
export function onMailConnectRequest(opener: Opener): () => void {
  openers.push(opener);
  return () => {
    const index = openers.lastIndexOf(opener);
    if (index !== -1) openers.splice(index, 1);
  };
}
