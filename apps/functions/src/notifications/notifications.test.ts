import { DEFAULT_NOTIFICATION_PREFERENCES } from "@bfhr/core";
import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { describe, expect, it, vi } from "vitest";
import { pushCopy } from "./copy";
import { jobAlertDigest, jobAlertSchedule } from "./job-alerts";
import { MAIL_PUSH_MAX_AGE_MS, mailPush, type MailPushMessage } from "./mail";
import { buildPushMessage, pushAllowed, type PushDeps, type PushProfile, sendPush } from "./push";
import { nextLocalTime, quietHoursEnd } from "./quiet-hours";
import type { PushNotification } from "./types";

vi.mock("firebase-functions/v2", () => ({ logger: { info: vi.fn() } }));

const NOW = new Date("2026-10-20T10:00:00Z");

function message(patch: Partial<MailPushMessage> = {}): MailPushMessage {
  return {
    id: "a1b2c3",
    receivedAt: new Date(NOW.getTime() - 60_000),
    category: "interview_invite",
    extracted: {
      company: "Acme",
      role: "iOS Engineer",
      contactName: null,
      contactEmail: null,
      dates: [],
      meetingUrls: [],
    },
    applicationId: "app1",
    suggestedStatus: "interviewing",
    appliedEventId: "ev1",
    reviewState: "auto_applied",
    ...patch,
  };
}

const notification: PushNotification = {
  content: { kind: "offer", company: "Acme", role: "iOS Engineer" },
  link: "bruteforcehr://applications/app1",
  threadId: "application-app1",
  collapseId: "mail-abc",
};

describe("push copy", () => {
  it("names company and role when the mail gave them, in each language", () => {
    const content = { kind: "interview", company: "Acme", role: "iOS Engineer" } as const;
    expect(pushCopy(content, "en")).toEqual({
      title: "Interview invite",
      body: "Acme invited you to interview for iOS Engineer.",
    });
    expect(pushCopy(content, "tr").body).toBe("Acme, iOS Engineer pozisyonu için sizi mülakata davet etti.");
    expect(pushCopy(content, "de").body).toBe("Acme lädt dich zu einem Gespräch für iOS Engineer ein.");
  });

  it("falls back gracefully when company or role is unknown", () => {
    expect(pushCopy({ kind: "offer", company: null, role: "Designer" }, "en").body).toBe(
      "You have a new offer for Designer.",
    );
    expect(pushCopy({ kind: "assessment", company: "Acme", role: null }, "de").body).toBe(
      "Acme hat dir ein Assessment geschickt.",
    );
    expect(pushCopy({ kind: "interview", company: null, role: null }, "tr").body).toBe(
      "Yeni bir mülakat davetiniz var.",
    );
  });

  it("words decisions calmly, never as a rejection", () => {
    const en = pushCopy({ kind: "decision", company: "Acme", updated: true }, "en");
    expect(en).toEqual({
      title: "Decision",
      body: "Acme decided not to move forward. We updated the application.",
    });
    for (const language of ["en", "tr", "de"] as const) {
      const copy = pushCopy({ kind: "decision", company: "Acme", updated: false }, language);
      expect(`${copy.title} ${copy.body}`).not.toMatch(/reject|unfortunately|sorry|leider|maalesef|red/iu);
    }
    expect(pushCopy({ kind: "decision", company: null, updated: false }, "tr").body).toBe(
      "İşveren süreci ilerletmemeye karar verdi.",
    );
  });

  it("uses the app's status labels for automatic changes", () => {
    expect(pushCopy({ kind: "status_update", company: "Acme", status: "screening" }, "en").body).toBe(
      "Moved to Screening — from an email by Acme",
    );
    expect(pushCopy({ kind: "status_update", company: null, status: "rejected" }, "de").body).toBe(
      "Automatisch zu „Nicht ausgewählt“ verschoben",
    );
  });

  it("summarizes a digest with the best jobs and the rest as a count", () => {
    const jobs = [
      { title: "iOS Engineer", company: "Acme" },
      { title: "Swift Developer", company: "Beta" },
    ];
    expect(pushCopy({ kind: "job_alerts", count: 5, searchName: "iOS Berlin", jobs }, "en")).toEqual({
      title: "5 new matches for “iOS Berlin”",
      body: "iOS Engineer · Acme, Swift Developer · Beta and 3 more",
    });
    expect(
      pushCopy({ kind: "job_alerts", count: 1, searchName: null, jobs: jobs.slice(0, 1) }, "de"),
    ).toEqual({
      title: "Neuer Treffer",
      body: "iOS Engineer · Acme",
    });
    expect(pushCopy({ kind: "job_alerts", count: 3, searchName: null, jobs }, "tr").title).toBe(
      "3 yeni eşleşme",
    );
  });
});

