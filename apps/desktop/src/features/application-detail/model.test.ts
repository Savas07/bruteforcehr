import type { Application } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  type ApplicationDetailVM,
  buildApplicationDetailModel,
  contactProblem,
  cvRevisionOptions,
  interviewInput,
  interviewProblem,
  reminderPatch,
  reminderProblem,
  wallInstant,
} from "./model";

const ctx = fixtureContext(populatedDataset);
const DAY_MS = 86_400_000;

function detailOf(applicationId: string, data = populatedDataset, context = ctx): ApplicationDetailVM {
  const model = buildApplicationDetailModel(data, context, { applicationId });
  if (model.status !== "found") throw new Error(`${applicationId} not found`);
  return model.detail;
}

/** The populated dataset with one application changed. */
function withApplication(id: string, patch: Partial<Application>) {
  return {
    ...populatedDataset,
    applications: populatedDataset.applications.map((application) =>
      application.id === id ? { ...application, ...patch } : application,
    ),
  };
}

describe("buildApplicationDetailModel · app-brightwave (automatic move, interview, contact, pinned CV)", () => {
  const detail = detailOf("app-brightwave");

  it("names the record and its status with how long it has had it", () => {
    expect(detail.documentTitle).toBe("Brightwave · Frontend Engineer, Editor");
    expect(detail.header).toMatchObject({
      role: "Frontend Engineer, Editor",
      location: "Remote",
      company: { name: "Brightwave", monogram: "B" },
      status: { key: "interviewing", label: "Interviewing" },
      inStatus: "2 days in Interviewing",
      jobId: "job-brightwave-frontend",
      pendingSync: false,
    });
  });

  it("draws the stage strip past ✓ / current / future", () => {
    expect(detail.progress.steps.map((step) => [step.label, step.state])).toEqual([
      ["Saved", "done"],
      ["Preparing", "done"],
      ["Applied", "done"],
      ["Acknowledged", "done"],
      ["Screening", "done"],
      ["Interviewing", "current"],
      ["Offer", "upcoming"],
    ]);
    expect(detail.progress.summary).toBe("Stage 6 of 7: Interviewing");
    expect(detail.progress.closed).toBe(false);
  });

  it("offers the upcoming interview's prep as the next action", () => {
    expect(detail.nextAction).toMatchObject({
      kind: "prepareInterview",
      label: "Prepare for Hiring manager interview",
      interviewId: "int-brightwave-1",
    });
  });

  it("keeps the automatic move undoable on the timeline, newest first, with source and reason", () => {
    const auto = detail.timeline.find((event) => event.title === "Moved to Interviewing");
    expect(auto).toMatchObject({
      source: { label: "Automatic · Mail" },
      reason: "Email from marcus@brightwave.io: “Brightwave — next step with the Editor team”",
      undo: { available: true },
    });
    expect(detail.timeline[0]?.title).toBe("Interview scheduled");
    expect(detail.timeline.at(-1)?.title).toBe("Added as Saved");
    const earlier = detail.timeline.find((event) => event.title === "Moved to Screening");
    expect(earlier?.undo).toEqual({ available: false, reason: "Can't undo — the status changed since." });
  });

  it("shows the interview in the user's zone and the organiser's, with its calendar file", () => {
    expect(detail.interviews).toHaveLength(1);
    const [interview] = detail.interviews;
    expect(interview).toMatchObject({
      roundLabel: "Round 1",
      kindLabel: "Hiring manager",
      title: "Hiring manager interview",
      when: { label: "Wed 28 Oct · 17:00–17:45" },
      organiserTime: "10:00–10:45 New York time",
      duration: "45 min",
      meetingUrl: "https://meet.google.com/bwq-ztkx-rmh",
      past: false,
    });
    expect(interview?.draft).toMatchObject({ date: "2026-10-28", time: "10:00", timeZone: "America/New_York" });
    expect(interview?.ics.fileName).toBe("Interview-Brightwave-Hiring manager interview.ics");
    expect(interview?.ics.content).toContain("BEGIN:VEVENT");
    expect(detail.exportAll?.fileName).toBe("Interview-Brightwave-All rounds.ics");
  });

  it("prefills the next round: number + 1, tomorrow, the user's zone", () => {
    expect(detail.newInterview).toMatchObject({
      round: 2,
      kind: "technical",
      date: "2026-10-23",
      time: "10:00",
      timeZone: "Europe/Istanbul",
    });
  });

  it("lists the linked contact and the rest of the address book for linking", () => {
    expect(detail.contacts.map((contact) => [contact.name, contact.role, contact.email])).toEqual([
      ["Marcus Reid", "Head of Frontend", "marcus@brightwave.io"],
    ]);
    expect(detail.addressBook.map((entry) => entry.id)).not.toContain("contact-marcus");
    expect(detail.addressBook[0]?.label).toBe("Elif Demir · Lumenpay");
    expect(detail.newContact.company).toBe("Brightwave");
  });

  it("shows the pinned CV read-only once applied", () => {
    expect(detail.documents.cv).toEqual({
      id: "cv-en",
      title: "Base CV — English",
      revisionId: "rev-en-2",
      archived: false,
    });
    expect(detail.documents.lockedReason).toBe(
      "Recorded on 5 Oct, when you applied. Documents used stay as you sent them.",
    );
  });

  it("carries the user's reminder and the prep reminder rules", () => {
    expect(detail.reminder).toMatchObject({
      label: "Hiring manager interview",
      due: { label: "Wednesday, 17:00" },
      overdue: false,
      draft: { text: "Hiring manager interview", date: "2026-10-28", time: "17:00" },
    });
    expect(detail.reminderRules).toEqual({
      evening: "18:00",
      leadMinutes: 60,
      quietStart: "22:00",
      quietEnd: "08:00",
    });
    expect(detail.suggestion).toBeNull();
    expect(detail.snoozed).toBeNull();
  });

  it("marks rows waiting to sync", () => {
    const pending = detailOf(
      "app-brightwave",
      populatedDataset,
      fixtureContext(populatedDataset, ["app-brightwave", "int-brightwave-1", "contact-marcus"]),
    );
    expect(pending.header.pendingSync).toBe(true);
    expect(pending.notes.pendingSync).toBe(true);
    expect(pending.interviews[0]?.pendingSync).toBe(true);
    expect(pending.contacts[0]?.pendingSync).toBe(true);
  });
});

