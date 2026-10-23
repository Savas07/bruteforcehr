/**
 * The way back from the editor's working copy (`CvDraft`) to stored CV content (JSON Resume +
 * `meta`), plus the content of new CVs (blank, from the profile, a copy or a variant).
 *
 * The draft is a lossy, editor-shaped view of the content (one "location" line, one "title" for
 * an education entry's degree + field, …). So a draft is always written back against the content
 * it was built from (`base`) and the draft built from that content (`baseDraft`): only fields the
 * user changed are replaced, everything the editor doesn't show (education `area`/`studyType`
 * split, `location.address`, project `roles`, JSON Resume `meta` fields, …) survives untouched.
 */
import {
  CV_STANDARD_SECTIONS,
  CvContentSchema,
  type CvContent,
  type CvCustomSection,
  type CvMeta,
  type CvStandardSection,
  type CvTheme,
  type Profile,
} from "@bfhr/core";
import type { CvDraft, CvDraftItem, CvDraftSection } from "./draft";
import { DEFAULT_ACCENT, DEFAULT_DENSITY, DEFAULT_FONT_PAIR, DEFAULT_TEMPLATE } from "@bfhr/cv-render";

type ListKey = Exclude<CvStandardSection, "basics">;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** US and Canada print on Letter, everyone else on A4. */
export function defaultPaperSize(locale: string): CvTheme["paperSize"] {
  const region = new Intl.Locale(locale).maximize().region;
  return region === "US" || region === "CA" ? "letter" : "a4";
}

export function defaultMeta(paperSize: CvTheme["paperSize"]): CvMeta {
  return {
    template: DEFAULT_TEMPLATE,
    theme: { accentColor: DEFAULT_ACCENT, fontPair: DEFAULT_FONT_PAIR, density: DEFAULT_DENSITY, paperSize },
    sectionOrder: ["basics", "work", "education", "skills", "languages"],
    customSections: [],
  };
}

/** A blank CV: the standard sections in order, every one empty (the editor shows its ghost rows). */
export function blankContent(paperSize: CvTheme["paperSize"]): CvContent {
  return { meta: defaultMeta(paperSize) };
}

const LANGUAGE_FLUENCY: Readonly<Record<Profile["languages"][number]["level"], string>> = {
  native: "Native",
  C2: "C2",
  C1: "C1",
  B2: "B2",
  B1: "B1",
  A2: "A2",
  A1: "A1",
};

/**
 * "Guided from profile": what the profile already knows (name, contact, headline, links, spoken
 * languages, skills), nothing invented. Work, education and the summary stay empty for the user.
 */
export function contentFromProfile(profile: Profile, language: string, paperSize: CvTheme["paperSize"]): CvContent {
  const languageNames = new Intl.DisplayNames([language], { type: "language" });
  const content: Mutable<CvContent> = {
    basics: {
      name: profile.fullName,
      email: profile.email,
      ...(profile.phone !== null && { phone: profile.phone }),
      ...(profile.headline !== null && { label: profile.headline }),
      ...(profile.locations[0]?.city && {
        location: {
          city: profile.locations[0].city,
          ...(profile.locations[0].countryCode !== null && { countryCode: profile.locations[0].countryCode }),
        },
      }),
      profiles: profile.links.map((link) => ({ network: link.label, url: link.url })),
    },
    meta: defaultMeta(paperSize),
  };
  if (profile.languages.length > 0) {
    content.languages = profile.languages.map((spoken) => ({
      language: languageNames.of(spoken.language) ?? spoken.language,
      fluency: LANGUAGE_FLUENCY[spoken.level],
    }));
  }
  if (profile.skills.length > 0) content.skills = [{ keywords: [...profile.skills] }];
  return CvContentSchema.parse(content);
}

/* ------------------------------------------------------------------------------------------------
 * Draft → content.
 * ---------------------------------------------------------------------------------------------- */

const LIST_KEYS = new Set<string>(CV_STANDARD_SECTIONS.filter((key) => key !== "basics"));

function isListKey(key: string): key is ListKey {
  return LIST_KEYS.has(key);
}

/** Index of an item in the base content (`work-3` → 3), or null for items added in the editor. */
function baseIndex(item: CvDraftItem, sectionKey: string): number | null {
  const match = new RegExp(`^${sectionKey.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}-(\\d+)$`, "u").exec(item.id);
  return match?.[1] === undefined ? null : Number(match[1]);
}

const opt = (value: string): string | undefined => (value.trim() === "" ? undefined : value);
const optDate = (value: string | null): string | undefined => (value === null || value === "" ? undefined : value);
const optList = (values: readonly string[]): string[] | undefined => {
  const kept = values.filter((value) => value.trim() !== "");
  return kept.length > 0 ? kept : undefined;
};

