/**
 * Lays JSON Resume + meta out as a format-neutral document (header, then sections in
 * `meta.sectionOrder`). The HTML templates and the DOCX builder both print this model, so the two
 * formats always contain the same words in the same order.
 */
import {
  CV_WORDS,
  type CvLanguage,
  cvLanguage,
  formatDay,
  formatRange,
  formatMonth,
  type HeadingKey,
  langTag,
  SECTION_HEADINGS,
} from "./i18n";
import type { CvRenderInput, OutlineSection, PlaceholderHit } from "./types";

export interface TextField {
  readonly text: string;
  /** JSON pointer into the CV content (`/work/0/position`) for click-to-locate. */
  readonly path: string;
}

export interface ContactItem extends TextField {
  /** Sanitised link target (https:, mailto:, tel:) or absent for plain text. */
  readonly href?: string;
}

export interface DocHeader {
  readonly name?: TextField;
  readonly label?: TextField;
  readonly contact: readonly ContactItem[];
  /** "Date of birth: 14 May 1996" when the variant opted in. */
  readonly dateOfBirth?: TextField;
  /** `data:image/jpeg|png;base64,…` when the variant opted in and bytes were supplied. */
  readonly photo?: string;
}

export interface DocEntry {
  readonly path: string;
  readonly title?: TextField;
  readonly subtitle?: TextField;
  readonly location?: TextField;
  readonly dates?: string;
  readonly link?: ContactItem;
  readonly summary?: TextField;
  readonly bullets: readonly TextField[];
  /** Secondary lines: "Grade: 3.6", "Courses: …", "Keywords: …". */
  readonly notes: readonly TextField[];
}

export interface DocLine {
  readonly path: string;
  readonly label?: TextField;
  readonly text?: TextField;
}

interface SectionBase {
  readonly key: string;
  readonly heading: string;
  readonly path: string;
}

export type DocSection =
  | (SectionBase & { readonly kind: "text"; readonly text: TextField })
  | (SectionBase & { readonly kind: "entries"; readonly entries: readonly DocEntry[] })
  | (SectionBase & { readonly kind: "lines"; readonly lines: readonly DocLine[] });

export interface CvDocument {
  readonly language: CvLanguage;
  readonly lang: string;
  readonly title: string;
  readonly header?: DocHeader;
  readonly sections: readonly DocSection[];
  readonly placeholders: readonly PlaceholderHit[];
  readonly outline: readonly OutlineSection[];
}

/** `[X%]`, `[number]`, `[Firma]`: square-bracketed gaps the AI leaves instead of inventing facts. */
export const PLACEHOLDER_PATTERN = /\[[^[\]\r\n]{1,40}\]/gu;

export interface TextRunPart {
  readonly text: string;
  readonly placeholder: boolean;
}

/** Splits text into plain runs and placeholder runs, in order. */
export function splitPlaceholders(text: string): TextRunPart[] {
  const parts: TextRunPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start), placeholder: false });
    parts.push({ text: match[0], placeholder: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false });
  return parts;
}

function clean(value: string | undefined): string | undefined {
  const text = value?.replace(/\r\n?/gu, "\n").trim();
  return text ? text : undefined;
}

function field(value: string | undefined, path: string): TextField | undefined {
  const text = clean(value);
  return text === undefined ? undefined : { text, path };
}

function joined(
  values: readonly (string | undefined)[],
  separator: string,
  path: string,
): TextField | undefined {
  const text = values
    .map(clean)
    .filter((value) => value !== undefined)
    .join(separator);
  return text ? { text, path } : undefined;
}

/** Only links that can't run code or leave the document unexpectedly: https/http, mailto, tel. */
export function safeHref(value: string): string | undefined {
  const url = value.trim();
  if (/^(?:https?:\/\/|mailto:|tel:)[^\s<>"]+$/iu.test(url)) return url;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#][^\s<>"]*)?$/iu.test(url)) return `https://${url}`;
  return undefined;
}

/** "https://www.github.com/deniz/" → "github.com/deniz". */
export function displayUrl(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//iu, "")
    .replace(/^www\./iu, "")
    .replace(/\/$/u, "");
}

function link(value: string | undefined, path: string): ContactItem | undefined {
  const url = clean(value);
  if (url === undefined) return undefined;
  const href = safeHref(url);
  return href === undefined ? { text: url, path } : { text: displayUrl(url), path, href };
}