describe("quiet hours", () => {
  const quiet = { start: "22:00", end: "07:00" };

  it("defers a push inside overnight quiet hours to their end in the user's zone", () => {
    // 23:30 in Berlin (UTC+2 in October before the change).
    const end = quietHoursEnd(new Date("2026-10-20T21:30:00Z"), quiet, "Europe/Berlin");
    expect(end?.toISOString()).toBe("2026-10-21T05:00:00.000Z");
    // 06:59:30 is still quiet; 07:00 is not.
    expect(quietHoursEnd(new Date("2026-10-21T04:59:30Z"), quiet, "Europe/Berlin")?.toISOString()).toBe(
      "2026-10-21T05:00:00.000Z",
    );
    expect(quietHoursEnd(new Date("2026-10-21T05:00:00Z"), quiet, "Europe/Berlin")).toBeNull();
  });

  it("lets a push through outside quiet hours, with none set or an empty window", () => {
    expect(quietHoursEnd(new Date("2026-10-20T12:00:00Z"), quiet, "Europe/Berlin")).toBeNull();
    expect(quietHoursEnd(NOW, null, "Europe/Berlin")).toBeNull();
    expect(quietHoursEnd(NOW, { start: "09:00", end: "09:00" }, "UTC")).toBeNull();
  });

  it("handles a same-day window", () => {
    const end = quietHoursEnd(new Date("2026-10-20T13:15:00Z"), { start: "13:00", end: "14:30" }, "UTC");
    expect(end?.toISOString()).toBe("2026-10-20T14:30:00.000Z");
  });

  it("keeps the local end time across a DST change", () => {
    // Berlin falls back on 2026-10-25 03:00 → 02:00; 07:00 local is then 06:00Z.
    expect(quietHoursEnd(new Date("2026-10-24T21:00:00Z"), quiet, "Europe/Berlin")?.toISOString()).toBe(
      "2026-10-25T06:00:00.000Z",
    );
    // Spring forward 2026-03-29 02:00 → 03:00; 07:00 local is then 05:00Z.
    expect(quietHoursEnd(new Date("2026-03-28T22:00:00Z"), quiet, "Europe/Berlin")?.toISOString()).toBe(
      "2026-03-29T05:00:00.000Z",
    );
    // Istanbul has no DST.
    expect(quietHoursEnd(new Date("2026-10-24T20:00:00Z"), quiet, "Europe/Istanbul")?.toISOString()).toBe(
      "2026-10-25T04:00:00.000Z",
    );
  });

  it("always schedules the next occurrence strictly in the future", () => {
    expect(nextLocalTime(new Date("2026-10-20T09:00:20Z"), "UTC", "09:00").toISOString()).toBe(
      "2026-10-21T09:00:00.000Z",
    );
  });
});

describe("preferences", () => {
  const settings = { quietHours: null, notifyRejections: true, notifications: null };

  it("enables every category until the user changes one", () => {
    for (const kind of [
      "interview",
      "offer",
      "assessment",
      "decision",
      "status_update",
      "job_alerts",
    ] as const)
      expect(pushAllowed(kind, settings)).toBe(true);
  });

  it("applies each toggle to its own category only", () => {
    const muted = {
      ...settings,
      notifyRejections: false,
      notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, autoApplied: false, jobAlerts: false },
    };
    expect(pushAllowed("decision", muted)).toBe(false);
    expect(pushAllowed("status_update", muted)).toBe(false);
    expect(pushAllowed("job_alerts", muted)).toBe(false);
    expect(pushAllowed("interview", muted)).toBe(true);
    expect(
      pushAllowed("offer", {
        ...settings,
        notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, offers: false },
      }),
    ).toBe(false);
  });
});

