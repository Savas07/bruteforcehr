import { htmlToText, type MailInput } from "@bfhr/core";
import { simpleParser } from "mailparser";
import type { FetchedMail } from "./providers/types";

/** Plain-text body kept for classification and storage (the schema's `bodyText` cap). */
const MAX_BODY_CHARS = 200_000;

export interface ParsedMail {
  input: MailInput;
  receivedAt: Date;
  rfc822MessageId: string | null;
  snippet: string;
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
  const precedence = header("precedence");
  const autoSubmitted = header("auto-submitted");
  return {
    input: {
      accountId,
      from: {
        name: sender?.name?.trim() || null,
        address: (sender?.address ?? "unknown@invalid").toLowerCase(),
      },
      subject: (parsed.subject ?? "").slice(0, 1_000),
      bodyText: text,
      folder: fetched.folder,
      providerThreadId: fetched.threadId,
      inReplyTo: parsed.inReplyTo ?? null,
      references,
      listUnsubscribe: parsed.headers.has("list-unsubscribe"),
      bulk: /^(?:bulk|list|junk)$/u.test(precedence) || (autoSubmitted !== "" && autoSubmitted !== "no"),
    },
    receivedAt: fetched.receivedAt,
    rfc822MessageId: parsed.messageId ?? null,
    snippet: text.replace(/\s+/gu, " ").trim().slice(0, 200),
  };
}
