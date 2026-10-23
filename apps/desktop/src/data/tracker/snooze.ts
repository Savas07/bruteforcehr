/**
 * When a snoozed item comes back (D19 presets: Later today · Tomorrow · Next week · Pick a date…),
 * as an instant computed in the user's time zone, independent of the machine's zone.
 */
import type { SnoozePreset } from "../../shared/ui/SnoozeMenu";

/** A snooze choice; `pickDate` carries the date the user chose. */
export type SnoozeUntil =
  | { readonly preset: Exclude<SnoozePreset, "pickDate"> }
  | { readonly preset: "pickDate"; readonly date: Date };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Hour of the day snoozed items come back on a later day. */
export const SNOOZE_MORNING_HOUR = 9;
/** "Later today" is this many hours from now. */
const LATER_TODAY_HOURS = 3;

/** Wall-clock fields of `date` in `timeZone`, as the UTC epoch of that wall time. */
export function zonedWallTime(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}

/** The instant at which the wall clock in `timeZone` reads `wall` (a wall time as a UTC epoch). */
export function instantOfWallTime(wall: number, timeZone: string): Date {
  // Start from the wall time read as UTC and shift by the zone's offset there; a second pass
  // settles days where the offset changes (daylight saving).
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) instant += wall - zonedWallTime(new Date(instant), timeZone);
  return new Date(instant);
}

/** `SNOOZE_MORNING_HOUR`:00 on the calendar day `days` after `now`'s day in `timeZone`. */
function morning(now: Date, days: number, timeZone: string): Date {
  const today = Math.floor(zonedWallTime(now, timeZone) / DAY_MS) * DAY_MS;
  return instantOfWallTime(today + days * DAY_MS + SNOOZE_MORNING_HOUR * HOUR_MS, timeZone);
}

/** `YYYY-MM-DD` of the calendar day `days` after `now`'s day in `timeZone` (date-input format). */
export function zonedIsoDay(now: Date, days: number, timeZone: string): string {
  return new Date(zonedWallTime(now, timeZone) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The instant a snooze to the picked day `value` (`YYYY-MM-DD` from the date field) ends:
 * `SNOOZE_MORNING_HOUR`:00 on that day in `timeZone`. Null when `value` isn't a date.
 */
export function snoozeDateInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return instantOfWallTime(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), SNOOZE_MORNING_HOUR),
    timeZone,
  );
}

/**
 * When the snooze ends: Later today = in 3 hours; Tomorrow = 09:00 tomorrow; Next week = 09:00 next
 * Monday; a picked date as chosen.
 */
export function snoozeInstant(until: SnoozeUntil, now: Date, timeZone: string): Date {
  switch (until.preset) {
    case "laterToday":
      return new Date(now.getTime() + LATER_TODAY_HOURS * HOUR_MS);
    case "tomorrow":
      return morning(now, 1, timeZone);
    case "nextWeek": {
      // getUTCDay of the zoned wall time is the local weekday (0 = Sunday).
      const weekday = new Date(zonedWallTime(now, timeZone)).getUTCDay();
      return morning(now, (8 - weekday) % 7 || 7, timeZone);
    }
    case "pickDate":
      return until.date;
  }
}
