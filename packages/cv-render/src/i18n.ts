/**
 * CV words in the CV's own language (not the UI language): section headings, "Present", labels and
 * dates. Our own tables instead of `Intl.DateTimeFormat` so every engine (Chromium, WebKit,
 * JavaScriptCore, Node) prints byte-identical text whatever its ICU version.
 */

export const CV_LANGUAGES = ["en", "tr", "de"] as const;
export type CvLanguage = (typeof CV_LANGUAGES)[number];

/** Section keys with a standard heading: JSON Resume sections plus `summary` (`basics.summary`). */
export type HeadingKey =
  | "summary"
  | "work"
  | "projects"
  | "education"
  | "skills"
  | "languages"
  | "certificates"
  | "awards"
  | "publications"
  | "volunteer"
  | "interests"
  | "references";

/** Standard section headings, the strings the ATS readback check looks for. */
export const SECTION_HEADINGS: Readonly<Record<CvLanguage, Readonly<Record<HeadingKey, string>>>> = {
  en: {
    summary: "Summary",
    work: "Experience",
    projects: "Projects",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    certificates: "Certifications",
    awards: "Awards",
    publications: "Publications",
    volunteer: "Volunteering",
    interests: "Interests",
    references: "References",
  },
  tr: {
    summary: "Özet",
    work: "Deneyim",
    projects: "Projeler",
    education: "Eğitim",
    skills: "Yetenekler",
    languages: "Diller",
    certificates: "Sertifikalar",
    awards: "Ödüller",
    publications: "Yayınlar",
    volunteer: "Gönüllü Çalışmalar",
    interests: "İlgi Alanları",
    references: "Referanslar",
  },
  de: {
    summary: "Profil",
    work: "Berufserfahrung",
    projects: "Projekte",
    education: "Ausbildung",
    skills: "Kenntnisse",
    languages: "Sprachen",
    certificates: "Zertifikate",
    awards: "Auszeichnungen",
    publications: "Publikationen",
    volunteer: "Ehrenamt",
    interests: "Interessen",
    references: "Referenzen",
  },
};

/** Open end date of an ongoing entry ("Mar 2022 – Present"). */
export const PRESENT_WORD: Readonly<Record<CvLanguage, string>> = {
  en: "Present",
  tr: "Günümüz",
  de: "heute",
};

interface CvWords {
  /** Document title suffix: "Deniz Aksoy – CV". */
  readonly document: string;
  /** Cover letter title suffix: "Deniz Aksoy – Cover letter". */
  readonly coverLetter: string;
  readonly dateOfBirth: string;
  readonly grade: string;
  readonly courses: string;
  readonly keywords: string;
}

export const CV_WORDS: Readonly<Record<CvLanguage, CvWords>> = {
  en: {
    document: "CV",
    coverLetter: "Cover letter",
    dateOfBirth: "Date of birth",
    grade: "Grade",
    courses: "Courses",
    keywords: "Keywords",
  },
  tr: {
    document: "Özgeçmiş",
    coverLetter: "Ön yazı",
    dateOfBirth: "Doğum tarihi",
    grade: "Not ortalaması",
    courses: "Dersler",
    keywords: "Anahtar kelimeler",
  },
  de: {
    document: "Lebenslauf",
    coverLetter: "Anschreiben",
    dateOfBirth: "Geburtsdatum",
    grade: "Note",
    courses: "Kurse",
    keywords: "Schlagworte",
  },
};

/** CLDR abbreviated (format) month names, as `Intl.DateTimeFormat(lang, { month: "short" })`. */
const SHORT_MONTHS: Readonly<Record<CvLanguage, readonly string[]>> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
};

const LONG_MONTHS: Readonly<Record<CvLanguage, readonly string[]>> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  tr: [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
  ],
  de: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
};

/** "de-DE" → "de"; anything other than en/tr/de prints English words. */
export function cvLanguage(locale: string): CvLanguage {
  const base = locale.trim().toLowerCase().split(/[-_]/u)[0];
  return base === "tr" || base === "de" ? base : "en";
}

/** A BCP 47 tag safe for `lang=""`; falls back to the CV language. */
export function langTag(locale: string, language: CvLanguage): string {
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale.trim()) ? locale.trim() : language;
}

/**
 * Upper-cases a heading with the language's rules: Turkish dotted/dotless i (i → İ, ı → I), German
 * ß → SS. Done in the text itself (not CSS `text-transform`), so the PDF text layer, DOCX and the
 * ATS readback all see the same letters on every engine.
 */
export function upperCase(text: string, language: CvLanguage): string {
  if (language === "tr") return text.replace(/i/gu, "İ").replace(/ı/gu, "I").toUpperCase();
  return text.toUpperCase();
}

interface ParsedDate {
  year: number;
  month?: number;
  day?: number;
}

function parseDate(value: string): ParsedDate | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (month !== undefined && (month < 1 || month > 12)) return { year };
  return { year, ...(month === undefined ? {} : { month }), ...(day === undefined ? {} : { day }) };
}

/** JSON Resume date → "Mar 2022" / "Mar 2022" / "März 2022"; a bare year stays "2022". */
export function formatMonth(value: string, language: CvLanguage): string {
  const date = parseDate(value);
  if (!date) return value.trim();
  if (date.month === undefined) return String(date.year);
  return `${SHORT_MONTHS[language][date.month - 1]} ${date.year}`;
}

/** Full date for the date of birth: "14 May 1996" / "14 Mayıs 1996" / "14. Mai 1996". */
export function formatDay(value: string, language: CvLanguage): string {
  const date = parseDate(value);
  if (!date || date.month === undefined || date.day === undefined) return value.trim();
  const month = LONG_MONTHS[language][date.month - 1];
  return language === "de" ? `${date.day}. ${month} ${date.year}` : `${date.day} ${month} ${date.year}`;
}

/**
 * "Mar 2022 – Present", "Feb 2020 – Feb 2022", "Apr 2025". `openEnded` decides whether a start date
 * without an end means "ongoing" (work, education) or a one-off (a talk, a certificate).
 */
export function formatRange(
  start: string | undefined,
  end: string | undefined,
  language: CvLanguage,
  openEnded: boolean,
): string | undefined {
  const from = start?.trim() ? formatMonth(start, language) : undefined;
  const to = end?.trim() ? formatMonth(end, language) : undefined;
  if (from && to) return from === to ? from : `${from} – ${to}`;
  if (from) return openEnded ? `${from} – ${PRESENT_WORD[language]}` : from;
  return to;
}