/** `value` when it changed from `before`, else `fallback` (the base content's own field). */
function changed<T>(now: T, before: T | undefined, encoded: unknown, fallback: unknown): unknown {
  if (before !== undefined && JSON.stringify(now) === JSON.stringify(before)) return fallback;
  return encoded;
}

/** Drops `undefined` values (zod output would keep the keys; Firestore rejects them). */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, inner]) => inner !== undefined)) as T;
}

/** One draft item → the JSON Resume entry of `key`, merged over the base entry when it had one. */
function entry(key: ListKey, item: CvDraftItem, before: CvDraftItem | undefined, base: Record<string, unknown> | undefined): object {
  const b = base ?? {};
  const pick = <F extends keyof CvDraftItem>(field: F, encoded: unknown, fallback: unknown) =>
    changed(item[field], before?.[field], encoded, before === undefined ? encoded : fallback);
  const title = opt(item.title);
  const org = opt(item.org);
  const detail = opt(item.detail);
  const url = opt(item.url);
  const start = optDate(item.start);
  const end = optDate(item.end);
  const bullets = optList(item.bullets);
  const keywords = optList(item.keywords);
  switch (key) {
    case "work": {
      const detailField = b.summary === undefined && b.description !== undefined ? "description" : "summary";
      return compact({
        ...b,
        position: pick("title", title, b.position),
        name: pick("org", org, b.name),
        location: pick("location", opt(item.location), b.location),
        startDate: pick("start", start, b.startDate),
        endDate: pick("end", end, b.endDate),
        [detailField]: pick("detail", detail, b[detailField]),
        highlights: pick("bullets", bullets, b.highlights),
        url: pick("url", url, b.url),
      });
    }
    case "projects":
      return compact({
        ...b,
        name: pick("title", title, b.name),
        entity: pick("org", org, b.entity),
        startDate: pick("start", start, b.startDate),
        endDate: pick("end", end, b.endDate),
        description: pick("detail", detail, b.description),
        highlights: pick("bullets", bullets, b.highlights),
        keywords: pick("keywords", keywords, b.keywords),
        url: pick("url", url, b.url),
      });
    case "education": {
      const titleChanged = before === undefined || item.title !== before.title;
      return compact({
        ...b,
        // The editor shows degree + field as one line; a changed line becomes the degree.
        studyType: titleChanged ? title : b.studyType,
        area: titleChanged ? undefined : b.area,
        institution: pick("org", org, b.institution),
        startDate: pick("start", start, b.startDate),
        endDate: pick("end", end, b.endDate),
        score: pick("detail", detail, b.score),
        courses: pick("bullets", bullets, b.courses),
        url: pick("url", url, b.url),
      });
    }
    case "skills":
      return compact({
        ...b,
        name: pick("title", title, b.name),
        level: pick("detail", detail, b.level),
        keywords: pick("keywords", keywords, b.keywords),
      });
    case "languages":
      return compact({ ...b, language: pick("title", title, b.language), fluency: pick("detail", detail, b.fluency) });
    case "certificates":
      return compact({
        ...b,
        name: pick("title", title, b.name),
        issuer: pick("org", org, b.issuer),
        date: pick("end", end, b.date),
        url: pick("url", url, b.url),
      });
    case "awards":
      return compact({
        ...b,
        title: pick("title", title, b.title),
        awarder: pick("org", org, b.awarder),
        date: pick("end", end, b.date),
        summary: pick("detail", detail, b.summary),
      });
    case "publications":
      return compact({
        ...b,
        name: pick("title", title, b.name),
        publisher: pick("org", org, b.publisher),
        releaseDate: pick("end", end, b.releaseDate),
        summary: pick("detail", detail, b.summary),
        url: pick("url", url, b.url),
      });
    case "volunteer":
      return compact({
        ...b,
        position: pick("title", title, b.position),
        organization: pick("org", org, b.organization),
        startDate: pick("start", start, b.startDate),
        endDate: pick("end", end, b.endDate),
        summary: pick("detail", detail, b.summary),
        highlights: pick("bullets", bullets, b.highlights),
        url: pick("url", url, b.url),
      });
    case "interests":
      return compact({ ...b, name: pick("title", title, b.name), keywords: pick("keywords", keywords, b.keywords) });
    case "references":
      return compact({ ...b, name: pick("title", title, b.name), reference: pick("detail", detail, b.reference) });
  }
}

