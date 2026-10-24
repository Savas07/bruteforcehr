/**
 * Which new job emails notify on this computer (Settings › Notifications), mirroring the push
 * rules (docs/runbooks/notifications.md): interview invites, offers, assessments and decisions by
 * category, other categories only when their status change was applied automatically; mail
 * received more than 2 days before it arrived here never notifies (lookback scans); during quiet
 * hours (profile zone, `start` > `end` spans midnight) nothing pops up; Mail and Today still list it.
 * Muted kinds are dropped. Pure, so the decision is unit-tested; `MailNotificationsHost` does the I/O.
 */
import type { MailMessage, NotificationPreferences, ProfileSettings } from "@bfhr/core";

export type MailNotificationKind = "interview" | "offer" | "assessment" | "decision" | "statusUpdate";

/** Older mail is a scan's, not news. */
export const MAIL_NOTIFY_MAX_AGE_MS = 2 * 86_400_000;

export interface MailNotificationRules {
  readonly notifications: NotificationPreferences;
  readonly notifyRejections: boolean;
  readonly quietHours: ProfileSettings["quietHours"];
  readonly timeZone: string;
}

function kindOf(message: MailMessage): MailNotificationKind | null {
  switch (message.category) {
    case "interview_invite":
      return "interview";
    case "offer":
      return "offer";
    case "assessment":
      return "assessment";
    case "rejection":
      return "decision";
    default:
      return message.reviewState === "auto_applied" ? "statusUpdate" : null;
  }
}

function enabled(kind: MailNotificationKind, rules: MailNotificationRules): boolean {
  switch (kind) {
    case "interview":
      return rules.notifications.interviews;
    case "offer":
      return rules.notifications.offers;
    case "assessment":
      return rules.notifications.assessments;
    case "decision":
      return rules.notifyRejections;
    case "statusUpdate":
      return rules.notifications.autoApplied;
  }
}

function minuteOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

function clockMinutes(clock: string): number {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Whether `now` falls in quiet hours (start inclusive, end exclusive; start > end spans midnight). */
export function inQuietHours(now: Date, quietHours: ProfileSettings["quietHours"], timeZone: string): boolean {
  if (quietHours === null) return false;
  const start = clockMinutes(quietHours.start);
  const end = clockMinutes(quietHours.end);
  if (start === end) return false;
  const minute = minuteOfDay(now, timeZone);
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export type MailNotificationDecision =
  | { readonly notify: true; readonly kind: MailNotificationKind }
  | { readonly notify: false; readonly reason: "notJobNews" | "old" | "muted" | "quiet" };

export function mailNotificationDecision(
  message: MailMessage,
  rules: MailNotificationRules,
  now: Date,
): MailNotificationDecision {
  const kind = kindOf(message);
  if (kind === null) return { notify: false, reason: "notJobNews" };
  if (now.getTime() - message.receivedAt.getTime() > MAIL_NOTIFY_MAX_AGE_MS) return { notify: false, reason: "old" };
  if (!enabled(kind, rules)) return { notify: false, reason: "muted" };
  if (inQuietHours(now, rules.quietHours, rules.timeZone)) return { notify: false, reason: "quiet" };
  return { notify: true, kind };
}
