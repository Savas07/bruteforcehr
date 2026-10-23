/**
 * Interview prep reminders on this device: the opt-in setting (`useInterviewReminderSetting`,
 * stored per install like the appearance, F13) and the scheduler (`InterviewReminders`), mounted
 * once in the signed-in app. It checks every 30 seconds while the app runs and sends what
 * `dueReminders` says, at most once per reminder (remembered on this device).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { defineMessages, useIntl } from "react-intl";
import {
  notificationPermission,
  notify,
  requestNotificationPermission,
  type NotificationPermission,
} from "../../lib/notifications";
import { dayAndTime } from "../../shared/model/format";
import { displayTimeZone, useTrackerData } from "./live";
import { dueReminders, interviewReminders } from "./reminders";

const ENABLED_KEY = "bfhr.interviewReminders.enabled";
const SENT_KEY = "bfhr.interviewReminders.sent";
const CHECK_EVERY_MS = 30_000;
/** Sent keys are kept this long, then forgotten (the interview is long past). */
const SENT_RETENTION_MS = 14 * 86_400_000;

const messages = defineMessages({
  eveningTitle: {
    id: "shared.interviewReminders.eveningTitle",
    defaultMessage: "Interview tomorrow · {company}",
  },
  shortlyTitle: {
    id: "shared.interviewReminders.shortlyTitle",
    defaultMessage: "Interview in an hour · {company}",
  },
  body: {
    id: "shared.interviewReminders.body",
    defaultMessage: "{title}, {time}. Your prep notes are on the application in BruteForceHR.",
    description: "Notification body; {time} is like 'Tomorrow, 10:00'",
  },
});

const listeners = new Set<() => void>();

function readEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) === "true";
}

function writeEnabled(enabled: boolean): void {
  if (enabled) localStorage.setItem(ENABLED_KEY, "true");
  else localStorage.removeItem(ENABLED_KEY);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface InterviewReminderSetting {
  /** The user turned reminders on on this device. */
  readonly enabled: boolean;
  /** What the OS allows; `denied` means the OS settings must change, `unsupported` a plain browser. */
  readonly permission: NotificationPermission | "unknown";
  /** Turns reminders on (asking the OS first); resolves to whether they are on. */
  enable(): Promise<boolean>;
  disable(): void;
}

export function useInterviewReminderSetting(): InterviewReminderSetting {
  const enabled = useSyncExternalStore(subscribe, readEnabled);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  useEffect(() => {
    let live = true;
    void notificationPermission().then((value) => {
      if (live) setPermission(value);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  const enable = useCallback(async () => {
    const answer = await requestNotificationPermission();
    setPermission(answer);
    if (answer !== "granted") return false;
    writeEnabled(true);
    return true;
  }, []);
  const disable = useCallback(() => writeEnabled(false), []);
  return { enabled: enabled && permission !== "denied", permission, enable, disable };
}

function readSent(now: number): Map<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(stored).filter(([, at]) => now - at < SENT_RETENTION_MS));
  } catch {
    return new Map();
  }
}

/** Sends due interview reminders while the app runs (renders nothing). */
export function InterviewReminders() {
  const intl = useIntl();
  const state = useTrackerData();
  const enabled = useSyncExternalStore(subscribe, readEnabled);
  const data = state.status === "ready" ? state.data : null;

  useEffect(() => {
    if (!enabled || data === null) return;
    const timeZone = displayTimeZone(data.profile);
    const check = () => {
      const now = new Date();
      const sent = readSent(now.getTime());
      const due = dueReminders(
        interviewReminders(data.interviews, data.applications, now, timeZone),
        now,
        new Set(sent.keys()),
        timeZone,
      );
      if (due.length === 0) return;
      for (const reminder of due) {
        sent.set(reminder.key, now.getTime());
        const ctx = { now, locale: intl.locale, intl, timeZone };
        void notify(
          intl.formatMessage(
            reminder.kind === "eveningBefore" ? messages.eveningTitle : messages.shortlyTitle,
            {
              company: reminder.application.company,
            },
          ),
          intl.formatMessage(messages.body, {
            title: reminder.interview.title,
            time: dayAndTime(reminder.interview.startsAt, ctx).label,
          }),
        );
      }
      localStorage.setItem(SENT_KEY, JSON.stringify(Object.fromEntries(sent)));
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [enabled, data, intl]);

  return null;
}
