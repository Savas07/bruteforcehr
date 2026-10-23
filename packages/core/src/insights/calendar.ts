/**
 * Civil (wall-calendar) dates for Insights ranges and weeks. A `CivilDate` is `YYYY-MM-DD` in the
 * user's time zone; arithmetic runs on day numbers (days since 1970-01-01), so it is exact and
 * easy to port (BFHRCore `InsightsCalendar.swift`). Only `civilDate()` touches time zones.
 */

/** `YYYY-MM-DD`. Compares correctly as a string. */
export type CivilDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 86_400_000;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      calendar: "gregory",
      numberingSystem: "latn",
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/** The calendar date of `instant` in `timeZone` (IANA id). */
export function civilDate(instant: Date, timeZone: string): CivilDate {
  const parts = formatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

function parse(date: CivilDate): [year: number, month: number, day: number] {
  const match = CIVIL_DATE.exec(date);
  if (match === null) throw new RangeError(`Expected YYYY-MM-DD, got ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Whether `value` is a valid `YYYY-MM-DD` date. */
export function isCivilDate(value: string): value is CivilDate {
  const match = CIVIL_DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days since 1970-01-01. */
export function dayNumber(date: CivilDate): number {
  const [year, month, day] = parse(date);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function fromDayNumber(days: number): CivilDate {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Same day `months` later (negative: earlier), clamped to the month's last day (Mar 31 − 1 → Feb 28/29). */
export function addMonths(date: CivilDate, months: number): CivilDate {
  const [year, month, day] = parse(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function isoWeekday(date: CivilDate): IsoWeekday {
  // 1970-01-01 was a Thursday (4).
  return (((((dayNumber(date) + 3) % 7) + 7) % 7) + 1) as IsoWeekday;
}

/** The first day of the week containing `date`, for weeks starting on `weekStart`. */
export function startOfWeek(date: CivilDate, weekStart: IsoWeekday): CivilDate {
  const offset = (isoWeekday(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

/** Inclusive number of days from `from` to `to`. */
export function daysInclusive(from: CivilDate, to: CivilDate): number {
  return dayNumber(to) - dayNumber(from) + 1;
}
