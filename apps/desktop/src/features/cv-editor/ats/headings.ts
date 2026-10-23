/**
 * Standard CV section headings per CV language, the words application-system parsers look for.
 * The first entry is the heading @bfhr/cv-render prints (its `SECTION_HEADINGS`, agreed value for
 * value; import those once the package is in this app); the rest are accepted synonyms for older
 * exports and imported CVs. `summary` is the heading over `basics.summary`.
 */
import type { CvStandardSection } from "@bfhr/core";

export type AtsLanguage = "en" | "tr" | "de";

export type AtsHeadingKey = Exclude<CvStandardSection, "basics"> | "summary";

export const STANDARD_HEADINGS: Readonly<
  Record<AtsHeadingKey, Readonly<Record<AtsLanguage, readonly [string, ...string[]]>>>
> = {
  summary: {
    en: ["Summary", "Profile", "About Me"],
    tr: ["Özet", "Profil", "Hakkımda"],
    de: ["Profil", "Zusammenfassung", "Über mich"],
  },
  work: {
    en: ["Experience", "Work Experience", "Professional Experience", "Employment History", "Work History"],
    tr: ["Deneyim", "İş Deneyimi", "Mesleki Deneyim", "Çalışma Deneyimi"],
    de: ["Berufserfahrung", "Erfahrung", "Beruflicher Werdegang", "Praxiserfahrung"],
  },
  projects: {
    en: ["Projects", "Selected Projects"],
    tr: ["Projeler"],
    de: ["Projekte"],
  },
  education: {
    en: ["Education", "Academic Background"],
    tr: ["Eğitim", "Eğitim Bilgileri"],
    de: ["Ausbildung", "Bildung", "Bildungsweg", "Studium"],
  },
  skills: {
    en: ["Skills", "Technical Skills", "Core Skills"],
    tr: ["Yetenekler", "Beceriler", "Yetkinlikler"],
    de: ["Kenntnisse", "Fähigkeiten", "Fachkenntnisse", "Kompetenzen"],
  },
  languages: {
    en: ["Languages"],
    tr: ["Diller", "Yabancı Diller"],
    de: ["Sprachen", "Sprachkenntnisse"],
  },
  certificates: {
    en: ["Certifications", "Certificates", "Licenses & Certifications"],
    tr: ["Sertifikalar"],
    de: ["Zertifikate", "Zertifizierungen"],
  },
  awards: {
    en: ["Awards", "Honors & Awards"],
    tr: ["Ödüller"],
    de: ["Auszeichnungen"],
  },
  publications: {
    en: ["Publications"],
    tr: ["Yayınlar"],
    de: ["Publikationen", "Veröffentlichungen"],
  },
  volunteer: {
    en: ["Volunteering", "Volunteer Experience"],
    tr: ["Gönüllü Çalışmalar", "Gönüllülük"],
    de: ["Ehrenamt", "Ehrenamtliches Engagement"],
  },
  interests: {
    en: ["Interests"],
    tr: ["İlgi Alanları"],
    de: ["Interessen"],
  },
  references: {
    en: ["References"],
    tr: ["Referanslar"],
    de: ["Referenzen"],
  },
};

/** How cv-render writes an open end date ("2021 – Present"); synonyms accepted like headings. */
export const PRESENT_WORDS: Readonly<Record<AtsLanguage, readonly [string, ...string[]]>> = {
  en: ["Present", "Current", "Now", "Today"],
  tr: ["Günümüz", "Halen", "Devam ediyor", "Şu an"],
  de: ["heute", "aktuell", "jetzt", "derzeit"],
};
