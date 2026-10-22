import { emptyDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { nudgeVMs } from "../../shared/model/build-blocks";
import { fixtureContext } from "../../shared/model/fixture-context";
import {
  applyBoardMoves,
  type BoardMove,
  buildTrackerBoardModel,
  checkBoardMove,
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

  it("passes the shared nudges through", () => {
    expect(board.nudges).toEqual(nudgeVMs(populatedDataset, ctx));
    expect(board.nudges.find((nudge) => nudge.applicationId === "app-kiez")?.message).toBe(
      "No reply in 26 days. Mark as no response?",
    );
    expect(board.nudges.find((nudge) => nudge.applicationId === "app-quill")?.primaryLabel).toBe(
      "Draft follow-up",
    );
  });

  it("selects an application with header, timeline and Undo state", () => {
    const { selected } = buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-lumenpay" });
    expect(selected?.company.name).toBe("Lumenpay");
    expect(selected?.role).toBe("Frontend Engineer, Merchant Dashboard");
    expect(selected?.status.label).toBe("Offer");
    expect(selected?.position).toEqual({ label: "1 of 1 in Offer", previousId: null, nextId: null });
    expect(selected?.nextAction).toEqual({
      label: "Reply to the offer",
      due: expect.objectContaining({ label: "29 Oct, 18:00" }),
    });
    expect(selected?.summary.applicationId).toBe("app-lumenpay");
    expect(selected?.summary.nextStep).toBe("Take the time you need to review the offer before you reply.");

    const timeline = selected?.timeline ?? [];
    expect(timeline[0]?.kind).toBe("note");
    const offer = timeline.find((event) => event.id === "evt-lumenpay-offer");
    expect(offer?.title).toBe("Moved to Offer");
    expect(offer?.undo).toEqual({ available: true });
    expect(offer?.source.label).toBe("Automatic · Mail");
    expect(offer?.mailMessageId).toBe("mail-lumenpay-offer");
    const ack = timeline.find((event) => event.id === "app-lumenpay-e2");
    expect(ack?.undo).toEqual({ available: false, reason: "Can't undo — the status changed since." });

    // From Offer, Accepted and Declined are open.
    const moves = selected?.moves ?? [];
    expect(moves.find((move) => move.status.key === "accepted")?.disabledReason).toBeNull();
    expect(moves.find((move) => move.status.key === "offer")?.current).toBe(true);
  });

  it("walks the column with n of N and disables outcomes before an offer", () => {
    const { selected } = buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-thames" });
    expect(selected?.position).toEqual({
      label: "2 of 3 in Interviewing",
      previousId: "app-kervan",
      nextId: "app-brightwave",
    });
    const moves = selected?.moves ?? [];
    expect(moves).toHaveLength(12);
    expect(moves.map((move) => move.status.key).slice(0, 7)).toEqual([
      "saved",
      "preparing",
      "applied",
      "acknowledged",
      "screening",
      "interviewing",
      "offer",
    ]);
    for (const key of ["accepted", "declined"]) {
      expect(moves.find((move) => move.status.key === key)?.disabledReason).toBe(
        "Accepted and Declined come after an offer.",
      );
    }
    expect(moves.find((move) => move.status.key === "rejected")).toEqual({
      status: { key: "rejected", label: "Not selected", phase: "closed" },
      current: false,
      disabledReason: null,
    });
    expect(moves.find((move) => move.status.key === "interviewing")).toMatchObject({
      current: true,
      disabledReason: null,
    });
  });

  it("includes the nudge for the selected application", () => {
    const { selected } = buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-quill" });
    expect(selected?.nudge?.kind).toBe("followUp");
    expect(selected?.nextAction).toBeNull();
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
    expect(model.selected?.pendingSync).toBe(true);
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
      secondary: { label: "Import CSV" },
      columnAddLabel: "Add",
    });
  });

  it("has an empty Closed rail, no nudges and no selection", () => {
    expect(empty.closedRail.countLabel).toBe("0");
    expect(empty.closedRail.outcomes.map((outcome) => outcome.count)).toEqual([0, 0, 0, 0, 0]);
    expect(empty.closedRail.emptyLine).toBe("Closed applications will appear here.");
    expect(empty.nudges).toEqual([]);
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

describe("applyBoardMoves", () => {
  const intl = ctx.intl;
  const selectedBoard = buildTrackerBoardModel(populatedDataset, ctx, { applicationId: "app-lumenpay" });
  const move = (
    applicationId: string,
    from: BoardMove["from"],
    to: BoardMove["to"],
    revertsEventId: string | null = null,
  ): BoardMove => ({
    id: `local-${applicationId}-${to}`,
    applicationId,
    from,
    to,
    revertsEventId,
  });

  it("moves a card into its board-order slot and recounts both columns", () => {
    const next = applyBoardMoves(board, [move("app-quill", "applied", "screening")], intl, {
      pendingSync: false,
    });
    expect(next.columns[2]?.cards.map((entry) => entry.applicationId)).toEqual([
      "app-tannenbaum",
      "app-halden",
      "app-kumsal",
    ]);
    expect(next.columns[2]?.accessibleLabel).toBe("Applied, 3 applications");
    expect(next.columns[4]?.countLabel).toBe("3");
    const quill = card(next, "app-quill");
    expect(quill.status.key).toBe("screening");
    expect(quill.age.label).toBe("New today");
    expect(quill.staleness).toBeNull();
    expect(quill.stepForward?.key).toBe("interviewing");
    expect(quill.moves.find((target) => target.current)?.status.key).toBe("screening");
    expect(quill.pendingSync).toBe(false);
    // The untouched board is unchanged.
    expect(card(board, "app-quill").status.key).toBe("applied");
  });

  it("recounts the Closed rail and marks offline moves as waiting to sync", () => {
    const next = applyBoardMoves(board, [move("app-quill", "applied", "rejected")], intl, {
      pendingSync: true,
    });
    expect(next.closedRail.countLabel).toBe("8");
    expect(next.closedRail.outcomes[2]?.count).toBe(4);
    expect(card(next, "app-quill").pendingSync).toBe(true);
    expect(next.nudges.some((nudge) => nudge.applicationId === "app-quill")).toBe(false);
  });

  it("skips moves the state machine refuses and stale moves", () => {
    expect(checkBoardMove("applied", "accepted", intl)).toEqual({
      allowed: false,
      reason: "Accepted and Declined come after an offer.",
    });
    expect(checkBoardMove("offer", "accepted", intl)).toEqual({ allowed: true });
    expect(
      applyBoardMoves(board, [move("app-quill", "applied", "accepted")], intl, { pendingSync: false }),
    ).toBe(board);
    expect(
      applyBoardMoves(board, [move("app-quill", "offer", "accepted")], intl, { pendingSync: false }),
    ).toBe(board);
  });

  it("collapses a column its last card leaves", () => {
    const next = applyBoardMoves(board, [move("app-lumenpay", "offer", "accepted")], intl, {
      pendingSync: false,
    });
    expect(next.columns[6]).toMatchObject({
      count: 0,
      collapsedByDefault: true,
      emptyLine: "No applications",
    });
  });

  it("adds the timeline row to the selected record and tags an undone automatic move", () => {
    const next = applyBoardMoves(
      selectedBoard,
      [move("app-lumenpay", "offer", "acknowledged", "evt-lumenpay-offer")],
      intl,
      { pendingSync: false },
    );
    const selected = next.selected;
    expect(selected?.status.key).toBe("acknowledged");
    expect(selected?.timeline[0]).toMatchObject({
      title: "Undid a move · back to Acknowledged",
      source: { kind: "you", label: "You" },
      move: { from: { key: "offer" }, to: { key: "acknowledged" } },
    });
    expect(selected?.timeline.find((event) => event.id === "evt-lumenpay-offer")?.reverted).toBe(true);
    expect(selected?.summary.nextStep).toBe(selected?.nextStepByStatus.acknowledged);
    expect(selected?.position.label).toBe("1 of 4 in Acknowledged");
  });

  it("supersedes earlier Undo offers after a plain move", () => {
    const next = applyBoardMoves(selectedBoard, [move("app-lumenpay", "offer", "accepted")], intl, {
      pendingSync: false,
    });
    expect(next.selected?.timeline[0]?.title).toBe("Moved to Accepted");
    expect(next.selected?.timeline.find((event) => event.id === "evt-lumenpay-offer")?.undo).toEqual({
      available: false,
      reason: "Can't undo — the status changed since.",
    });
  });
});
