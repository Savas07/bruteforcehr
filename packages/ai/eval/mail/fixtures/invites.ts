import type { InviteEvalCase } from "../types";

/**
 * Interview invites with a calendar part (Google Calendar, Outlook/Teams, Zoom, floating times)
 * or explicit times in the text (EN/TR/DE, ranges, zones, offsets, Calendly), fictional parties.
 * Default persona zone: Europe/Istanbul.
 */
export const INVITE_CASES: InviteEvalCase[] = [
  {
    id: "invite-en-01",
    language: "en",
    hard: null,
    message: {
      from: { name: "Priya Shah (via Google Calendar)", address: "calendar-notification@google.com" },
      subject: "Invitation: Interview – Deniz / Larkspur Health @ Tue 3 Nov 2026 15:00 - 15:30 (GMT)",
      receivedAt: "2026-10-26T10:04:00+00:00",
      bodyText: `Priya Shah has invited you to an event.

Interview – Deniz / Larkspur Health
Tuesday 3 Nov 2026 ⋅ 15:00 – 15:30 (United Kingdom Time)
Join with Google Meet: https://meet.google.com/xqa-pmtr-vdk

Invitation from Google Calendar`,
      calendar: `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
DTSTART:19701025T020000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/London:20261103T150000
DTEND;TZID=Europe/London:20261103T153000
DTSTAMP:20261026T100400Z
ORGANIZER;CN=Priya Shah:mailto:priya.shah@larkspur-health.example
UID:5k1m3n0p@google.com
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=deni
 z@example.com:mailto:deniz@example.com
X-GOOGLE-CONFERENCE:https://meet.google.com/xqa-pmtr-vdk
DESCRIPTION:Hi Deniz\\, looking forward to our chat!\\n\\nJoin with Google Meet
 : https://meet.google.com/xqa-pmtr-vdk
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Interview – Deniz / Larkspur Health
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-P0DT0H10M0S
END:VALARM
END:VEVENT
END:VCALENDAR`,
    },
    expected: {
      startsAt: "2026-11-03T15:00:00Z",
      timezone: "Europe/London",
      durationMinutes: 30,
      meetingUrl: "https://meet.google.com/xqa-pmtr-vdk",
    },
  },
  {
    id: "invite-de-01",
    language: "de",
    hard: "Outlook invite: Windows zone name, folded Teams link.",
    message: {
      from: { name: "Lena Vogel", address: "lena.vogel@nordlicht-mobility.de" },
      subject: "Vorstellungsgespräch Frontend Engineer – Nordlicht Mobility",
      receivedAt: "2026-10-27T13:15:00+01:00",
      bodyText: `Hallo Deniz,

wie besprochen sende ich dir die Einladung zu unserem Fachgespräch.

________________________________________________________________________________
Microsoft Teams-Besprechung
Nehmen Sie auf dem Computer, in der mobilen App oder im Raumgerät teil
Klicken Sie hier, um an der Besprechung teilzunehmen
________________________________________________________________________________`,
      calendar: `BEGIN:VCALENDAR
METHOD:REQUEST
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:W. Europe Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
ORGANIZER;CN=Lena Vogel:mailto:lena.vogel@nordlicht-mobility.de
SUMMARY;LANGUAGE=de-DE:Fachgespräch Frontend Engineer
DTSTART;TZID=W. Europe Standard Time:20261105T100000
DTEND;TZID=W. Europe Standard Time:20261105T110000
UID:040000008200E00074C5B7101A82E00800000000
CLASS:PUBLIC
PRIORITY:5
DTSTAMP:20261027T121500Z
TRANSP:OPAQUE
STATUS:CONFIRMED
SEQUENCE:0
LOCATION;LANGUAGE=de-DE:Microsoft Teams-Besprechung
X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/1
 9%3ameeting_YmFkZjQ1NjI%40thread.v2/0?context=%7b%22Tid%22%3a%22c0ffee%22%7d
END:VEVENT
END:VCALENDAR`,
    },
    userTimeZone: "Europe/Berlin",
    expected: {
      startsAt: "2026-11-05T09:00:00Z",
      timezone: "Europe/Berlin",
      durationMinutes: 60,
      meetingUrl:
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_YmFkZjQ1NjI%40thread.v2/0?context=%7b%22Tid%22%3a%22c0ffee%22%7d",
    },
  },
  {
    id: "invite-tr-01",
    language: "tr",
    hard: "UTC times and the Zoom link in LOCATION.",
    message: {
      from: { name: "Pazarix İK", address: "ik@pazarix.example" },
      subject: "Teknik Mülakat Daveti – Frontend Geliştirici",
      receivedAt: "2026-10-28T09:30:00+03:00",
      bodyText: `Merhaba Deniz,

Teknik mülakat davetimiz ektedir. Takvim davetini kabul etmeniz yeterli.

Sevgiler,
Pazarix İnsan Kaynakları`,
      calendar: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Zoom Video Communications//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:zoom-81234567890
DTSTAMP:20261028T063000Z
DTSTART:20261110T070000Z
DTEND:20261110T074500Z
SUMMARY:Teknik Mülakat - Frontend Geliştirici
LOCATION:https://us06web.zoom.us/j/81234567890?pwd=bXJ0c2Z3
DESCRIPTION:Zoom toplantısına katılın\\nhttps://us06web.zoom.us/j/81234567890?pwd=bXJ0c2Z3
END:VEVENT
END:VCALENDAR`,
    },
    expected: {
      startsAt: "2026-11-10T07:00:00Z",
      timezone: "UTC",
      durationMinutes: 45,
      meetingUrl: "https://us06web.zoom.us/j/81234567890?pwd=bXJ0c2Z3",
    },
  },
  {
    id: "invite-de-02",
    language: "de",
    hard: "Calendar part with a floating time: read in the persona's zone, no zone stated.",
    message: {
      from: { name: "Hanseatic Freight Recruiting", address: "karriere@hanseatic-freight.example" },
      subject: "Einladung zum persönlichen Gespräch",
      receivedAt: "2026-10-26T16:00:00+01:00",
      bodyText: `Sehr geehrte:r Deniz,

anbei die Termineinladung für unser Gespräch vor Ort in unserem Büro.

Mit freundlichen Grüßen
Personalabteilung`,
      calendar: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Personio//Interview//DE
BEGIN:VEVENT
UID:pers-55120
DTSTART:20261104T150000
DTEND:20261104T153000
SUMMARY:Persönliches Gespräch – Data Analyst
LOCATION:Büro Hamburg\\, Großer Burstah 12
END:VEVENT
END:VCALENDAR`,
    },
    userTimeZone: "Europe/Berlin",
    expected: {
      startsAt: "2026-11-04T14:00:00Z",
      timezone: null,
      durationMinutes: 30,
      meetingUrl: null,
    },
  },
  {
    id: "invite-en-02",
    language: "en",
    hard: null,
    message: {
      from: { name: "Tom Becker", address: "tom.becker@quarry-systems.example" },
      subject: "Technical interview – Backend Engineer (Go)",
      receivedAt: "2026-10-27T09:00:00+01:00",
      bodyText: `Hi Deniz,

Thanks for your time last week. We'd like to invite you to a technical interview with two of our engineers on Thursday, 5 November 2026 at 2:00 PM – 2:45 PM CET.

Zoom: https://quarry.zoom.us/j/93456781234

Best regards,
Tom Becker
Engineering Manager, Quarry Systems`,
      calendar: null,
    },
    expected: {
      startsAt: "2026-11-05T13:00:00Z",
      timezone: "Europe/Berlin",
      durationMinutes: 45,
      meetingUrl: "https://quarry.zoom.us/j/93456781234",
    },
  },
  {
    id: "invite-de-03",
    language: "de",
    hard: "No zone in the text: the persona's zone applies.",
    message: {
      from: { name: "Mainfeld Digital Recruiting", address: "jobs@mainfeld-digital.example" },
      subject: "Einladung: Kennenlerngespräch Site Reliability Engineer",
      receivedAt: "2026-10-28T11:00:00+01:00",
      bodyText: `Hallo Deniz,

vielen Dank für deine Bewerbung! Wir laden dich herzlich zu einem ersten Kennenlernen ein:

Termin: am Dienstag, 03.11.2026, von 10:00 bis 11:00 Uhr
Ort: Microsoft Teams – https://teams.microsoft.com/l/meetup-join/19%3ameeting_MmQ3Y2E%40thread.v2/0

Viele Grüße
Sabine Kraus, Talent Acquisition`,
      calendar: null,
    },
    userTimeZone: "Europe/Berlin",
    expected: {
      startsAt: "2026-11-03T09:00:00Z",
      timezone: null,
      durationMinutes: 60,
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_MmQ3Y2E%40thread.v2/0",
    },
  },
  {
    id: "invite-tr-02",
    language: "tr",
    hard: "Turkish date with weekday and a separate duration phrase.",
    message: {
      from: { name: "Lale Bank İnsan Kaynakları", address: "kariyer@lalebank.example" },
      subject: "Mülakat Daveti – Yazılım Geliştirme Uzmanı",
      receivedAt: "2026-10-29T15:20:00+03:00",
      bodyText: `Merhaba Deniz Hanım,

Yazılım Geliştirme Uzmanı pozisyonu için yaptığınız başvuru kapsamında sizi 45 dakikalık bir görüşmeye davet etmek isteriz.

Tarih: 5 Kasım 2026 Perşembe günü saat 14:00
Bağlantı: https://meet.google.com/lbk-qwer-tyu

Saygılarımızla,
Lale Bank İnsan Kaynakları`,
      calendar: null,
    },
    expected: {
      startsAt: "2026-11-05T11:00:00Z",
      timezone: null,
      durationMinutes: 45,
      meetingUrl: "https://meet.google.com/lbk-qwer-tyu",
    },
  },
  {
    id: "invite-en-03",
    language: "en",
    hard: "Calendly confirmation: time range before the date, zone after it.",
    message: {
      from: { name: "Calendly", address: "notifications@calendly.com" },
      subject: "Confirmed: 30 Minute Interview with Marcus Reid on Wednesday, October 28, 2026",
      receivedAt: "2026-10-22T18:40:00+03:00",
      bodyText: `Hi Deniz,

A new event has been scheduled.

Event Type:
30 Minute Interview

Event Date/Time:
10:30am - 11:00am, Wednesday, October 28, 2026 (Eastern Time - US & Canada)

Location:
This is a Zoom web conference. You can join this meeting from your computer, tablet, or smartphone.
https://us02web.zoom.us/j/84561237890

Need to make changes to this event?
Cancel: https://calendly.com/cancellations/AB12
Reschedule: https://calendly.com/reschedulings/AB12`,
      calendar: null,
    },
    expected: {
      startsAt: "2026-10-28T14:30:00Z",
      timezone: "America/New_York",
      durationMinutes: 30,
      meetingUrl: "https://us02web.zoom.us/j/84561237890",
    },
  },
  {
    id: "invite-en-04",
    language: "en",
    hard: "Reply thread: a restatement in the user's zone and an older quoted proposal.",
    message: {
      from: { name: "Marcus Reid", address: "marcus@brightwave.io" },
      subject: "Re: Brightwave — next step with the Editor team",
      receivedAt: "2026-10-19T20:05:00+03:00",
      bodyText: `Hi Deniz,

Works for me — confirmed: Wednesday 28 October at 10:00 ET (17:00 Istanbul time), a 45-minute conversation with me and our design lead.

Google Meet: https://meet.google.com/bwq-ztkx-rmh

Best,
Marcus

On Mon, 19 Oct 2026 at 09:14, Deniz Yılmaz <deniz@example.com> wrote:
> Hi Marcus, could we do Tuesday 27 October at 15:00 instead?
> Thanks, Deniz`,
      calendar: null,
    },
    expected: {
      startsAt: "2026-10-28T14:00:00Z",
      timezone: "America/New_York",
      durationMinutes: 45,
      meetingUrl: "https://meet.google.com/bwq-ztkx-rmh",
    },
  },
  {
    id: "invite-tr-03",
    language: "tr",
    hard: "UTC offset instead of a zone name.",
    message: {
      from: { name: "Kızılay Yazılım", address: "ik@kizilay-yazilim.example" },
      subject: "Görüşme Daveti – Kıdemli Veri Mühendisi",
      receivedAt: "2026-10-30T10:10:00+03:00",
      bodyText: `Merhaba Deniz,

Ekibimizle 1 saatlik bir teknik görüşme için 12 Kasım 2026 saat 16:30 (GMT+3) uygun mudur?
Teams bağlantısı: https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZGVmNDU%40thread.v2/0

İyi çalışmalar,
Kızılay Yazılım İK`,
      calendar: null,
    },
    expected: {
      startsAt: "2026-11-12T13:30:00Z",
      timezone: null,
      durationMinutes: 60,
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZGVmNDU%40thread.v2/0",
    },
  },
];
