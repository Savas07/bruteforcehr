import type { CvContent } from "@bfhr/core";

export type ExportExtension = "pdf" | "docx" | "json";

export interface ExportFileNameInput {
  readonly firstName?: string;
  readonly lastName?: string;
  /** Company of the application the file is for; omitted → `First-Last-CV.pdf`. */
  readonly company?: string;
  readonly ext: ExportExtension;
  /** CV language; German spells umlauts out (Müller → Mueller), others drop accents (Öztürk → Ozturk). */
  readonly locale?: string;
}

const LETTERS: Readonly<Record<string, string>> = {
  ß: "ss",
  ı: "i",
  İ: "I",
  æ: "ae",
  Æ: "Ae",
  ø: "o",
  Ø: "O",
  œ: "oe",
  Œ: "Oe",
  ł: "l",
  Ł: "L",
  đ: "d",
  Đ: "D",
  þ: "th",
  Þ: "Th",
};

const GERMAN: Readonly<Record<string, string>> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue" };

/**
 * ASCII words joined by hyphens. Upload forms and some ATS mangle non-ASCII or spaced file names,
 * so "Şükrü Öztürk" becomes "Sukru-Ozturk".
 */
function slug(value: string | undefined, german: boolean): string {
  if (!value) return "";
  return value
    .replace(/[äöüÄÖÜ]/gu, (char) => (german ? (GERMAN[char] ?? char) : char))
    .replace(/[ßıİæÆøØœŒłŁđĐþÞ]/gu, (char) => LETTERS[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/u, "");
}

/** `First-Last-CV-<Company>.pdf`, or `First-Last-CV.pdf` without a company. */
export function exportFileName({ firstName, lastName, company, ext, locale }: ExportFileNameInput): string {
  const german = (locale ?? "").toLowerCase().startsWith("de");
  const parts = [slug(firstName, german), slug(lastName, german), "CV", slug(company, german)].filter(
    Boolean,
  );
  return `${parts.join("-")}.${ext}`;
}

/** Splits `basics.name` for `exportFileName`: the last word is the last name. */
export function splitName(fullName: string | undefined): { firstName: string; lastName: string } {
  const words = (fullName ?? "").trim().split(/\s+/u).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? "", lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] ?? "" };
}

export const JSON_RESUME_SCHEMA_URL =
  "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";

/**
 * The CV as a JSON Resume v1.0.0 document. Our `meta` extension (template, theme, section order,
 * custom sections, personal details) rides along in JSON Resume's open `meta` object, so importing
 * the file back is lossless; other JSON Resume tools ignore the extra keys.
 */
export function exportJsonResume(content: CvContent, options: { lastModified?: Date } = {}): string {
  const { meta, ...resume } = content;
  const lastModified = options.lastModified?.toISOString() ?? meta.lastModified;
  const document = {
    $schema: JSON_RESUME_SCHEMA_URL,
    ...resume,
    meta: { ...meta, version: meta.version ?? "v1.0.0", ...(lastModified ? { lastModified } : {}) },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
