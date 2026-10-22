import { emptyDataset, FIXTURE_NOW, type FixtureDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { type AttentionItemVM, buildTodayModel, type TodayModel } from "./model";

const HOUR_MS = 3_600_000;

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
      ["deadlines", "Deadlines", "2"],
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
    expect(model.items).toHaveLength(14);
    expect(new Set(model.items.map((item) => item.id)).size).toBe(14);
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
      primaryLabel: "Draft follow-up",
      secondaryLabel: "Not needed",
    });
  });

  it("lists the take-home and the offer reply date with relative chips", () => {
    expect(
      itemsOf(model, "deadline").map((item) => [
        item.company.name,
        item.deadlineKind,
        item.title,
        item.due.label,
      ]),
    ).toEqual([
      ["Grachten Commerce", "assessment", "Assessment due", "In 5 days"],
      ["Lumenpay", "offerReply", "Reply to the offer by", "29 Oct, 18:00"],
    ]);
    // Tannenbaum's reply date sits in a pending email: it shows in the review proposal instead.
    expect(itemsOf(model, "deadline").some((item) => item.company.name === "Tannenbaum Software")).toBe(
      false,
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
    const [closing] = itemsOf(build(data), "deadline");
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
      "deadline:mail-grachten-assessment:0",
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
      [
        "Tuesday 27 October",
        [
          ["00:59", "Grachten Commerce", "deadline:mail-grachten-assessment:0"],
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

  it("offers the connect-email card and Find jobs on first run", () => {
    expect(model.sections).toEqual([]);
    expect(model.items).toEqual([]);
    expect(model.selectedId).toBeNull();
    expect(model.firstUse).toEqual({
      connectMail: {
        message: "Connect your email to see interview invites and replies here.",
        estimate: "About 2 minutes.",
        actionLabel: "Connect email",
      },
      findJobs: { actionLabel: "Find jobs" },
    });
    expect(model.caughtUp).toBeNull();
    expect(model.doneToday).toBeNull();
    expect(model.agenda).toEqual({ title: "Next 7 days", days: [], emptyLabel: "No interviews this week" });
    expect(model.dateLabel).toBe("Thursday 22 October");
  });

  it("says caught up once mail is connected and nothing is open", () => {
    const connected = build({ ...emptyDataset, mailAccounts: populatedDataset.mailAccounts });
    expect(connected.firstUse).toBeNull();
    expect(connected.caughtUp).toEqual({ message: "You're all caught up. New updates will show up here." });
  });

  it("keeps the connect card above open items when mail isn't connected", () => {
    const noMail = build({ ...populatedDataset, mailAccounts: [] });
    expect(noMail.firstUse).toEqual({
      connectMail: expect.objectContaining({ estimate: "About 2 minutes." }),
      findJobs: null,
    });
    expect(noMail.caughtUp).toBeNull();
    expect(noMail.sections.map((section) => section.id)).toContain("nextUp");
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