describe("buildApplicationDetailModel · app-kervan", () => {
  const detail = detailOf("app-kervan");

  it("sorts rounds by start and shows a same-zone interview once", () => {
    expect(detail.interviews.map((interview) => interview.title)).toEqual(["On-site: system design + product"]);
    expect(detail.interviews[0]).toMatchObject({
      location: "Kervan Teknoloji, Caferağa Mah. Moda Cad. 112, Kadıköy, İstanbul",
      organiserTime: null,
      duration: "2 h",
      people: [
        { name: "Emre Kaya", title: "Engineering Manager", email: "emre.kaya@kervan.tech" },
        { name: "Selin Arslan", title: "Product Designer", email: null },
      ],
    });
    expect(detail.interviews[0]?.prepNotes).toContain("Pazarbox");
  });

  it("reads 12 days in Interviewing with the recruiter as contact", () => {
    expect(detail.header.inStatus).toBe("12 days in Interviewing");
    expect(detail.contacts.map((contact) => contact.name)).toEqual(["Emre Kaya"]);
  });
});

describe("buildApplicationDetailModel · closed and not found", () => {
  it("ends a closed application's strip with its outcome after the furthest stage", () => {
    const detail = detailOf("app-fjordline");
    expect(detail.progress.steps.map((step) => [step.label, step.state])).toEqual([
      ["Saved", "done"],
      ["Preparing", "done"],
      ["Applied", "done"],
      ["Acknowledged", "done"],
      ["Screening", "done"],
      ["Not selected", "current"],
    ]);
    expect(detail.progress).toMatchObject({ closed: true, summary: "Closed as Not selected after Screening" });
    expect(detail.nextAction).toBeNull();
    expect(detail.header.inStatus).toBe("Closed 16 days ago");
  });

  it("is notFound for an unknown or missing id", () => {
    expect(buildApplicationDetailModel(populatedDataset, ctx, { applicationId: "app-gone" })).toEqual({
      status: "notFound",
      applicationId: "app-gone",
    });
    expect(buildApplicationDetailModel(populatedDataset, ctx, {})).toEqual({
      status: "notFound",
      applicationId: null,
    });
  });

  it("is notFound in the empty dataset (deleted, or right after onboarding)", () => {
    const empty = fixtureContext(emptyDataset);
    expect(buildApplicationDetailModel(emptyDataset, empty, { applicationId: "app-brightwave" }).status).toBe(
      "notFound",
    );
  });
});

