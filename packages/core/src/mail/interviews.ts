import type { Interview, InterviewKind } from "../application";
import { UrlSchema } from "../common";
import type { MailCategory } from "../enums";
import { foldText } from "../jobs/normalize";
import { durationInText, interviewSlotInText, isIanaTimeZone, meetingUrlsIn, parseIcs } from "./calendar";
import type { InterviewSuggestion, MailExtraction, MailMessage } from "./schemas";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export interface InterviewSuggestionInput {
  category: MailCategory;
  subject: string;
  bodyText: string;
  /** `text/calendar` parts and `.ics` attachments of the message. */
  calendars: readonly string[];
  receivedAt: Date;
  /** Profile zone: floating ICS times and texts without a zone are read in it. */
  userTimeZone: string;
  extracted: MailExtraction;
}

/**
 * The interview an `interview_invite` proposes, or null. Sources, most reliable first: a calendar
 * invite (VEVENT, not cancelled, not all-day), the model's single `interview` date, an explicit
 * date + time in the text (`interviewSlotInText`). Length from DTEND/DURATION, a time range or a
 * duration phrase; meeting link from the invite, the extraction or the text.
 */
export function interviewSuggestionFromMail(input: InterviewSuggestionInput): InterviewSuggestion | null {
  if (input.category !== "interview_invite") return null;
  const userZone = isIanaTimeZone(input.userTimeZone) ? input.userTimeZone : "UTC";
  const notBefore = input.receivedAt.getTime() - DAY_MS;
  const event = input.calendars
    .flatMap((ics) => parseIcs(ics, userZone))
    .find((candidate) => !candidate.cancelled && !candidate.allDay && candidate.start.getTime() >= notBefore);
  const textMeeting =
    input.extracted.meetingUrls[0] ?? meetingUrlsIn(`${input.subject}\n${input.bodyText}`)[0] ?? null;
  const subject = input.subject.trim();

  let suggestion: Omit<InterviewSuggestion, "meetingUrl" | "title"> & {
    meetingUrl: string | null;
    title: string | null;
  };
  if (event !== undefined) {
    const minutes =
      event.end === null ? null : Math.round((event.end.getTime() - event.start.getTime()) / MINUTE_MS);
    const location =
      event.location !== null && !/^https?:\/\/\S+$/u.test(event.location) ? event.location : null;
    suggestion = {
      title: event.summary,
      startsAt: event.start,
      durationMinutes: minutes !== null && minutes >= 5 && minutes <= 600 ? minutes : null,
      timezone: event.timezone,
      location: location?.slice(0, 300) ?? null,
      meetingUrl: event.meetingUrl ?? textMeeting,
      source: "calendar",
      interviewId: null,
    };
  } else {
    const modelDates = [
      ...new Map(
        input.extracted.dates
          .filter((date) => date.kind === "interview")
          .map((date) => [date.at.getTime(), date] as const),
      ).values(),
    ];
    const slot = interviewSlotInText({
      text: input.bodyText,
      receivedAt: input.receivedAt,
      userTimeZone: userZone,
    });
    const [modelDate] = modelDates;
    if (modelDates.length === 1 && modelDate !== undefined) {
      const sameSlot = slot !== null && slot.startsAt.getTime() === modelDate.at.getTime();
      suggestion = {
        title: modelDate.label.trim() || null,
        startsAt: modelDate.at,
        durationMinutes: (sameSlot ? slot.durationMinutes : null) ?? durationInText(input.bodyText),
        timezone: modelDate.timezone ?? (sameSlot ? slot.timezone : null),
        location: null,
        meetingUrl: textMeeting,
        source: "model",
        interviewId: null,
      };
    } else if (slot !== null) {
      suggestion = {
        title: null,
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        timezone: slot.timezone,
        location: null,
        meetingUrl: textMeeting,
        source: "text",
        interviewId: null,
      };
    } else {
      return null;
    }
  }
  const meetingUrl =
    suggestion.meetingUrl !== null && UrlSchema.safeParse(suggestion.meetingUrl).success
      ? suggestion.meetingUrl
      : null;
  return {
    ...suggestion,
    title: (suggestion.title ?? (subject || "Interview")).slice(0, 200),
    meetingUrl,
  };
}

/** Interview kinds named in a title or subject (EN/TR/DE, folded). */
const KIND_HINTS: readonly (readonly [RegExp, InterviewKind])[] = [
  [/\b(?:system design|systemdesign|sistem tasarim)/u, "system_design"],
  [/\b(?:take[- ]home|case study review|fallstudie)/u, "take_home_review"],
  [
    /\b(?:technical|technisch\w*|teknik|coding|pair programming|live coding|fachgesprach|fachinterview)/u,
    "technical",
  ],
  [/\b(?:hiring manager|team lead\w*|head of|fuhrungskraft|yonetici)/u, "hiring_manager"],
  [/\b(?:behavio(?:u)?ral|culture|kultur|values)/u, "behavioral"],
  [/\b(?:on-?site|vor ort|in person|personlich|ofiste|yuz yuze)/u, "onsite"],
  [/\b(?:final|last round|letzte runde|abschlussgesprach|son gorusme|final gorusme)/u, "final"],
  [
    /\b(?:recruiter|phone screen|screening|telefoninterview|kennenlern\w*|on gorusme|ilk gorusme|tanisma)/u,
    "recruiter_call",
  ],
];

/** Kind of an interview: a first screen (screening suggestion) is a recruiter call, else by wording. */
export function interviewKindOf(input: { screening: boolean; wording: string }): InterviewKind {
  if (input.screening) return "recruiter_call";
  const folded = foldText(input.wording);
  return KIND_HINTS.find(([pattern]) => pattern.test(folded))?.[1] ?? "other";
}

/** Default lengths when the invite doesn't say: 30 minutes for a first screen, else an hour. */
export const DEFAULT_INTERVIEW_MINUTES = { screening: 30, other: 60 } as const;

/**
 * The `interviews/{id}` document confirmed from a message's suggestion (ADR 0012): round after the
 * application's existing interviews, organizer zone (else the user's), the contact as a person.
 */
export function interviewFromSuggestion(input: {
  message: Pick<MailMessage, "id" | "subject" | "extracted" | "suggestedStatus">;
  suggestion: InterviewSuggestion;
  applicationId: string;
  existingInterviews: number;
  userTimeZone: string;
  now: Date;
}): Omit<Interview, "id"> {
  const { message, suggestion } = input;
  const screening = message.suggestedStatus === "screening";
  const contact = message.extracted.contactName;
  return {
    applicationId: input.applicationId,
    round: Math.min(20, input.existingInterviews + 1),
    kind: interviewKindOf({ screening, wording: `${suggestion.title}\n${message.subject}` }),
    title: suggestion.title,
    startsAt: suggestion.startsAt,
    durationMinutes:
      suggestion.durationMinutes ??
      (screening ? DEFAULT_INTERVIEW_MINUTES.screening : DEFAULT_INTERVIEW_MINUTES.other),
    timezone: suggestion.timezone ?? (isIanaTimeZone(input.userTimeZone) ? input.userTimeZone : "UTC"),
    location: suggestion.location,
    meetingUrl: suggestion.meetingUrl,
    people:
      contact === null
        ? []
        : [{ name: contact, title: null, email: message.extracted.contactEmail, contactId: null }],
    prepNotes: "",
    sourceMailMessageId: message.id,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
