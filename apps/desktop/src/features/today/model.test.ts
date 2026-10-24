import type { Application, ApplicationEvent } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, type FixtureDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { snoozeDateInstant } from "../../data/tracker/snooze";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { type AttentionItemVM, buildTodayModel, type TodayModel } from "./model";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const at = (hours: number) => new Date(FIXTURE_NOW.getTime() + hours * HOUR_MS);

/** The populated dataset with `patch` applied to one application. */
function withApplication(id: string, patch: Partial<Application>): FixtureDataset {
  return {
    ...populatedDataset,
    applications: populatedDataset.applications.map((application) =>
      application.id === id ? { ...application, ...patch } : application,
    ),
  };
}

/** A user event on the timeline, as `useTrackerActions` writes it. */
function userEvent(
  id: string,
  applicationId: string,
  type: ApplicationEvent["type"],
  occurredAt: Date,
  extra: Partial<ApplicationEvent> = {},
): ApplicationEvent {
  return {
    id,
    applicationId,
    type,
    fromStatus: null,
    toStatus: null,
    actor: "user",
    confidence: null,
    evidence: null,
    text: null,
    revertsEventId: null,
    occurredAt,
    createdAt: occurredAt,
    ...extra,
  };
}

function build(
  data: FixtureDataset,
  params: Record<string, string> = {},
  pendingWrites: string[] = [],
): TodayModel {
  return buildTodayModel(data, fixtureContext(data, pendingWrites), params);
}

function itemsOf<Kind extends AttentionItemVM["kind"]>(
  model: TodayModel,
  kind: Kind,
): Extract<AttentionItemVM, { kind: Kind }>[] {
  return model.items.filter((item): item is Extract<AttentionItemVM, { kind: Kind }> => item.kind === kind);
}