function customItem(item: CvDraftItem): CvCustomSection["items"][number] {
  // A single date is a point in time: stored as `startDate` only (see model.ts sectionVMs).
  const start = optDate(item.start);
  const end = optDate(item.end);
  return compact({
    title: item.title.trim() === "" ? item.org || "—" : item.title,
    subtitle: opt(item.org),
    startDate: start ?? end,
    endDate: start === undefined ? undefined : end,
    url: opt(item.url),
    summary: opt(item.detail),
    highlights: optList(item.bullets),
  });
}

function isEmptyItem(item: CvDraftItem): boolean {
  return (
    item.title.trim() === "" &&
    item.org.trim() === "" &&
    item.detail.trim() === "" &&
    item.location.trim() === "" &&
    item.url.trim() === "" &&
    item.start === null &&
    item.end === null &&
    item.bullets.every((bullet) => bullet.trim() === "") &&
    item.keywords.length === 0
  );
}

/** "Istanbul, TR" → city "Istanbul", country "TR"; anything else → city only. */
function parseLocation(text: string): { city?: string | undefined; region?: string | undefined; countryCode?: string | undefined } {
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  const last = parts.at(-1) ?? "";
  if (parts.length >= 2 && /^[A-Z]{2}$/u.test(last)) {
    return compact({ city: parts[0], region: parts.length > 2 ? parts.slice(1, -1).join(", ") : undefined, countryCode: last });
  }
  return { city: parts.join(", ") };
}

/** The template and font pair: CV design that the editor's draft doesn't carry. */
interface DesignChoice {
  readonly template: string;
  readonly fontPair: string;
}

/**
 * The content to store for `draft`, built over `base` (the content `baseDraft` was made from).
 * `design` carries the template and font pair (not part of the editor's draft).
 */
export function draftToContent(draft: CvDraft, baseDraft: CvDraft, base: CvContent, design: DesignChoice): CvContent {
  const out: Record<string, unknown> = { ...base };
  const beforeHeader = baseDraft.header;
  const header = draft.header;
  const basics: Record<string, unknown> = { ...base.basics };
  const set = (key: string, now: string, before: string, encoded: unknown) => {
    if (now !== before) basics[key] = encoded;
  };
  set("name", header.name, beforeHeader.name, opt(header.name));
  set("label", header.headline, beforeHeader.headline, opt(header.headline));
  set("email", header.email, beforeHeader.email, opt(header.email));
  set("phone", header.phone, beforeHeader.phone, opt(header.phone));
  set("url", header.website, beforeHeader.website, opt(header.website));
  set("summary", draft.summary, baseDraft.summary, opt(draft.summary));
  if (header.location !== beforeHeader.location) {
    const { address, postalCode } = base.basics?.location ?? {};
    const location = compact({ address, postalCode, ...parseLocation(header.location) });
    basics.location = Object.keys(location).length > 0 ? location : undefined;
  }
  if (JSON.stringify(header.links) !== JSON.stringify(beforeHeader.links)) {
    const previous = base.basics?.profiles ?? [];
    basics.profiles = header.links
      .filter((link) => link.url.trim() !== "" || link.label.trim() !== "")
      .map((link) => {
        const same = previous.find((profile) => profile.url === link.url);
        return compact({ ...same, network: opt(link.label), url: opt(link.url) });
      });
  }
  if (draft.showPhoto !== baseDraft.showPhoto || header.photoUrl !== beforeHeader.photoUrl) {
    basics.image = draft.showPhoto ? opt(header.photoUrl) : undefined;
  }
  const keptBasics = compact(basics);
  out.basics = Object.keys(keptBasics).length > 0 ? keptBasics : undefined;

  const customById = new Map(base.meta.customSections.map((section) => [section.id, section]));
  const customSections: CvCustomSection[] = [];
  const order: string[] = [];
  const headerVisible = draft.sections.find((section) => section.key === "header")?.visible ?? true;
  if (headerVisible) order.push("basics");

  for (const section of draft.sections) {
    if (section.kind !== "list") continue;
    const beforeSection = baseDraft.sections.find((candidate) => candidate.key === section.key);
    const items = section.items.filter((item) => !isEmptyItem(item));
    if (section.key.startsWith("custom:")) {
      const id = section.key.slice("custom:".length);
      const title = section.customTitle ?? customById.get(id)?.title ?? id;
      customSections.push({ id, title, items: items.map(customItem) });
    } else if (isListKey(section.key)) {
      out[section.key] = listEntries(section.key, section, items, beforeSection, base);
    }
    if (section.visible) order.push(section.key);
  }
  for (const key of LIST_KEYS) {
    if (Array.isArray(out[key]) && (out[key] as unknown[]).length === 0) out[key] = undefined;
  }

  const meta: CvMeta = {
    ...base.meta,
    template: design.template,
    theme: {
      accentColor: draft.accentColor,
      fontPair: design.fontPair,
      density: draft.density,
      paperSize: draft.paperSize,
    },
    sectionOrder: order as CvMeta["sectionOrder"],
    customSections,
  };
  out.meta = meta;
  return CvContentSchema.parse(compact(out));
}

