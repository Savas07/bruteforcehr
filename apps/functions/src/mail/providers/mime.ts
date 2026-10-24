import { randomUUID } from "node:crypto";
import type { MailAddress } from "@bfhr/core";
import MailComposer from "nodemailer/lib/mail-composer";
import type { OutgoingMail } from "./types";

const formatAddress = ({ name, address }: MailAddress) => ({ name: name ?? "", address });

/** A fresh RFC 822 Message-ID on the sender's domain; providers store it for reply tracking. */
export function newMessageId(fromAddress: string): string {
  return `<${randomUUID()}@${fromAddress.slice(fromAddress.lastIndexOf("@") + 1)}>`;
}

/**
 * RFC 822 source of an outgoing message (Gmail API raw send, SMTP + IMAP APPEND to Sent).
 * The Message-ID is generated here, so every provider path can store it for reply tracking.
 */
export async function composeMime(message: OutgoingMail): Promise<{ raw: Buffer; messageId: string }> {
  const messageId = newMessageId(message.from.address);
  const references = message.replyTo
    ? [...message.replyTo.references, message.replyTo.rfc822MessageId].filter(
        (id): id is string => id !== null,
      )
    : [];
  const composer = new MailComposer({
    from: formatAddress(message.from),
    to: message.to.map(formatAddress),
    cc: message.cc.map(formatAddress),
    subject: message.subject,
    text: message.text,
    messageId,
    date: new Date(),
    ...(message.replyTo?.rfc822MessageId ? { inReplyTo: message.replyTo.rfc822MessageId } : {}),
    ...(references.length > 0 ? { references } : {}),
    attachments: message.attachments.map((attachment) => ({
      filename: attachment.fileName,
      contentType: attachment.contentType,
      content: attachment.content,
    })),
  });
  const raw = await composer.compile().build();
  return { raw, messageId };
}