describe("buildTodayModel — populated", () => {
  const model = build(populatedDataset);

  it("opens with the title and date, no greeting (U8)", () => {
    expect(model.title).toBe("Today");
    expect(model.dateLabel).toBe("Thursday 22 October");
  });

  it("lists the five sections in the fixed order with plain-text counts", () => {
    expect(model.sections.map(({ id, title, countLabel }) => [id, title, countLabel])).toEqual([
      ["nextUp", "Next up", null],
      // Only the 3 emails waiting for confirmation count (D01); the 3 automatic changes don't.
      ["toReview", "To review", "3"],
      ["followUps", "Follow-ups", "2"],
      ["deadlines", "Deadlines", "5"],
      ["newMatches", "New matches", "3"],
    ]);
    expect(model.sections.find((section) => section.id === "newMatches")?.seeAllLabel).toBe(
      "See all in Jobs",
    );
  });

  it("leaves the To review count out when only automatic changes are listed (D01)", () => {
    const data: FixtureDataset = {
      ...populatedDataset,
      mailMessages: populatedDataset.mailMessages.filter((message) => message.reviewState !== "pending"),
    };
    const section = build(data).sections.find((candidate) => candidate.id === "toReview");
    expect(section?.items.every((item) => item.kind === "autoUpdate")).toBe(true);
    expect(section?.countLabel).toBeNull();
  });

  it("flattens the items in display order and selects the first by default", () => {
    expect(model.items.map((item) => item.id)).toEqual(
      model.sections.flatMap((section) => section.items.map((item) => item.id)),
    );
    expect(model.items).toHaveLength(17);
    expect(new Set(model.items.map((item) => item.id)).size).toBe(17);
    expect(model.selectedId).toBe("interview:int-kervan-2");
    expect(build(populatedDataset, { item: "followUp:app-quill" }).selectedId).toBe("followUp:app-quill");
    expect(build(populatedDataset, { item: "review:does-not-exist" }).selectedId).toBe(
      "interview:int-kervan-2",
    );
  });

  it("puts today's Kervan on-site in Next up with its prep", () => {
    const [interview] = itemsOf(model, "interview");
    expect(interview).toMatchObject({
      id: "interview:int-kervan-2",
      company: { name: "Kervan Teknoloji", monogram: "KT" },
      title: "On-site: system design + product",
      context: "Product Engineer (Frontend) · Round 2",
      round: "Round 2",
      startsAt: { label: "Today, 15:00" },
      timeRange: "15:00–17:00",
      // Istanbul interviewer, Istanbul user: no second time line.
      interviewerTime: null,
      location: "Kervan Teknoloji, Caferağa Mah. Moda Cad. 112, Kadıköy, İstanbul",
      join: null,
      prep: {
        cv: { id: "cv-en", label: "Base CV — English" },
        job: { id: "job-kervan-product", label: "Product Engineer (Frontend)" },
      },
    });
    expect(interview?.people.map((person) => person.name)).toEqual(["Emre Kaya", "Selin Arslan"]);
    expect(itemsOf(model, "interview")).toHaveLength(1);
  });

  it("shows the interviewer's time and Join 10 minutes before a remote interview", () => {
    // 5 minutes before Brightwave's 10:00 New York (17:00 Istanbul) interview.
    const now = new Date("2026-10-28T13:55:00.000Z");
    const later = buildTodayModel(populatedDataset, { ...fixtureContext(populatedDataset), now }, {});
    const [interview] = itemsOf(later, "interview");
    expect(interview).toMatchObject({
      company: { name: "Brightwave" },
      startsAt: { label: "Today, 17:00" },
      interviewerTime: "10:00 New York time",
      join: {
        url: "https://meet.google.com/bwq-ztkx-rmh",
        joinableAt: { label: "Today, 16:50" },
        joinable: true,
      },
      prep: { notes: null },
    });
  });

  it("lists pending emails newest first, then automatic changes from the last 7 days", () => {
    const section = model.sections.find((candidate) => candidate.id === "toReview");
    expect(section?.items.map((item) => [item.kind, item.company.name, item.title])).toEqual([
      ["review", "Sail Analytics", "Looks like a recruiter message about Sail Analytics"],
      ["review", "Tannenbaum Software", "Looks like Tannenbaum Software needs more information"],
      ["review", "Nordlicht Mobility", "Looks like an interview invite from Nordlicht Mobility"],
      ["autoUpdate", "Lumenpay", "Moved to Offer — from an email by Lumenpay"],
      ["autoUpdate", "Brightwave", "Moved to Interviewing — from an email by Brightwave"],
      ["autoUpdate", "Grachten Commerce", "Moved to Screening — from an email by Grachten Commerce"],
    ]);
    // Kumsal's automatic rejection was undone; Brisk's confirmation is 11 days old.
    expect(
      model.items.some(
        (item) => item.company.name === "Kumsal Games" || item.company.name === "Brisk Payments",
      ),
    ).toBe(false);
    const [nordlicht] = itemsOf(model, "review").filter((item) => item.id === "review:mail-nordlicht-invite");
    expect(nordlicht?.proposal.move?.to.label).toBe("Screening");
    expect(itemsOf(model, "autoUpdate")[0]?.change.undo).toEqual({ available: true });
  });

  it("uses the decision wording for automatic rejections (D18)", () => {
    const now = new Date("2026-10-08T07:30:00.000Z"); // 2 days after Fjordline's rejection
    const earlier = buildTodayModel(populatedDataset, { ...fixtureContext(populatedDataset), now }, {});
    expect(itemsOf(earlier, "autoUpdate").map((item) => item.title)).toContain(
      "Fjordline Health decided not to move forward. We updated the application.",
    );
  });

  it("suggests follow-ups oldest first with the shared nudge copy", () => {
    expect(
      itemsOf(model, "followUp").map((item) => [item.company.name, item.nudge.kind, item.context]),
    ).toEqual([
      ["Kiez Health", "noResponse", "No reply in 26 days. Mark as no response?"],
      ["Quill Docs", "followUp", "Applied 9 days ago · no reply yet"],
    ]);
    expect(itemsOf(model, "followUp")[1]?.nudge).toMatchObject({
      primaryLabel: "I followed up",
      secondaryLabel: "Not needed",
    });
    expect(itemsOf(model, "followUp").every((item) => item.snoozed === null)).toBe(true);
    expect(model.later).toEqual([]);
  });

  it("lists reminders, the take-home and the offer reply date with relative chips", () => {
    expect(
      itemsOf(model, "deadline").map((item) => [
        item.company.name,
        item.deadlineKind,
        item.title,
        item.context,
        item.due.label,
      ]),
    ).toEqual([
      ["Northstar Maps", "reminder", "Tailor CV for the map platform role", expect.any(String), "Tomorrow, 10:30"],
      ["Polder Energy", "reminder", "Write cover letter", expect.any(String), "In 2 days"],
      ["Thames Ledger", "reminder", "Prepare the pairing exercise", expect.any(String), "In 4 days"],
      ["Grachten Commerce", "assessment", "Assessment due", expect.any(String), "In 5 days"],
      ["Lumenpay", "offerReply", "Offer reply due", expect.any(String), "29 Oct, 18:00"],
    ]);
    // Tannenbaum's reply date sits in a pending email: it shows in the review proposal instead.
    expect(itemsOf(model, "deadline").some((item) => item.company.name === "Tannenbaum Software")).toBe(
      false,
    );
  });

  it("shows a reminder with its own text, the role as context and the application to clear it on", () => {
    const northstar = populatedDataset.applications.find((application) => application.id === "app-northstar");
    expect(itemsOf(model, "deadline")[0]).toMatchObject({
      id: "deadline:reminder:app-northstar",
      deadlineKind: "reminder",
      title: "Tailor CV for the map platform role",
      context: northstar?.role,
      applicationId: "app-northstar",
      mailMessageId: null,
    });
  });

  it("leaves out reminders that repeat an interview or an email's date of the same application", () => {
    // Kervan's "On-site interview" reminder is the Next up interview; Grachten's "Submit the
    // take-home" and Lumenpay's "Reply to the offer" are the dates from their emails.
    const titles = itemsOf(model, "deadline").map((item) => item.title);
    expect(titles).not.toContain("On-site interview");
    expect(titles).not.toContain("Submit the take-home");
    expect(titles).not.toContain("Reply to the offer");
    // Moved off the interview's start, the reminder is its own item again.
    const moved = withApplication("app-kervan", { nextActionAt: at(2) });
    expect(itemsOf(build(moved), "deadline").map((item) => item.id)).toContain("deadline:reminder:app-kervan");
  });

  it("drops a reminder once it's done (next action cleared) or its application closed", () => {
    const done = withApplication("app-northstar", { nextAction: null, nextActionAt: null });
    expect(itemsOf(build(done), "deadline").map((item) => item.id)).not.toContain(
      "deadline:reminder:app-northstar",
    );
    const closed = withApplication("app-northstar", { status: "withdrawn" });
    expect(itemsOf(build(closed), "deadline").map((item) => item.id)).not.toContain(
      "deadline:reminder:app-northstar",
    );
  });

  it("adds closing dates of saved jobs", () => {
    const expiresAt = new Date(FIXTURE_NOW.getTime() + 30 * HOUR_MS);
    const data: FixtureDataset = {
      ...populatedDataset,
      jobs: populatedDataset.jobs.map((job) =>
        job.id === "job-aurora-react-native" ? { ...job, expiresAt } : job,
      ),
    };
    const closing = itemsOf(build(data), "deadline").find((item) => item.deadlineKind === "jobClosing");
    expect(closing).toMatchObject({
      id: "deadline:job:job-aurora-react-native",
      deadlineKind: "jobClosing",
      title: "Posting closes",
      company: { name: "Aurora Fintech" },
      due: { label: "Tomorrow, 16:30" },
      applicationId: null,
    });
  });

  it("shows the top 3 new matches with a reason line", () => {
    expect(
      itemsOf(model, "match").map((item) => [item.company.name, item.match.bandLabel, item.saved]),
    ).toEqual([
      ["Pixelpost", "Strong", false],
      ["Lighthouse Learning", "Strong", false],
      ["Mercator Travel", "Strong", false],
    ]);
    expect(itemsOf(model, "match")[0]?.reason).toBe(
      "Berlin is one of your target cities · Visa sponsorship offered",
    );
  });

  it("keeps a match saved today with Save on, and skips hidden companies", () => {
    const data: FixtureDataset = {
      ...populatedDataset,
      profile: {
        ...populatedDataset.profile,
        hiddenCompanies: [{ name: "Lighthouse Learning", domain: null, hiddenAt: FIXTURE_NOW }],
      },
      jobMatches: populatedDataset.jobMatches.map((match) =>
        match.id === "job-pixelpost-design-systems"
          ? { ...match, state: "saved" as const, stateChangedAt: new Date(FIXTURE_NOW.getTime() - HOUR_MS) }
          : match,
      ),
    };
    expect(itemsOf(build(data), "match").map((item) => [item.company.name, item.saved])).toEqual([
      ["Pixelpost", true],
      ["Mercator Travel", false],
      ["Moda Market", false],
    ]);
  });

  it("flags items whose document has a local write waiting to sync", () => {
    const pending = build(populatedDataset, {}, [
      "int-kervan-2",
      "mail-nordlicht-invite",
      "evt-lumenpay-offer",
      "app-quill",
      "mail-grachten-assessment",
      "job-mercator-frontend",
    ]);
    expect(pending.items.filter((item) => item.pendingSync).map((item) => item.id)).toEqual([
      "interview:int-kervan-2",
      "review:mail-nordlicht-invite",
      "autoUpdate:evt-lumenpay-offer",
      "followUp:app-quill",
      "deadline:mail:mail-grachten-assessment:0",
      "match:job-mercator-frontend",
    ]);
    expect(model.items.some((item) => item.pendingSync)).toBe(false);
  });

  it("groups the next 7 days of interviews and deadlines for the agenda rail", () => {
    expect(model.agenda.emptyLabel).toBeNull();
    expect(
      model.agenda.days.map((day) => [
        day.label,
        day.entries.map((entry) => [entry.time, entry.company.name, entry.itemId]),
      ]),
    ).toEqual([
      ["Today", [["15:00", "Kervan Teknoloji", "interview:int-kervan-2"]]],
      ["Tomorrow", [["10:30", "Northstar Maps", "deadline:reminder:app-northstar"]]],
      ["Saturday 24 October", [["10:30", "Polder Energy", "deadline:reminder:app-polder"]]],
      ["Monday 26 October", [["10:30", "Thames Ledger", "deadline:reminder:app-thames"]]],
      [
        "Tuesday 27 October",
        [
          ["00:59", "Grachten Commerce", "deadline:mail:mail-grachten-assessment:0"],
          ["14:00", "Thames Ledger", null],
        ],
      ],
      ["Wednesday 28 October", [["17:00", "Brightwave", null]]],
    ]);
  });

  it("collects emails reviewed today in Done today", () => {
    expect(model.doneToday).toBeNull();
    const data: FixtureDataset = {
      ...populatedDataset,
      mailMessages: populatedDataset.mailMessages.map((message) =>
        message.id === "mail-nordlicht-invite"
          ? {
              ...message,
              reviewState: "confirmed" as const,
              reviewedAt: new Date(FIXTURE_NOW.getTime() - HOUR_MS),
            }
          : message,
      ),
    };
    const reviewed = build(data);
    expect(reviewed.items.some((item) => item.id === "review:mail-nordlicht-invite")).toBe(false);
    expect(reviewed.doneToday).toMatchObject({
      title: "Done today",
      countLabel: "1",
      items: [
        {
          kind: "review",
          company: { name: "Nordlicht Mobility" },
          outcome: "Confirmed",
          doneAt: { label: "1 hour ago" },
        },
      ],
    });
  });

  it("shows no set-up card or caught-up message while work is open", () => {
    expect(model.firstUse).toBeNull();
    expect(model.caughtUp).toBeNull();
  });
});

