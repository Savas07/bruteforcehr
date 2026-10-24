import { describe, expect, it } from "vitest";
import { InterviewSchema } from "../application";
import { durationInText, interviewSlotInText, meetingUrlsIn, parseIcs, wallTimeToInstant } from "./calendar";
import { interviewFromSuggestion, interviewKindOf, interviewSuggestionFromMail } from "./interviews";
import type { MailExtraction } from "./schemas";

const received = new Date("2026-10-26T10:00:00Z");
const noExtraction: MailExtraction = {
  company: null,
  role: null,
  contactName: null,
  contactEmail: null,
  dates: [],
  meetingUrls: [],
};

describe("zones", () => {
  it("reads wall times in IANA zones across DST", () => {
    expect(wallTimeToInstant({ year: 2026, month: 7, day: 1, hour: 10, minute: 0 }, "Europe/Berlin")).toEqual(
      new Date("2026-07-01T08:00:00Z"),
    );
    expect(
      wallTimeToInstant({ year: 2026, month: 11, day: 3, hour: 10, minute: 0 }, "Europe/Berlin"),
    ).toEqual(new Date("2026-11-03T09:00:00Z"));
    expect(wallTimeToInstant({ year: 2026, month: 2, day: 30, hour: 10, minute: 0 }, "UTC")).toBeNull();
    expect(wallTimeToInstant({ year: 2026, month: 2, day: 3, hour: 10, minute: 0 }, "Mars/Base")).toBeNull();
  });
});

describe("iCalendar", () => {
  it("unfolds lines, maps Windows zones and reads DTEND, location and the Teams link", () => {
    const [event] = parseIcs(
      `BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
SUMMARY:Fachgespräch
DTSTART;TZID=W. Europe Standard Time:20261105T100000
DTEND;TZID=W. Europe Standard Time:20261105T104500
LOCATION:Microsoft Teams-Besprechung
X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/1
 9%3ameeting_Ym%40thread.v2/0
BEGIN:VALARM
TRIGGER:-PT15M
DTSTART:20200101T000000Z
END:VALARM
END:VEVENT
END:VCALENDAR`,
      "Europe/Istanbul",
    );
    expect(event).toEqual({
      summary: "Fachgespräch",
      start: new Date("2026-11-05T09:00:00Z"),
      end: new Date("2026-11-05T09:45:00Z"),
      timezone: "Europe/Berlin",
      allDay: false,
      location: "Microsoft Teams-Besprechung",
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_Ym%40thread.v2/0",
      cancelled: false,
    });
  });

  it("reads UTC, floating, vendor-prefixed and all-day times, DURATION and cancellations", () => {
    const events = parseIcs(
      `BEGIN:VCALENDAR
METHOD:CANCEL
BEGIN:VEVENT
DTSTART:20261110T070000Z
DURATION:PT1H30M
LOCATION:https://us06web.zoom.us/j/81234567890?pwd=x
END:VEVENT
BEGIN:VEVENT
DTSTART:20261104T150000
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=/mozilla.org/20050126_1/Europe/London:20261104T150000
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261104
END:VEVENT
END:VCALENDAR`,
      "Europe/Berlin",
    );
    expect(
      events.map((e) => [
        e.start.toISOString(),
        e.end?.toISOString() ?? null,
        e.timezone,
        e.allDay,
        e.cancelled,
      ]),
    ).toEqual([
      ["2026-11-10T07:00:00.000Z", "2026-11-10T08:30:00.000Z", "UTC", false, true],
      ["2026-11-04T14:00:00.000Z", null, null, false, true],
      ["2026-11-04T15:00:00.000Z", null, "Europe/London", false, true],
      ["2026-11-03T23:00:00.000Z", null, null, true, true],
    ]);
    expect(events[0]?.meetingUrl).toBe("https://us06web.zoom.us/j/81234567890?pwd=x");
  });
});

