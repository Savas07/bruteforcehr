/**
 * OS notifications for new job emails while the app runs (Settings › Notifications › "Show
 * notifications on this computer", off until turned on). Mounted once in the signed-in shell,
 * inside the tracker and mail providers. Emails present in the first snapshot never notify; each
 * later one is decided by `mailNotificationDecision` with the same categories, toggles and quiet
 * hours as the phone's pushes. Copy follows the push copy (apps/functions/src/notifications/copy.ts).
 */
import { DEFAULT_NOTIFICATION_PREFERENCES, DEFAULT_PROFILE_SETTINGS, type MailMessage } from "@bfhr/core";
import { useEffect, useRef } from "react";
import { defineMessages, type IntlShape, type MessageDescriptor, useIntl } from "react-intl";
import { useMailData } from "../../data/mail/live";
import { displayTimeZone, useTrackerData } from "../../data/tracker/live";
import { notify } from "../../lib/notifications";
import { useDevicePreferences } from "../../lib/preferences";
import { statusVM } from "../../shared/model/vocabulary";
import { type MailNotificationKind, mailNotificationDecision } from "./mailNotifications";

const messages = defineMessages({
  interviewTitle: { id: "settings.notify.interview.title", defaultMessage: "Interview invite" },
  interviewBody: {
    id: "settings.notify.interview.body",
    defaultMessage: "{company, select, none {You have a new interview invite.} other {{company} invited you to an interview.}}",
  },
  offerTitle: { id: "settings.notify.offer.title", defaultMessage: "Offer" },
  offerBody: {
    id: "settings.notify.offer.body",
    defaultMessage: "{company, select, none {You have a new offer.} other {{company} sent you an offer.}}",
  },
  assessmentTitle: { id: "settings.notify.assessment.title", defaultMessage: "Assessment" },
  assessmentBody: {
    id: "settings.notify.assessment.body",
    defaultMessage: "{company, select, none {You have a new assessment.} other {{company} sent you an assessment.}}",
  },
  decisionTitle: { id: "settings.notify.decision.title", defaultMessage: "Decision" },
  decisionBody: {
    id: "settings.notify.decision.body",
    defaultMessage:
      "{company, select, none {An employer decided not to move forward.} other {{company} decided not to move forward.}}",
  },
  updateTitle: { id: "settings.notify.update.title", defaultMessage: "Application updated" },
  updateBody: {
    id: "settings.notify.update.body",
    defaultMessage: "{company, select, none {Moved to {status} automatically} other {Moved to {status} — from an email by {company}}}",
  },
});

const COPY: Readonly<Record<MailNotificationKind, { readonly title: MessageDescriptor; readonly body: MessageDescriptor }>> = {
  interview: { title: messages.interviewTitle, body: messages.interviewBody },
  offer: { title: messages.offerTitle, body: messages.offerBody },
  assessment: { title: messages.assessmentTitle, body: messages.assessmentBody },
  decision: { title: messages.decisionTitle, body: messages.decisionBody },
  statusUpdate: { title: messages.updateTitle, body: messages.updateBody },
};

/** Title and body of the notification for `message` (exported for tests). */
export function mailNotificationCopy(
  kind: MailNotificationKind,
  message: MailMessage,
  intl: IntlShape,
): { readonly title: string; readonly body: string } {
  const company = message.extracted.company?.trim() || "none";
  const status = message.suggestedStatus ? statusVM(message.suggestedStatus, intl).label : "";
  return {
    title: intl.formatMessage(COPY[kind].title),
    body: intl.formatMessage(COPY[kind].body, { company, status }),
  };
}

export function MailNotificationsHost() {
  const intl = useIntl();
  const { mailNotifications } = useDevicePreferences();
  const mail = useMailData();
  const tracker = useTrackerData();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (mail.status !== "ready") return;
    const ids = mail.data.mailMessages.map((message) => message.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const known = seen.current;
    const fresh = mail.data.mailMessages.filter((message) => !known.has(message.id));
    for (const id of ids) known.add(id);
    if (!mailNotifications || fresh.length === 0) return;
    const profile = tracker.status === "ready" ? tracker.data.profile : null;
    const settings = profile?.settings ?? DEFAULT_PROFILE_SETTINGS;
    const rules = {
      notifications: settings.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
      notifyRejections: settings.notifyRejections,
      quietHours: settings.quietHours,
      timeZone: displayTimeZone(profile),
    };
    const now = new Date();
    for (const message of fresh) {
      const decision = mailNotificationDecision(message, rules, now);
      if (!decision.notify) continue;
      const copy = mailNotificationCopy(decision.kind, message, intl);
      void notify(copy.title, copy.body);
    }
  }, [mail, tracker, mailNotifications, intl]);

  return null;
}
