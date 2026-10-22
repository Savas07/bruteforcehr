/**
 * The live preview's document: the draft laid out as the ATS-safe single-column template reads
 * it, in the CV's own language (headings, month names, "Present"), independent of the UI
 * language. A flat block list so the view can paginate on block boundaries. `@bfhr/cv-render`
 * (M2) takes over the HTML; this stays the on-screen preview's contract.
 */
import type { CvDraft, CvDraftItem } from "./draft";

export type CvPreviewBlock =
  | {
      readonly kind: "header";
      readonly id: "header";
      readonly name: string;
      readonly headline: string;
      /** Location, email, phone, website, links: one line, separated by the template. */
      readonly contact: readonly string[];
      /** "Date of birth: 14 May 1996" when the variant opted in and the date is set. */
      readonly dateOfBirth: string | null;
      readonly photoUrl: string | null;
    }
  | { readonly kind: "heading"; readonly id: string; readonly sectionKey: string; readonly text: string }
  | { readonly kind: "text"; readonly id: string; readonly sectionKey: string; readonly text: string }
  | {
      readonly kind: "entry";
      readonly id: string;
      readonly sectionKey: string;
      readonly title: string;
      readonly org: string;
      readonly dates: string | null;
      readonly location: string;
      readonly detail: string;
      readonly bullets: readonly string[];
    }
  | {
      readonly kind: "line";
      readonly id: string;
      readonly sectionKey: string;
      /** "Frontend", "Turkish". */
      readonly label: string;
      /** "React, TypeScript, Next.js", "Native". */
      readonly text: string;
    };

export interface CvPreviewDocument {
  /** BCP 47 tag for the page's `lang` (screen readers, hyphenation). */
  readonly lang: string;
  readonly blocks: readonly CvPreviewBlock[];
}

type HeadingKey =
  | "summary"
  | "work"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "certificates"
  | "awards"
  | "publications"
  | "volunteer"
  | "interests"
  | "references"
  | "present"
  | "dateOfBirth";

/**
 * Standard CV headings per CV language: CV content, not UI copy (research "Layout rules": a
 * German variant edited in an English UI still reads "Berufserfahrung").
 */
const CV_WORDS: Readonly<Record<"en" | "tr" | "de", Readonly<Record<HeadingKey, string>>>> = {
  en: {
    summary: "Summary",
    work: "Experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    projects: "Projects",
    certificates: "Certificates",
    awards: "Awards",
    publications: "Publications",
    volunteer: "Volunteering",
    interests: "Interests",
    references: "References",
    present: "Present",
    dateOfBirth: "Date of birth",
  },
  tr: {
    summary: "Özet",
    work: "Deneyim",
    education: "Eğitim",
    skills: "Yetenekler",
    languages: "Diller",
    projects: "Projeler",
    certificates: "Sertifikalar",
    awards: "Ödüller",
    publications: "Yayınlar",
    volunteer: "Gönüllülük",
    interests: "İlgi alanları",
    references: "Referanslar",
    present: "Halen",
    dateOfBirth: "Doğum tarihi",
  },
  de: {
    summary: "Profil",
    work: "Berufserfahrung",
    education: "Ausbildung",
    skills: "Kenntnisse",
    languages: "Sprachen",
    projects: "Projekte",
    certificates: "Zertifikate",
    awards: "Auszeichnungen",
    publications: "Publikationen",
    volunteer: "Ehrenamt",
    interests: "Interessen",
    references: "Referenzen",
    present: "heute",
    dateOfBirth: "Geburtsdatum",
  },
};

/** Sections the template prints as one "Label: text" line per item. */
const LINE_SECTIONS: Readonly<Record<string, true>> = { skills: true, languages: true, interests: true };

function words(language: string): Readonly<Record<HeadingKey, string>> {
  const base = language.split("-")[0];
  return base === "tr" || base === "de" ? CV_WORDS[base] : CV_WORDS.en;
}

function isHeadingKey(key: string): key is HeadingKey {
  return key in CV_WORDS.en;
}

