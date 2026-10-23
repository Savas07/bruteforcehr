import type { JsonResume } from "@bfhr/core";
import { strFromU8, unzipSync } from "fflate";
import { fold } from "../grounding/grounding";
import { MONTHS } from "../grounding/terms";
import { uniformConfidence } from "../resume-pointers";
import { UnreadableFileError } from "./text";

/** Version of the deterministic LinkedIn data-export mapping (reported as `promptVersion`). */
export const LINKEDIN_MAPPER_VERSION = "linkedin-zip@1";

type Row = Record<string, string>;

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF/LF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Rows of a LinkedIn export CSV keyed by header. Some files start with a "Notes:" preamble; the
 * header is the first row that contains `headerHint`.
 */
function readTable(files: Record<string, Uint8Array>, name: string, headerHint: string): Row[] | undefined {
  const entry = Object.entries(files).find(
    ([path]) => path.split("/").pop()?.toLowerCase() === name.toLowerCase(),
  );
  if (entry === undefined) return undefined;
  const rows = parseCsv(strFromU8(entry[1]).replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.trim() === headerHint));
  if (headerIndex < 0) return [];
  const header = (rows[headerIndex] ?? []).map((cell) => cell.trim());
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(header.map((key, i) => [key, (row[i] ?? "").trim()])));
}

/** `Jan 2020`, `2020`, `03/2020`, `2020-03` → JSON Resume date; anything else → undefined. */
export function parseExportDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = fold(value);
  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(text);
  if (iso !== null) return text;
  const named = /^(\p{L}+)\.?\s+(\d{4})$/u.exec(text);
  const month = named === null ? undefined : MONTHS[named[1] ?? ""];
  if (named !== null && month !== undefined) return `${named[2]}-${String(month).padStart(2, "0")}`;
  const numeric = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (numeric !== null && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    return `${numeric[2]}-${numeric[1]?.padStart(2, "0")}`;
  }
  return undefined;
}

/** Drops empty strings, empty arrays and objects left empty, so the resume has only real values. */
function compact<T>(value: T): T | undefined {
  if (typeof value === "string") return (value.trim() === "" ? undefined : value.trim()) as T | undefined;
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => compact(item)).filter((item) => item !== undefined);
    return (items.length === 0 ? undefined : items) as T | undefined;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)] as const)
      .filter(([, item]) => item !== undefined);
    return (entries.length === 0 ? undefined : Object.fromEntries(entries)) as T | undefined;
  }
  return value;
}

/** Free-text description → bullets when the lines are bulleted, a summary otherwise. */
function splitDescription(description: string | undefined): { summary?: string; highlights?: string[] } {
  if (description === undefined || description.trim() === "") return {};
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bulleted = lines.filter((line) => /^[-•*▪●–]\s*/u.test(line));
  if (bulleted.length >= 2 && bulleted.length >= lines.length - 1) {
    const intro = lines.filter((line) => !/^[-•*▪●–]\s*/u.test(line)).join(" ");
    return {
      ...(intro === "" ? {} : { summary: intro }),
      highlights: bulleted.map((line) => line.replace(/^[-•*▪●–]\s*/u, "")),
    };
  }
  return { summary: description.trim() };
}

export interface LinkedInImport {
  resume: JsonResume;
  confidence: Record<string, number>;
  warnings: string[];
}

/**
 * Maps a LinkedIn "Download your data" ZIP to JSON Resume without a model: the CSV columns map
 * one-to-one, so every value is the user's own text (confidence 1).
 */
