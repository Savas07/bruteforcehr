import type { Application, Interview } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { dueReminders, inQuietHours, interviewReminders } from "./reminders";
import { snoozeInstant } from "./snooze";

const zone = "Europe/Istanbul"; // UTC+3 all year
const at = (iso: string) => new Date(iso);

const application = { id: "a1", status: "interviewing", company: "Acme", role: "Engineer" } as Application;
const interview = (startsAt: string, id = "i1"): Interview =>
  ({ id, applicationId: "a1", title: "Technical interview", startsAt: at(startsAt) }) as Interview;

describe("interviewReminders", () => {
  it("reminds the evening before at 18:00 local and an hour before", () => {
    const reminders = interviewReminders(
      [interview("2026-10-28T11:00:00Z")],
      [application],
      at("2026-10-23T08:00:00Z"),
      zone,
    );
    expect(reminders.map((reminder) => [reminder.kind, reminder.at.toISOString()])).toEqual([
      ["eveningBefore", "2026-10-27T15:00:00.000Z"],
      ["shortly", "2026-10-28T10:00:00.000Z"],
    ]);
  });

  it("skips the hour-before reminder in quiet hours, and closed or past interviews", () => {
    // 08:30 local: an hour before is 07:30, inside quiet hours (22–08).
    const early = interviewReminders(
      [interview("2026-10-28T05:30:00Z")],
      [application],
      at("2026-10-23T08:00:00Z"),
      zone,
    );
    expect(early.map((reminder) => reminder.kind)).toEqual(["eveningBefore"]);
    expect(
      interviewReminders(
        [interview("2026-10-28T11:00:00Z")],
        [{ ...application, status: "rejected" }],
        at("2026-10-23T08:00:00Z"),
        zone,
      ),
    ).toEqual([]);
    expect(
      interviewReminders(
        [interview("2026-10-20T11:00:00Z")],
        [application],
        at("2026-10-23T08:00:00Z"),
        zone,
      ),
    ).toEqual([]);
  });
});

describe("dueReminders", () => {
  const reminders = interviewReminders(
    [interview("2026-10-28T11:00:00Z")],
    [application],
    at("2026-10-23T08:00:00Z"),
    zone,
  );

  it("sends a reminder once, from its time until the grace period ends", () => {
    expect(dueReminders(reminders, at("2026-10-27T14:59:00Z"), new Set(), zone)).toEqual([]);
    const due = dueReminders(reminders, at("2026-10-27T15:05:00Z"), new Set(), zone);
    expect(due.map((reminder) => reminder.kind)).toEqual(["eveningBefore"]);
    expect(dueReminders(reminders, at("2026-10-27T15:05:00Z"), new Set(due.map((r) => r.key)), zone)).toEqual(
      [],
    );
    expect(dueReminders(reminders, at("2026-10-27T15:16:00Z"), new Set(), zone)).toEqual([]);
  });

  it("sends nothing during quiet hours", () => {
    expect(inQuietHours(at("2026-10-27T20:00:00Z"), zone)).toBe(true); // 23:00 local
    expect(inQuietHours(at("2026-10-27T05:00:00Z"), zone)).toBe(false); // 08:00 local
  });
});

describe("snoozeInstant", () => {
  const now = at("2026-10-23T08:00:00Z"); // Friday 11:00 in Istanbul
  it("resolves the presets in the user's zone", () => {
    expect(snoozeInstant({ preset: "laterToday" }, now, zone).toISOString()).toBe("2026-10-23T11:00:00.000Z");
    expect(snoozeInstant({ preset: "tomorrow" }, now, zone).toISOString()).toBe("2026-10-24T06:00:00.000Z");
    expect(snoozeInstant({ preset: "nextWeek" }, now, zone).toISOString()).toBe("2026-10-26T06:00:00.000Z");
    const picked = at("2026-11-02T06:00:00Z");
    expect(snoozeInstant({ preset: "pickDate", date: picked }, now, zone)).toBe(picked);
  });
});
