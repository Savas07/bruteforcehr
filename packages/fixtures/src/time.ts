/**
 * Every fixture date is derived from `FIXTURE_NOW` so screenshots and tests are deterministic.
 * Thursday 22 October 2026, 10:30 in Istanbul.
 */
export const FIXTURE_NOW = new Date("2026-10-22T07:30:00.000Z");

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** `days` (fractional allowed) before `FIXTURE_NOW`; add `hours` to shift within the day. */
export function daysAgo(days: number, hours = 0): Date {
  return new Date(FIXTURE_NOW.getTime() - days * DAY_MS + hours * HOUR_MS);
}

/**
 * Wall-clock time `hhmm` in a zone with the given UTC offset, `dayOffset` calendar days from
 * FIXTURE_NOW's date. Offsets are explicit because fixtures avoid Intl time-zone data.
 */
export function wallClock(dayOffset: number, hhmm: string, utcOffsetHours: number): Date {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  const midnight = Date.UTC(
    FIXTURE_NOW.getUTCFullYear(),
    FIXTURE_NOW.getUTCMonth(),
    FIXTURE_NOW.getUTCDate(),
  );
  return new Date(midnight + dayOffset * DAY_MS + (hours - utcOffsetHours) * HOUR_MS + minutes * 60_000);
}
