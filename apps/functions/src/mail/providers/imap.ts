// IMAP + SMTP with app passwords (docs/adr/0012-mail-sync.md). Reads INBOX and the Junk folder;
// the cursor keeps UIDVALIDITY, UIDNEXT and HIGHESTMODSEQ per folder, so an unchanged mailbox
// costs one STATUS per folder. Sending goes through SMTP and the message is appended to Sent
// (unless the provider files SMTP mail in Sent itself).
import { isIP } from "node:net";
import type { ConnectionOptions } from "node:tls";
import type { MailEndpoint, MailFolder } from "@bfhr/core";
import { ImapFlow, type ImapFlowOptions } from "imapflow";
import { createTransport } from "nodemailer";
import { z } from "zod";
import { composeMime } from "./mime";
import { resolveMailServer } from "../../net/address-guard";
import {
  type ChangesPage,
  type FetchedMail,
  MailAuthError,
  MailCursorExpiredError,
  type MailProviderAdapter,
  MailTransientError,
  type MessageRef,
  type OutgoingMail,
  type RefPage,
  type SentMail,
} from "./types";

export interface ImapCredentials {
  username: string;
  password: string;
  imap: MailEndpoint;
  /** null: reading only. */
  smtp: MailEndpoint | null;
  /** The provider files SMTP-sent mail in Sent itself (Gmail): skip the IMAP APPEND. */
  smtpSavesSent: boolean;
  /** SMTP login when it differs from the IMAP one (iCloud: IMAP may take the local part, SMTP the address). */
  smtpUsername: string | null;
}

/** Test seams: in-process servers listen on loopback with a self-signed certificate. */
export interface ImapTestOptions {
  allowPrivateHosts?: boolean;
  tls?: ConnectionOptions;
}

/** Messages per `listSince` page and per `changesSince` call. */
const PAGE_SIZE = 200;
const MAX_CHANGES = 2_000;
const CONNECTION_TIMEOUT_MS = 15_000;

const FolderCursorSchema = z.object({
  uidValidity: z.string(),
  uidNext: z.int().min(1),
  modseq: z.string().nullable(),
});
const CursorSchema = z.object({ v: z.literal(1), folders: z.record(z.string(), FolderCursorSchema) });
type Cursor = z.infer<typeof CursorSchema>;

const PageTokenSchema = z.object({ folder: z.int().min(0), offset: z.int().min(0) });

interface Folder {
  path: string;
  kind: MailFolder;
}

/** IMAP failure reasons the connect form maps to field errors. */
export type ImapFailure = "auth_failed" | "host_unreachable" | "tls_failed" | "imap_disabled";

export class ImapConnectError extends Error {
  constructor(
    readonly reason: ImapFailure,
    readonly side: "imap" | "smtp",
    message: string,
  ) {
    super(message);
    this.name = "ImapConnectError";
  }
}

const DISABLED_TEXT =
  /imap\b.{0,40}\b(?:disabled|not enabled|deaktiviert|nicht aktiviert|kapal[ıi]|devre d[ıi][şs][ıi])|enable imap|application-specific password required|web login required/iu;

