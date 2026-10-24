import { htmlToText, type MailInput, senderAuthenticated } from "@bfhr/core";
import { simpleParser } from "mailparser";
import type { FetchedMail } from "./providers/types";

/** Plain-text body kept for classification and storage (the schema's `bodyText` cap). */
const MAX_BODY_CHARS = 200_000;
/** HTML kept in memory for job-alert links (never stored). */
const MAX_HTML_CHARS = 1_000_000;
/** Calendar parts read per message, and their size cap. */
const MAX_CALENDARS = 3;
const MAX_CALENDAR_CHARS = 100_000;

export interface ParsedMail {
  input: MailInput;
  receivedAt: Date;
  rfc822MessageId: string | null;
  snippet: string;
  /** HTML part (job-alert links); null without one. Not stored. */
  html: string | null;
  /** `text/calendar` parts and `.ics` attachments (interview invites). Not stored. */
  calendars: string[];
}

/** Parses a fetched message into the pipeline input (text body; HTML converted when there's no text part). */
export async function parseMail(accountId: string, fetched: FetchedMail): Promise<ParsedMail> {
  const parsed = await simpleParser(fetched.raw, { skipImageLinks: true, skipTextToHtml: true });
  const sender = parsed.from?.value[0];
  const html = typeof parsed.html === "string" ? parsed.html : "";
  const text = (parsed.text?.trim() ? parsed.text : htmlToText(html))
    .replace(/\r\n/gu, "\n")
    .slice(0, MAX_BODY_CHARS);
  const header = (name: string) => {
    const value = parsed.headers.get(name);
    return typeof value === "string" ? value.toLowerCase() : "";
  };
  const references =
    parsed.references === undefined
      ? []
      : Array.isArray(parsed.references)
        ? parsed.references
        : [parsed.references];
  // The topmost Authentication-Results is the receiving provider's own (Gmail, Microsoft and IMAP
  // hosts add it last); lower ones may come from the sender and are ignored.
  const authenticationResults =
    parsed.headerLines
      .find((line) => line.key === "authentication-results")
      ?.line.replace(/^[^:]*:/u, "") ?? null;
  const fromAddress = (sender?.address ?? "unknown@invalid").toLowerCase();
  const precedence = header("precedence");
  const autoSubmitted = header("auto-submitted");
  const calendars = parsed.attachments
    .filter(
      (attachment) =>
        /^(?:text\/calendar|application\/ics)$/iu.test(attachment.contentType) ||
        /\.ics$/iu.test(attachment.filename ?? ""),
    )
    .slice(0, MAX_CALENDARS)
    .map((attachment) => attachment.content.toString("utf8").slice(0, MAX_CALENDAR_CHARS));
  return {
    input: {
      accountId,
      from: {
        name: sender?.name?.trim() || null,
        address: fromAddress,
      },
      subject: (parsed.subject ?? "").slice(0, 1_000),
      bodyText: text,
      folder: fetched.folder,
      providerThreadId: fetched.threadId,
      inReplyTo: parsed.inReplyTo ?? null,
      references,
      listUnsubscribe: parsed.headers.has("list-unsubscribe"),
      bulk: /^(?:bulk|list|junk)$/u.test(precedence) || (autoSubmitted !== "" && autoSubmitted !== "no"),
      // Several From addresses: only the first is read, so don't vouch for it.
      senderAuthenticated:
        (parsed.from?.value.length ?? 0) === 1 && senderAuthenticated(authenticationResults, fromAddress),
    },
    receivedAt: fetched.receivedAt,
    rfc822MessageId: parsed.messageId ?? null,
    snippet: text.replace(/\s+/gu, " ").trim().slice(0, 200),
    html: html === "" ? null : html.slice(0, MAX_HTML_CHARS),
    calendars,
  };
}
