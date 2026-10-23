import { foldText } from "../jobs/normalize";

/**
 * Interview times from invites (docs/adr/0012-mail-sync.md, "Interviews from invites"): a tiny
 * iCalendar (RFC 5545) VEVENT reader for `text/calendar` parts, and a deterministic reader for
 * explicit EN/TR/DE date + time phrases in the mail text. Pure; zones via `Intl`.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** A zone name the runtime knows, in the `TimeZoneSchema` shape (`UTC` or `Area/City`). */
export function isIanaTimeZone(zone: string): boolean {
  if (!/^(?:UTC|[A-Z][A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/u.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Istanbul: 180). */
export function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  return Math.round((wall - Math.floor(instant / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

export interface WallTime {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

/** A wall-clock time in an IANA zone as an instant (two passes settle DST edges); null when invalid. */
export function wallTimeToInstant(wall: WallTime, timeZone: string): Date | null {
  const { year, month, day, hour, minute } = wall;
  const second = wall.second ?? 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, Math.min(second, 59));
  if (Number.isNaN(asUtc) || new Date(asUtc).getUTCDate() !== day) return null;
  if (!isIanaTimeZone(timeZone)) return null;
  let guess = asUtc;
  for (let pass = 0; pass < 2; pass++) guess = asUtc - zoneOffsetMinutes(guess, timeZone) * MINUTE_MS;
  return new Date(guess);
}

/** Civil date of an instant in a zone. */
function civilDate(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const shifted = new Date(instant.getTime() + zoneOffsetMinutes(instant.getTime(), timeZone) * MINUTE_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

const MEETING_URL =
  /https:\/\/(?:[\w-]+\.)*(?:zoom\.us\/(?:j|my|w)\/|meet\.google\.com\/|teams\.microsoft\.com\/l\/meetup-join\/|teams\.live\.com\/meet\/|webex\.com\/|whereby\.com\/|meet\.jit\.si\/|meet\.goto\.com\/|app\.gotomeeting\.com\/)[^\s<>"'\])]*/giu;

/** Video-meeting links (Zoom, Meet, Teams, Webex, Whereby, Jitsi, GoTo) in order of appearance. */
export function meetingUrlsIn(text: string): string[] {
  const found = (text.match(MEETING_URL) ?? []).map((url) => url.replace(/[.,;:!?>]+$/u, ""));
  return [...new Set(found)];
}

// ─────────────────────────────── iCalendar ───────────────────────────────

export interface CalendarEvent {
  summary: string | null;
  start: Date;
  end: Date | null;
  /** IANA zone of DTSTART (`TZID`, or `UTC` for `…Z`); null for floating times and unknown zones. */
  timezone: string | null;
  allDay: boolean;
  location: string | null;
  /** First video-meeting link of URL, conference properties, LOCATION or DESCRIPTION. */
  meetingUrl: string | null;
  /** `METHOD:CANCEL` or `STATUS:CANCELLED`. */
  cancelled: boolean;
}

/** Windows zone names Outlook/Exchange put in `TZID` (the common ones for EN/TR/DE users). */
const WINDOWS_ZONES: Readonly<Record<string, string>> = {
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "Turkey Standard Time": "Europe/Istanbul",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "India Standard Time": "Asia/Kolkata",
  "Arabian Standard Time": "Asia/Dubai",
  UTC: "UTC",
  "Coordinated Universal Time": "UTC",
};

function resolveTzid(raw: string): string | null {
  const tzid = raw.replace(/^"|"$/gu, "").trim();
  if (isIanaTimeZone(tzid)) return tzid;
  const windows = WINDOWS_ZONES[tzid];
  if (windows !== undefined) return windows;
  // Vendor prefixes: `/mozilla.org/20050126_1/Europe/Berlin`, `/softwarestudio.org/…/Europe/Berlin`.
  const segments = tzid.split("/").filter((segment) => segment !== "");
  for (let take = 3; take >= 2; take--) {
    const candidate = segments.slice(-take).join("/");
    if (segments.length >= take && isIanaTimeZone(candidate)) return candidate;
  }
  return null;
}

interface IcsProperty {
  params: Record<string, string>;
  value: string;
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/gu, (_match, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

function parseProperty(line: string): { name: string; property: IcsProperty } | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [name = "", ...params] = line.slice(0, colon).split(";");
  const record: Record<string, string> = {};
  for (const param of params) {
    const eq = param.indexOf("=");
    if (eq > 0) record[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1);
  }
  return { name: name.toUpperCase(), property: { params: record, value: line.slice(colon + 1) } };
}

function parseIcsDateTime(
  property: IcsProperty,
  floatingTimeZone: string,
): { at: Date; timezone: string | null; allDay: boolean } | null {
  const value = property.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/u.exec(value);
  if (date !== null || property.params["VALUE"] === "DATE") {
    if (date === null) return null;
    const [, y, m, d] = date.map(Number) as [number, number, number, number];
    const at = wallTimeToInstant({ year: y, month: m, day: d, hour: 0, minute: 0 }, floatingTimeZone);
    return at === null ? null : { at, timezone: null, allDay: true };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/u.exec(value);
  if (match === null) return null;
  const [y, m, d, h, mi, s] = match.slice(1, 7).map((part) => Number(part ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = { year: y, month: m, day: d, hour: h, minute: mi, second: s };
  if (match[7] === "Z") {
    const at = wallTimeToInstant(wall, "UTC");
    return at === null ? null : { at, timezone: "UTC", allDay: false };
  }
  const tzid = property.params["TZID"];
  const zone = tzid === undefined ? null : resolveTzid(tzid);
  const at = wallTimeToInstant(wall, zone ?? floatingTimeZone);
  return at === null ? null : { at, timezone: zone, allDay: false };
}

function parseIcsDuration(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u.exec(value.trim());
  if (match === null) return null;
  const [w, d, h, m, s] = match.slice(2, 7).map((part) => Number(part ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const ms = ((((w * 7 + d) * 24 + h) * 60 + m) * 60 + s) * 1000;
  return match[1] === "-" ? -ms : ms;
}

/**
 * VEVENTs of an iCalendar text (RFC 5545: unfolded lines, escaped text, `TZID` as IANA, Windows
 * or vendor-prefixed names, `DTEND` or `DURATION`). Floating times and unknown zones are read in
 * `floatingTimeZone` (the user's zone). Nested components (VALARM) and VTIMEZONE are skipped.
 */
export function parseIcs(ics: string, floatingTimeZone: string): CalendarEvent[] {
  const lines = ics
    .replace(/\r\n?/gu, "\n")
    .replace(/\n[ \t]/gu, "")
    .split("\n");
  const events: CalendarEvent[] = [];
  const stack: string[] = [];
  let method: string | null = null;
  let current: Map<string, IcsProperty> | null = null;
  for (const line of lines) {
    const parsed = parseProperty(line);
    if (parsed === null) continue;
    const { name, property } = parsed;
    const value = property.value.trim().toUpperCase();
    if (name === "BEGIN") {
      stack.push(value);
      if (value === "VEVENT") current = new Map();
      continue;
    }
    if (name === "END") {
      stack.pop();
      if (value === "VEVENT" && current !== null) {
        const event = toEvent(current, method, floatingTimeZone);
        if (event !== null) events.push(event);
        current = null;
      }
      continue;
    }
    const top = stack.at(-1);
    if (top === "VCALENDAR" && name === "METHOD") method = value;
    else if (top === "VEVENT" && current !== null && !current.has(name)) current.set(name, property);
  }
  return events;
}

function toEvent(
  properties: Map<string, IcsProperty>,
  method: string | null,
  floatingTimeZone: string,
): CalendarEvent | null {
  const startProperty = properties.get("DTSTART");
  if (startProperty === undefined) return null;
  const start = parseIcsDateTime(startProperty, floatingTimeZone);
  if (start === null) return null;
  const endProperty = properties.get("DTEND");
  const durationProperty = properties.get("DURATION");
  let end: Date | null = null;
  if (endProperty !== undefined) end = parseIcsDateTime(endProperty, floatingTimeZone)?.at ?? null;
  else if (durationProperty !== undefined) {
    const ms = parseIcsDuration(durationProperty.value);
    if (ms !== null) end = new Date(start.at.getTime() + ms);
  }
  const text = (name: string) => {
    const property = properties.get(name);
    const value = property === undefined ? "" : unescapeText(property.value).trim();
    return value === "" ? null : value;
  };
  const location = text("LOCATION");
  const description = text("DESCRIPTION");
  const meetingUrl =
    [
      text("URL"),
      text("X-GOOGLE-CONFERENCE"),
      text("X-MICROSOFT-SKYPETEAMSMEETINGURL"),
      text("X-MICROSOFT-ONLINEMEETINGCONFLINK"),
    ].find((url) => url !== null && meetingUrlsIn(url).length > 0) ??
    meetingUrlsIn(`${location ?? ""}\n${description ?? ""}`)[0] ??
    null;
  return {
    summary: text("SUMMARY"),
    start: start.at,
    end: end !== null && end.getTime() > start.at.getTime() ? end : null,
    timezone: start.timezone,
    allDay: start.allDay,
    location,
    meetingUrl: meetingUrl === null ? null : (meetingUrlsIn(meetingUrl)[0] ?? null),
    cancelled: method === "CANCEL" || properties.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED",
  };
}

// ──────────────────────────── explicit text times ────────────────────────────

/** Months by folded name/abbreviation (EN, DE, TR). */
const MONTHS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, januar: 1, ocak: 1,
  february: 2, feb: 2, februar: 2, subat: 2,
  march: 3, mar: 3, marz: 3, maerz: 3, mart: 3,
  april: 4, apr: 4, nisan: 4,
  may: 5, mai: 5, mayis: 5,
  june: 6, jun: 6, juni: 6, haziran: 6,
  july: 7, jul: 7, juli: 7, temmuz: 7,
  august: 8, aug: 8, agustos: 8,
  september: 9, sep: 9, sept: 9, eylul: 9,
  october: 10, oct: 10, oktober: 10, okt: 10, ekim: 10,
  november: 11, nov: 11, kasim: 11,
  december: 12, dec: 12, dezember: 12, dez: 12, aralik: 12,
}; // prettier-ignore

/** Weekdays by folded name (0 = Sunday). */
const WEEKDAYS: Readonly<Record<string, number>> = {
  sunday: 0, sonntag: 0, pazar: 0,
  monday: 1, montag: 1, pazartesi: 1,
  tuesday: 2, dienstag: 2, sali: 2,
  wednesday: 3, mittwoch: 3, carsamba: 3,
  thursday: 4, donnerstag: 4, persembe: 4,
  friday: 5, freitag: 5, cuma: 5,
  saturday: 6, samstag: 6, cumartesi: 6,
}; // prettier-ignore

const alternation = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length).join("|");
const MONTH_WORDS = alternation(Object.keys(MONTHS));
const WEEKDAY_WORDS = alternation(Object.keys(WEEKDAYS));

/** Zone abbreviations right after a time → IANA zone (wall time read in that zone). */
const ZONE_ABBREVIATIONS: readonly (readonly [RegExp, string])[] = [
  [/^\(?(?:cest|mesz|cet|mez)\b/u, "Europe/Berlin"],
  [/^\(?(?:tsi|trt)\b/u, "Europe/Istanbul"],
  [/^\(?(?:bst)\b/u, "Europe/London"],
  [/^\(?(?:gmt)\b(?!\s*[+-]\d)/u, "Europe/London"],
  [/^\(?(?:utc)\b(?!\s*[+-]\d)/u, "UTC"],
  [/^\(?(?:edt|est|et)\b/u, "America/New_York"],
  [/^\(?(?:cdt|cst|ct)\b/u, "America/Chicago"],
  [/^\(?(?:pdt|pst|pt)\b/u, "America/Los_Angeles"],
];

/**
 * Zone names and cities (folded): right after a time ("deutscher Zeit", "in Istanbul") or inside
 * the parentheses after it ("(British Summer Time - London)", "(Wiener Zeit)").
 */
const NAMED_ZONES: readonly (readonly [RegExp, string])[] = [
  [/\b(?:british summer time|greenwich mean time|uk time|london(?: time)?)\b/u, "Europe/London"],
  [
    /\b(?:central european (?:summer |standard )?time|mitteleuropaische (?:sommer)?zeit|deutscher zeit|german time|berlin(?:er zeit| time)?|munchen|munich|hamburg|frankfurt|koln|cologne|dusseldorf|stuttgart)\b/u,
    "Europe/Berlin",
  ],
  [/\b(?:wiener zeit|osterreichischer zeit|vienna|wien)\b/u, "Europe/Vienna"],
  [/\b(?:zurich|schweizer zeit)\b/u, "Europe/Zurich"],
  [/\b(?:paris)\b/u, "Europe/Paris"],
  [/\b(?:amsterdam)\b/u, "Europe/Amsterdam"],
  [/\b(?:dublin|irish time)\b/u, "Europe/Dublin"],
  [
    /\b(?:istanbul(?: time| saati\w*)?|turkiye saati\w*|turkish time|turkey time|ankara|izmir)\b/u,
    "Europe/Istanbul",
  ],
  [/\b(?:eastern (?:standard |daylight )?time|new york)\b/u, "America/New_York"],
  [/\b(?:central (?:standard |daylight )?time|chicago)\b/u, "America/Chicago"],
  [/\b(?:pacific (?:standard |daylight )?time|los angeles|san francisco)\b/u, "America/Los_Angeles"],
];

/** `europe/berlin` (folded) → `Europe/Berlin` when the runtime knows it. */
function canonicalZone(folded: string): string | null {
  const name = folded
    .split("/")
    .map((part) => part.replace(/(^|_|-)([a-z])/gu, (_m, sep: string, c: string) => sep + c.toUpperCase()))
    .join("/");
  return isIanaTimeZone(name) ? name : null;
}

export interface TextZone {
  /** IANA zone, or null for a bare UTC offset. */
  zone: string | null;
  /** Fixed offset in minutes when the text gave one (`UTC+3`). */
  offsetMinutes: number | null;
  length: number;
}

function zoneAt(rest: string): TextZone | null {
  const head = /^[\s,]*/u.exec(rest)?.[0].length ?? 0;
  const tail = rest.slice(head);
  const offset = /^\(?(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\)?/u.exec(tail);
  if (offset !== null) {
    const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === "-" ? -1 : 1);
    return { zone: minutes === 0 ? "UTC" : null, offsetMinutes: minutes, length: head + offset[0].length };
  }
  const iana = /^\(?([a-z]+\/[a-z_]+(?:\/[a-z_]+)?)\)?/u.exec(tail);
  if (iana !== null) {
    const zone = canonicalZone(iana[1] ?? "");
    if (zone !== null) return { zone, offsetMinutes: null, length: head + iana[0].length };
  }
  for (const [pattern, zone] of ZONE_ABBREVIATIONS) {
    const match = pattern.exec(tail);
    if (match !== null) return { zone, offsetMinutes: null, length: head + match[0].length };
  }
  const parenthesized = /^\(([^()]{1,60})\)/u.exec(tail);
  const window = parenthesized?.[1] ?? /^[^.,;:!?()\n]{0,30}/u.exec(tail)?.[0] ?? "";
  for (const [pattern, zone] of NAMED_ZONES) {
    const match = pattern.exec(window);
    if (match === null) continue;
    // Outside parentheses the name must come first ("deutscher Zeit", "in Istanbul").
    if (parenthesized === null && !/^(?:in\s+)?$/u.test(window.slice(0, match.index))) continue;
    const length = parenthesized === null ? match.index + match[0].length : parenthesized[0].length;
    return { zone, offsetMinutes: null, length: head + length };
  }
  return null;
}

interface FoundDate {
  index: number;
  end: number;
  year: number | null;
  month: number;
  day: number;
}

interface FoundTime {
  index: number;
  end: number;
  hour: number;
  minute: number;
}

const DATE_PATTERNS: readonly ((text: string) => FoundDate[])[] = [
  (text) =>
    [...text.matchAll(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/gu)].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
    })),
  (text) =>
    [...text.matchAll(/\b(\d{1,2})([./])(\d{1,2})(?:\2(20\d\d|\d\d)\b|\.(?!\d))/gu)].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      year: m[4] === undefined ? null : Number(m[4].length === 2 ? `20${m[4]}` : m[4]),
      month: Number(m[3]),
      day: Number(m[1]),
    })),
  (text) =>
    [
      ...text.matchAll(
        new RegExp(
          `\\b(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:of\\s+)?(${MONTH_WORDS})\\b\\.?,?(?:\\s+(20\\d\\d)\\b)?`,
          "gu",
        ),
      ),
    ].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      year: m[3] === undefined ? null : Number(m[3]),
      month: MONTHS[m[2] ?? ""] ?? 0,
      day: Number(m[1]),
    })),
  (text) =>
    [
      ...text.matchAll(
        new RegExp(
          `\\b(${MONTH_WORDS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?![:.]\\d),?(?:\\s+(20\\d\\d)\\b)?`,
          "gu",
        ),
      ),
    ].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      year: m[3] === undefined ? null : Number(m[3]),
      month: MONTHS[m[1] ?? ""] ?? 0,
      day: Number(m[2]),
    })),
];

function findTimes(text: string): FoundTime[] {
  const times: FoundTime[] = [];
  const pattern =
    /(?<![\d+\-:.])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|uhr|h\b)?(?![\d:])|\b(?:saat|um|at|ab|von|from)\s+(\d{1,2})(?![\d:.])/gu;
  for (const match of text.matchAll(pattern)) {
    const preceding = text.slice(Math.max(0, match.index - 4), match.index);
    if (/(?:utc|gmt)\s*$/u.test(preceding)) continue;
    let hour: number;
    let minute = 0;
    if (match[4] !== undefined) {
      hour = Number(match[4]);
    } else {
      const suffix = match[3]?.replace(/\./gu, "");
      // A bare number is only a time with minutes or an explicit suffix ("14:00", "2 pm", "14 Uhr").
      if (match[2] === undefined && suffix === undefined) continue;
      hour = Number(match[1]);
      minute = Number(match[2] ?? 0);
      if (suffix === "pm" && hour < 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
      if ((suffix === "am" || suffix === "pm") && Number(match[1]) > 12) continue;
    }
    if (hour > 23 || minute > 59) continue;
    times.push({ index: match.index, end: match.index + match[0].length, hour, minute });
  }
  return times;
}

/** Reply headers and quoted text are not part of the new message. */
function ownText(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/gu, "\n").split("\n")) {
    const trimmed = line.trim();
    if (
      /^(?:-{2,}\s*(?:original message|ursprüngliche nachricht|orijinal ileti)|on .{4,120} wrote:$|am .{4,120} schrieb .{1,120}:$|.{4,120} tarihinde .{1,120} yazdı:$|(?:from|von|kimden):\s)/iu.test(
        trimmed,
      )
    )
      break;
    if (trimmed.startsWith(">")) continue;
    lines.push(line);
  }
  return lines.join("\n");
}

/** Minutes from a duration phrase ("45-minute", "30 Minuten", "1 saatlik", "half an hour"). */
export function durationInText(text: string): number | null {
  const folded = foldText(ownText(text));
  const minutes =
    /\b(\d{1,3})\s*[-‐]?\s*(?:minutes?|mins?\b|minutige[nrs]?|minutigen|minuten|min\.|dakika(?:lik)?|dk\b)/u.exec(
      folded,
    );
  if (minutes !== null) return clampDuration(Number(minutes[1]));
  const hours =
    /\b(\d(?:[.,]5)?)\s*[-‐]?\s*(?:hours?|stunden?|stundige[nrs]?|saat(?:lik)?(?!\s*\d))(?![\w])/u.exec(
      folded,
    );
  if (hours !== null) return clampDuration(Math.round(Number((hours[1] ?? "").replace(",", ".")) * 60));
  if (/\b(?:half an hour|halbe stunde|halbstundige[nrs]?|yarim saat(?:lik)?)\b/u.test(folded)) return 30;
  if (/\b(?:an hour|one hour|eine stunde|einstundige[nrs]?|bir saat(?:lik)?)\b/u.test(folded)) return 60;
  return null;
}

function clampDuration(minutes: number): number | null {
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 600 ? minutes : null;
}

export interface TextSlot {
  startsAt: Date;
  /** IANA zone the text named; null when it gave none or only a UTC offset. */
  timezone: string | null;
  /** From a time range ("14:00–14:45"); else a duration phrase; null when the text gives neither. */
  durationMinutes: number | null;
}

/**
 * The one interview time an invite states explicitly: a date (ISO, `05.11.2026`, `5. November`,
 * `5 Kasım 2026`, `November 5`, a weekday or tomorrow) paired with a time (`14:00`, `2 pm`,
 * `14 Uhr`, `saat 14:00`), an optional end time and zone. Several different times (a choice of
 * slots) or none → null. Dates without a year take the next occurrence after `receivedAt`.
 */
export function interviewSlotInText(input: {
  text: string;
  receivedAt: Date;
  userTimeZone: string;
}): TextSlot | null {
  const userZone = isIanaTimeZone(input.userTimeZone) ? input.userTimeZone : "UTC";
  const text = foldText(ownText(input.text));
  const received = civilDate(input.receivedAt, userZone);
  const dates: FoundDate[] = DATE_PATTERNS.flatMap((find) => find(text)).filter(
    (date) => date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31,
  );
  const covered = (index: number) => dates.some((date) => index >= date.index && index < date.end);
  // Weekdays and "tomorrow" stand for a date only when no explicit date is next to them.
  for (const match of text.matchAll(new RegExp(`\\b(${WEEKDAY_WORDS}|tomorrow|morgen|yarin)\\b`, "gu"))) {
    const near = dates.some((date) => Math.abs(date.index - match.index) < 25);
    if (near || covered(match.index)) continue;
    const word = match[1] ?? "";
    const base = Date.UTC(received.year, received.month - 1, received.day);
    const weekday = WEEKDAYS[word];
    const ahead = weekday === undefined ? 1 : (weekday - new Date(base).getUTCDay() + 7) % 7 || 7;
    const target = new Date(base + ahead * DAY_MS);
    dates.push({
      index: match.index,
      end: match.index + match[0].length,
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
    });
  }
  const times = findTimes(text).filter((time) => !covered(time.index));

  // Time ranges first, so a range's end ("12:00 PM" in "9:00 AM – 12:00 PM") is never a slot.
  const rangeEnds = new Map<FoundTime, FoundTime>();
  for (const time of times) {
    const range = /^\s*(?:-|–|—|to|bis|until|till|ile|and)\s*(?:(?:saat|um)\s+)?/u.exec(text.slice(time.end));
    const end =
      range === null ? undefined : times.find((other) => other.index === time.end + range[0].length);
    if (end !== undefined) rangeEnds.set(time, end);
  }
  const ends = new Set(rangeEnds.values());
  const slots: TextSlot[] = [];
  for (const time of times) {
    if (ends.has(time)) continue;
    // A time in parentheses right after another one restates it in another zone.
    const before = text.slice(Math.max(0, time.index - 40), time.index);
    if (
      /\(\s*$/u.test(before) &&
      times.some((other) => other.end <= time.index && time.index - other.end < 40)
    )
      continue;
    const date =
      [...dates]
        .filter((candidate) => candidate.end <= time.index && time.index - candidate.end <= 60)
        .sort((a, b) => b.end - a.end)[0] ??
      dates
        .filter((candidate) => candidate.index >= time.end && candidate.index - time.end <= 40)
        .sort((a, b) => a.index - b.index)[0];
    if (date === undefined) continue;

    const endTime = rangeEnds.get(time);
    const cursor = endTime?.end ?? time.end;
    // The zone follows the time ("14:00 CET"), or the date when the date comes last
    // ("10:30am - 11:00am, Wednesday, October 28, 2026 (Eastern Time)").
    const zoneMatch =
      zoneAt(text.slice(cursor, cursor + 40)) ??
      (date.index >= cursor ? zoneAt(text.slice(date.end, date.end + 40)) : null);
    const year = date.year ?? inferYear(date, received);
    const wall = { year, month: date.month, day: date.day, hour: time.hour, minute: time.minute };
    let startsAt: Date | null;
    if (zoneMatch?.offsetMinutes !== null && zoneMatch?.offsetMinutes !== undefined) {
      const utc = wallTimeToInstant(wall, "UTC");
      startsAt = utc === null ? null : new Date(utc.getTime() - zoneMatch.offsetMinutes * MINUTE_MS);
    } else {
      startsAt = wallTimeToInstant(wall, zoneMatch?.zone ?? userZone);
    }
    if (startsAt === null) continue;
    const delta = startsAt.getTime() - input.receivedAt.getTime();
    if (delta < -12 * 3_600_000 || delta > 180 * DAY_MS) continue;
    let durationMinutes: number | null = null;
    if (endTime !== undefined) {
      const span = (endTime.hour * 60 + endTime.minute - (time.hour * 60 + time.minute) + 1_440) % 1_440;
      durationMinutes = clampDuration(span);
    }
    slots.push({ startsAt, timezone: zoneMatch?.zone ?? null, durationMinutes });
  }
  const distinct = [...new Map(slots.map((slot) => [slot.startsAt.getTime(), slot])).values()];
  if (distinct.length !== 1) return null;
  const [slot] = distinct as [TextSlot];
  // A restatement in another zone keeps the named zone of the first mention.
  const named = slots.find((candidate) => candidate.timezone !== null);
  return {
    startsAt: slot.startsAt,
    timezone: slot.timezone ?? named?.timezone ?? null,
    durationMinutes:
      slots.find((candidate) => candidate.durationMinutes !== null)?.durationMinutes ??
      durationInText(input.text),
  };
}

function inferYear(date: FoundDate, received: { year: number; month: number; day: number }): number {
  const receivedKey = received.month * 100 + received.day;
  const key = date.month * 100 + date.day;
  // On or after the receipt day this year (one day of slack), else next year.
  return key >= receivedKey - 1 ? received.year : received.year + 1;
}
