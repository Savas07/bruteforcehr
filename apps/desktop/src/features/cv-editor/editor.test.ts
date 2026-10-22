import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { keywordCoverage } from "./coverage";
import { designSuggestions } from "./design-suggestions";
import { addSkillKeyword, moveItem, moveSection, removeItem, insertItem, setTextAt, type CvDraft } from "./draft";
import { buildCvEditorModel } from "./model";
import { buildPreviewDocument, paginate } from "./preview-document";
import { buildSuggestionVMs, fillPlaceholders, hasUnfilledPlaceholders, wordDiff } from "./suggestions";

const ctx = fixtureContext(populatedDataset);

function draftFor(cvId: string): CvDraft {
  const editor = buildCvEditorModel(populatedDataset, ctx, { cvId }).editor;
  if (!editor) throw new Error(`no editor for ${cvId}`);
  return editor.draft;
}

describe("draft", () => {
  it("keeps the editor's section order with the header pinned first", () => {
    const draft = draftFor("cv-en");
    expect(draft.sections.map((section) => section.key).slice(0, 3)).toEqual(["header", "summary", "work"]);
    expect(draft.sections.find((section) => section.key === "work")?.items.map((item) => item.org)).toEqual([
      "Pazarbox",
      "Kuzey Labs",
      "Mavi Yazılım",
    ]);
  });

  it("moves sections but never past the header, and returns null at the ends", () => {
    const draft = draftFor("cv-en");
    expect(moveSection(draft, "summary", -1)).toBeNull();
    expect(moveSection(draft, "header", 1)).toBeNull();
    const moved = moveSection(draft, "work", -1);
    expect(moved?.sections.map((section) => section.key).slice(0, 3)).toEqual(["header", "work", "summary"]);
    const last = draft.sections.at(-1)?.key ?? "";
    expect(moveSection(draft, last, 1)).toBeNull();
  });

  it("moves items within a section and removes / restores them", () => {
    const draft = draftFor("cv-en");
    const moved = moveItem(draft, "work", "work-1", -1);
    expect(moved?.sections.find((section) => section.key === "work")?.items[0]?.id).toBe("work-1");
    expect(moveItem(draft, "work", "work-0", -1)).toBeNull();
    const removed = removeItem(draft, "work", "work-1");
    expect(removed?.index).toBe(1);
    const restored = removed && insertItem(removed.draft, "work", removed.item, removed.index);
    expect(restored?.sections.find((section) => section.key === "work")?.items.map((item) => item.id)).toEqual([
      "work-0",
      "work-1",
      "work-2",
    ]);
  });

  it("adds a missing keyword to the last skill group once", () => {
    const draft = draftFor("cv-en");
    const added = addSkillKeyword(draft, "Vue");
    expect(added?.draft.sections.find((section) => section.key === "skills")?.items.at(-1)?.keywords).toContain("Vue");
    expect(added && addSkillKeyword(added.draft, "vue")).toBeNull();
  });
});

describe("preview document", () => {
  it("uses the CV's language for headings and dates, not the UI's", () => {
    const de = buildPreviewDocument(draftFor("cv-de"));
    const headings = de.blocks.flatMap((block) => (block.kind === "heading" ? [block.text] : []));
    expect(headings).toContain("Berufserfahrung");
    expect(de.lang).toBe("de");
    const entry = de.blocks.find((block) => block.kind === "entry");
    expect(entry?.kind === "entry" && entry.dates).toBe("März 2022 – heute");
  });

  it("leaves hidden and empty sections out and prints skills as lines", () => {
    const en = buildPreviewDocument(draftFor("cv-en"));
    const skills = en.blocks.filter((block) => block.kind === "line" && block.sectionKey === "skills");
    expect(skills[0]?.kind === "line" && skills[0].text).toBe("React, TypeScript, Next.js, Redux, Tailwind CSS, Vite");
    expect(en.blocks.some((block) => block.kind === "heading" && block.text === "References")).toBe(false);
  });

  it("paginates on block boundaries and keeps a heading with the next block", () => {
    expect(paginate([400, 400, 100, 200], ["entry", "entry", "heading", "entry"], 1000)).toEqual([[0, 1], [2, 3]]);
    expect(paginate([1200, 10], ["entry", "entry"], 1000)).toEqual([[0], [1]]);
  });
});

describe("suggestions", () => {
  it("diffs by word, deletions before insertions", () => {
    expect(wordDiff("Responsible for the checkout", "Led the checkout")).toEqual([
      { kind: "del", text: "Responsible for" },
      { kind: "ins", text: "Led" },
      { kind: "same", text: "the checkout" },
    ]);
  });

  it("folds one- or two-word kept runs between changes into the change", () => {
    const tokens = wordDiff("a b c d e", "x b y d e");
    expect(tokens).toEqual([
      { kind: "del", text: "a b c" },
      { kind: "ins", text: "x b y" },
      { kind: "same", text: "d e" },
    ]);
  });

  it("blocks use until every placeholder has a real value", () => {
    expect(hasUnfilledPlaceholders(["[X%]"], {})).toBe(true);
    expect(hasUnfilledPlaceholders(["[X%]"], { "[X%]": "  " })).toBe(true);
    expect(hasUnfilledPlaceholders(["[X%]"], { "[X%]": "[X%]" })).toBe(true);
    expect(hasUnfilledPlaceholders(["[X%]"], { "[X%]": "30%" })).toBe(false);
    expect(fillPlaceholders("by [X%].", { "[X%]": " 30% " })).toBe("by 30%.");
  });

  it("builds view-models for the design seed against the English CV only", () => {
    const draft = draftFor("cv-en");
    const vms = buildSuggestionVMs(designSuggestions, draft, { work: "Experience" }, ctx.intl);
    expect(vms).toHaveLength(3);
    expect(vms[1]?.placeholders).toEqual(["[X%]"]);
    expect(vms[0]?.location).toBe("Experience · Pazarbox · Bullet 3");
    expect(vms[0]?.spoken).toMatch(/^Removed: .+\. Added: .+\.$/u);
    expect(buildSuggestionVMs(designSuggestions, draftFor("cv-de"), {}, ctx.intl)).toEqual([]);
  });

  it("applies a filled suggestion to its bullet", () => {
    const draft = draftFor("cv-en");
    const [, withPlaceholder] = buildSuggestionVMs(designSuggestions, draft, {}, ctx.intl);
    if (!withPlaceholder) throw new Error("missing suggestion");
    const next = setTextAt(draft, withPlaceholder.target, fillPlaceholders(withPlaceholder.proposed, { "[X%]": "25%" }));
    expect(next.sections.find((section) => section.key === "work")?.items[1]?.bullets[0]).toContain("by 25%.");
  });
});

describe("keyword coverage", () => {
  it("counts covered keywords case-insensitively and drops excluded ones", () => {
    const draft = draftFor("cv-en");
    const coverage = keywordCoverage(["react", "storybook", "vue"], draft, new Set(), ctx.intl);
    expect(coverage.covered).toEqual(["react", "storybook"]);
    expect(coverage.missing).toEqual(["vue"]);
    expect(coverage.fact).toBe("Covers 2 of 3 keywords from this job");
    expect(keywordCoverage(["react", "vue"], draft, new Set(["vue"]), ctx.intl).total).toBe(1);
  });

  it("words the fact in Turkish", () => {
    const tr = createAppIntl({ language: "tr", locale: "tr-TR" });
    expect(keywordCoverage(["react"], draftFor("cv-en"), new Set(), tr).fact).not.toBe("");
  });
});
