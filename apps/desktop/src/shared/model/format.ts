/**
 * Date, time and number formatting for view-models. Everything goes through `Intl` with the
 * context's locale and time zone (system.md "Typography": 24 h in TR/DE, `Intl.*` always).
 * Counted nouns are ICU plurals in the messages (`{count, plural, one {# application} other {…}}`),
 * never assembled here.
 */
import { defineMessages } from "react-intl";
import type { ModelContext, TimeVM } from "./types";

type FormatContext = Pick<ModelContext, "now" | "locale" | "timeZone" | "intl">;

const messages = defineMessages({
  dayAndTime: {
    id: "shared.format.dayAndTime",
    defaultMessage: "{day}, {time}",
    description: "An appointment's day and clock time: 'Tomorrow, 17:00'",
  },
});

const DAY_MS = 86_400_000;

/** Calendar date of `date` in `timeZone`, as days since the epoch (for day differences). */
function dayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((candidate) => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

/** Whole calendar days from `ctx.now` to `date` in the user's zone: 0 today, 1 tomorrow, -1 yesterday. */
export function calendarDaysFromNow(date: Date, ctx: FormatContext): number {
  return dayNumber(date, ctx.timeZone) - dayNumber(ctx.now, ctx.timeZone);
}

/** Locale-native short time: "10:30" in en-GB, tr, de; "3:00 PM" in en-US (no forced leading zero). */
export function clockTime(date: Date, ctx: FormatContext): string {
  return new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    timeStyle: "short",
  }).format(date);
}

/** "Thursday 22 October 2026 at 10:30": tooltips and accessible names. */
export function absoluteDateTime(date: Date, ctx: FormatContext): string {
  return new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

/** "22 Oct" (this year) or "22 Oct 2025". */
export function shortDate(date: Date, ctx: FormatContext): string {
  const sameYear =
    new Intl.DateTimeFormat("en-US", { timeZone: ctx.timeZone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en-US", { timeZone: ctx.timeZone, year: "numeric" }).format(ctx.now);
  return new Intl.DateTimeFormat(ctx.locale, {
    timeZone: ctx.timeZone,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/**
 * Neutral relative time (system.md "Data display"): "now", "25 minutes ago", "3 hours ago",
 * "yesterday", "in 2 days", "last week", "3 weeks ago". Calendar days count in the user's zone.
 */
export function relativeTime(date: Date, ctx: FormatContext): TimeVM {
  const rtf = new Intl.RelativeTimeFormat(ctx.locale, { numeric: "auto" });
  const diffMs = date.getTime() - ctx.now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  const days = calendarDaysFromNow(date, ctx);
  let label: string;
  if (Math.abs(minutes) < 1) label = rtf.format(0, "second");
  else if (Math.abs(minutes) < 60) label = rtf.format(minutes, "minute");
  else if (days === 0) label = rtf.format(Math.round(diffMs / 3_600_000), "hour");
  else if (Math.abs(days) < 7) label = rtf.format(days, "day");
  else if (Math.abs(days) < 30) label = rtf.format(Math.trunc(days / 7), "week");
  else if (Math.abs(days) < 365) label = rtf.format(Math.trunc(days / 30), "month");
  else label = rtf.format(Math.trunc(days / 365), "year");
  return { iso: date.toISOString(), label, absolute: absoluteDateTime(date, ctx) };
}

/**
 * Day plus clock time for appointments: "Today, 14:00", "Tomorrow, 17:00", "Monday, 09:00"
 * (within a week), "29 Oct, 09:00" otherwise.
 */
export function dayAndTime(date: Date, ctx: FormatContext): TimeVM {
  const days = calendarDaysFromNow(date, ctx);
  const time = clockTime(date, ctx);
  let day: string;
  if (days >= -1 && days <= 1) {
    const word = new Intl.RelativeTimeFormat(ctx.locale, { numeric: "auto" }).format(days, "day");
    day = word.charAt(0).toLocaleUpperCase(ctx.locale) + word.slice(1);
  } else if (days > 1 && days < 7) {
    day = new Intl.DateTimeFormat(ctx.locale, { timeZone: ctx.timeZone, weekday: "long" }).format(date);
  } else {
    day = shortDate(date, ctx);
  }
  return {
    iso: date.toISOString(),
    label: ctx.intl.formatMessage(messages.dayAndTime, { day, time }),
    absolute: absoluteDateTime(date, ctx),
  };
}

/** "€55,000" / "55.000 €": whole units, the locale's grouping. */
export function money(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(
    amount,
  );
}