describe("buildTodayModel — empty", () => {
  const model = build(emptyDataset);

  it("offers adding an application or connecting email on first run", () => {
    expect(model.sections).toEqual([]);
    expect(model.items).toEqual([]);
    expect(model.selectedId).toBeNull();
    expect(model.firstUse).toEqual({
      title: "Add the jobs you've applied to",
      body: "Today then shows your interviews, follow-ups and reminders. Connect your email and replies from employers show up here too.",
      actionLabel: "Add application",
      connectLabel: "Connect email",
    });
    expect(model.caughtUp).toBeNull();
    expect(model.doneToday).toBeNull();
    expect(model.later).toEqual([]);
    expect(model.agenda).toEqual({ title: "Next 7 days", days: [], emptyLabel: "No interviews this week" });
    expect(model.dateLabel).toBe("Thursday 22 October");
  });

  it("says caught up once mail is connected and nothing is open", () => {
    const connected = build({ ...emptyDataset, mailAccounts: populatedDataset.mailAccounts });
    expect(connected.firstUse).toBeNull();
    expect(connected.caughtUp).toEqual({ message: "You're all caught up. New updates will show up here." });
  });

  it("says caught up, not first run, when applications are tracked but nothing needs the user (M3)", () => {
    const quiet: FixtureDataset = {
      ...emptyDataset,
      applications: populatedDataset.applications.filter((application) => application.id === "app-northstar")
        .map((application) => ({ ...application, nextAction: null, nextActionAt: null })),
    };
    const model = build(quiet);
    expect(model.items).toEqual([]);
    expect(model.firstUse).toBeNull();
    expect(model.caughtUp).toEqual({ message: "You're all caught up. New updates will show up here." });
  });

  it("shows open items without a set-up card when mail isn't connected (production M3)", () => {
    // No mail, matches or automatic changes until M4/M5.
    const noMail = build({
      ...populatedDataset,
      mailAccounts: [],
      mailMessages: [],
      jobMatches: [],
      applicationEvents: populatedDataset.applicationEvents.filter((event) => event.actor === "user"),
    });
    expect(noMail.firstUse).toBeNull();
    expect(noMail.caughtUp).toBeNull();
    // No email and no matches: To review and New matches stay hidden.
    expect(noMail.sections.map((section) => section.id)).toEqual(["nextUp", "followUps", "deadlines"]);
    expect(itemsOf(noMail, "deadline").map((item) => item.deadlineKind)).toEqual([
      "reminder",
      "reminder",
      "reminder",
      "reminder",
      "reminder",
    ]);
  });
});

