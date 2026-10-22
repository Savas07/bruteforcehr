/**
 * The CV editor's working copy: what the structured form edits and the live preview renders.
 * Built once per CV by the view-model (`CvEditorVM.draft`); every edit is a pure function here,
 * so the view only holds state. Writes reach Firestore in a later milestone (M0 is optimistic and
 * local, with Undo toasts).
 */
import type { CvTheme } from "@bfhr/core";

export interface CvDraftItem {
  /** `<sectionKey>-<index>` for loaded items, `<sectionKey>-new-<n>` for added ones. */
  readonly id: string;
  /** Role, degree, project name, skill group, language. */
  readonly title: string;
  /** Employer, school, issuer, subtitle. */
  readonly org: string;
  readonly location: string;
  /** JSON Resume dates ("2022-03"); null when not set. `end` null with a `start` means ongoing. */
  readonly start: string | null;
  readonly end: string | null;
  /** Summary, fluency, level, description. */
  readonly detail: string;
  readonly bullets: readonly string[];
  readonly keywords: readonly string[];
  readonly url: string;
}

export interface CvDraftSection {
  /** `header`, `summary`, a JSON Resume section (`work`, …) or `custom:<id>`. */
  readonly key: string;
  readonly kind: "header" | "text" | "list";
  /** False when the section has content but isn't in the CV's section order. */
  readonly visible: boolean;
  /** Custom sections carry their own title (CV content); standard ones use the CV-language dictionary. */
  readonly customTitle: string | null;
  readonly items: readonly CvDraftItem[];
}

export interface CvDraftHeader {
  readonly name: string;
  readonly headline: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly location: string;
  readonly links: readonly { readonly label: string; readonly url: string }[];
  /** U6, opt-in per variant: ISO date ("1996-05-14") or empty. */
  readonly dateOfBirth: string;
  /** U6, opt-in per variant: object URL of a photo picked on this device, or empty. */
  readonly photoUrl: string;
}

export interface CvDraft {
  readonly cvId: string;
  /** The CV's own language (headings, dates and spell-check), not the UI language. */
  readonly language: string;
  readonly header: CvDraftHeader;
  readonly summary: string;
  /** In display order. Header is always first. */
  readonly sections: readonly CvDraftSection[];
  readonly paperSize: CvTheme["paperSize"];
  readonly density: CvTheme["density"];
  /** User-chosen CV accent (`#RRGGBB`), CV content rather than a UI colour. */
  readonly accentColor: string;
  readonly showPhoto: boolean;
  readonly showDateOfBirth: boolean;
}

/** Where a suggestion or a text edit lands: the summary, or one bullet of one item. */
export interface CvTextTarget {
  readonly sectionKey: string;
  /** Null for the summary. */
  readonly itemId: string | null;
  /** Null for the summary. */
  readonly bulletIndex: number | null;
}

function replaceSection(
  draft: CvDraft,
  key: string,
  update: (section: CvDraftSection) => CvDraftSection,
): CvDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) => (section.key === key ? update(section) : section)),
  };
}

