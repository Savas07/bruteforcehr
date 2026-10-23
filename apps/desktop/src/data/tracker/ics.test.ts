import type { Interview } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { eventsToIcs, type IcsEvent, icsFileName, interviewsToIcs } from "./ics";

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const now = new Date("2026-10-23T08:00:00.000Z");

const event = (overrides: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "int-1@bruteforcehr.web.app",
  start: new Date("2026-10-28T13:30:00.000Z"),
  durationMinutes: 45,
  timeZone: "Europe/Berlin",
  summary: "Technical interview · Acme",
  description: null,
  location: null,
  url: null,
  lastModified: now,
  ...overrides,
});

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("eventsToIcs", () => {
  it("writes a CRLF calendar with the event at its local time in its zone", () => {
    const ics = eventsToIcs([event()], now);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
    const lines = unfold(ics).split("\r\n");
    expect(lines.slice(0, 5)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BruteForceHR//Tracker//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ]);
    // 28 Oct 2026: Berlin is back on CET (+01:00) since 25 Oct.
    expect(lines).toContain("DTSTART;TZID=Europe/Berlin:20261028T143000");
    expect(lines).toContain("DTEND;TZID=Europe/Berlin:20261028T151500");
    expect(lines).toContain("DTSTAMP:20261023T080000Z");
    expect(lines).toContain("UID:int-1@bruteforcehr.web.app");
  });

  it("describes the zone's real offset changes around the event", () => {
    const lines = unfold(eventsToIcs([event()], now)).split("\r\n");
    const zone = lines.slice(lines.indexOf("BEGIN:VTIMEZONE"), lines.indexOf("END:VTIMEZONE") + 1);
    expect(zone).toContain("TZID:Europe/Berlin");
    // The change to summer time on 29 Mar 2026 at 02:00 CET and back on 25 Oct 2026 at 03:00 CEST.
    expect(zone.join("\n")).toContain(
      "BEGIN:DAYLIGHT\nDTSTART:20260329T020000\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nEND:DAYLIGHT",
    );
    expect(zone.join("\n")).toContain(
      "BEGIN:STANDARD\nDTSTART:20261025T030000\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nEND:STANDARD",
    );
  });

  it("keeps a zone without changes to one observance and writes UTC events in UTC", () => {
    const lines = unfold(
      eventsToIcs([event({ timeZone: "Europe/Istanbul" }), event({ uid: "u2", timeZone: "UTC" })], now),
    ).split("\r\n");
    expect(lines).toContain("DTSTART;TZID=Europe/Istanbul:20261028T163000");
    expect(lines.filter((line) => line.startsWith("TZOFFSETTO"))).toEqual(["TZOFFSETTO:+0300"]);
    expect(lines).toContain("DTSTART:20261028T133000Z");
    expect(lines.filter((line) => line === "BEGIN:VTIMEZONE")).toHaveLength(1);
  });

  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    const description = `Ask about the team; budget, and "growth"\nŞule Yılmaz — ${"ğ".repeat(80)}`;
    const ics = eventsToIcs([event({ description })], now);
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(
      `DESCRIPTION:Ask about the team\\; budget\\, and "growth"\\nŞule Yılmaz — ${"ğ".repeat(80)}`,
    );
  });
});

describe("interviewsToIcs", () => {
  const interview: Interview = {
    id: "int-9",
    applicationId: "a1",
    round: 2,
    kind: "technical",
    title: "Technical interview",
    startsAt: new Date("2026-10-28T13:30:00.000Z"),
    durationMinutes: 60,
    timezone: "America/New_York",
    location: "Zoom",
    meetingUrl: "https://zoom.us/j/123",
    people: [{ name: "Ana Ruiz", title: "Engineering Manager", email: null, contactId: null }],
    prepNotes: "System design: caching",
    sourceMailMessageId: null,
    createdAt: now,
    updatedAt: now,
  };

  it("words the event and keeps the organiser's zone", () => {
    const lines = unfold(
      interviewsToIcs([{ interview, application: { company: "Acme", role: "Engineer" } }], intl, now),
    ).split("\r\n");
    expect(lines).toContain("SUMMARY:Technical interview · Acme");
    expect(lines).toContain("DTSTART;TZID=America/New_York:20261028T093000");
    expect(lines).toContain("LOCATION:Zoom");
    expect(lines).toContain("URL:https://zoom.us/j/123");
    expect(lines.find((line) => line.startsWith("DESCRIPTION:"))).toBe(
      "DESCRIPTION:Role: Engineer\\nRound 2\\nWith: Ana Ruiz (Engineering Manager)\\nJoin: https://zoom.us/j/123\\n\\nPrep notes:\\nSystem design: caching",
    );
  });

  it("names the file without path or reserved characters", () => {
    expect(
      icsFileName({
        interview: { ...interview, title: "Round 2: Tech/Design" },
        application: { company: "A*B", role: "Engineer" },
      }),
    ).toBe("Interview-A B-Round 2 Tech Design.ics");
  });
});
