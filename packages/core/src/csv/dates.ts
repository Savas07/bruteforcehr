/**
 * Dates as spreadsheets write them: ISO, numeric day/month/year in either order with `.` `/` `-`,
 * Excel serial numbers, and month names in English, Turkish and German ("12 Oct 2026",
 * "12 Ekim 2026", "12. Oktober 2026"). A date without a time becomes 12:00 UTC of that day, which
 * is the same calendar day in every zone from UTC−11 to UTC+11.
 */
import { normalizeWord } from "./vocabulary";

/** Order of day, month and year in numeric dates whose year comes last. */
export type DateOrder = "dmy" | "mdy";

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  ocak: 1,
  januar: 1,
  janner: 1,
  feb: 2,
  february: 2,
  subat: 2,
  februar: 2,
  mar: 3,
  march: 3,
  mart: 3,
  marz: 3,
  maerz: 3,
  apr: 4,
  april: 4,
  nisan: 4,
  may: 5,
  mayis: 5,
  mai: 5,
  jun: 6,
  june: 6,
  haziran: 6,
  juni: 6,
  jul: 7,
  july: 7,
  temmuz: 7,
  juli: 7,
  aug: 8,
  august: 8,
  agustos: 8,
  agu: 8,
  sep: 9,
  sept: 9,
  september: 9,
  eylul: 9,
  eyl: 9,
  oct: 10,
  october: 10,
  ekim: 10,
  oktober: 10,
  okt: 10,
  eki: 10,
  nov: 11,
  november: 11,
  kasim: 11,
  kas: 11,
  dec: 12,
  december: 12,
  aralik: 12,
  dezember: 12,
  dez: 12,
  ara: 12,
};

/** Excel's day zero (serial 1 = 1900-01-01, with the 1900 leap-year bug folded in). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

function calendarDate(year: number, month: number, day: number): Date | null {
  if (year < 100) year += 2000;
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

const NUMERIC = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\.?(?:[ T,]+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)?$/;

/**
 * The order numeric dates in a column use: a first part above 12 means day first, a second part
 * above 12 means month first; otherwise `fallback` (from the user's locale).
 */
export function detectDateOrder(values: readonly string[], fallback: DateOrder): DateOrder {
  for (const value of values) {
    const match = NUMERIC.exec(value.trim());
    if (!match || (match[1] ?? "").length === 4) continue;
    if (Number(match[1]) > 12) return "dmy";
    if (Number(match[2]) > 12) return "mdy";
  }
  return fallback;
}

/** Parses one cell; null when it isn't a date (an empty cell is not an error, check that first). */
export function parseSpreadsheetDate(raw: string, order: DateOrder): Date | null {
  const value = raw.trim();
  if (value === "") return null;

  // ISO with a time and a zone is an instant.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Math.floor(Number(value));
    if (serial < 25_569 || serial > 73_051) return null; // 1970 … 2100
    const date = new Date(EXCEL_EPOCH_MS + serial * DAY_MS);
    return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const numeric = NUMERIC.exec(value);
  if (numeric) {
    const [a, b, c] = [numeric[1] ?? "", Number(numeric[2]), numeric[3] ?? ""];
    if (a.length === 4) return calendarDate(Number(a), b, Number(c));
    if (c.length !== 2 && c.length !== 4) return null;
    return order === "dmy" ? calendarDate(Number(c), b, Number(a)) : calendarDate(Number(c), Number(a), b);
  }

  // Month names: "12 Oct 2026", "Oct 12, 2026", "12. Oktober 2026", "12-Ekim-26", "Ekim 12 2026".
  const words = normalizeWord(
    value.replace(/[ T,]+\d{1,2}[:.]\d{2}([:.]\d{2})?\s*([ap]\.?m\.?)?$/i, ""),
  ).split(" ");
  if (words.length !== 3) return null;
  const monthIndex = words.findIndex((word) => MONTHS[word] !== undefined);
  if (monthIndex < 0) return null;
  const month = MONTHS[words[monthIndex] as string] as number;
  const numbers = words.filter((_, index) => index !== monthIndex);
  if (!numbers.every((word) => /^\d+$/.test(word))) return null;
  const [first, second] = numbers as [string, string];
  const [day, year] = first.length === 4 ? [second, first] : [first, second];
  return calendarDate(Number(year), month, Number(day));
}

/** `YYYY-MM-DD` of `date` in `timeZone`: the export format, which every spreadsheet reads. */
export function isoDay(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