export function importLinkedInZip(bytes: Uint8Array): LinkedInImport {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name.toLowerCase().endsWith(".csv") });
  } catch {
    throw new UnreadableFileError("unreadable_file", "not a ZIP archive");
  }
  const warnings: string[] = [];
  const table = (name: string, hint: string, required: boolean): Row[] => {
    const rows = readTable(files, name, hint);
    if (rows === undefined && required) warnings.push(`linkedin_missing:${name}`);
    return rows ?? [];
  };

  const profile = table("Profile.csv", "First Name", true)[0];
  const emails = table("Email Addresses.csv", "Email Address", false);
  const phones = table("PhoneNumbers.csv", "Number", false);
  const positions = table("Positions.csv", "Company Name", true);
  const education = table("Education.csv", "School Name", false);
  if (profile === undefined && positions.length === 0 && education.length === 0) {
    throw new UnreadableFileError("unreadable_file", "not a LinkedIn data export");
  }

  const primaryEmail = emails.find((row) => /^yes$/i.test(row["Primary"] ?? "")) ?? emails[0];
  const websites = [...(profile?.["Websites"] ?? "").matchAll(/https?:\/\/[^\s,\]]+/g)].map((m) => m[0]);
  const twitter = (profile?.["Twitter Handles"] ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")[0]
    ?.trim();
  const geo = profile?.["Geo Location"] ?? "";

  const resume =
    compact<JsonResume>({
      basics: {
        name: [profile?.["First Name"], profile?.["Last Name"]].filter(Boolean).join(" "),
        label: profile?.["Headline"] ?? "",
        email: primaryEmail?.["Email Address"] ?? "",
        phone: phones[0]?.["Number"] ?? "",
        url: websites[0] ?? "",
        summary: profile?.["Summary"] ?? "",
        location: { city: geo.split(",")[0] ?? "", postalCode: profile?.["Zip Code"] ?? "" },
        profiles: twitter === undefined || twitter === "" ? [] : [{ network: "Twitter", username: twitter }],
      },
      work: positions.map((row) => ({
        name: row["Company Name"] ?? "",
        position: row["Title"] ?? "",
        location: row["Location"] ?? "",
        startDate: parseExportDate(row["Started On"]) ?? "",
        endDate: parseExportDate(row["Finished On"]) ?? "",
        ...splitDescription(row["Description"]),
      })),
      education: education.map((row) => ({
        institution: row["School Name"] ?? "",
        studyType: row["Degree Name"] ?? "",
        startDate: parseExportDate(row["Start Date"]) ?? "",
        endDate: parseExportDate(row["End Date"]) ?? "",
      })),
      skills: table("Skills.csv", "Name", false).map((row) => ({ name: row["Name"] ?? "" })),
      languages: table("Languages.csv", "Name", false).map((row) => ({
        language: row["Name"] ?? "",
        fluency: row["Proficiency"] ?? "",
      })),
      certificates: table("Certifications.csv", "Name", false).map((row) => ({
        name: row["Name"] ?? "",
        issuer: row["Authority"] ?? "",
        url: row["Url"] ?? "",
        date: parseExportDate(row["Started On"]) ?? "",
      })),
      projects: table("Projects.csv", "Title", false).map((row) => ({
        name: row["Title"] ?? "",
        description: row["Description"] ?? "",
        url: row["Url"] ?? "",
        startDate: parseExportDate(row["Started On"]) ?? "",
        endDate: parseExportDate(row["Finished On"]) ?? "",
      })),
      awards: table("Honors.csv", "Title", false).map((row) => ({
        title: row["Title"] ?? "",
        summary: row["Description"] ?? "",
        date: parseExportDate(row["Issued On"]) ?? "",
      })),
      publications: table("Publications.csv", "Name", false).map((row) => ({
        name: row["Name"] ?? "",
        publisher: row["Publisher"] ?? "",
        url: row["Url"] ?? "",
        summary: row["Description"] ?? "",
        releaseDate: parseExportDate(row["Published On"]) ?? "",
      })),
      volunteer: table("Volunteering.csv", "Company Name", false).map((row) => ({
        organization: row["Company Name"] ?? "",
        position: row["Role"] ?? "",
        startDate: parseExportDate(row["Started On"]) ?? "",
        endDate: parseExportDate(row["Finished On"]) ?? "",
        ...splitDescription(row["Description"]),
      })),
    }) ?? {};
  return { resume, confidence: uniformConfidence(resume, 1), warnings };
}
