/**
 * Between the preview's JSON pointers (`data-cv-path` from @bfhr/cv-render, into the content
 * `draftToContent` writes) and the editor's draft (section keys, item ids). Entries are written in
 * draft order with empty ones dropped (content.ts), so index i of a section is its i-th non-empty
 * draft item.
 */
import type { CvDraft, CvDraftItem, CvDraftSection } from "./draft";

/** Where a preview click lands in the editor. */
export interface DraftLocation {
  readonly sectionKey: string;
  /** Null for the header and the summary. */
  readonly itemId: string | null;
}

function written(section: CvDraftSection): readonly CvDraftItem[] {
  return section.items.filter(
    (item) =>
      item.title.trim() !== "" ||
      item.org.trim() !== "" ||
      item.detail.trim() !== "" ||
      item.location.trim() !== "" ||
      item.url.trim() !== "" ||
      item.start !== null ||
      item.end !== null ||
      item.bullets.some((bullet) => bullet.trim() !== "") ||
      item.keywords.length > 0,
  );
}

function customSections(draft: CvDraft): CvDraftSection[] {
  return draft.sections.filter((section) => section.key.startsWith("custom:"));
}

export function locateInDraft(path: string, draft: CvDraft): DraftLocation | null {
  const [, first, second, third, , fifth] = path.split("/");
  if (first === "basics") return second === "summary" ? { sectionKey: "summary", itemId: null } : { sectionKey: "header", itemId: null };
  if (first === "meta" && second === "customSections" && third !== undefined) {
    // `/meta/customSections/<i>/items/<j>/…`
    const section = customSections(draft)[Number(third)];
    const item = section && fifth !== undefined ? written(section)[Number(fifth)] : undefined;
    return section ? { sectionKey: section.key, itemId: item?.id ?? null } : null;
  }
  const section = draft.sections.find((candidate) => candidate.key === first);
  if (!section) return null;
  const item = second === undefined ? undefined : written(section)[Number(second)];
  return { sectionKey: section.key, itemId: item?.id ?? null };
}

/** JSON pointer of an editor block (item id, `summary`, `header`) in the written content. */
export function pathOfBlock(blockId: string, draft: CvDraft): string | null {
  if (blockId === "header") return "/basics";
  if (blockId === "summary") return "/basics/summary";
  for (const section of draft.sections) {
    const index = written(section).findIndex((item) => item.id === blockId);
    if (index === -1) continue;
    if (section.key.startsWith("custom:")) {
      return `/meta/customSections/${customSections(draft).indexOf(section)}/items/${index}`;
    }
    return `/${section.key}/${index}`;
  }
  return null;
}
