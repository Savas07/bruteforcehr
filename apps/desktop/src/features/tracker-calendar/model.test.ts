import { DEFAULT_PROFILE_SETTINGS } from "@bfhr/core";
import { emptyDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  addDays,
  addMonths,
  buildTrackerCalendarModel,
  monthWeeks,
  startOfWeek,
  weekDays,
  weekday,
} from "./model";

const data = { ...populatedDataset, profile: { settings: DEFAULT_PROFILE_SETTINGS, hiddenCompanies: [] } };
const ctx = fixtureContext(populatedDataset);
const model = buildTrackerCalendarModel(data, ctx);

describe("buildTrackerCalendarModel", () => {
  it("lists interviews as timed entries in the user's zone", () => {
    const interviews = model.entries.filter((entry) => entry.kind === "interview");
    expect(interviews).toHaveLength(populatedDataset.interviews.length);
    for (const entry of interviews) {
      expect(entry.time).toMatch(/^\d{2}:\d{2}$/);
      expect(entry.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.interviewId).not.toBeNull();
      expect(entry.timeDetail).toContain("min");
    }
    expect(model.hasInterviewsAhead).toBe(true);
  });

  it("suggests follow-ups for applications waiting since applying, as all-day entries", () => {
    const followUps = model.entries.filter((entry) => entry.kind === "followUp");
    expect(followUps.length).toBeGreaterThan(0);
    for (const entry of followUps) {
      expect(entry).toMatchObject({ suggested: true, time: null, title: "Follow up" });
      const application = populatedDataset.applications.find((candidate) => candidate.id === entry.applicationId);
      expect(application?.status).toBe("applied");
    }
  });

  it("sorts entries by time and knows the week start of the locale", () => {
    const sorts = model.entries.map((entry) => entry.sort);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
    expect(model.today).toBe("2026-10-22");
    expect(model.weekStartsOn).toBe(1);
    const us = buildTrackerCalendarModel(data, fixtureContext(populatedDataset, [], createAppIntl({ language: "en", locale: "en-US" })));
    expect(us.weekStartsOn).toBe(0);
  });

  it("is empty without data", () => {
    const empty = buildTrackerCalendarModel(
      { ...emptyDataset, profile: { settings: DEFAULT_PROFILE_SETTINGS, hiddenCompanies: [] } },
      fixtureContext(emptyDataset),
    );
    expect(empty.entries).toEqual([]);
    expect(empty.hasInterviewsAhead).toBe(false);
  });
});

describe("day arithmetic", () => {
  it("adds days and months across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-23", -12)).toBe("2025-10-23");
    expect(weekday("2026-10-23")).toBe(5);
  });

  it("builds Monday- and Sunday-first weeks", () => {
    expect(startOfWeek("2026-10-23", 1)).toBe("2026-10-19");
    expect(startOfWeek("2026-10-23", 0)).toBe("2026-10-18");
    expect(weekDays("2026-10-25", 1)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    const october = monthWeeks("2026-10-23", 1);
    expect(october).toHaveLength(5);
    expect(october[0]?.[0]).toBe("2026-09-28");
    expect(october.at(-1)?.at(-1)).toBe("2026-11-01");
    expect(monthWeeks("2026-02-10", 0)[0]?.[0]).toBe("2026-02-01");
  });
});
