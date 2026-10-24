// The Firestore triggers mailMessageReviewed and mailApplicationChanged, driven with real before/after
// snapshots from the emulator (the client writes exactly what converters.mailReviewUpdate allows).
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import type { MailCategory, MailReviewUpdate } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { adminConverters as converters } from "../../converters";
import { reviewMailMessage, syncBodyPurgeAt } from "../functions";
import {
  application,
  clearFirestore,
  listEvents,
  listMessages,
  mailMessage,
  readApplication,
  seedApplication,
  seedMessage,
  seedProfile,
} from "./helpers";

const UID = "user-review";
const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

const messageRef = (id: string) => getFirestore().doc(firestorePaths.mailMessage(UID, id));

/** The client's review write, then the trigger on the resulting change. */
async function review(
  id: string,
  update: {
    reviewState: MailReviewUpdate["reviewState"];
    applicationId: string | null;
    category: MailCategory;
  },
): Promise<void> {
  const before = await messageRef(id).get();
  await messageRef(id).update(converters.mailReviewUpdate({ ...update, reviewedAt: new Date() }));
  await reviewMailMessage(UID, id, before, await messageRef(id).get());
}

const corrections = async () =>
  (await getFirestore().collection(serverOnlyPaths.mailCorrections(UID)).get()).docs.map((doc) => doc.data());

beforeEach(async () => {
  await clearFirestore();
  await seedProfile(UID, { mailBodyRetentionDays: RETENTION_DAYS });
  await seedApplication(
    UID,
    application({
      id: "app-hooli",
      company: "Hooli",
      companyDomain: "hooli.example",
      role: "Data Engineer",
      status: "applied",
    }),
  );
});

describe("mailMessageReviewed", () => {
  it("Confirm links the message, records the mail and applies the proposed move", async () => {
    await seedMessage(
      UID,
      mailMessage({
        id: "m-invite",
        category: "interview_invite",
        applicationId: "app-hooli",
        linkStrength: "company_domain",
        suggestedStatus: "interviewing",
        subject: "Interview invitation: Data Engineer",
      }),
    );

    await review("m-invite", {
      reviewState: "confirmed",
      applicationId: "app-hooli",
      category: "interview_invite",
    });

    const app = await readApplication(UID, "app-hooli");
    expect(app.status).toBe("interviewing");
    const events = await listEvents(UID, "app-hooli");
    const received = events.find((event) => event.type === "mail_received");
    const moved = events.find((event) => event.type === "status_changed");
    expect(received).toMatchObject({
      actor: "user",
      text: "Interview invitation: Data Engineer",
      evidence: { mailMessageId: "m-invite", reason: "Confirmed from an email" },
    });
    expect(moved).toMatchObject({
      actor: "user",
      fromStatus: "applied",
      toStatus: "interviewing",
      evidence: { mailMessageId: "m-invite" },
    });
    const [message] = await listMessages(UID);
    expect(message).toMatchObject({
      reviewState: "confirmed",
      appliedEventId: moved?.id,
      suggestedStatus: null,
      bodyPurgeAt: null,
    });
    // Unchanged category and link: nothing to learn from.
    expect(await corrections()).toEqual([]);
  });

  it("Change stores a labeled correction and applies the corrected category", async () => {
    await seedMessage(UID, mailMessage({ id: "m-other", category: "other_job" }));

    await review("m-other", { reviewState: "corrected", applicationId: "app-hooli", category: "rejection" });

    const app = await readApplication(UID, "app-hooli");
    expect(app.status).toBe("rejected");
    const [message] = await listMessages(UID);
    // The application is closed now: the body is purged after the retention period.
    expect(message?.bodyPurgeAt?.getTime()).toBe(app.statusChangedAt.getTime() + RETENTION_DAYS * DAY_MS);
    expect(await corrections()).toEqual([
      expect.objectContaining({
        from: { category: "other_job", applicationId: null, reviewState: "pending" },
        to: { category: "rejection", applicationId: "app-hooli", reviewState: "corrected" },
        senderDomain: "hooli.example",
        language: "en",
        linkStrength: "none",
      }),
    ]);
    // Labeled examples never hold message text.
    expect(JSON.stringify(await corrections())).not.toContain("Hi Deniz");
  });

  it("Not job mail deletes the message and keeps the correction", async () => {
    await seedMessage(UID, mailMessage({ id: "m-spam", category: "recruiter_outreach" }));

    await review("m-spam", { reviewState: "corrected", applicationId: null, category: "not_job" });

    expect((await messageRef("m-spam").get()).exists).toBe(false);
    expect(await corrections()).toEqual([
      expect.objectContaining({ to: { category: "not_job", applicationId: null, reviewState: "corrected" } }),
    ]);
    expect(await listEvents(UID)).toEqual([]);
    expect((await readApplication(UID, "app-hooli")).status).toBe("applied");
  });

  it("Dismiss changes nothing", async () => {
    await seedMessage(
      UID,
      mailMessage({
        id: "m-dismiss",
        category: "info_request",
        applicationId: "app-hooli",
        linkStrength: "company_domain",
      }),
    );

    await review("m-dismiss", {
      reviewState: "dismissed",
      applicationId: "app-hooli",
      category: "info_request",
    });

    expect(await listEvents(UID)).toEqual([]);
    expect(await corrections()).toEqual([]);
    expect((await listMessages(UID))[0]?.reviewState).toBe("dismissed");
  });

  const suggestion = {
    title: "Technical interview",
    startsAt: new Date("2026-11-05T13:00:00Z"),
    durationMinutes: 45,
    timezone: "Europe/Berlin",
    location: null,
    meetingUrl: "https://hooli.zoom.us/j/93456781234",
    source: "text" as const,
    interviewId: null,
  };
  const interviews = async () =>
    (await getFirestore().collection(firestorePaths.interviews(UID)).get()).docs.map((doc) =>
      converters.interview.fromSnapshot(doc),
    );

  it("Confirm of an invite creates the suggested interview (review-first)", async () => {
    await seedMessage(
      UID,
      mailMessage({
        id: "m-slot",
        category: "interview_invite",
        applicationId: "app-hooli",
        linkStrength: "company_domain",
        suggestedStatus: "interviewing",
        interviewSuggestion: suggestion,
      }),
    );
    expect(await interviews()).toEqual([]);

    await review("m-slot", {
      reviewState: "confirmed",
      applicationId: "app-hooli",
      category: "interview_invite",
    });

    expect(await interviews()).toEqual([
      expect.objectContaining({
        id: "m-slot",
        applicationId: "app-hooli",
        round: 1,
        kind: "technical",
        startsAt: suggestion.startsAt,
        durationMinutes: 45,
        timezone: "Europe/Berlin",
        meetingUrl: suggestion.meetingUrl,
        sourceMailMessageId: "m-slot",
      }),
    ]);
    const events = await listEvents(UID, "app-hooli");
    expect(events.map((event) => event.type).sort()).toEqual([
      "interview_scheduled",
      "mail_received",
      "status_changed",
    ]);
    expect((await listMessages(UID))[0]?.interviewSuggestion?.interviewId).toBe("m-slot");
  });

  it("Add interview on an automatically applied invite creates only the interview, once", async () => {
    await seedMessage(
      UID,
      mailMessage({
        id: "m-auto",
        category: "interview_invite",
        applicationId: "app-hooli",
        linkStrength: "thread",
        suggestedStatus: "interviewing",
        reviewState: "auto_applied",
        interviewSuggestion: suggestion,
      }),
    );

    await review("m-auto", {
      reviewState: "confirmed",
      applicationId: "app-hooli",
      category: "interview_invite",
    });

    expect((await interviews()).map((interview) => [interview.id, interview.round])).toEqual([["m-auto", 1]]);
    expect((await listEvents(UID, "app-hooli")).map((event) => event.type)).toEqual(["interview_scheduled"]);
    expect((await readApplication(UID, "app-hooli")).status).toBe("applied");

    // A second review write finds the interview already created.
    await review("m-auto", {
      reviewState: "corrected",
      applicationId: "app-hooli",
      category: "interview_invite",
    });
    await review("m-auto", {
      reviewState: "confirmed",
      applicationId: "app-hooli",
      category: "interview_invite",
    });
    expect(await interviews()).toHaveLength(1);
  });
});