describe("mail pushes", () => {
  it("links an automatic change to its timeline row with Undo", () => {
    expect(mailPush(message(), null, NOW)).toEqual({
      content: { kind: "interview", company: "Acme", role: "iOS Engineer" },
      link: "bruteforcehr://applications/app1/events/ev1",
      threadId: "application-app1",
      collapseId: expect.stringMatching(/^mail-[0-9a-f]{40}$/u) as string,
    });
  });

  it("sends mail waiting for review to the review sheet", () => {
    const pending = message({
      reviewState: "pending",
      appliedEventId: null,
      applicationId: null,
      category: "offer",
    });
    expect(mailPush(pending, null, NOW)).toMatchObject({
      content: { kind: "offer" },
      link: "bruteforcehr://mail/review/a1b2c3",
      threadId: "mail",
    });
  });

  it("marks a decision as updated only when it moved the application", () => {
    expect(
      mailPush(message({ category: "rejection", suggestedStatus: "rejected" }), null, NOW)?.content,
    ).toEqual({
      kind: "decision",
      company: "Acme",
      updated: true,
    });
    const linked = message({ category: "rejection", reviewState: "confirmed", appliedEventId: null });
    expect(mailPush(linked, null, NOW)).toMatchObject({
      content: { updated: false },
      link: "bruteforcehr://applications/app1",
    });
  });

  it("notifies other categories only for automatic status changes", () => {
    const received = message({ category: "application_received", suggestedStatus: "acknowledged" });
    expect(mailPush(received, null, NOW)?.content).toEqual({
      kind: "status_update",
      company: "Acme",
      status: "acknowledged",
    });
    expect(mailPush({ ...received, reviewState: "pending", appliedEventId: null }, null, NOW)).toBeNull();
    expect(mailPush(message({ category: "job_alert", reviewState: "not_required" }), null, NOW)).toBeNull();
  });

  it("takes company and role from the application when the mail lacks them", () => {
    const bare = message({ extracted: { ...message().extracted, company: null, role: null } });
    expect(mailPush(bare, { company: "Acme GmbH", role: "Mobile Lead" }, NOW)?.content).toMatchObject({
      company: "Acme GmbH",
      role: "Mobile Lead",
    });
  });

  it("stays silent for old mail stored by a lookback scan", () => {
    const old = message({ receivedAt: new Date(NOW.getTime() - MAIL_PUSH_MAX_AGE_MS - 1) });
    expect(mailPush(old, null, NOW)).toBeNull();
  });
});

describe("job alert digest", () => {
  const jobs = new Map([
    ["j1", { title: "iOS Engineer", company: "Acme" }],
    ["j2", { title: "Swift Developer", company: "Beta" }],
  ]);

  it("links one search's digest to that search, best match first", () => {
    const digest = jobAlertDigest(
      [
        { jobId: "j2", savedSearchId: "s1", score: 70 },
        { jobId: "j1", savedSearchId: "s1", score: 90 },
        { jobId: "j3", savedSearchId: "s1", score: 80 },
      ],
      jobs,
      new Map([["s1", "iOS Berlin"]]),
    );
    expect(digest).toMatchObject({
      content: {
        kind: "job_alerts",
        count: 3,
        searchName: "iOS Berlin",
        jobs: [
          { title: "iOS Engineer", company: "Acme" },
          { title: "Swift Developer", company: "Beta" },
        ],
      },
      link: "bruteforcehr://jobs/searches/s1",
      threadId: "job-alerts",
    });
  });

  it("links a single match to the job and several searches to Today", () => {
    expect(jobAlertDigest([{ jobId: "j1", savedSearchId: "s1", score: 90 }], jobs, new Map())?.link).toBe(
      "bruteforcehr://jobs/j1",
    );
    const mixed = jobAlertDigest(
      [
        { jobId: "j1", savedSearchId: "s1", score: 90 },
        { jobId: "j2", savedSearchId: "s2", score: 80 },
      ],
      jobs,
      new Map(),
    );
    expect(mixed?.link).toBe("bruteforcehr://today");
    expect(mixed?.content).toMatchObject({ searchName: null });
    expect(jobAlertDigest([], jobs, new Map())).toBeNull();
  });

  it("collapses the same set of jobs to one notification", () => {
    const a = jobAlertDigest(
      [
        { jobId: "j1", savedSearchId: "s1", score: 90 },
        { jobId: "j2", savedSearchId: "s1", score: 80 },
      ],
      jobs,
      new Map(),
    );
    const b = jobAlertDigest(
      [
        { jobId: "j2", savedSearchId: "s1", score: 80 },
        { jobId: "j1", savedSearchId: "s1", score: 90 },
      ],
      jobs,
      new Map(),
    );
    expect(a?.collapseId).toBe(b?.collapseId);
    expect(new TextEncoder().encode(a?.collapseId).length).toBeLessThanOrEqual(64);
  });

  it("debounces a run into one task and holds daily-digest searches until 09:00 local", () => {
    const first = jobAlertSchedule("u1", "instant", new Date("2026-10-20T10:00:05Z"), "UTC");
    const second = jobAlertSchedule("u1", "instant", new Date("2026-10-20T10:01:40Z"), "UTC");
    expect(second.id).toBe(first.id);
    expect(first.at.toISOString()).toBe("2026-10-20T10:02:15.000Z");

    const daily = jobAlertSchedule("u1", "daily", new Date("2026-10-20T10:00:00Z"), "Europe/Istanbul");
    expect(daily.at.toISOString()).toBe("2026-10-21T06:00:00.000Z");
    expect(daily.id).toBe("jobalerts-daily-u1-2026-10-21");
    const early = jobAlertSchedule("u1", "daily", new Date("2026-10-20T04:00:00Z"), "Europe/Istanbul");
    expect(early.id).toBe("jobalerts-daily-u1-2026-10-20");
  });
});

