// Which stored job mails notify, and where the push leads (flows.md §3, IA.md § Deep links).
import { createHash } from "node:crypto";
import type { Application, MailMessage } from "@bfhr/core";
import type { PushContent, PushNotification } from "./types";

/**
 * Mail received longer ago than this never notifies: lookback scans and a new account's first
 * sync store months of old mail, which the backfill review presents instead.
 */
export const MAIL_PUSH_MAX_AGE_MS = 2 * 86_400_000;

const SCHEME = "bruteforcehr://";

/** The fields of a stored mail message that decide its push. */
export type MailPushMessage = Pick<
  MailMessage,
  | "id"
  | "receivedAt"
  | "category"
  | "extracted"
  | "applicationId"
  | "suggestedStatus"
  | "appliedEventId"
  | "reviewState"
>;

function mailContent(
  message: MailPushMessage,
  company: string | null,
  role: string | null,
): PushContent | null {
  switch (message.category) {
    case "interview_invite":
      return { kind: "interview", company, role };
    case "offer":
      return { kind: "offer", company, role };
    case "assessment":
      return { kind: "assessment", company, role };
    case "rejection":
      return { kind: "decision", company, updated: message.reviewState === "auto_applied" };
    default:
      return message.reviewState === "auto_applied" &&
        message.appliedEventId !== null &&
        message.suggestedStatus !== null
        ? { kind: "status_update", company, status: message.suggestedStatus }
        : null;
  }
}

/** The deep link: the review sheet while it waits for the user, else the application (event). */
function mailLink(message: MailPushMessage): string {
  const id = encodeURIComponent;
  if (message.reviewState === "pending") return `${SCHEME}mail/review/${id(message.id)}`;
  if (message.applicationId === null) return `${SCHEME}mail`;
  const application = `${SCHEME}applications/${id(message.applicationId)}`;
  return message.appliedEventId === null
    ? application
    : `${application}/events/${id(message.appliedEventId)}`;
}

/**
 * The push for a newly stored job mail, or null when it shouldn't notify: interview invites,
 * offers, assessments and decisions always qualify (the user's toggles are applied when sending),
 * other categories only when they moved an application automatically.
 */
export function mailPush(
  message: MailPushMessage,
  application: Pick<Application, "company" | "role"> | null,
  now: Date,
): PushNotification | null {
  if (now.getTime() - message.receivedAt.getTime() > MAIL_PUSH_MAX_AGE_MS) return null;
  const content = mailContent(
    message,
    message.extracted.company ?? application?.company ?? null,
    message.extracted.role ?? application?.role ?? null,
  );
  if (content === null) return null;
  return {
    content,
    link: mailLink(message),
    threadId: message.applicationId === null ? "mail" : `application-${message.applicationId}`,
    collapseId: `mail-${createHash("sha256").update(message.id).digest("hex").slice(0, 40)}`,
  };
}
