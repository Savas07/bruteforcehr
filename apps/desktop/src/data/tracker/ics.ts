/**
 * Interviews as iCalendar files (RFC 5545) for "Add to calendar": one VEVENT per interview at its
 * real instant, written in the organiser's time zone (`DTSTART;TZID=…` plus a VTIMEZONE built from
 * the zone's actual offset changes), so calendars show the right time wherever the user is. UTC
 * interviews use UTC times (`…Z`). Lines are CRLF-terminated and folded at 75 octets.
 */
import type { Application, Interview } from "@bfhr/core";
import { defineMessages, type IntlShape } from "react-intl";
import { saveExportFile } from "../../lib/cvExport";

/** One calendar event, already worded for the user. */
export interface IcsEvent {
  /** Globally unique and stable: re-importing updates the same event. */
  readonly uid: string;
  readonly start: Date;
  readonly durationMinutes: number;
  /** IANA zone the times are written in. */
  readonly timeZone: string;
  readonly summary: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly url: string | null;
  readonly lastModified: Date;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** VTIMEZONE covers offset changes from a year before the first event to a year after the last. */
const ZONE_MARGIN_MS = 366 * DAY_MS;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** `20261028T090000Z`. */
function utcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

/** The wall clock in `timeZone` at `date`, as if it were a UTC time (ms). */
function wallClockMs(date: Date, timeZone: string): number {
  let formatter = wallFormatters.get(timeZone);
  if (!formatter) {
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
    wallFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return Date.UTC(
    parts["year"] ?? 1970,
    (parts["month"] ?? 1) - 1,
    parts["day"] ?? 1,
    parts["hour"] ?? 0,
    parts["minute"] ?? 0,
    parts["second"] ?? 0,
  );
}

/** Offset of `timeZone` from UTC at `date`, in whole minutes. */
function offsetMinutes(date: Date, timeZone: string): number {
  return Math.round((wallClockMs(date, timeZone) - Math.floor(date.getTime() / 1000) * 1000) / MINUTE_MS);
}

/** `20261028T120000` (local, floating form used with TZID). */
function localStamp(wallMs: number): string {
  return utcStamp(new Date(wallMs)).slice(0, -1);
}

/** `+0300`, `-0430`. */
function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
}

/** The first minute at which the offset differs from the one at `from` (offset changes within (from, to]). */
function transitionBetween(from: number, to: number, timeZone: string): number {
  const before = offsetMinutes(new Date(from), timeZone);
  let low = from;
  let high = to;
  while (high - low > MINUTE_MS) {
    const middle = low + Math.floor((high - low) / 2 / MINUTE_MS) * MINUTE_MS;
    if (offsetMinutes(new Date(middle), timeZone) === before) low = middle;
    else high = middle;
  }
  return high;
}

/**
 * A VTIMEZONE for `timeZone` valid over [from, to]: the offset in force before `from`, then every
 * change in the range as its own observance (no RRULE, so it is exact for this zone's history).
 */
function vtimezone(timeZone: string, from: number, to: number): string[] {
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  const observance = (kind: "STANDARD" | "DAYLIGHT", start: string, fromOffset: number, toOffset: number) => {
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${start}`,
      `TZOFFSETFROM:${offsetText(fromOffset)}`,
      `TZOFFSETTO:${offsetText(toOffset)}`,
      `END:${kind}`,
    );
  };
  const initial = offsetMinutes(new Date(from), timeZone);
  observance("STANDARD", "19700101T000000", initial, initial);
  let previous = initial;
  for (let day = from; day < to; day += DAY_MS) {
    const next = Math.min(day + DAY_MS, to);
    const offset = offsetMinutes(new Date(next), timeZone);
    if (offset === previous) continue;
    const at = transitionBetween(day, next, timeZone);
    // DTSTART of an observance is the local time of the change in the offset it replaces.
    observance(
      offset > previous ? "DAYLIGHT" : "STANDARD",
      localStamp(at + previous * MINUTE_MS),
      previous,
      offset,
    );
    previous = offset;
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets without splitting a UTF-8 character (§3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (octets + size > limit) {
      out.push(current);
      current = "";
      octets = 0;
    }
    current += character;
    octets += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** One VCALENDAR with every event (and one VTIMEZONE per zone used). */
export function eventsToIcs(events: readonly IcsEvent[], now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BruteForceHR//Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const zones = new Map<string, { from: number; to: number }>();
  for (const event of events) {
    if (event.timeZone === "UTC") continue;
    const start = event.start.getTime();
    const range = zones.get(event.timeZone) ?? { from: start, to: start };
    zones.set(event.timeZone, { from: Math.min(range.from, start), to: Math.max(range.to, start) });
  }
  for (const [zone, range] of zones) {
    lines.push(...vtimezone(zone, range.from - ZONE_MARGIN_MS, range.to + ZONE_MARGIN_MS));
  }
  for (const event of events) {
    const end = new Date(event.start.getTime() + event.durationMinutes * MINUTE_MS);
    const time = (name: string, date: Date) =>
      event.timeZone === "UTC"
        ? `${name}:${utcStamp(date)}`
        : `${name};TZID=${event.timeZone}:${localStamp(wallClockMs(date, event.timeZone))}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `LAST-MODIFIED:${utcStamp(event.lastModified)}`,
      time("DTSTART", event.start),
      time("DTEND", end),
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// ─── Interviews ────────────────────────────────────────────────────────────────────────────────

const messages = defineMessages({
  summary: {
    id: "shared.ics.summary",
    defaultMessage: "{title} · {company}",
    description: "Calendar event title for an interview: the interview's title and the company",
  },
  role: { id: "shared.ics.role", defaultMessage: "Role: {role}" },
  round: { id: "shared.ics.round", defaultMessage: "Round {round}" },
  people: { id: "shared.ics.people", defaultMessage: "With: {people}" },
  meeting: { id: "shared.ics.meeting", defaultMessage: "Join: {url}" },
  prep: { id: "shared.ics.prep", defaultMessage: "Prep notes:" },
});

export interface IcsInterview {
  readonly interview: Interview;
  readonly application: Pick<Application, "company" | "role">;
}

/** The calendar event of an interview, worded in the UI language. */
export function interviewIcsEvent({ interview, application }: IcsInterview, intl: IntlShape): IcsEvent {
  const people = interview.people
    .map((person) => (person.title ? `${person.name} (${person.title})` : person.name))
    .join(", ");
  const description = [
    intl.formatMessage(messages.role, { role: application.role }),
    intl.formatMessage(messages.round, { round: interview.round }),
    people ? intl.formatMessage(messages.people, { people }) : null,
    interview.meetingUrl ? intl.formatMessage(messages.meeting, { url: interview.meetingUrl }) : null,
    interview.prepNotes.trim()
      ? `\n${intl.formatMessage(messages.prep)}\n${interview.prepNotes.trim()}`
      : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
  return {
    uid: `${interview.id}@bruteforcehr.web.app`,
    start: interview.startsAt,
    durationMinutes: interview.durationMinutes,
    timeZone: interview.timezone,
    summary: intl.formatMessage(messages.summary, { title: interview.title, company: application.company }),
    description,
    location: interview.location,
    url: interview.meetingUrl,
    lastModified: interview.updatedAt,
  };
}

export function interviewsToIcs(items: readonly IcsInterview[], intl: IntlShape, now: Date): string {
  return eventsToIcs(
    items.map((item) => interviewIcsEvent(item, intl)),
    now,
  );
}

/** `Interview-Acme Robotics-Round 2.ics`: a plain file name (no path separators or reserved characters). */
export function icsFileName({ interview, application }: IcsInterview): string {
  // Characters Windows and macOS refuse in file names, and control characters, become spaces.
  const safe = [...`${application.company}-${interview.title}`]
    .map((character) => (character < " " || '\\/:*?"<>|'.includes(character) ? " " : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `Interview-${safe.slice(0, 120)}.ics`;
}

/** Saves `.ics` text through the native Save dialog; returns the path, or null when cancelled. */
export function saveIcsFile(fileName: string, ics: string): Promise<string | null> {
  return saveExportFile(encoder.encode(ics), fileName, "ics");
}
