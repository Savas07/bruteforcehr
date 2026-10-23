import { CvContentSchema } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { fixtureContext } from "../../shared/model/fixture-context";
import { blankContent, changedSections, contentFromProfile, contentLines, defaultPaperSize, diffLines, draftToContent } from "./content";
import { emptyItem, insertItem, moveSection, removeItem, setTextAt, updateHeader } from "./draft";
import { buildCvEditorModel } from "./model";

const ctx = fixtureContext(populatedDataset);

function editorFor(cvId: string) {
  const editor = buildCvEditorModel(populatedDataset, ctx, { cvId }).editor;
  if (!editor) throw new Error(`no editor for ${cvId}`);
  const content = editor.revisionContents[editor.currentRevisionId];
  if (!content) throw new Error(`no content for ${cvId}`);
  return { editor, content, design: { template: content.meta.template, fontPair: content.meta.theme.fontPair } };
}

describe("draftToContent", () => {
  it("writes an unchanged draft back as the same content, for every fixture CV", () => {
    for (const cv of populatedDataset.cvs) {
      const { editor, content, design } = editorFor(cv.id);
      expect(draftToContent(editor.draft, editor.draft, content, design)).toEqual(CvContentSchema.parse(content));
    }
  });

  it("changes only the edited bullet and keeps fields the editor doesn't show", () => {
    const { editor, content, design } = editorFor("cv-en");
    const edited = setTextAt(editor.draft, { sectionKey: "work", itemId: "work-0", bulletIndex: 0 }, "Shipped a new checkout.");
    const next = draftToContent(edited, editor.draft, content, design);
    expect(next.work?.[0]?.highlights?.[0]).toBe("Shipped a new checkout.");
    expect(next.work?.[0]?.highlights?.slice(1)).toEqual(content.work?.[0]?.highlights?.slice(1));
    expect(next.work?.slice(1)).toEqual(content.work?.slice(1));
    expect(next.education).toEqual(content.education);
    expect(changedSections(content, next)).toEqual(["work"]);
  });

  it("adds, removes and reorders entries and sections", () => {
    const { editor, content, design } = editorFor("cv-en");
    let draft = insertItem(editor.draft, "work", { ...emptyItem("work-new-1"), title: "Mentor", org: "Code Club" }, 0);
    draft = removeItem(draft, "work", "work-2")?.draft ?? draft;
    draft = moveSection(draft, "education", -1) ?? draft;
    const next = draftToContent(draft, editor.draft, content, design);
    expect(next.work?.map((work) => work.name)).toEqual(["Code Club", content.work?.[0]?.name, content.work?.[1]?.name]);
    const order = next.meta.sectionOrder;
    expect(order.indexOf("education")).toBeLessThan(order.indexOf("work") === -1 ? Infinity : order.indexOf("education") + 1);
  });

  it("drops empty new entries instead of storing blanks", () => {
    const { editor, content, design } = editorFor("cv-en");
    const draft = insertItem(editor.draft, "work", emptyItem("work-new-1"));
    expect(draftToContent(draft, editor.draft, content, design).work).toEqual(content.work);
  });

  it("splits an edited location line into city and country", () => {
    const { editor, content, design } = editorFor("cv-en");
    const draft = updateHeader(editor.draft, { location: "Berlin, DE" });
    expect(draftToContent(draft, editor.draft, content, design).basics?.location).toMatchObject({ city: "Berlin", countryCode: "DE" });
  });

  it("stores the chosen template, font pair and theme", () => {
    const { editor, content } = editorFor("cv-en");
    const draft = { ...editor.draft, paperSize: "letter" as const, density: "compact" as const };
    const next = draftToContent(draft, editor.draft, content, { template: "modern", fontPair: "source-sans-serif" });
    expect(next.meta.template).toBe("modern");
    expect(next.meta.theme).toMatchObject({ paperSize: "letter", density: "compact", fontPair: "source-sans-serif" });
  });
});

describe("new CV content", () => {
  it("starts blank with valid meta", () => {
    expect(CvContentSchema.parse(blankContent("a4")).meta.theme.paperSize).toBe("a4");
  });

  it("takes only what the profile knows", () => {
    const content = contentFromProfile(populatedDataset.profile, "en", "a4");
    expect(content.basics?.name).toBe(populatedDataset.profile.fullName);
    expect(content.basics?.email).toBe(populatedDataset.profile.email);
    expect(content.work).toBeUndefined();
    expect(content.basics?.summary).toBeUndefined();
  });

  it("prints on Letter in the US and Canada, A4 elsewhere", () => {
    expect(defaultPaperSize("en-US")).toBe("letter");
    expect(defaultPaperSize("en-CA")).toBe("letter");
    expect(defaultPaperSize("en-GB")).toBe("a4");
    expect(defaultPaperSize("tr-TR")).toBe("a4");
  });
});

describe("diffLines", () => {
  it("marks added and removed lines and keeps the rest", () => {
    const { content } = editorFor("cv-en");
    const next = { ...content, basics: { ...content.basics, label: "Staff Engineer" } };
    const diff = diffLines(contentLines(content), contentLines(next));
    expect(diff.filter((line) => line.kind === "added").map((line) => line.line.text)).toEqual(["Staff Engineer"]);
    expect(diff.filter((line) => line.kind === "removed")).toHaveLength(1);
    expect(diff.filter((line) => line.kind === "same").length).toBe(contentLines(content).length - 1);
  });
});
