import { emptyDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  buildTrackerBoardModel,
  checkBoardMove,
  previewDrop,
  type TrackerBoardModel,
  type TrackerCardVM,
} from "./model";

const ctx = fixtureContext(populatedDataset);
const board = buildTrackerBoardModel(populatedDataset, ctx, {});

function card(model: TrackerBoardModel, applicationId: string): TrackerCardVM {
  const found = [...model.columns, ...model.closedRail.outcomes]
    .flatMap((column) => column.cards)
    .find((candidate) => candidate.applicationId === applicationId);
  if (!found) throw new Error(`no card ${applicationId}`);
  return found;
}

describe("buildTrackerBoardModel · populated", () => {
  it("shows the 7 active stages in core order with counts and oldest age", () => {
    expect(
      board.columns.map((column) => [column.status.label, column.countLabel, column.oldestLabel]),
    ).toEqual([
      ["Saved", "3", "oldest 2 d"],
      ["Preparing", "2", "oldest 3 d"],
      ["Applied", "4", "oldest 9 d"],
      ["Acknowledged", "3", "oldest 13 d"],
      ["Screening", "2", "oldest 27 d"],
      ["Interviewing", "3", "oldest 12 d"],
      ["Offer", "1", "oldest 1 d"],
    ]);
    const interviewing = board.columns[5];
    expect(interviewing?.accessibleLabel).toBe("Interviewing, 3 applications");
    expect(interviewing?.oldestAccessibleLabel).toBe("Oldest: 12 days in this stage");
    // Nothing is empty and Saved holds 3 (≤ 5), so no column starts collapsed.
    expect(board.columns.every((column) => !column.collapsedByDefault && column.emptyLine === null)).toBe(
      true,
    );
    expect(board.firstUse).toBeNull();
  });

  it("orders cards by next action due, then longest in stage", () => {
    const ids = (index: number) => board.columns[index]?.cards.map((entry) => entry.applicationId);
    expect(ids(5)).toEqual(["app-kervan", "app-thames", "app-brightwave"]);
    expect(ids(2)).toEqual(["app-quill", "app-tannenbaum", "app-halden", "app-kumsal"]);
    expect(ids(0)).toEqual(["app-sail", "app-bosphorus", "app-aire"]);
  });

  it("words card meta, staleness and the automatic-move glyph", () => {
    const kervan = card(board, "app-kervan");
    expect(kervan.company).toEqual({
      name: "Kervan Teknoloji",
      domain: kervan.company.domain,
      monogram: "KT",
    });
    expect(kervan.role).toBe("Product Engineer (Frontend)");
    expect(kervan.location).toBe("Istanbul (hybrid)");
    expect(kervan.age.label).toBe("12 d in stage");
    expect(kervan.age.accessibleLabel).toBe("12 days in Interviewing");
    expect(kervan.nextAction).toEqual({
      label: "On-site interview",
      due: expect.objectContaining({ label: "Today, 15:00" }),
    });
    // An interview is coming up, so the card doesn't say "No reply".
    expect(kervan.staleness).toBeNull();
    expect(kervan.autoMove).toBeNull();

    expect(card(board, "app-quill").staleness).toBe("No reply in 9 days");
    expect(card(board, "app-kiez").staleness).toBe("No reply in 26 days");
    expect(card(board, "app-tannenbaum").staleness).toBeNull();

    expect(card(board, "app-lumenpay").autoMove).toBe("Moved automatically from an email");
    expect(card(board, "app-brisk").autoMove).toBe("Moved automatically from an email");
    // Kumsal's automatic Not selected was undone by the user: the latest move is the user's.
    expect(card(board, "app-kumsal").autoMove).toBeNull();
  });

  it("offers one-stage steps for keyboard moves", () => {
    const kervan = card(board, "app-kervan");
    expect(kervan.stepForward?.key).toBe("offer");
    expect(kervan.stepBack?.key).toBe("screening");
    expect(card(board, "app-sail").stepBack).toBeNull();
    expect(card(board, "app-lumenpay").stepForward).toBeNull();
    expect(card(board, "app-vela").stepForward).toBeNull();
  });

  it("counts closed outcomes with Not selected and No response wording", () => {
    const rail = board.closedRail;
    expect(rail.label).toBe("Closed");
    expect(rail.countLabel).toBe("7");
    expect(rail.outcomes.map((outcome) => [outcome.status.label, outcome.count])).toEqual([
      ["Accepted", 1],
      ["Declined", 1],
      ["Not selected", 3],
      ["Withdrawn", 1],
      ["No response", 1],
    ]);
    expect(rail.accessibleLabel).toBe(
      "Closed, 7 applications: Accepted 1, Declined 1, Not selected 3, Withdrawn 1, No response 1",
    );
    expect(rail.emptyLine).toBeNull();
    const labels = JSON.stringify([
      rail.accessibleLabel,
      rail.outcomes.map((outcome) => outcome.status.label),
    ]);
    expect(labels).not.toMatch(/Rejected|Ghosted/);
  });

  it("selects an application by id with its place in the column", () => {
    const { selected } = buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-thames" });
    expect(selected).toEqual({
      applicationId: "app-thames",
      position: { label: "2 of 3 in Interviewing", previousId: "app-kervan", nextId: "app-brightwave" },
    });
    expect(
      card(board, "app-thames").moves.find((move) => move.status.key === "accepted")?.disabledReason,
    ).toBe("Accepted and Declined come after an offer.");
  });

  it("falls back to no selection for a missing or unknown id", () => {
    expect(board.selected).toBeNull();
    expect(buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-nope" }).selected).toBeNull();
  });

  it("flags pending writes on the application or its events", () => {
    const pending = fixtureContext(populatedDataset, ["app-quill", "app-kervan-x1"]);
    const model = buildTrackerBoardModel(populatedDataset, pending, { applicationId: "app-quill" });
    expect(card(model, "app-quill").pendingSync).toBe(true);
    expect(card(model, "app-kervan").pendingSync).toBe(true);
    expect(card(model, "app-thames").pendingSync).toBe(false);
    expect(card(board, "app-quill").pendingSync).toBe(false);
  });
});

describe("buildTrackerBoardModel · empty", () => {
  const emptyCtx = fixtureContext(emptyDataset);
  const empty = buildTrackerBoardModel(emptyDataset, emptyCtx, { applicationId: "app-lumenpay" });

  it("keeps every column with a 0 count and shows the first-use explainer", () => {
    expect(empty.columns.map((column) => [column.status.label, column.countLabel])).toEqual([
      ["Saved", "0"],
      ["Preparing", "0"],
      ["Applied", "0"],
      ["Acknowledged", "0"],
      ["Screening", "0"],
      ["Interviewing", "0"],
      ["Offer", "0"],
    ]);
    for (const column of empty.columns) {
      expect(column.cards).toEqual([]);
      expect(column.oldestLabel).toBeNull();
      expect(column.emptyLine).toBeNull();
      expect(column.collapsedByDefault).toBe(false);
    }
    expect(empty.firstUse).toEqual({
      title: "No applications yet",
      body: "Add a job you've applied to, or save one from Jobs to track it here.",
      primary: { label: "Add application", shortcut: "Mod+N" },
      columnAddLabel: "Add",
    });
  });

  it("has an empty Closed rail and no selection", () => {
    expect(empty.closedRail.countLabel).toBe("0");
    expect(empty.closedRail.outcomes.map((outcome) => outcome.count)).toEqual([0, 0, 0, 0, 0]);
    expect(empty.closedRail.emptyLine).toBe("Closed applications will appear here.");
    expect(empty.selected).toBeNull();
  });
});

describe("buildTrackerBoardModel · Turkish", () => {
  it("words the Closed rail from the Turkish catalog", () => {
    const turkish = fixtureContext(populatedDataset, [], createAppIntl({ language: "tr", locale: "tr-TR" }));
    const rail = buildTrackerBoardModel(populatedDataset, turkish, {}).closedRail;
    expect(rail.accessibleLabel).not.toMatch(/Closed|applications|Accepted/);
    expect(rail.accessibleLabel).toContain("Kabul edildi 1");
  });
});

describe("previewDrop", () => {
  const intl = ctx.intl;

  it("shows the target column with the card in its board-order slot", () => {
    const column = previewDrop(board, "app-quill", "screening", intl);
    expect(column?.countLabel).toBe("3");
    const quill = column?.cards.find((entry) => entry.applicationId === "app-quill");
    expect(quill?.status.key).toBe("screening");
    expect(quill?.age.label).toBe("New today");
    expect(quill?.staleness).toBeNull();
    expect(card(board, "app-quill").status.key).toBe("applied");
  });

  it("refuses moves the state machine refuses", () => {
    expect(checkBoardMove("applied", "accepted", intl)).toEqual({
      allowed: false,
      reason: "Accepted and Declined come after an offer.",
    });
    expect(checkBoardMove("offer", "accepted", intl)).toEqual({ allowed: true });
    expect(previewDrop(board, "app-quill", "accepted", intl)).toBeNull();
    expect(previewDrop(board, "app-quill", "applied", intl)).toBeNull();
  });
});