function errorCode(error: unknown): string {
  return error !== null && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

/** Maps imapflow / nodemailer / socket errors to a connect failure, or null when unknown. */
export function classifyConnectError(error: unknown, side: "imap" | "smtp"): ImapConnectError | null {
  const code = errorCode(error);
  const text =
    error instanceof Error ? `${error.message} ${"response" in error ? String(error.response) : ""}` : "";
  if (DISABLED_TEXT.test(text))
    return new ImapConnectError("imap_disabled", side, "access disabled at the provider");
  const authFailed =
    (error !== null && typeof error === "object" && "authenticationFailed" in error) ||
    code === "EAUTH" ||
    /AUTHENTICATIONFAILED|authentication failed|invalid credentials|535/iu.test(text);
  if (authFailed) return new ImapConnectError("auth_failed", side, "authentication failed");
  if (
    /^(?:ERR_TLS|ERR_SSL|CERT_|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|ESOCKET_TLS)|ClosedAfterConnectTLS|UPGRADE_TIMEOUT/u.test(
      code,
    ) ||
    /certificate|wrong version number|ssl3_get_record|tls/iu.test(text)
  )
    return new ImapConnectError("tls_failed", side, "TLS negotiation failed");
  if (
    /^(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|CONNECT_TIMEOUT|GREETING_TIMEOUT|ETIMEOUT|ECONNECTION|EDNS|NoConnection|BlockedHost)$/u.test(
      code,
    ) ||
    (error instanceof Error && (error.name === "BlockedHostError" || error.name === "MailPortError"))
  )
    return new ImapConnectError("host_unreachable", side, "server unreachable");
  return null;
}

export class ImapAdapter implements MailProviderAdapter {
  private client: ImapFlow | null = null;
  private folders: Folder[] | null = null;

  constructor(
    private readonly credentials: ImapCredentials,
    private readonly address: string,
    private readonly test: ImapTestOptions = {},
  ) {}

  /** Logs in once and logs out: the server-side credential check of the connect form. */
  static async verifyImap(credentials: ImapCredentials, test: ImapTestOptions = {}): Promise<void> {
    const adapter = new ImapAdapter(credentials, credentials.username, test);
    try {
      await adapter.connection();
    } catch (error) {
      throw classifyConnectError(error, "imap") ?? error;
    } finally {
      await adapter.close();
    }
  }

  /** Authenticates against SMTP without sending (EHLO, STARTTLS/TLS, AUTH). */
  static async verifySmtp(credentials: ImapCredentials, test: ImapTestOptions = {}): Promise<void> {
    if (credentials.smtp === null) throw new ImapConnectError("host_unreachable", "smtp", "no SMTP server");
    const transport = await smtpTransport(credentials, credentials.smtp, test);
    try {
      await transport.verify();
    } catch (error) {
      throw classifyConnectError(error, "smtp") ?? error;
    } finally {
      transport.close();
    }
  }

  private async connection(): Promise<ImapFlow> {
    if (this.client !== null && this.client.usable) return this.client;
    const { imap, username, password } = this.credentials;
    const target = await resolveMailServer("imap", imap, { allowPrivate: this.test.allowPrivateHosts === true });
    const options: ImapFlowOptions = {
      host: target.address,
      ...(isIP(imap.host) === 0 ? { servername: target.servername } : {}),
      port: imap.port,
      secure: imap.security === "tls",
      doSTARTTLS: imap.security === "starttls" ? true : undefined,
      auth: { user: username, pass: password },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: 120_000,
      clientInfo: {
        name: "BruteForceHR",
        vendor: "BruteForceHR",
        "support-url": "https://github.com/Savas07/bruteforcehr-releases/issues",
      },
      tls: { minVersion: "TLSv1.2", ...this.test.tls },
    };
    const client = new ImapFlow(options);
    // A dropped socket emits 'error'; without a listener it would crash the instance.
    client.on("error", () => undefined);
    try {
      await client.connect();
    } catch (error) {
      const mapped = classifyConnectError(error, "imap");
      if (mapped?.reason === "auth_failed") throw new MailAuthError("IMAP authentication failed");
      if (mapped !== null) throw mapped;
      throw new MailTransientError(`IMAP connect failed (${errorCode(error) || "unknown"})`);
    }
    this.client = client;
    return client;
  }

  /** INBOX and the Junk folder (SPECIAL-USE, or a localized name imapflow recognises). */
  private async mailFolders(): Promise<Folder[]> {
    if (this.folders !== null) return this.folders;
    const client = await this.connection();
    const list = await client.list();
    const junk = list.find((entry) => entry.specialUse === "\\Junk");
    this.folders = [
      { path: "INBOX", kind: "inbox" },
      ...(junk === undefined ? [] : [{ path: junk.path, kind: "spam" as const }]),
    ];
    return this.folders;
  }

  async currentCursor(): Promise<string> {
    const client = await this.connection();
    const cursor: Cursor = { v: 1, folders: {} };
    for (const folder of await this.mailFolders()) {
      const status = await client.status(folder.path, {
        uidNext: true,
        uidValidity: true,
        highestModseq: true,
      });
      if (status === false || status.uidValidity === undefined || status.uidNext === undefined) continue;
      cursor.folders[folder.path] = {
        uidValidity: status.uidValidity.toString(),
        uidNext: status.uidNext,
        modseq: status.highestModseq?.toString() ?? null,
      };
    }
    return JSON.stringify(cursor);
  }

  async listSince(since: Date, pageToken: string | null): Promise<RefPage> {
    const client = await this.connection();
    const folders = await this.mailFolders();
    const position =
      pageToken === null ? { folder: 0, offset: 0 } : PageTokenSchema.parse(JSON.parse(pageToken));
    const folder = folders[position.folder];
    if (folder === undefined) return { refs: [], nextPageToken: null, total: null };

    let uids: number[];
    let refs: MessageRef[];
    const lock = await client.getMailboxLock(folder.path, { readOnly: true });
    try {
      const mailbox = client.mailbox;
      if (mailbox === false) return { refs: [], nextPageToken: null, total: null };
      const found = await client.search({ since }, { uid: true });
      uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a);
      refs = uids.slice(position.offset, position.offset + PAGE_SIZE).map((uid) => ({
        id: refId(folder.path, mailbox.uidValidity, uid),
        threadId: null,
        folder: folder.kind,
      }));
    } finally {
      lock.release();
    }
    // Counted after releasing the lock: imapflow serialises mailbox locks, a nested one would wait forever.
    let total: number | null = null;
    if (pageToken === null) {
      total = uids.length;
      for (const other of folders.slice(1)) total += await countSince(client, other.path, since);
    }
    const nextOffset = position.offset + PAGE_SIZE;
    const nextPageToken =
      nextOffset < uids.length
        ? JSON.stringify({ folder: position.folder, offset: nextOffset })
        : position.folder + 1 < folders.length
          ? JSON.stringify({ folder: position.folder + 1, offset: 0 })
          : null;
    return { refs, nextPageToken, total };
  }

  async changesSince(cursor: string): Promise<ChangesPage> {
    const client = await this.connection();
    let stored: Cursor;
    try {
      stored = CursorSchema.parse(JSON.parse(cursor));
    } catch {
      throw new MailCursorExpiredError("unreadable IMAP cursor");
    }
    const next: Cursor = { v: 1, folders: {} };
    const refs: MessageRef[] = [];
    let more = false;
    for (const folder of await this.mailFolders()) {
      const known = stored.folders[folder.path];
      const status = await client.status(folder.path, {
        uidNext: true,
        uidValidity: true,
        highestModseq: true,
      });
      if (status === false || status.uidValidity === undefined || status.uidNext === undefined) continue;
      const uidValidity = status.uidValidity.toString();
      const modseq = status.highestModseq?.toString() ?? null;
      if (known === undefined) {
        // A Junk folder that appeared since: start from now.
        next.folders[folder.path] = { uidValidity, uidNext: status.uidNext, modseq };
        continue;
      }
      if (known.uidValidity !== uidValidity)
        throw new MailCursorExpiredError(`UIDVALIDITY of ${folder.path} changed`);
      const unchanged = status.uidNext === known.uidNext && (modseq === null || modseq === known.modseq);
      if (unchanged || status.uidNext <= known.uidNext) {
        next.folders[folder.path] = { uidValidity, uidNext: Math.max(known.uidNext, status.uidNext), modseq };
        continue;
      }
      const lock = await client.getMailboxLock(folder.path, { readOnly: true });
      try {
        const found = await client.search({ uid: `${known.uidNext}:*` }, { uid: true });
        const uids = (Array.isArray(found) ? found : [])
          .filter((uid) => uid >= known.uidNext)
          .sort((a, b) => a - b);
        const room = MAX_CHANGES - refs.length;
        const taken = uids.slice(0, Math.max(0, room));
        for (const uid of taken)
          refs.push({ id: refId(folder.path, status.uidValidity, uid), threadId: null, folder: folder.kind });
        if (taken.length < uids.length) {
          more = true;
          const last = taken.at(-1);
          next.folders[folder.path] = {
            uidValidity,
            uidNext: last === undefined ? known.uidNext : last + 1,
            modseq: known.modseq,
          };
        } else {
          next.folders[folder.path] = { uidValidity, uidNext: status.uidNext, modseq };
        }
      } finally {
        lock.release();
      }
    }
    return { refs, cursor: JSON.stringify(next), more };
  }

  async fetch(refs: readonly MessageRef[]): Promise<FetchedMail[]> {
    const client = await this.connection();
    const byFolder = new Map<string, { uidValidity: string; uids: number[]; folder: MailFolder }>();
    for (const ref of refs) {
      const parsed = parseRefId(ref.id);
      if (parsed === null) continue;
      const key = `${parsed.path}\u0000${parsed.uidValidity}`;
      const entry = byFolder.get(key) ?? { uidValidity: parsed.uidValidity, uids: [], folder: ref.folder };
      entry.uids.push(parsed.uid);
      byFolder.set(key, entry);
    }
    const fetched: FetchedMail[] = [];
    for (const [key, entry] of byFolder) {
      const path = key.slice(0, key.indexOf("\u0000"));
      const lock = await client.getMailboxLock(path, { readOnly: true });
      try {
        if (client.mailbox === false || client.mailbox.uidValidity.toString() !== entry.uidValidity) continue;
        for await (const message of client.fetch(
          entry.uids.join(","),
          { uid: true, source: true, internalDate: true },
          { uid: true },
        )) {
          if (message.source === undefined) continue;
          fetched.push({
            id: refId(path, BigInt(entry.uidValidity), message.uid),
            threadId: null,
            folder: entry.folder,
            raw: message.source,
            receivedAt: message.internalDate === undefined ? new Date() : new Date(message.internalDate),
          });
        }
      } finally {
        lock.release();
      }
    }
    return fetched;
  }

  async send(message: OutgoingMail): Promise<SentMail> {
    const { smtp } = this.credentials;
    if (smtp === null) throw new MailAuthError("no SMTP server configured");
    const { raw, messageId } = await composeMime(message);
    const transport = await smtpTransport(this.credentials, smtp, this.test);
    try {
      await transport.sendMail({
        envelope: {
          from: this.address,
          to: [...message.to, ...message.cc].map((recipient) => recipient.address),
        },
        raw,
      });
    } catch (error) {
      const mapped = classifyConnectError(error, "smtp");
      if (mapped?.reason === "auth_failed") throw new MailAuthError("SMTP authentication failed");
      throw new MailTransientError(`SMTP send failed (${errorCode(error) || "unknown"})`);
    } finally {
      transport.close();
    }
    let providerMessageId = messageId;
    if (!this.credentials.smtpSavesSent) {
      // Best effort: the mail is sent; a failed APPEND only means no copy in Sent.
      try {
        const client = await this.connection();
        const sent = (await client.list()).find((entry) => entry.specialUse === "\\Sent");
        if (sent !== undefined) {
          const appended = await client.append(sent.path, raw, ["\\Seen"]);
          if (appended !== false && appended.uid !== undefined && appended.uidValidity !== undefined)
            providerMessageId = refId(sent.path, appended.uidValidity, appended.uid);
        }
      } catch {
        // Logged by the caller through the account status; never fail a delivered send.
      }
    }
    return { providerMessageId, threadId: null, rfc822MessageId: messageId };
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client === null) return;
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

async function countSince(client: ImapFlow, path: string, since: Date): Promise<number> {
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const found = await client.search({ since }, { uid: true });
    return Array.isArray(found) ? found.length : 0;
  } finally {
    lock.release();
  }
}

async function smtpTransport(credentials: ImapCredentials, smtp: MailEndpoint, test: ImapTestOptions) {
  const target = await resolveMailServer("smtp", smtp, { allowPrivate: test.allowPrivateHosts === true });
  return createTransport({
    host: target.address,
    port: smtp.port,
    secure: smtp.security === "tls",
    requireTLS: smtp.security === "starttls",
    auth: { user: credentials.smtpUsername ?? credentials.username, pass: credentials.password },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: 60_000,
    name: "bruteforcehr.web.app",
    tls: {
      minVersion: "TLSv1.2",
      ...(isIP(smtp.host) === 0 ? { servername: target.servername } : {}),
      ...test.tls,
    },
  });
}

/** `INBOX:1730112009:4211` — mailbox path, UIDVALIDITY, UID (stable while UIDVALIDITY holds). */
function refId(path: string, uidValidity: bigint, uid: number): string {
  return `${path}:${uidValidity.toString()}:${uid}`;
}

function parseRefId(id: string): { path: string; uidValidity: string; uid: number } | null {
  const match = /^(.*):(\d+):(\d+)$/su.exec(id);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined)
    return null;
  return { path: match[1], uidValidity: match[2], uid: Number(match[3]) };
}