describe("buildTodayModel — suggestions the user answered", () => {
  it("moves a snoozed follow-up to the Later view with when it's back", () => {
    const tomorrow = new Date("2026-10-23T06:00:00.000Z"); // 09:00 in Istanbul
    const model = build(withApplication("app-quill", { followUpSnoozedUntil: tomorrow }));
    expect(model.items.map((item) => item.id)).not.toContain("followUp:app-quill");
    expect(model.later).toHaveLength(1);
    expect(model.later[0]).toMatchObject({
      id: "later:app-quill",
      kind: "followUp",
      company: { name: "Quill Docs" },
      nudge: { applicationId: "app-quill", kind: "followUp", primaryLabel: "I followed up" },
      snoozed: {
        until: { iso: tomorrow.toISOString(), label: "Tomorrow, 09:00" },
        rowLabel: "Back on Fri 23 Oct",
        title: "Snoozed until Friday 23 October, 09:00",
      },
    });
  });

  it("says 'Back at' for a snooze ending later today, and lists the soonest back first", () => {
    const data: FixtureDataset = {
      ...withApplication("app-quill", { followUpSnoozedUntil: at(3 * 24) }),
    };
    const both = build({
      ...data,
      applications: data.applications.map((application) =>
        application.id === "app-kiez" ? { ...application, ghostedSnoozedUntil: at(3) } : application,
      ),
    });
    expect(both.later.map((item) => [item.id, item.nudge.kind, item.snoozed?.rowLabel])).toEqual([
      ["later:app-kiez", "noResponse", "Back at 13:30"],
      ["later:app-quill", "followUp", "Back on Sun 25 Oct"],
    ]);
    expect(both.sections.find((section) => section.id === "followUps")).toBeUndefined();
  });

  it("brings a suggestion back to the open list once its snooze has ended", () => {
    const model = build(withApplication("app-quill", { followUpSnoozedUntil: at(-1) }));
    expect(model.items.map((item) => item.id)).toContain("followUp:app-quill");
    expect(model.later).toEqual([]);
  });

  it("doesn't list a snooze whose suggestion no longer applies", () => {
    const moved = withApplication("app-quill", { status: "screening", followUpSnoozedUntil: at(24) });
    expect(build(moved).later).toEqual([]);
  });

  it("hides a follow-up marked Not needed and lists it in Done today", () => {
    const model = build(withApplication("app-quill", { followUpDismissedAt: at(-1) }));
    expect(model.items.map((item) => item.id)).not.toContain("followUp:app-quill");
    expect(model.later).toEqual([]);
    expect(model.doneToday?.items).toEqual([
      expect.objectContaining({
        id: "done:notNeeded:app-quill",
        kind: "suggestion",
        company: expect.objectContaining({ name: "Quill Docs" }),
        outcome: "Follow-up not needed",
        doneAt: expect.objectContaining({ label: "1 hour ago" }),
      }),
    ]);
  });

  it("hides a no-response suggestion after Keep waiting; an earlier day's answer isn't in Done today", () => {
    const today = build(withApplication("app-kiez", { ghostedDismissedAt: at(-2) }));
    expect(today.items.map((item) => item.id)).not.toContain("followUp:app-kiez");
    expect(today.doneToday?.items.map((item) => [item.id, item.outcome])).toEqual([
      ["done:keptWaiting:app-kiez", "Still waiting"],
    ]);
    const yesterday = build(withApplication("app-kiez", { ghostedDismissedAt: at(-24) }));
    expect(yesterday.items.map((item) => item.id)).not.toContain("followUp:app-kiez");
    expect(yesterday.doneToday).toBeNull();
  });
});

