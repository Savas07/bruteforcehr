// @vitest-environment happy-dom
import { DEFAULT_NOTIFICATION_PREFERENCES, type MailMessage } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { mailNotificationCopy } from "./MailNotificationsHost";
import { inQuietHours, type MailNotificationRules, mailNotificationDecision } from "./mailNotifications";

const base = populatedDataset.mailMessages[0];
if (!base) throw new Error("fixture mail missing");

const message = (fields: Partial<MailMessage>): MailMessage => ({
  ...base,
  receivedAt: new Date(FIXTURE_NOW.getTime() - 60_000),
  reviewState: "pending",
  ...fields,
});

const rules: MailNotificationRules = {
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  notifyRejections: true,
  quietHours: null,
  timeZone: "Europe/Istanbul",
};

describe("mailNotificationDecision", () => {
  it("notifies interview invites, offers, assessments and decisions by category", () => {
    expect(mailNotificationDecision(message({ category: "interview_invite" }), rules, FIXTURE_NOW)).toEqual({
      notify: true,
      kind: "interview",
    });
    expect(mailNotificationDecision(message({ category: "offer" }), rules, FIXTURE_NOW)).toMatchObject({
      kind: "offer",
    });
    expect(mailNotificationDecision(message({ category: "assessment" }), rules, FIXTURE_NOW)).toMatchObject({
      kind: "assessment",
    });
    expect(mailNotificationDecision(message({ category: "rejection" }), rules, FIXTURE_NOW)).toMatchObject({
      kind: "decision",
    });
  });

  it("notifies other categories only when their change was applied automatically", () => {
    const received = message({ category: "application_received" });
    expect(mailNotificationDecision(received, rules, FIXTURE_NOW)).toEqual({
      notify: false,
      reason: "notJobNews",
    });
    expect(
      mailNotificationDecision({ ...received, reviewState: "auto_applied" }, rules, FIXTURE_NOW),
    ).toMatchObject({
      kind: "statusUpdate",
    });
  });

  it("never notifies mail older than two days (a lookback scan)", () => {
    const old = message({ category: "offer", receivedAt: new Date(FIXTURE_NOW.getTime() - 3 * 86_400_000) });
    expect(mailNotificationDecision(old, rules, FIXTURE_NOW)).toEqual({ notify: false, reason: "old" });
  });

  it("follows the category toggles and the decisions switch", () => {
    const muted = {
      ...rules,
      notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, offers: false },
      notifyRejections: false,
    };
    expect(mailNotificationDecision(message({ category: "offer" }), muted, FIXTURE_NOW)).toEqual({
      notify: false,
      reason: "muted",
    });
    expect(mailNotificationDecision(message({ category: "rejection" }), muted, FIXTURE_NOW)).toEqual({
      notify: false,
      reason: "muted",
    });
    expect(
      mailNotificationDecision(message({ category: "interview_invite" }), muted, FIXTURE_NOW).notify,
    ).toBe(true);
  });

  it("stays quiet during quiet hours in the profile's zone", () => {
    // 23:30 in Istanbul (UTC+3).
    const night = new Date("2026-10-22T20:30:00Z");
    const quiet = { ...rules, quietHours: { start: "22:00", end: "08:00" } };
    expect(mailNotificationDecision(message({ category: "offer", receivedAt: night }), quiet, night)).toEqual(
      { notify: false, reason: "quiet" },
    );
  });
});

describe("inQuietHours", () => {
  const zone = "Europe/Berlin";
  const at = (iso: string) => new Date(iso);
  it("spans midnight when start is after end", () => {
    const hours = { start: "22:00", end: "08:00" };
    expect(inQuietHours(at("2026-10-22T21:00:00Z"), hours, zone)).toBe(true); // 23:00
    expect(inQuietHours(at("2026-10-23T05:59:00Z"), hours, zone)).toBe(true); // 07:59
    expect(inQuietHours(at("2026-10-23T06:00:00Z"), hours, zone)).toBe(false); // 08:00
    expect(inQuietHours(at("2026-10-22T12:00:00Z"), hours, zone)).toBe(false);
  });
  it("handles a same-day window and no quiet hours", () => {
    expect(inQuietHours(at("2026-10-22T11:30:00Z"), { start: "13:00", end: "14:00" }, zone)).toBe(true);
    expect(inQuietHours(at("2026-10-22T11:30:00Z"), null, zone)).toBe(false);
  });
});

describe("mailNotificationCopy", () => {
  it("uses the push wording, calm for decisions", () => {
    const intl = createAppIntl({ language: "en", locale: "en-GB" });
    const decision = message({ category: "rejection", extracted: { ...base.extracted, company: "Acme" } });
    expect(mailNotificationCopy("decision", decision, intl)).toEqual({
      title: "Decision",
      body: "Acme decided not to move forward.",
    });
    const anonymous = message({ extracted: { ...base.extracted, company: null } });
    expect(mailNotificationCopy("interview", anonymous, intl).body).toBe("You have a new interview invite.");
  });

  it("speaks Turkish with siz", () => {
    const intl = createAppIntl({ language: "tr", locale: "tr-TR" });
    const invite = message({ extracted: { ...base.extracted, company: "Acme" } });
    expect(mailNotificationCopy("interview", invite, intl).body).toBe("Acme sizi mülakata davet etti.");
  });
});