/** JSON Resume date → "Mar 2022" / "März 2022" / "Mar 2022" in the CV's language. */
function cvDate(value: string, language: string): string {
  const [year, month] = value.split("-").map(Number);
  if (year === undefined || Number.isNaN(year)) return value;
  if (month === undefined || Number.isNaN(month)) return String(year);
  return new Intl.DateTimeFormat(language, { timeZone: "UTC", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** "Mar 2022 – Present", "Feb 2020 – Feb 2022", "Apr 2025" in the CV's language. */
export function cvDateRange(start: string | null, end: string | null, language: string): string | null {
  if (start === null) return end === null ? null : cvDate(end, language);
  return `${cvDate(start, language)} – ${end === null ? words(language).present : cvDate(end, language)}`;
}

function entryBlock(sectionKey: string, item: CvDraftItem, language: string): CvPreviewBlock {
  if (LINE_SECTIONS[sectionKey]) {
    const text = item.keywords.length > 0 ? item.keywords.join(", ") : item.detail;
    return { kind: "line", id: item.id, sectionKey, label: item.title, text };
  }
  return {
    kind: "entry",
    id: item.id,
    sectionKey,
    title: item.title,
    org: item.org,
    dates: cvDateRange(item.start, item.end, language),
    location: item.location,
    detail: item.detail,
    bullets: item.bullets.filter((bullet) => bullet.trim() !== ""),
  };
}

/** Lays the draft out for the preview. Hidden and empty sections are left out, as on the PDF. */
export function buildPreviewDocument(draft: CvDraft): CvPreviewDocument {
  const dictionary = words(draft.language);
  const { header } = draft;
  const blocks: CvPreviewBlock[] = [];
  for (const section of draft.sections) {
    if (!section.visible) continue;
    if (section.kind === "header") {
      const dateOfBirth =
        draft.showDateOfBirth && header.dateOfBirth
          ? `${dictionary.dateOfBirth}: ${new Intl.DateTimeFormat(draft.language, {
              timeZone: "UTC",
              dateStyle: "long",
            }).format(new Date(`${header.dateOfBirth}T00:00:00Z`))}`
          : null;
      blocks.push({
        kind: "header",
        id: "header",
        name: header.name,
        headline: header.headline,
        contact: [
          header.location,
          header.email,
          header.phone,
          header.website,
          ...header.links.map((link) => link.url.replace(/^https?:\/\/(www\.)?/u, "")),
        ].filter((part) => part.trim() !== ""),
        dateOfBirth,
        photoUrl: draft.showPhoto && header.photoUrl ? header.photoUrl : null,
      });
      continue;
    }
    const heading = section.customTitle ?? (isHeadingKey(section.key) ? dictionary[section.key] : section.key);
    if (section.kind === "text") {
      if (draft.summary.trim() === "") continue;
      blocks.push({ kind: "heading", id: `heading-${section.key}`, sectionKey: section.key, text: heading });
      blocks.push({ kind: "text", id: section.key, sectionKey: section.key, text: draft.summary });
      continue;
    }
    const items = section.items.filter((item) => item.title.trim() !== "" || item.org.trim() !== "");
    if (items.length === 0) continue;
    blocks.push({ kind: "heading", id: `heading-${section.key}`, sectionKey: section.key, text: heading });
    for (const item of items) blocks.push(entryBlock(section.key, item, draft.language));
  }
  return { lang: draft.language, blocks };
}

/**
 * Packs measured block heights into pages on block boundaries (a heading never ends a page).
 * Returns block indexes per page; a block taller than a page gets a page of its own.
 */
export function paginate(heights: readonly number[], kinds: readonly CvPreviewBlock["kind"][], pageHeight: number): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  heights.forEach((height, index) => {
    const current = pages.at(-1) ?? [];
    // Keep a heading with the block after it.
    const needed = kinds[index] === "heading" ? height + (heights[index + 1] ?? 0) : height;
    if (current.length > 0 && used + needed > pageHeight) {
      pages.push([index]);
      used = height;
    } else {
      current.push(index);
      used += height;
    }
  });
  return pages;
}