describe("buildTodayModel — Done today from the timeline", () => {
  const withEvents = (...events: ApplicationEvent[]): FixtureDataset => ({
    ...populatedDataset,
    applicationEvents: [...populatedDataset.applicationEvents, ...events],
  });

  it("lists a follow-up logged today, and the follow-up suggestion starts a new round", () => {
    const model = build(withEvents(userEvent("evt-quill-followed-up", "app-quill", "mail_sent", at(-2))));
    expect(model.items.map((item) => item.id)).not.toContain("followUp:app-quill");
    expect(model.doneToday?.items.map((item) => [item.id, item.kind, item.title, item.outcome])).toEqual([
      ["done:followedUp:evt-quill-followed-up", "followedUp", expect.any(String), "Followed up"],
    ]);
  });

  it("lists notes, no-response moves and undone moves of today, newest first", () => {
    const model = build(
      withEvents(
        userEvent("evt-note", "app-thames", "note", at(-3), { text: "Asked about the team" }),
        userEvent("evt-kiez-ghosted", "app-kiez", "status_changed", at(-1), {
          fromStatus: "applied",
          toStatus: "ghosted",
        }),
        userEvent("evt-yesterday-note", "app-thames", "note", new Date(FIXTURE_NOW.getTime() - DAY_MS)),
      ),
    );
    expect(model.doneToday?.items.map((item) => [item.id, item.outcome, item.doneAt.label])).toEqual([
      ["done:noResponse:evt-kiez-ghosted", "Marked as no response", "1 hour ago"],
      ["done:note:evt-note", "Note added", "3 hours ago"],
    ]);
    expect(model.doneToday?.countLabel).toBe("2");

    // Undoing the move from its toast leaves only the undo in Done today.
    const undone = build(
      withEvents(
        userEvent("evt-kiez-ghosted", "app-kiez", "status_changed", at(-1), {
          fromStatus: "applied",
          toStatus: "ghosted",
        }),
        userEvent("evt-kiez-back", "app-kiez", "status_changed", at(-0.5), {
          fromStatus: "ghosted",
          toStatus: "applied",
          revertsEventId: "evt-kiez-ghosted",
        }),
      ),
    );
    expect(undone.doneToday?.items.map((item) => [item.id, item.outcome])).toEqual([
      ["done:undone:evt-kiez-ghosted", "Undone · back to Applied"],
    ]);
  });
});