function replaceItem(
  draft: CvDraft,
  sectionKey: string,
  itemId: string,
  update: (item: CvDraftItem) => CvDraftItem,
): CvDraft {
  return replaceSection(draft, sectionKey, (section) => ({
    ...section,
    items: section.items.map((item) => (item.id === itemId ? update(item) : item)),
  }));
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Moves a section one place up (`-1`) or down (`+1`). The header stays pinned first. Returns null
 * when the section can't move that way, so the caller can say so instead of doing nothing.
 */
export function moveSection(draft: CvDraft, key: string, delta: -1 | 1): CvDraft | null {
  const from = draft.sections.findIndex((section) => section.key === key);
  const to = from + delta;
  if (from <= 0 || to <= 0 || to >= draft.sections.length) return null;
  return { ...draft, sections: move(draft.sections, from, to) };
}

/** Moves an item one place within its section; null at either end. */
export function moveItem(draft: CvDraft, sectionKey: string, itemId: string, delta: -1 | 1): CvDraft | null {
  const section = draft.sections.find((candidate) => candidate.key === sectionKey);
  if (!section) return null;
  const from = section.items.findIndex((item) => item.id === itemId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= section.items.length) return null;
  return replaceSection(draft, sectionKey, (current) => ({ ...current, items: move(current.items, from, to) }));
}

export type CvItemField = "title" | "org" | "location" | "start" | "end" | "detail" | "url";

export function updateItemField(
  draft: CvDraft,
  sectionKey: string,
  itemId: string,
  field: CvItemField,
  value: string,
): CvDraft {
  return replaceItem(draft, sectionKey, itemId, (item) => ({
    ...item,
    [field]: field === "start" || field === "end" ? (value === "" ? null : value) : value,
  }));
}

export function updateBullet(
  draft: CvDraft,
  sectionKey: string,
  itemId: string,
  index: number,
  text: string,
): CvDraft {
  return replaceItem(draft, sectionKey, itemId, (item) => ({
    ...item,
    bullets: item.bullets.map((bullet, position) => (position === index ? text : bullet)),
  }));
}

/** Inserts an empty bullet after `index` (`-1`: at the start). */
export function insertBullet(draft: CvDraft, sectionKey: string, itemId: string, index: number): CvDraft {
  return replaceItem(draft, sectionKey, itemId, (item) => {
    const bullets = [...item.bullets];
    bullets.splice(index + 1, 0, "");
    return { ...item, bullets };
  });
}

export function removeBullet(draft: CvDraft, sectionKey: string, itemId: string, index: number): CvDraft {
  return replaceItem(draft, sectionKey, itemId, (item) => ({
    ...item,
    bullets: item.bullets.filter((_, position) => position !== index),
  }));
}

export function emptyItem(id: string): CvDraftItem {
  return {
    id,
    title: "",
    org: "",
    location: "",
    start: null,
    end: null,
    detail: "",
    bullets: [""],
    keywords: [],
    url: "",
  };
}

/** Adds `item` at `index` (default: the end) of a section. */
export function insertItem(draft: CvDraft, sectionKey: string, item: CvDraftItem, index?: number): CvDraft {
  return replaceSection(draft, sectionKey, (section) => {
    const items = [...section.items];
    items.splice(index ?? items.length, 0, item);
    return { ...section, items };
  });
}

/** Removes an item; returns what Undo needs to put it back, or null when it isn't there. */
export function removeItem(
  draft: CvDraft,
  sectionKey: string,
  itemId: string,
): { readonly draft: CvDraft; readonly item: CvDraftItem; readonly index: number } | null {
  const section = draft.sections.find((candidate) => candidate.key === sectionKey);
  const index = section?.items.findIndex((item) => item.id === itemId) ?? -1;
  const item = section?.items[index];
  if (!item) return null;
  return {
    draft: replaceSection(draft, sectionKey, (current) => ({
      ...current,
      items: current.items.filter((candidate) => candidate.id !== itemId),
    })),
    item,
    index,
  };
}

export function updateHeader(draft: CvDraft, patch: Partial<CvDraftHeader>): CvDraft {
  return { ...draft, header: { ...draft.header, ...patch } };
}

export function updateSummary(draft: CvDraft, summary: string): CvDraft {
  return { ...draft, summary };
}

/** The text at a target, or null when the target no longer exists. */
export function textAt(draft: CvDraft, target: CvTextTarget): string | null {
  if (target.itemId === null) return draft.summary;
  const item = draft.sections
    .find((section) => section.key === target.sectionKey)
    ?.items.find((candidate) => candidate.id === target.itemId);
  return item?.bullets[target.bulletIndex ?? -1] ?? null;
}

export function setTextAt(draft: CvDraft, target: CvTextTarget, text: string): CvDraft {
  if (target.itemId === null) return updateSummary(draft, text);
  return updateBullet(draft, target.sectionKey, target.itemId, target.bulletIndex ?? -1, text);
}

/**
 * Adds a keyword to the last skill group ("Add to Skills" from the keyword check). Returns null
 * when the CV has no skill group or already lists it.
 */
export function addSkillKeyword(
  draft: CvDraft,
  keyword: string,
): { readonly draft: CvDraft; readonly itemId: string } | null {
  const skills = draft.sections.find((section) => section.key === "skills");
  const group = skills?.items.at(-1);
  if (!group) return null;
  const lower = keyword.toLocaleLowerCase();
  if (group.keywords.some((existing) => existing.toLocaleLowerCase() === lower)) return null;
  return {
    draft: replaceItem(draft, "skills", group.id, (item) => ({ ...item, keywords: [...item.keywords, keyword] })),
    itemId: group.id,
  };
}

export function removeSkillKeyword(draft: CvDraft, itemId: string, keyword: string): CvDraft {
  return replaceItem(draft, "skills", itemId, (item) => ({
    ...item,
    keywords: item.keywords.filter((existing) => existing !== keyword),
  }));
}

/** Every piece of CV text, lower-cased, for deterministic keyword matching. */
export function draftText(draft: CvDraft): string {
  const parts: string[] = [draft.header.headline, draft.summary];
  for (const section of draft.sections) {
    if (!section.visible) continue;
    for (const item of section.items) {
      parts.push(item.title, item.org, item.detail, ...item.bullets, ...item.keywords);
    }
  }
  return parts.join("\n").toLocaleLowerCase();
}
