import { isTerminalStatus } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  appliedDateProblem,
  appliedInstant,
  buildAddApplicationModel,
  duplicateKey,
  findDuplicate,
  isValidLink,
} from "./model";

const ctx = fixtureContext(populatedDataset);
const model = buildAddApplicationModel(populatedDataset, ctx);

describe("buildAddApplicationModel · populated", () => {
  it("offers every status by phase with the shared labels, Applied by default", () => {
    expect(model.statusGroups.map((group) => [group.label, group.options.map((option) => option.label)])).toEqual([
      ["Shortlist", ["Saved", "Preparing"]],
      ["In progress", ["Applied", "Acknowledged", "Screening", "Interviewing", "Offer"]],
      ["Closed", ["Accepted", "Declined", "Not selected", "Withdrawn", "No response"]],
    ]);
    expect(model.defaultStatus).toBe("applied");
    expect(model.datedStatuses).not.toContain("saved");
    expect(model.datedStatuses).not.toContain("preparing");
    expect(model.datedStatuses).toContain("applied");
    expect(model.datedStatuses).toContain("ghosted");
  });

  it("offers the five channels", () => {
    expect(model.channels.map((option) => option.label)).toEqual([
      "Email",
      "Company site",
      "Referral",
      "Recruiter",
      "Other",
    ]);
  });

  it("groups each base CV with its variants; versions newest first, the current one marked", () => {
    expect(model.cvGroups.map((group) => [group.label, group.options.map((option) => option.label)])).toEqual([
      ["Base CV — English", ["Base CV — English", "Lebenslauf — Deutsch"]],
    ]);
    const english = model.cvGroups[0]?.options[0];
    expect(english?.currentRevisionId).toBe("rev-en-3");
    expect(english?.revisions.map((revision) => revision.label)).toEqual([
      "10 Oct · Edited (current)",
      "2 Sept · Edited",
      "13 Aug · Imported",
    ]);
    expect(model.cvGroups[0]?.options[1]?.revisions[0]?.label).toBe("14 Oct · Tailored with AI (current)");
  });

  it("lists only the current version until a CV's versions are known", () => {
    const withoutRevisions = buildAddApplicationModel({ ...populatedDataset, cvRevisions: [] }, ctx);
    expect(withoutRevisions.cvGroups[0]?.options[0]?.revisions).toEqual([
      { id: "rev-en-3", label: "Current version" },
    ]);
  });

  it("leaves archived CVs out; a variant of an archived base stands alone", () => {
    const archived = buildAddApplicationModel(
      {
        ...populatedDataset,
        cvs: populatedDataset.cvs.map((cv) => (cv.id === "cv-en" ? { ...cv, archivedAt: FIXTURE_NOW } : cv)),
      },
      ctx,
    );
    expect(archived.cvGroups.map((group) => group.options.map((option) => option.id))).toEqual([["cv-de"]]);
  });

  it("defaults the applied date to today in the user's zone", () => {
    // 07:30 UTC is 10:30 in Istanbul; at 23:30 UTC the Istanbul day has already turned.
    expect(model.today).toBe("2026-10-22");
    const late = { ...ctx, now: new Date("2026-10-22T22:30:00Z") };
    expect(buildAddApplicationModel(populatedDataset, late).today).toBe("2026-10-23");
    expect(buildAddApplicationModel(populatedDataset, { ...late, timeZone: "America/New_York" }).today).toBe(
      "2026-10-22",
    );
  });

  it("points out an open application with the same company and role, ignoring case and spaces", () => {
    const duplicate = findDuplicate(model, "  brightwave ", "frontend engineer,   EDITOR");
    expect(duplicate?.applicationId).toBe("app-brightwave");
    expect(duplicate?.note).toMatch(/^You're already tracking Frontend Engineer, Editor at Brightwave \(.+\)\.$/u);
    expect(findDuplicate(model, "Brightwave", "Backend Engineer")).toBeNull();
    expect(findDuplicate(model, "Brightwave", "")).toBeNull();
  });

  it("doesn't point at closed applications", () => {
    const closed = populatedDataset.applications.find((application) => isTerminalStatus(application.status));
    expect(closed).toBeDefined();
    if (!closed) return;
    expect(findDuplicate(model, closed.company, closed.role)).toBeNull();
  });

  it("formats in the UI language", () => {
    const turkish = buildAddApplicationModel(
      populatedDataset,
      fixtureContext(populatedDataset, [], createAppIntl({ language: "tr", locale: "tr-TR" })),
    );
    const labels = turkish.statusGroups.flatMap((group) => group.options.map((option) => option.label));
    expect(labels).toHaveLength(12);
    expect(labels).not.toContain("Not selected");
  });
});

describe("buildAddApplicationModel · empty", () => {
  const empty = buildAddApplicationModel(emptyDataset, fixtureContext(emptyDataset));

  it("has no CVs and nothing to duplicate", () => {
    expect(empty.cvGroups).toEqual([]);
    expect(empty.openApplications).toEqual([]);
    expect(findDuplicate(empty, "Acme", "Engineer")).toBeNull();
    expect(empty.statusGroups.flatMap((group) => group.options)).toHaveLength(12);
  });
});

describe("validation", () => {
  it("accepts an empty link or a full http(s) address only", () => {
    expect(isValidLink("")).toBe(true);
    expect(isValidLink("  ")).toBe(true);
    expect(isValidLink("https://jobs.example.com/123")).toBe(true);
    expect(isValidLink("http://example.org")).toBe(true);
    expect(isValidLink("example.com/jobs")).toBe(false);
    expect(isValidLink("ftp://example.com")).toBe(false);
    expect(isValidLink("javascript:alert(1)")).toBe(false);
    expect(isValidLink("https://localhost")).toBe(false);
  });

  it("refuses a missing or future applied day", () => {
    expect(appliedDateProblem(model, "")).toBe("missing");
    expect(appliedDateProblem(model, "2026-10-23")).toBe("future");
    expect(appliedDateProblem(model, "2026-10-22")).toBeNull();
    expect(appliedDateProblem(model, "2026-09-30")).toBeNull();
  });

  it("dates today now and an earlier day at 09:00 in the user's zone", () => {
    expect(appliedInstant(model, "2026-10-22", FIXTURE_NOW)).toBe(FIXTURE_NOW);
    expect(appliedInstant(model, "2026-10-20", FIXTURE_NOW)?.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(appliedInstant(model, "2026-10-30", FIXTURE_NOW)).toBeNull();
  });

  it("keys duplicates on normalised company and role", () => {
    expect(duplicateKey(" Acme  GmbH", "Engineer ")).toBe(duplicateKey("acme gmbh", "ENGINEER"));
    expect(duplicateKey("Acme", "Engineer")).not.toBe(duplicateKey("Acme Engineer", ""));
  });
});