describe("buildTodayModel — Turkish", () => {
  it("takes its copy from the catalog of the UI language", () => {
    const intl = createAppIntl({ language: "tr", locale: "tr-TR" });
    const model = buildTodayModel(populatedDataset, fixtureContext(populatedDataset, [], intl), {});
    const english = build(populatedDataset);
    expect(model.title).not.toBe(english.title);
    const titles = model.sections.map((section) => section.title);
    expect(titles).toHaveLength(english.sections.length);
    for (const title of english.sections.map((section) => section.title)) expect(titles).not.toContain(title);
  });
});

describe("snooze to a picked date", () => {
  it("starts the date field tomorrow in the user's zone, not the machine's", () => {
    expect(build(populatedDataset).snoozeDate).toEqual({ min: "2026-10-23", timeZone: "Europe/Istanbul" });
    // 22:30 UTC is already the 23rd in Istanbul but still the 22nd in New York.
    const now = new Date("2026-10-22T22:30:00.000Z");
    const at = (timeZone: string) =>
      buildTodayModel(populatedDataset, { ...fixtureContext(populatedDataset), now, timeZone }, {}).snoozeDate
        .min;
    expect(at("Europe/Istanbul")).toBe("2026-10-24");
    expect(at("America/New_York")).toBe("2026-10-23");
  });

  it("brings the item back at 09:00 on the picked day in the user's zone", () => {
    expect(snoozeDateInstant("2026-10-27", "Europe/Istanbul")?.toISOString()).toBe(
      "2026-10-27T06:00:00.000Z",
    );
    expect(snoozeDateInstant("2026-10-27", "Europe/Berlin")?.toISOString()).toBe("2026-10-27T08:00:00.000Z");
    // New York leaves daylight saving on 1 November: 09:00 EST.
    expect(snoozeDateInstant("2026-11-01", "America/New_York")?.toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
    expect(snoozeDateInstant("", "Europe/Istanbul")).toBeNull();
  });
});
