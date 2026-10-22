import type { CvRevision } from "@bfhr/core";
import { emptyDataset, FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { fixtureContext } from "../../shared/model/fixture-context";
import { buildCvEditorModel, type CvEditorVM, type CvListSectionVM } from "./model";

const ctx = fixtureContext(populatedDataset);

function editorFor(cvId: string | undefined, data = populatedDataset, context = ctx): CvEditorVM {
  const editor = buildCvEditorModel(data, context, { cvId }).editor;
  if (!editor) throw new Error(`no editor for ${String(cvId)}`);
  return editor;
}

function listSection(editor: CvEditorVM, key: string): CvListSectionVM {
  const section = editor.sections.find((candidate) => candidate.key === key);
  if (section?.kind !== "list") throw new Error(`no list section ${key}`);
  return section;
}

describe("buildCvEditorModel: selection and list", () => {
  it("selects the default CV when no or an unknown cvId is given", () => {
    for (const cvId of [undefined, "cv-missing"]) {
      const model = buildCvEditorModel(populatedDataset, ctx, { cvId });
      expect(model.selectedCvId).toBe("cv-en");
      expect(model.editor?.title).toBe("Base CV — English");
      expect(model.firstUse).toBeNull();
    }
  });

  it("selects the CV named by the param", () => {
    const model = buildCvEditorModel(populatedDataset, ctx, { cvId: "cv-de" });
    expect(model.selectedCvId).toBe("cv-de");
    expect(model.list.groups[0]?.variants[0]?.selected).toBe(true);
    expect(model.list.groups[0]?.base.selected).toBe(false);
  });

  it("groups the German variant under the English base with language pills and usage", () => {
    const { list } = buildCvEditorModel(populatedDataset, ctx, {});
    expect(list.groups).toHaveLength(1);
    const group = list.groups[0];
    expect(group?.base).toMatchObject({
      cvId: "cv-en",
      kind: "base",
      pill: "English",
      defaultLabel: "Default",
      usedIn: "Used in 18 applications",
      selected: true,
    });
    expect(group?.base.lastEdited.label).toBe("last week");
    expect(group?.variants.map((row) => [row.cvId, row.kind, row.pill, row.usedIn])).toEqual([
      ["cv-de", "language", "Deutsch", "Used in 2 applications"],
    ]);
    expect(list.archived).toEqual([]);
    expect(list.filters).toEqual([
      { id: "all", label: "All", count: 2 },
      { id: "archived", label: "Archived", count: 0 },
    ]);
  });

  it("moves archived CVs out of the groups", () => {
    const data = {
      ...populatedDataset,
      cvs: populatedDataset.cvs.map((cv) =>
        cv.id === "cv-de" ? { ...cv, archivedAt: new Date(FIXTURE_NOW.getTime() - 86_400_000) } : cv,
      ),
    };
    const model = buildCvEditorModel(data, ctx, { cvId: "cv-de" });
    expect(model.list.groups[0]?.variants).toEqual([]);
    expect(model.list.archived.map((row) => [row.cvId, row.archived, row.selected])).toEqual([
      ["cv-de", true, true],
    ]);
    expect(model.editor?.archivedAt?.label).toBe("yesterday");
  });
});

describe("buildCvEditorModel: editor", () => {
  it("lays out the base CV's sections in its own order, hidden ones last", () => {
    const editor = editorFor(undefined);
    expect(editor.variant).toBeNull();
    expect(editor.sections.map((section) => [section.key, section.title, section.visible])).toEqual([
      ["header", "Header", true],
      ["summary", "Summary", true],
      ["work", "Experience", true],
      ["projects", "Projects", true],
      ["skills", "Skills", true],
      ["education", "Education", true],
      ["languages", "Languages", true],
      ["custom:talks", "Talks", true],
      ["certificates", "Certificates", false],
    ]);
    expect(editor.sections.at(-1)?.hiddenNote).toBe("Not shown on your CV");
    expect(editor.sections[0]).toMatchObject({
      movable: false,
      summary: "Deniz Aksoy · Frontend & Product Engineer",
    });
    expect(editor.sections[1]?.summary).toBe(
      "Frontend engineer with five years of experience building fast, accessible product UIs in React and TypeScript.",
    );
  });

  it("builds item cards from the real employers and bullets", () => {
    const work = listSection(editorFor(undefined), "work");
    expect(work.summary).toBe("Pazarbox, Kuzey Labs and Mavi Yazılım");
    expect(work.countLabel).toBe("3 roles");
    expect(work.ghost).toBeNull();
    expect(work.items[0]).toMatchObject({
      title: "Frontend Engineer",
      org: "Pazarbox",
      dates: "Mar 2022 – Present",
      subtitle: "Pazarbox · Mar 2022 – Present",
      firstBullet:
        "Led the rebuild of the design system (62 components, React + TypeScript, Storybook), adopted by 7 product teams.",
    });
    expect(work.items[0]?.bullets).toHaveLength(4);
    expect(work.items[1]?.dates).toBe("Feb 2020 – Feb 2022");

    const editor = editorFor(undefined);
    expect(listSection(editor, "skills").summary).toBe("18 skills in 4 groups");
    expect(listSection(editor, "languages").summary).toBe("Turkish, English and German");
    expect(listSection(editor, "custom:talks").items[0]).toMatchObject({
      title: "Design systems that survive seven teams",
      subtitle: "Frontend Istanbul meetup · Apr 2025",
    });
    expect(listSection(editor, "certificates").items[0]?.subtitle).toBe("IAAP · Nov 2024");
  });

  it("shows a ghost row for an empty section", () => {
    const data = {
      ...populatedDataset,
      cvRevisions: populatedDataset.cvRevisions.map((revision) =>
        revision.id === "rev-en-3" ? { ...revision, content: { ...revision.content, work: [] } } : revision,
      ),
    };
    const work = listSection(editorFor("cv-en", data), "work");
    expect(work.items).toEqual([]);
    expect(work.ghost).toEqual({ label: "Add your first role", hint: "Start with the most recent." });
    expect(work.summary).toBe("Add your first role");
    expect(work.countLabel).toBe("0 roles");
  });

  it("shows the variant banner with the base changes since the translation", () => {
    const editor = editorFor("cv-de");
    expect(editor.kind).toBe("language");
    expect(editor.language).toEqual({ tag: "de", label: "Deutsch" });
    expect(editor.variant).toEqual({
      baseCvId: "cv-en",
      baseTitle: "Base CV — English",
      text: "Variant of Base CV — English · Deutsch",
      // rev-en-2 → rev-en-3 added Projects, Certificates and Talks.
      baseChange: { count: 3, label: "The base changed in 3 places", action: "Review" },
    });
    expect(listSection(editor, "work").summary).toBe("Pazarbox and Kuzey Labs");
    expect(editor.personalDetails).toMatchObject({ photo: { on: false }, dateOfBirth: { on: false } });
    expect(editorFor("cv-en").personalDetails).toBeNull();
  });

  it("reports save status, design and preview facts", () => {
    const editor = editorFor("cv-en");
    expect(editor.saveStatus).toMatchObject({ state: "saved", label: "Saved · last week" });
    expect(editor.design.summary).toBe("Classic · Inter / Source Serif · Comfortable · A4");
    expect(editor.preview).toMatchObject({
      paperLabel: "A4",
      dimensions: "210 × 297 mm",
      exportFileName: "Deniz-Aksoy-CV.pdf",
      latestExport: {
        fileId: "file-cv-en-3",
        fileName: "Deniz-Aksoy-CV.pdf",
        sizeLabel: "92 kB",
        isCurrent: true,
      },
    });
    expect(editor.originalFile).toMatchObject({
      fileName: "Deniz_Aksoy_CV_2025.pdf",
      kindLabel: "PDF",
      uploadedLabel: "Uploaded on 13 Aug",
    });
    expect(editorFor("cv-de").originalFile).toBeNull();
  });

  it("marks local writes as saved on this device", () => {
    const pending = fixtureContext(populatedDataset, ["cv-en"]);
    const model = buildCvEditorModel(populatedDataset, pending, {});
    expect(model.editor?.saveStatus).toMatchObject({ state: "local", label: "Saved on this device" });
    expect(model.editor?.pendingSync).toBe(true);
    expect(model.list.groups[0]?.base.pendingSync).toBe(true);
    expect(model.list.groups[0]?.variants[0]?.pendingSync).toBe(false);
  });

  it("lists the applications that pinned the CV, newest first, with the version they used", () => {
    const de = editorFor("cv-de");
    expect(de.pinnedLabel).toBe("Used in 2 applications");
    expect(de.pinnedApplications.map((row) => [row.label, row.status.label, row.usesLatest])).toEqual([
      ["Tannenbaum Software · Frontend-Entwickler:in (React)", "Applied", true],
      ["Fjordline Health · Frontend Engineer (m/w/d)", "Not selected", false],
    ]);
    expect(de.pinnedApplications[0]?.versionLabel).toBe("Latest version");
    expect(de.pinnedApplications[1]?.versionLabel).toMatch(/^Version from 12 Sept?$/u);

    const en = editorFor("cv-en");
    expect(en.pinnedApplications).toHaveLength(18);
    expect(en.pinnedApplications[0]).toMatchObject({
      label: "Halden Freight · Product Engineer",
      usesLatest: true,
    });
    expect(en.pinnedApplications.at(-1)).toMatchObject({
      applicationId: "app-helio",
      versionLabel: "Version from 13 Aug",
    });
  });
});

describe("buildCvEditorModel: revisions", () => {
  it("groups the base CV's revisions by day, newest first, with sources", () => {
    const editor = editorFor("cv-en");
    expect(editor.revisionCountLabel).toBe("3 versions");
    expect(editor.revisions).toHaveLength(3);
    expect(editor.revisions[0]?.label).toBe("10 Oct");
    expect(editor.revisions[2]?.label).toBe("13 Aug");
    const rows = editor.revisions.flatMap((group) => group.revisions);
    expect(rows.map((row) => [row.revisionId, row.sentence, row.source.label, row.latestLabel])).toEqual([
      ["rev-en-3", "Added Projects, Certificates and a Talks section", "You", "Latest"],
      ["rev-en-2", "Rewrote summary, added 4 highlights and German (A2)", "You", null],
      ["rev-en-1", "Imported from Deniz_Aksoy_CV_2025.pdf", "Import", null],
    ]);
    expect(rows[1]?.restoreLabel).toBe("Restore this version");
    expect(rows[0]?.clock).toBe("10:30");
  });

  it("labels AI-tailored revisions with their job", () => {
    const [latest] = editorFor("cv-de").revisions[0]?.revisions ?? [];
    expect(latest).toMatchObject({
      revisionId: "rev-de-2",
      sourceKind: "ai_tailor",
      source: { kind: "ai", label: "AI tailor" },
      jobId: "job-tannenbaum-frontend",
      sentence: "Tailored summary for Tannenbaum Software (2 of 3 suggestions accepted)",
    });
  });

  it("puts same-day revisions in one Today group", () => {
    const base = populatedDataset.cvRevisions.find((revision) => revision.id === "rev-en-3");
    if (!base) throw new Error("rev-en-3 missing");
    const hoursAgo = (hours: number) => new Date(FIXTURE_NOW.getTime() - hours * 3_600_000);
    const today: CvRevision[] = [
      {
        ...base,
        id: "rev-en-4",
        basedOnRevisionId: "rev-en-3",
        diffSummary: "Edited Experience · Pazarbox",
        createdAt: hoursAgo(2),
      },
      { ...base, id: "rev-en-5", basedOnRevisionId: "rev-en-4", diffSummary: null, createdAt: hoursAgo(1) },
    ];
    const data = {
      ...populatedDataset,
      cvs: populatedDataset.cvs.map((cv) =>
        cv.id === "cv-en" ? { ...cv, currentRevisionId: "rev-en-5" } : cv,
      ),
      cvRevisions: [...populatedDataset.cvRevisions, ...today],
    };
    const editor = editorFor("cv-en", data);
    expect(editor.revisions[0]?.label).toBe("Today");
    expect(editor.revisions[0]?.revisions.map((row) => [row.revisionId, row.sentence, row.isLatest])).toEqual(
      [
        ["rev-en-5", "Edited", true],
        ["rev-en-4", "Edited Experience · Pazarbox", false],
      ],
    );
    expect(editor.revisions[1]?.label).toBe("10 Oct");
  });
});

describe("buildCvEditorModel: empty", () => {
  it("offers the two first-use choices and no editor", () => {
    const empty = fixtureContext(emptyDataset);
    for (const cvId of [undefined, "cv-en"]) {
      const model = buildCvEditorModel(emptyDataset, empty, { cvId });
      expect(model.selectedCvId).toBeNull();
      expect(model.editor).toBeNull();
      expect(model.list.groups).toEqual([]);
      expect(model.list.filters.map((filter) => filter.count)).toEqual([0, 0]);
      expect(model.firstUse).toEqual({
        title: "No CVs yet",
        body: "Import the CV you already have and we'll make it editable, or start from a blank page.",
        choices: [
          {
            id: "import",
            label: "Import a CV",
            description: "PDF, DOCX, JSON Resume or the LinkedIn ZIP",
            primary: true,
          },
          {
            id: "scratch",
            label: "Start from scratch",
            description: "Build it step by step (about 10 min)",
            primary: false,
          },
        ],
      });
    }
  });
});