describe("suggestions (D15 / D19)", () => {
  it("shows the follow-up card with I followed up / Not needed", () => {
    expect(detailOf("app-quill").suggestion).toMatchObject({
      kind: "followUp",
      message: "Applied 9 days ago · no reply yet",
      primaryLabel: "I followed up",
      secondaryLabel: "Not needed",
    });
    // The card is the next step: the header offers no second one.
    expect(detailOf("app-quill").nextAction).toBeNull();
    const snoozed = detailOf(
      "app-quill",
      withApplication("app-quill", { followUpSnoozedUntil: new Date(FIXTURE_NOW.getTime() + DAY_MS) }),
    );
    expect(snoozed.nextAction).toMatchObject({ kind: "reminder", label: "Set a reminder" });
  });

  it("shows the no-response card with Mark as no response / Keep waiting", () => {
    expect(detailOf("app-kiez").suggestion).toMatchObject({
      kind: "noResponse",
      message: "No reply in 26 days. Mark as no response?",
      primaryLabel: "Mark as no response",
      secondaryLabel: "Keep waiting",
    });
  });

  it("hides a snoozed follow-up and says until when", () => {
    const until = new Date(FIXTURE_NOW.getTime() + DAY_MS);
    const detail = detailOf("app-quill", withApplication("app-quill", { followUpSnoozedUntil: until }));
    expect(detail.suggestion).toBeNull();
    expect(detail.snoozed).toEqual({
      kind: "followUp",
      label: "Follow-up suggestion snoozed until Tomorrow, 10:30",
    });
  });

  it("brings a snoozed suggestion back once the snooze is over", () => {
    const past = new Date(FIXTURE_NOW.getTime() - 1);
    const detail = detailOf("app-quill", withApplication("app-quill", { followUpSnoozedUntil: past }));
    expect(detail.suggestion?.kind).toBe("followUp");
    expect(detail.snoozed).toBeNull();
  });

  it("hides a follow-up marked Not needed", () => {
    const detail = detailOf("app-quill", withApplication("app-quill", { followUpDismissedAt: FIXTURE_NOW }));
    expect(detail.suggestion).toBeNull();
    expect(detail.snoozed).toBeNull();
  });

  it("hides the no-response card after Keep waiting, and while snoozed", () => {
    expect(
      detailOf("app-kiez", withApplication("app-kiez", { ghostedDismissedAt: FIXTURE_NOW })).suggestion,
    ).toBeNull();
    const until = new Date(FIXTURE_NOW.getTime() + 7 * DAY_MS);
    const snoozed = detailOf("app-kiez", withApplication("app-kiez", { ghostedSnoozedUntil: until }));
    expect(snoozed.suggestion).toBeNull();
    expect(snoozed.snoozed?.kind).toBe("noResponse");
  });
});

