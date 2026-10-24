import { describe, expect, it } from "vitest";
import { CvContentSchema } from "../cv";
import {
  TAILOR_SAMPLE_CONTENT as content,
  TAILOR_SAMPLE_EDITS as edits,
  TAILOR_SAMPLE_STALE_CONTENT as edited,
  sampleEdit as byId,
} from "./sample";
import {
  applyTailorEdits,
  isTailorTarget,
  reorderLabels,
  type TailorEdit,
  TailorEditSchema,
  valueAtPointer,
} from "./tailor";

describe("TailorEditSchema", () => {
  it("accepts the sample edits", () => {
    for (const edit of edits) expect(TailorEditSchema.safeParse(edit).success, edit.id).toBe(true);
  });

  it("checks the fields each operation needs", () => {
    expect(TailorEditSchema.safeParse({ ...byId("e2"), after: null }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e3"), after: "x" }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e4"), before: "x" }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e5"), order: null }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e5"), order: [0, 0, 1] }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e2"), order: [0] }).success).toBe(false);
    expect(TailorEditSchema.safeParse({ ...byId("e2"), path: "work/0" }).success).toBe(false);
  });
});

describe("isTailorTarget", () => {
  it("allows wording and order of bullets at light intensity", () => {
    expect(isTailorTarget("replace", "/work/0/highlights/1", "light")).toBe(true);
    expect(isTailorTarget("reorder", "/skills/0/keywords", "light")).toBe(true);
    expect(isTailorTarget("replace", "/basics/summary", "light")).toBe(false);
    expect(isTailorTarget("insert", "/work/0/highlights/0", "light")).toBe(false);
  });

  it("unlocks summary, inserts, removals and section order at thorough intensity", () => {
    expect(isTailorTarget("replace", "/basics/summary", "thorough")).toBe(true);
    expect(isTailorTarget("insert", "/skills/1/keywords/3", "thorough")).toBe(true);
    expect(isTailorTarget("remove", "/work/0/highlights/2", "thorough")).toBe(true);
    expect(isTailorTarget("reorder", "/meta/sectionOrder", "thorough")).toBe(true);
  });

  it("never edits facts: names, titles, employers, dates, degrees, contact details", () => {
    for (const path of [
      "/basics/name",
      "/basics/email",
      "/work/0/name",
      "/work/0/position",
      "/work/0/startDate",
      "/education/0/studyType",
      "/education/0/institution",
      "/certificates/0/name",
    ])
      for (const op of ["replace", "insert", "remove", "reorder"] as const)
        expect(isTailorTarget(op, path), `${op} ${path}`).toBe(false);
    expect(isTailorTarget("reorder", "/work")).toBe(false);
    expect(isTailorTarget("remove", "/work/0")).toBe(false);
    expect(isTailorTarget("replace", "/work/01/summary")).toBe(false);
  });
});

describe("applyTailorEdits", () => {
  it("applies nothing when nothing is accepted, and never mutates the input", () => {
    const snapshot = structuredClone(content);
    const result = applyTailorEdits(content, edits, []);
    expect(result).toEqual({ content, applied: [], skipped: [] });
    expect(result.content).not.toBe(content);
    applyTailorEdits(
      content,
      edits,
      edits.map((edit) => edit.id),
    );
    expect(content).toEqual(snapshot);
  });

  it("replaces text values", () => {
    const result = applyTailorEdits(content, edits, ["e1", "e9"]);
    expect(result.applied).toEqual(["e1", "e9"]);
    expect(result.content.basics?.summary).toBe(byId("e1").after);
    expect(valueAtPointer(result.content, "/work/1/highlights/1")).toBe(byId("e9").after);
  });

  it("combines replace, insert, remove and reorder on one array by original index", () => {
    const result = applyTailorEdits(content, edits, ["e2", "e3", "e4", "e5"]);
    expect(result.skipped).toEqual([]);
    // Order [1, 0, 2]: original #1 first, then #0 with the insert before it, #2 removed.
    expect(result.content.work?.[0]?.highlights).toEqual([
      "Moved service deployments to Kubernetes, packaged with Helm.",
      "Owned the payments ledger end to end in Go.",
      "Built a ledger service in Go handling 2M transactions a day.",
    ]);
  });

  it("applies nested array edits before reordering their parent", () => {
    const result = applyTailorEdits(content, edits, ["e6", "e7", "e8"]);
    expect(result.content.skills).toEqual([
      { name: "Infrastructure", keywords: ["Kubernetes", "Helm", "Redis", "PostgreSQL"] },
      { name: "Languages", keywords: ["Go", "TypeScript", "SQL"] },
    ]);
    expect(result.content.meta.sectionOrder).toEqual(["basics", "skills", "work", "projects"]);
    expect(CvContentSchema.safeParse(result.content).success).toBe(true);
  });

  it("gives the same result whatever order the edits are accepted in", () => {
    const all = edits.map((edit) => edit.id);
    const forward = applyTailorEdits(content, edits, all);
    const backward = applyTailorEdits(content, [...edits].reverse(), [...all].reverse());
    expect(backward.content).toEqual(forward.content);
    expect(forward.skipped).toEqual([]);
  });

  it("skips edits whose text changed since they were proposed", () => {
    const result = applyTailorEdits(edited, edits, ["e2", "e3"]);
    expect(result.applied).toEqual(["e3"]);
    expect(result.skipped).toEqual([{ id: "e2", reason: "stale" }]);
    expect(applyTailorEdits(edited, [{ ...byId("e5"), order: [1, 0] }], ["e5"]).skipped).toEqual([
      { id: "e5", reason: "stale" },
    ]);
    expect(
      applyTailorEdits(content, [{ ...byId("e4"), path: "/work/0/highlights/4" }], ["e4"]).skipped,
    ).toEqual([{ id: "e4", reason: "stale" }]);
  });

  it("skips paths outside the tailoring targets and duplicate changes", () => {
    const forged: TailorEdit = {
      ...byId("e2"),
      id: "x1",
      path: "/work/0/position",
      before: "Senior Backend Engineer",
    };
    const twice: TailorEdit = { ...byId("e2"), id: "x2", after: "Something else." };
    const result = applyTailorEdits(content, [...edits, forged, twice], ["e2", "x1", "x2"]);
    expect(result.applied).toEqual(["e2"]);
    expect(result.skipped).toEqual([
      { id: "x1", reason: "invalid_path" },
      { id: "x2", reason: "conflict" },
    ]);
    expect(result.content.work?.[0]?.position).toBe("Senior Backend Engineer");
  });
});

describe("reorderLabels", () => {
  it("labels strings by text and objects by name", () => {
    expect(reorderLabels(content.skills ?? [], [1, 0])).toEqual({
      before: "Languages · Infrastructure",
      after: "Infrastructure · Languages",
    });
  });
});