function countryName(code: string, locale: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(upper) || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return code.trim();
  }
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(upper) ?? upper;
  } catch {
    return upper;
  }
}

const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/u;

function header(input: CvRenderInput, language: CvLanguage, lang: string): DocHeader {
  const basics = input.resume.basics ?? {};
  const contact: ContactItem[] = [];
  const location = basics.location;
  if (location) {
    const country = location.countryCode ? countryName(location.countryCode, lang) : undefined;
    const place = joined([location.city, location.region, country], ", ", "/basics/location");
    if (place) contact.push(place);
  }
  const email = clean(basics.email);
  if (email) contact.push({ text: email, path: "/basics/email", href: `mailto:${email}` });
  const phone = clean(basics.phone);
  if (phone)
    contact.push({ text: phone, path: "/basics/phone", href: `tel:${phone.replace(/[^\d+]/gu, "")}` });
  const website = link(basics.url, "/basics/url");
  if (website) contact.push(website);
  (basics.profiles ?? []).forEach((profile, index) => {
    const path = `/basics/profiles/${index}`;
    const url = link(profile.url, `${path}/url`);
    if (url) contact.push(url);
    else {
      const handle = joined([profile.network, profile.username], ": ", path);
      if (handle) contact.push(handle);
    }
  });

  const personal = input.meta.personal;
  const dateOfBirth =
    personal?.showDateOfBirth && personal.dateOfBirth
      ? {
          text: `${CV_WORDS[language].dateOfBirth}: ${formatDay(personal.dateOfBirth, language)}`,
          path: "/meta/personal/dateOfBirth",
        }
      : undefined;
  const photo =
    personal?.showPhoto && input.photo && PHOTO_DATA_URL.test(input.photo.dataUrl)
      ? input.photo.dataUrl
      : undefined;

  const name = field(basics.name, "/basics/name");
  const label = field(basics.label, "/basics/label");
  return {
    ...(name ? { name } : {}),
    ...(label ? { label } : {}),
    contact,
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(photo ? { photo } : {}),
  };
}

/** Entry fields before empty values are dropped (`field()` returns undefined for blank text). */
interface EntryDraft {
  readonly path: string;
  readonly title?: TextField | undefined;
  readonly subtitle?: TextField | undefined;
  readonly location?: TextField | undefined;
  readonly dates?: string | undefined;
  readonly link?: ContactItem | undefined;
  readonly summary?: TextField | undefined;
  readonly bullets?: readonly TextField[];
  readonly notes?: readonly (TextField | undefined)[];
}

function entry(draft: EntryDraft): DocEntry | undefined {
  const bullets = draft.bullets ?? [];
  const notes = (draft.notes ?? []).filter((note) => note !== undefined);
  if (!draft.title && !draft.subtitle && !draft.summary && bullets.length === 0 && notes.length === 0) {
    return undefined;
  }
  return {
    path: draft.path,
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.subtitle ? { subtitle: draft.subtitle } : {}),
    ...(draft.location ? { location: draft.location } : {}),
    ...(draft.dates ? { dates: draft.dates } : {}),
    ...(draft.link ? { link: draft.link } : {}),
    ...(draft.summary ? { summary: draft.summary } : {}),
    bullets,
    notes,
  };
}

interface DocLineDraft {
  readonly path: string;
  readonly label?: TextField | undefined;
  readonly text?: TextField | undefined;
}

function bullets(values: readonly string[] | undefined, path: string): TextField[] {
  return (values ?? []).flatMap((value, index) => {
    const item = field(value, `${path}/${index}`);
    return item ? [item] : [];
  });
}

function labelled(label: string, values: readonly string[] | undefined, path: string): TextField | undefined {
  const list = (values ?? []).map(clean).filter((value) => value !== undefined);
  return list.length > 0 ? { text: `${label}: ${list.join(", ")}`, path } : undefined;
}

function entries<T>(
  list: readonly T[] | undefined,
  base: string,
  map: (item: T, path: string) => EntryDraft,
) {
  return (list ?? []).flatMap((item, index) => {
    const built = entry(map(item, `${base}/${index}`));
    return built ? [built] : [];
  });
}

