// Interviews confirmed from invites (docs/adr/0012-mail-sync.md, "Interviews from invites").
import { firestorePaths } from "@bfhr/api";
import { type ApplicationEvent, interviewFromSuggestion, type MailMessage } from "@bfhr/core";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { converters } from "../converters";

/** Writes of a confirmed suggestion: run after the transaction's other reads, before commit. */
export type InterviewWrite = (tx: Transaction) => { "interviewSuggestion.interviewId": string };

/**
 * Reads what creating `interviews/{messageId}` from the message's suggestion needs (inside `tx`,
 * before any write) and returns the write, or null when there is nothing to create: no
 * suggestion, not an invite, unlinked, or already created. The interview's round follows the
 * application's existing interviews; an `interview_scheduled` user event goes on the timeline.
 */
export async function prepareInterviewFromMail(
  tx: Transaction,
  db: Firestore,
  input: { uid: string; message: MailMessage; userTimeZone: string; now: Date },
): Promise<InterviewWrite | null> {
  const { uid, message, now } = input;
  const suggestion = message.interviewSuggestion;
  const applicationId = message.applicationId;
  if (
    suggestion === null ||
    suggestion.interviewId !== null ||
    applicationId === null ||
    message.category !== "interview_invite"
  )
    return null;
  const interviewRef = db.doc(firestorePaths.interview(uid, message.id));
  const [existing, rounds] = await Promise.all([
    tx.get(interviewRef),
    tx.get(db.collection(firestorePaths.interviews(uid)).where("applicationId", "==", applicationId)),
  ]);
  if (existing.exists) return null;
  const interview = interviewFromSuggestion({
    message,
    suggestion,
    applicationId,
    existingInterviews: rounds.size,
    userTimeZone: input.userTimeZone,
    now,
  });
  return (write) => {
    write.create(interviewRef, converters.interview.toFirestore({ id: interviewRef.id, ...interview }));
    const eventRef = db.collection(firestorePaths.applicationEvents(uid)).doc();
    const event: ApplicationEvent = {
      id: eventRef.id,
      applicationId,
      type: "interview_scheduled",
      fromStatus: null,
      toStatus: null,
      actor: "user",
      confidence: null,
      evidence: { mailMessageId: message.id, reason: "Interview added from an email" },
      text: interview.title,
      revertsEventId: null,
      occurredAt: now,
      createdAt: now,
    };
    write.create(eventRef, converters.applicationEvent.toFirestore(event));
    return { "interviewSuggestion.interviewId": interviewRef.id };
  };
}