describe("documents before applying", () => {
  it("lets the user pick a CV while nothing is sent", () => {
    const detail = detailOf(
      "app-brightwave",
      withApplication("app-brightwave", { appliedAt: null, cvId: null, cvRevisionId: null }),
    );
    expect(detail.documents.cv).toBeNull();
    expect(detail.documents.lockedReason).toBeNull();
    expect(detail.documents.cvChoices.map((cv) => cv.title)).toEqual(["Base CV — English", "Lebenslauf — Deutsch"]);
  });

  it("words revisions with their date and marks the latest", () => {
    const revisions = populatedDataset.cvRevisions.filter((revision) => revision.cvId === "cv-en");
    const options = cvRevisionOptions(revisions, "rev-en-3", ctx);
    expect(options.map((option) => option.id)).toEqual(["rev-en-3", "rev-en-2", "rev-en-1"]);
    expect(options[0]?.label).toMatch(/\(latest\)$/u);
    expect(options[2]?.label).not.toMatch(/latest/u);
  });
});

describe("editor helpers", () => {
  const draft = detailOf("app-brightwave").interviews[0]?.draft;
  if (!draft) throw new Error("draft missing");

  it("turns an interview draft back into the same interview", () => {
    const input = interviewInput(draft, "app-brightwave", "Hiring manager");
    const original = populatedDataset.interviews.find((interview) => interview.id === "int-brightwave-1");
    expect(input?.startsAt.toISOString()).toBe(original?.startsAt.toISOString());
    expect(input).toMatchObject({ title: "Hiring manager interview", timezone: "America/New_York", location: null });
  });

  it("names an untitled round after its kind and refuses bad links and emails", () => {
    expect(interviewInput({ ...draft, title: " " }, "app-brightwave", "Hiring manager")?.title).toBe(
      "Hiring manager",
    );
    expect(interviewProblem({ ...draft, meetingUrl: "meet.google.com/abc" })).toBe("meetingUrl");
    expect(interviewProblem({ ...draft, meetingUrl: "ftp://example.com" })).toBe("meetingUrl");
    expect(interviewProblem({ ...draft, date: "" })).toBe("date");
    expect(
      interviewProblem({ ...draft, people: [{ name: "", title: "", email: "x@example.com", contactId: null }] }),
    ).toBe("personName");
    expect(
      interviewProblem({ ...draft, people: [{ name: "A", title: "", email: "nope", contactId: null }] }),
    ).toBe("personEmail");
    expect(interviewProblem(draft)).toBeNull();
  });

  it("reads reminder drafts in the user's zone, 09:00 without a time", () => {
    expect(reminderPatch({ text: " Call Marcus ", date: "2026-10-30", time: "" }, "Europe/Istanbul")).toEqual({
      nextAction: "Call Marcus",
      nextActionAt: new Date("2026-10-30T06:00:00.000Z"),
    });
    expect(reminderPatch({ text: "Later", date: "", time: "" }, "Europe/Istanbul").nextActionAt).toBeNull();
    expect(reminderProblem({ text: " ", date: "", time: "" })).toBe("noText");
    expect(reminderProblem({ text: "Call", date: "2026-02-30x", time: "" })).toBe("badDate");
    expect(wallInstant("2026-10-28", "10:00", "America/New_York")?.toISOString()).toBe("2026-10-28T14:00:00.000Z");
  });

  it("needs a contact's name and a plausible email", () => {
    const fields = { name: "Jana", email: "", role: "", company: "", notes: "" };
    expect(contactProblem(fields)).toBeNull();
    expect(contactProblem({ ...fields, name: " " })).toBe("name");
    expect(contactProblem({ ...fields, email: "jana@" })).toBe("email");
  });
});

describe("languages", () => {
  it("words the header in Turkish and German", () => {
    const tr = createAppIntl({ language: "tr", locale: "tr-TR" });
    const de = createAppIntl({ language: "de", locale: "de-DE" });
    expect(detailOf("app-kervan", populatedDataset, fixtureContext(populatedDataset, [], tr)).header.inStatus).not.toBe(
      "12 days in Interviewing",
    );
    expect(detailOf("app-kervan", populatedDataset, fixtureContext(populatedDataset, [], de)).progress.summary).not.toBe(
      "Stage 6 of 7: Interviewing",
    );
  });
});