function standardSection(
  key: HeadingKey,
  input: CvRenderInput,
  language: CvLanguage,
): DocSection | undefined {
  const { resume } = input;
  const heading = SECTION_HEADINGS[language][key];
  const words = CV_WORDS[language];
  const path = `/${key}`;
  const range = (start?: string, end?: string) => formatRange(start, end, language, true);
  const date = (value?: string) => (value ? formatMonth(value, language) : undefined);

  const entriesSection = (list: DocEntry[]): DocSection | undefined =>
    list.length > 0 ? { key, heading, path, kind: "entries", entries: list } : undefined;
  const linesSection = (list: readonly DocLineDraft[]): DocSection | undefined => {
    const lines: DocLine[] = list.flatMap((line) =>
      line.label || line.text
        ? [
            {
              path: line.path,
              ...(line.label ? { label: line.label } : {}),
              ...(line.text ? { text: line.text } : {}),
            },
          ]
        : [],
    );
    return lines.length > 0 ? { key, heading, path, kind: "lines", lines } : undefined;
  };
  const keywordLine = (values: readonly string[] | undefined, at: string): TextField | undefined => {
    const list = (values ?? []).map(clean).filter((value) => value !== undefined);
    return list.length > 0 ? { text: list.join(", "), path: at } : undefined;
  };

  switch (key) {
    case "summary": {
      const text = field(resume.basics?.summary, "/basics/summary");
      return text ? { key, heading, path: "/basics/summary", kind: "text", text } : undefined;
    }
    case "work":
      return entriesSection(
        entries(resume.work, path, (job, at) => ({
          path: at,
          title: field(job.position, `${at}/position`),
          subtitle: field(job.name, `${at}/name`),
          location: field(job.location, `${at}/location`),
          dates: range(job.startDate, job.endDate),
          summary: field(job.summary ?? job.description, job.summary ? `${at}/summary` : `${at}/description`),
          bullets: bullets(job.highlights, `${at}/highlights`),
        })),
      );
    case "volunteer":
      return entriesSection(
        entries(resume.volunteer, path, (item, at) => ({
          path: at,
          title: field(item.position, `${at}/position`),
          subtitle: field(item.organization, `${at}/organization`),
          dates: range(item.startDate, item.endDate),
          summary: field(item.summary, `${at}/summary`),
          bullets: bullets(item.highlights, `${at}/highlights`),
        })),
      );
    case "projects":
      return entriesSection(
        entries(resume.projects, path, (project, at) => ({
          path: at,
          title: field(project.name, `${at}/name`),
          subtitle: joined([project.entity, ...(project.roles ?? [])], " · ", at),
          dates: range(project.startDate, project.endDate),
          link: link(project.url, `${at}/url`),
          summary: field(project.description, `${at}/description`),
          bullets: bullets(project.highlights, `${at}/highlights`),
          notes: [labelled(words.keywords, project.keywords, `${at}/keywords`)],
        })),
      );
    case "education":
      return entriesSection(
        entries(resume.education, path, (school, at) => ({
          path: at,
          title: joined([school.studyType, school.area], ", ", at),
          subtitle: field(school.institution, `${at}/institution`),
          dates: range(school.startDate, school.endDate),
          notes: [
            field(clean(school.score) && `${words.grade}: ${clean(school.score)}`, `${at}/score`),
            labelled(words.courses, school.courses, `${at}/courses`),
          ],
        })),
      );
    case "certificates":
      return entriesSection(
        entries(resume.certificates, path, (item, at) => ({
          path: at,
          title: field(item.name, `${at}/name`),
          subtitle: field(item.issuer, `${at}/issuer`),
          dates: date(item.date),
          link: link(item.url, `${at}/url`),
        })),
      );
    case "awards":
      return entriesSection(
        entries(resume.awards, path, (item, at) => ({
          path: at,
          title: field(item.title, `${at}/title`),
          subtitle: field(item.awarder, `${at}/awarder`),
          dates: date(item.date),
          summary: field(item.summary, `${at}/summary`),
        })),
      );
    case "publications":
      return entriesSection(
        entries(resume.publications, path, (item, at) => ({
          path: at,
          title: field(item.name, `${at}/name`),
          subtitle: field(item.publisher, `${at}/publisher`),
          dates: date(item.releaseDate),
          link: link(item.url, `${at}/url`),
          summary: field(item.summary, `${at}/summary`),
        })),
      );
    case "references":
      return entriesSection(
        entries(resume.references, path, (item, at) => ({
          path: at,
          title: field(item.name, `${at}/name`),
          summary: field(item.reference, `${at}/reference`),
        })),
      );
    case "skills":
      return linesSection(
        (resume.skills ?? []).map((skill, index) => {
          const at = `${path}/${index}`;
          return {
            path: at,
            label: field(skill.name, `${at}/name`),
            text: keywordLine(skill.keywords, `${at}/keywords`) ?? field(skill.level, `${at}/level`),
          };
        }),
      );
    case "languages":
      return linesSection(
        (resume.languages ?? []).map((item, index) => {
          const at = `${path}/${index}`;
          return {
            path: at,
            label: field(item.language, `${at}/language`),
            text: field(item.fluency, `${at}/fluency`),
          };
        }),
      );
    case "interests":
      return linesSection(
        (resume.interests ?? []).map((item, index) => {
          const at = `${path}/${index}`;
          return {
            path: at,
            label: field(item.name, `${at}/name`),
            text: keywordLine(item.keywords, `${at}/keywords`),
          };
        }),
      );
  }
}