describe("payload", () => {
  it("builds an APNs alert with sound, thread, collapse id and the deep link", () => {
    expect(
      buildPushMessage(["t1"], notification, { title: "Offer", body: "Acme sent you an offer." }),
    ).toEqual({
      tokens: ["t1"],
      notification: { title: "Offer", body: "Acme sent you an offer." },
      data: { link: "bruteforcehr://applications/app1", kind: "offer" },
      apns: {
        headers: { "apns-push-type": "alert", "apns-collapse-id": "mail-abc" },
        payload: {
          aps: {
            alert: { title: "Offer", body: "Acme sent you an offer." },
            sound: "default",
            threadId: "application-app1",
          },
        },
      },
    });
  });
});

describe("sendPush", () => {
  const profile: PushProfile = {
    language: "de",
    timeZone: "Europe/Berlin",
    settings: { quietHours: { start: "22:00", end: "07:00" }, notifyRejections: true, notifications: null },
  };

  function deps(overrides: Partial<PushDeps> = {}) {
    const sent: MulticastMessage[] = [];
    const response: BatchResponse = {
      successCount: 1,
      failureCount: 2,
      responses: [
        { success: true, messageId: "m1" },
        {
          success: false,
          error: { code: "messaging/registration-token-not-registered", message: "gone" } as never,
        },
        { success: false, error: { code: "messaging/internal-error", message: "retry" } as never },
      ],
    };
    const mocks = {
      loadProfile: vi.fn<PushDeps["loadProfile"]>(() => Promise.resolve(profile)),
      loadDevices: vi.fn<PushDeps["loadDevices"]>(() =>
        Promise.resolve([
          { id: "d1", token: "t1" },
          { id: "d2", token: "t2" },
          { id: "d3", token: "t3" },
          { id: "d4", token: "t1" },
        ]),
      ),
      clearTokens: vi.fn<PushDeps["clearTokens"]>(() => Promise.resolve()),
      send: vi.fn<PushDeps["send"]>((message) => {
        sent.push(message);
        return Promise.resolve(response);
      }),
      defer: vi.fn<PushDeps["defer"]>(() => Promise.resolve()),
      ...overrides,
    };
    return { mocks, sent };
  }

  it("sends once per token in the profile's language and clears unregistered tokens", async () => {
    const { mocks, sent } = deps();
    const result = await sendPush("u1", notification, mocks, new Date("2026-10-20T10:00:00Z"));
    expect(result).toEqual({ status: "sent", delivered: 1, failed: 2, removed: 1 });
    expect(sent[0]?.tokens).toEqual(["t1", "t2", "t3"]);
    expect(sent[0]?.notification).toEqual({
      title: "Angebot",
      body: "Acme hat dir ein Angebot für iOS Engineer geschickt.",
    });
    expect(mocks.clearTokens).toHaveBeenCalledWith("u1", [{ id: "d2", token: "t2" }]);
  });

  it("defers inside quiet hours without touching FCM", async () => {
    const { mocks } = deps();
    const result = await sendPush("u1", notification, mocks, new Date("2026-10-20T21:30:00Z"));
    expect(result).toEqual({ status: "deferred", at: new Date("2026-10-21T05:00:00Z") });
    expect(mocks.defer).toHaveBeenCalledWith("u1", notification, new Date("2026-10-21T05:00:00Z"));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("drops muted categories, even inside quiet hours", async () => {
    const { mocks } = deps({
      loadProfile: () =>
        Promise.resolve({
          ...profile,
          settings: {
            ...profile.settings,
            notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, offers: false },
          },
        }),
    });
    expect(await sendPush("u1", notification, mocks, new Date("2026-10-20T21:30:00Z"))).toEqual({
      status: "muted",
    });
    expect(mocks.defer).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does nothing without a profile or a registered device", async () => {
    expect(
      await sendPush("u1", notification, deps({ loadProfile: () => Promise.resolve(null) }).mocks, NOW),
    ).toEqual({
      status: "no_profile",
    });
    const none = deps({ loadDevices: () => Promise.resolve([]) }).mocks;
    expect(await sendPush("u1", notification, none, NOW)).toEqual({ status: "no_devices" });
    expect(none.send).not.toHaveBeenCalled();
  });
});
