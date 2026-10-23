// Wall-clock math in the user's time zone (Profile.timezone) for quiet hours and the daily digest.
import type { ProfileSettings } from "@bfhr/core";

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1_440;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local calendar fields of `date` in `timeZone`. */
function localParts(date: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    minuteOfDay: (parts.hour ?? 0) * 60 + (parts.minute ?? 0),
    second: parts.second ?? 0,
    /** Zone offset in minutes (local − UTC) at this instant. */
    offset: Math.round(
      (Date.UTC(
        parts.year ?? 0,
        (parts.month ?? 1) - 1,
        parts.day ?? 1,
        parts.hour,
        parts.minute,
        parts.second,
      ) -
        Math.floor(date.getTime() / 1_000) * 1_000) /
        MINUTE_MS,
    ),
  };
}

function clockMinutes(clock: string): number {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/**
 * The next instant strictly after `now` (at minute precision) when the wall clock in `timeZone`
 * reads `clock` ("HH:MM"). Across a DST change the result is corrected by the offset difference,
 * so "08:00" stays 08:00 local; a time skipped by the change resolves to the hour after.
 */
export function nextLocalTime(now: Date, timeZone: string, clock: string): Date {
  const local = localParts(now, timeZone);
  const delta = (clockMinutes(clock) - local.minuteOfDay + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES;
  const minuteStart = now.getTime() - local.second * 1_000 - (now.getTime() % 1_000);
  const candidate = new Date(minuteStart + delta * MINUTE_MS);
  const shift = local.offset - localParts(candidate, timeZone).offset;
  return shift === 0 ? candidate : new Date(candidate.getTime() + shift * MINUTE_MS);
}

/** Local date ("YYYY-MM-DD") of `date` in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * When the quiet hours that contain `now` end, or null when `now` is outside them (or none are
 * set). `start` > `end` spans midnight (22:00–07:00); `start` == `end` is an empty window.
 */
export function quietHoursEnd(
  now: Date,
  quietHours: ProfileSettings["quietHours"],
  timeZone: string,
): Date | null {
  if (quietHours === null) return null;
  const start = clockMinutes(quietHours.start);
  const end = clockMinutes(quietHours.end);
  const minute = localParts(now, timeZone).minuteOfDay;
  const inside = start <= end ? minute >= start && minute < end : minute >= start || minute < end;
  return inside ? nextLocalTime(now, timeZone, quietHours.end) : null;
}