function customSection(input: CvRenderInput, id: string, language: CvLanguage): DocSection | undefined {
  const index = input.meta.customSections.findIndex((section) => section.id === id);
  const section = input.meta.customSections[index];
  if (!section) return undefined;
  const path = `/meta/customSections/${index}`;
  // A start date alone is a one-off (a talk on a day), not something ongoing.
  const list = entries(section.items, `${path}/items`, (item, at) => ({
    path: at,
    title: field(item.title, `${at}/title`),
    subtitle: field(item.subtitle, `${at}/subtitle`),
    dates: formatRange(item.startDate, item.endDate, language, false),
    link: link(item.url, `${at}/url`),
    summary: field(item.summary, `${at}/summary`),
    bullets: bullets(item.highlights, `${at}/highlights`),
  }));
  const heading = clean(section.title) ?? id;
  return list.length > 0 ? { key: `custom:${id}`, heading, path, kind: "entries", entries: list } : undefined;
}

const LIST_SECTIONS: ReadonlySet<string> = new Set<HeadingKey>([
  "work",
  "projects",
  "education",
  "skills",
  "languages",
  "certificates",
  "awards",
  "publications",
  "volunteer",
  "interests",
  "references",
]);

function collectPlaceholders(document: Omit<CvDocument, "placeholders" | "outline">): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  const visit = (value: TextField | undefined) => {
    if (!value) return;
    for (const match of value.text.matchAll(PLACEHOLDER_PATTERN))
      hits.push({ path: value.path, text: match[0] });
  };
  const { header: head } = document;
  if (head) {
    visit(head.name);
    visit(head.label);
    head.contact.forEach(visit);
  }
  for (const section of document.sections) {
    if (section.kind === "text") visit(section.text);
    else if (section.kind === "lines") {
      for (const line of section.lines) {
        visit(line.label);
        visit(line.text);
      }
    } else {
      for (const item of section.entries) {
        [item.title, item.subtitle, item.location, item.summary, ...item.bullets, ...item.notes].forEach(
          visit,
        );
      }
    }
  }
  return hits;
}

/** Builds the document model. Sections not in `meta.sectionOrder`, and empty ones, are left out. */
export function buildDocument(input: CvRenderInput): CvDocument {
  const language = cvLanguage(input.locale);
  const lang = langTag(input.locale, language);
  const sections: DocSection[] = [];
  let head: DocHeader | undefined;
  const seen = new Set<string>();
  for (const key of input.meta.sectionOrder) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (key === "basics") {
      head = header(input, language, lang);
      const summary = standardSection("summary", input, language);
      if (summary) sections.push(summary);
    } else if (key.startsWith("custom:")) {
      const custom = customSection(input, key.slice("custom:".length), language);
      if (custom) sections.push(custom);
    } else if (LIST_SECTIONS.has(key)) {
      const section = standardSection(key as HeadingKey, input, language);
      if (section) sections.push(section);
    }
  }
  const name = clean(input.resume.basics?.name);
  const title = name ? `${name} – ${CV_WORDS[language].document}` : CV_WORDS[language].document;
  const draft = { language, lang, title, ...(head ? { header: head } : {}), sections };
  const outline: OutlineSection[] = sections.map((section) => ({
    key: section.key,
    heading: section.heading,
    entries:
      section.kind === "text"
        ? []
        : section.kind === "lines"
          ? section.lines.map((line) => (line.label ?? line.text)?.text ?? "")
          : section.entries.map((item) => (item.title ?? item.subtitle ?? item.summary)?.text ?? ""),
  }));
  return { ...draft, placeholders: collectPlaceholders(draft), outline };
}