describe("explicit interview times", () => {
  const slot = (text: string, zone = "Europe/Istanbul") =>
    interviewSlotInText({ text, receivedAt: received, userTimeZone: zone });

  it("reads EN/DE/TR dates, ranges, zones and offsets", () => {
    expect(slot("on Thursday, 5 November 2026 at 2:00 PM – 2:45 PM CET.")).toEqual({
      startsAt: new Date("2026-11-05T13:00:00Z"),
      timezone: "Europe/Berlin",
      durationMinutes: 45,
    });
    expect(slot("Termin: am Dienstag, 03.11.2026, von 10:00 bis 11:00 Uhr", "Europe/Berlin")).toEqual({
      startsAt: new Date("2026-11-03T09:00:00Z"),
      timezone: null,
      durationMinutes: 60,
    });
    expect(slot("Tarih: 5 Kasım 2026 Perşembe günü saat 14:00. 45 dakikalık bir görüşme.")).toEqual({
      startsAt: new Date("2026-11-05T11:00:00Z"),
      timezone: null,
      durationMinutes: 45,
    });
    expect(slot("12 Kasım 2026 saat 16:30 (GMT+3) uygun mu?")?.startsAt).toEqual(
      new Date("2026-11-12T13:30:00Z"),
    );
    expect(slot("10:30am - 11:00am, Wednesday, October 28, 2026 (Eastern Time - US & Canada)")).toEqual({
      startsAt: new Date("2026-10-28T14:30:00Z"),
      timezone: "America/New_York",
      durationMinutes: 30,
    });
    expect(slot("Termin: Mittwoch, 2. Dezember 2026, 9:00 Uhr (Wiener Zeit)")?.timezone).toBe(
      "Europe/Vienna",
    );
  });

  it("ignores restatements in other zones and quoted replies, and gives up on a choice of slots", () => {
    expect(
      slot(`Confirmed: Wednesday 28 October at 10:00 ET (17:00 Istanbul time).

On Mon, 19 Oct 2026 at 09:14, Deniz <deniz@example.com> wrote:
> could we do Tuesday 27 October at 15:00 instead?`)?.startsAt,
    ).toEqual(new Date("2026-10-28T14:00:00Z"));
    expect(slot("Would Tuesday 3 November at 10:00 or Wednesday 4 November at 15:00 work?")).toBeNull();
    expect(slot("Does 10:00 work for you?")).toBeNull();
  });

  it("finds durations and meeting links", () => {
    expect(durationInText("a 30-minütigen Videocall")).toBe(30);
    expect(durationInText("1 saatlik bir görüşme")).toBe(60);
    expect(durationInText("half an hour")).toBe(30);
    expect(durationInText("05.11.2026 saat 14:00")).toBeNull();
    expect(
      meetingUrlsIn("Join: https://meet.google.com/abc-defg-hij. Or https://acme.zoom.us/j/123)"),
    ).toEqual(["https://meet.google.com/abc-defg-hij", "https://acme.zoom.us/j/123"]);
  });
});

describe("interview suggestions", () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Interview – Larkspur Health
DTSTART;TZID=Europe/London:20261103T150000
DTEND;TZID=Europe/London:20261103T153000
X-GOOGLE-CONFERENCE:https://meet.google.com/xqa-pmtr-vdk
END:VEVENT
END:VCALENDAR`;

  it("prefers the calendar part, then the model's single interview date, then the text", () => {
    const base = {
      category: "interview_invite" as const,
      subject: "Interview",
      bodyText: "Thursday, 5 November 2026 at 14:00 CET, 45 minutes.",
      receivedAt: received,
      userTimeZone: "Europe/Istanbul",
    };
    expect(interviewSuggestionFromMail({ ...base, calendars: [ics], extracted: noExtraction })).toEqual({
      title: "Interview – Larkspur Health",
      startsAt: new Date("2026-11-03T15:00:00Z"),
      durationMinutes: 30,
      timezone: "Europe/London",
      location: null,
      meetingUrl: "https://meet.google.com/xqa-pmtr-vdk",
      source: "calendar",
      interviewId: null,
    });
    const modelDate = new Date("2026-11-05T13:00:00Z");
    expect(
      interviewSuggestionFromMail({
        ...base,
        calendars: [],
        extracted: {
          ...noExtraction,
          dates: [{ kind: "interview", at: modelDate, timezone: null, label: "Technical interview" }],
        },
      }),
    ).toMatchObject({ source: "model", startsAt: modelDate, durationMinutes: 45, timezone: "Europe/Berlin" });
    expect(interviewSuggestionFromMail({ ...base, calendars: [], extracted: noExtraction })).toMatchObject({
      source: "text",
      title: "Interview",
      startsAt: modelDate,
    });
    expect(
      interviewSuggestionFromMail({
        ...base,
        category: "rejection",
        calendars: [ics],
        extracted: noExtraction,
      }),
    ).toBeNull();
  });

  it("builds a valid interview on confirm", () => {
    const suggestion = interviewSuggestionFromMail({
      category: "interview_invite",
      subject: "Kennenlernen",
      bodyText: "Passt dir Freitag, 06.11.2026, um 16:00 Uhr?",
      calendars: [],
      receivedAt: received,
      userTimeZone: "Europe/Berlin",
      extracted: noExtraction,
    });
    if (suggestion === null) throw new Error("expected a suggestion");
    const interview = interviewFromSuggestion({
      message: {
        id: "m1",
        subject: "Kennenlernen",
        suggestedStatus: "screening",
        extracted: { ...noExtraction, contactName: "Lena Vogel", contactEmail: "lena@nordlicht.example" },
      },
      suggestion,
      applicationId: "a1",
      existingInterviews: 1,
      userTimeZone: "Europe/Berlin",
      now: received,
    });
    expect(InterviewSchema.parse({ id: "m1", ...interview })).toMatchObject({
      round: 2,
      kind: "recruiter_call",
      durationMinutes: 30,
      timezone: "Europe/Berlin",
      startsAt: new Date("2026-11-06T15:00:00Z"),
      people: [{ name: "Lena Vogel", title: null, email: "lena@nordlicht.example", contactId: null }],
      sourceMailMessageId: "m1",
    });
    expect(interviewKindOf({ screening: false, wording: "Technisches Interview" })).toBe("technical");
    expect(interviewKindOf({ screening: false, wording: "Final round" })).toBe("final");
  });
});