function listEntries(
  key: ListKey,
  section: CvDraftSection,
  items: readonly CvDraftItem[],
  beforeSection: CvDraftSection | undefined,
  base: CvContent,
): object[] {
  const baseEntries = (base[key] ?? []) as readonly Record<string, unknown>[];
  return items.map((item) => {
    const index = baseIndex(item, section.key);
    const before = index === null ? undefined : beforeSection?.items.find((candidate) => candidate.id === item.id);
    const baseEntry = index === null ? undefined : baseEntries[index];
    return entry(key, item, before, baseEntry);
  });
}

/* ------------------------------------------------------------------------------------------------
 * Comparing contents (history and conflicts).
 * ---------------------------------------------------------------------------------------------- */

/** One comparable line of a CV: its section key and text. */
export interface ContentLine {
  readonly section: string;
  readonly text: string;
}

/** The CV as plain lines, in render order, for line diffs ("Compare"). */
export function contentLines(content: CvContent): ContentLine[] {
  const lines: ContentLine[] = [];
  const push = (section: string, ...texts: (string | undefined)[]) => {
    for (const text of texts) if (text !== undefined && text.trim() !== "") lines.push({ section, text: text.trim() });
  };
  const b = content.basics;
  push("basics", b?.name, b?.label, b?.email, b?.phone, b?.url);
  push("basics", [b?.location?.city, b?.location?.region, b?.location?.countryCode].filter(Boolean).join(", "));
  for (const profile of b?.profiles ?? []) push("basics", [profile.network, profile.url].filter(Boolean).join(": "));
  push("summary", b?.summary);
  for (const key of CV_STANDARD_SECTIONS) {
    if (key === "basics") continue;
    for (const item of (content[key] ?? []) as readonly Record<string, unknown>[]) {
      // Fields in alphabetical order, not stored order (writes may reorder keys).
      const entries = Object.entries(item).sort(([a], [b]) => a.localeCompare(b));
      const scalars = entries.filter(([, value]) => typeof value === "string").map(([, value]) => value as string);
      push(key, scalars.join(" · "));
      for (const [, value] of entries) {
        if (Array.isArray(value)) push(key, ...(value as string[]));
      }
    }
  }
  for (const section of content.meta.customSections) {
    for (const item of section.items) {
      push(`custom:${section.id}`, [item.title, item.subtitle, item.startDate, item.endDate].filter(Boolean).join(" · "));
      push(`custom:${section.id}`, item.summary, ...(item.highlights ?? []));
    }
  }
  return lines;
}

export type LineDiff =
  | { readonly kind: "same"; readonly line: ContentLine }
  | { readonly kind: "added"; readonly line: ContentLine }
  | { readonly kind: "removed"; readonly line: ContentLine };

/** Line diff (LCS) from `before` to `after`. CVs are a few hundred lines at most. */
export function diffLines(before: readonly ContentLine[], after: readonly ContentLine[]): LineDiff[] {
  const key = (line: ContentLine) => `${line.section}\u0000${line.text}`;
  const a = before.map(key);
  const b = after.map(key);
  // lcs[i * width + j]: length of the longest common subsequence of a[i..] and b[j..].
  const width = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * width);
  const at = (i: number, j: number) => lcs[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: LineDiff[] = [];
  let i = 0;
  let j = 0;
  for (;;) {
    const removed = before[i];
    const added = after[j];
    if (removed && added && a[i] === b[j]) {
      out.push({ kind: "same", line: added });
      i += 1;
      j += 1;
    } else if (removed && (!added || at(i + 1, j) >= at(i, j + 1))) {
      out.push({ kind: "removed", line: removed });
      i += 1;
    } else if (added) {
      out.push({ kind: "added", line: added });
      j += 1;
    } else {
      return out;
    }
  }
}

/** Same stored content, whatever the key order (writes rebuild objects). */
export function sameContent(a: CvContent, b: CvContent): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, inner]) => inner !== undefined)
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([key, inner]) => [key, canonical(inner)]),
      );
    }
    return value;
  };
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Sections whose lines differ between two contents, in render order (for `diffSummary`). */
export function changedSections(before: CvContent, after: CvContent): string[] {
  const sections: string[] = [];
  for (const change of diffLines(contentLines(before), contentLines(after))) {
    if (change.kind !== "same" && !sections.includes(change.line.section)) sections.push(change.line.section);
  }
  return sections;
}
