/**
 * Interview prep reminders (opt-in, per device): when to notify about an upcoming interview.
 * - the evening before (`EVENING_HOUR`:00 local, the previous day), so there is time to prepare;
 * - one hour before, unless that falls in quiet hours (the evening one covers early interviews).
 * Quiet hours are a constant until Settings › Notifications lands (F12); nothing is ever sent in
 * them. Pure: the scheduler (`InterviewReminders.tsx`) passes the clock and what was already sent.
 */
import { type Application, type Interview, isActiveStatus } from "@bfhr/core";
import { instantOfWallTime, zonedWallTime } from "./snooze";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Local time of the evening-before reminder. */
export const EVENING_HOUR = 18;
/** The short reminder's lead time. */
export const SHORT_LEAD_MINUTES = 60;
/** No notifications between these local hours (start inclusive, end exclusive; spans midnight). */
export const QUIET_HOURS = { start: 22, end: 8 } as const;
/** A reminder the app missed (asleep, closed) is still sent this long after its time. */
export const LATE_GRACE_MINUTES = 15;

export type InterviewReminderKind = "eveningBefore" | "shortly";

export interface InterviewReminder {
  /** Stable per interview, kind and start time: a rescheduled interview reminds again. */
  readonly key: string;
  readonly kind: InterviewReminderKind;
  readonly at: Date;
  readonly interview: Interview;
  readonly application: Pick<Application, "id" | "company" | "role">;
}

/** Whether the local hour of `date` in `timeZone` is inside quiet hours. */
export function inQuietHours(date: Date, timeZone: string): boolean {
  const hour = new Date(zonedWallTime(date, timeZone)).getUTCHours();
  return QUIET_HOURS.start > QUIET_HOURS.end
    ? hour >= QUIET_HOURS.start || hour < QUIET_HOURS.end
    : hour >= QUIET_HOURS.start && hour < QUIET_HOURS.end;
}

/** Reminders for upcoming interviews of open applications, soonest first. */
export function interviewReminders(
  interviews: readonly Interview[],
  applications: readonly Application[],
  now: Date,
  timeZone: string,
): InterviewReminder[] {
  const reminders: InterviewReminder[] = [];
  for (const interview of interviews) {
    const application = applications.find((candidate) => candidate.id === interview.applicationId);
    if (!application || !isActiveStatus(application.status)) continue;
    const start = interview.startsAt.getTime();
    if (start <= now.getTime()) continue;
    const base = {
      interview,
      application: { id: application.id, company: application.company, role: application.role },
    };
    const stamp = interview.startsAt.toISOString();

    const startDay = Math.floor(zonedWallTime(interview.startsAt, timeZone) / DAY_MS) * DAY_MS;
    const evening = instantOfWallTime(startDay - DAY_MS + EVENING_HOUR * HOUR_MS, timeZone);
    if (!inQuietHours(evening, timeZone)) {
      reminders.push({
        ...base,
        key: `${interview.id}:eveningBefore:${stamp}`,
        kind: "eveningBefore",
        at: evening,
      });
    }
    const shortly = new Date(start - SHORT_LEAD_MINUTES * MINUTE_MS);
    if (!inQuietHours(shortly, timeZone)) {
      reminders.push({ ...base, key: `${interview.id}:shortly:${stamp}`, kind: "shortly", at: shortly });
    }
  }
  return reminders.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The reminders to send now: their time has come (at most `LATE_GRACE_MINUTES` ago), the interview
 * hasn't started, they weren't sent yet, and it isn't quiet hours.
 */
export function dueReminders(
  reminders: readonly InterviewReminder[],
  now: Date,
  sent: ReadonlySet<string>,
  timeZone: string,
): InterviewReminder[] {
  if (inQuietHours(now, timeZone)) return [];
  const at = now.getTime();
  return reminders.filter(
    (reminder) =>
      !sent.has(reminder.key) &&
      reminder.at.getTime() <= at &&
      at - reminder.at.getTime() <= LATE_GRACE_MINUTES * MINUTE_MS &&
      reminder.interview.startsAt.getTime() > at,
  );
}