describe("mailApplicationChanged", () => {
  it("starts the retention clock when the application closes and stops it when it reopens", async () => {
    await seedMessage(
      UID,
      mailMessage({ id: "m-1", category: "interview_invite", applicationId: "app-hooli" }),
    );
    await seedMessage(UID, mailMessage({ id: "m-2", category: "info_request", applicationId: "app-hooli" }));
    // Already purged: stays untouched.
    await seedMessage(
      UID,
      mailMessage({
        id: "m-purged",
        category: "other_job",
        applicationId: "app-hooli",
        bodyText: null,
        snippet: "",
      }),
    );
    const appRef = getFirestore().doc(firestorePaths.application(UID, "app-hooli"));
    const changeStatus = async (status: "rejected" | "interviewing") => {
      const before = await appRef.get();
      const at = new Date();
      await appRef.update(
        converters.application.toFirestoreUpdate({ status, statusChangedAt: at, updatedAt: at }),
      );
      await syncBodyPurgeAt(UID, "app-hooli", before, await appRef.get());
      return at;
    };

    const closedAt = await changeStatus("rejected");
    const purgeAt = (id: string) =>
      listMessages(UID).then((all) => all.find((m) => m.id === id)?.bodyPurgeAt ?? null);
    expect((await purgeAt("m-1"))?.getTime()).toBe(closedAt.getTime() + RETENTION_DAYS * DAY_MS);
    expect((await purgeAt("m-2"))?.getTime()).toBe(closedAt.getTime() + RETENTION_DAYS * DAY_MS);
    expect(await purgeAt("m-purged")).toBeNull();

    await changeStatus("interviewing");
    expect(await purgeAt("m-1")).toBeNull();
    expect(await purgeAt("m-2")).toBeNull();
  });
});
