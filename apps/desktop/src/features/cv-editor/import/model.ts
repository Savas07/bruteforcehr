/**
 * Pure logic of the CV import flow (research/cv-editor.md "Import review"): which files we take,
 * where they go in Storage, how the `cvImport` answer is checked, which extracted fields need a
 * look (confidence by JSON Pointer), the editable review model, applying the user's edits back to
 * the résumé, and the `meta` defaults of the new CV. No React, no Firebase.
 */
import {
  CV_STANDARD_SECTIONS,
  CvContentSchema,
  IdSchema,
  ResumeDateSchema,
  type CvContent,
  type CvImportKind,
  type CvMeta,
  type CvStandardSection,
} from "@bfhr/core";
import { CV_LANGUAGES, cvLanguage, type CvLanguage } from "@bfhr/cv-render";
import { defaultMeta, defaultPaperSize } from "../content";
import {
  CvImportResponseSchema,
  type CvImportRequestKind,
  type CvImportResponse,
  type JsonResume,
} from "./schema";

/* ------------------------------------------------------------------------------------------------
 * Files
 * ---------------------------------------------------------------------------------------------- */

/** storage.rules `users/{uid}/cv-imports/{fileId}`: at most 20 MB. */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** `accept` attribute of the file input: the extensions plus the content types storage.rules allows. */
export const IMPORT_ACCEPT = [
  ".pdf",
  ".docx",
  ".json",
  ".zip",
  "application/pdf",
  DOCX_MIME,
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
].join(",");

const KIND_BY_EXTENSION: Readonly<Record<string, CvImportKind>> = {
  pdf: "pdf",
  docx: "docx",
  json: "json_resume",
  zip: "linkedin_zip",
};

const KIND_BY_MIME: Readonly<Record<string, CvImportKind>> = {
  "application/pdf": "pdf",
  [DOCX_MIME]: "docx",
  "application/json": "json_resume",
  "application/zip": "linkedin_zip",
  "application/x-zip-compressed": "linkedin_zip",
};

/** Wire name the callable expects for each stored kind. */
export const IMPORT_REQUEST_KIND: Readonly<Record<CvImportKind, CvImportRequestKind>> = {
  pdf: "pdf",
  docx: "docx",
  json_resume: "json",
  linkedin_zip: "linkedin-zip",
};

/** The parts of a `File` the checks need. */
export interface ImportFileInfo {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

/** A file we can import, with the content type the upload must declare (storage.rules). */
export interface DetectedImportFile {
  readonly kind: CvImportKind;
  readonly requestKind: CvImportRequestKind;
  readonly contentType: string;
}

export type ImportFileProblem = "unsupported" | "empty" | "tooLarge" | "multiple";

export type ImportFileCheck =
  | { readonly ok: true; readonly file: DetectedImportFile }
  | { readonly ok: false; readonly problem: ImportFileProblem };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Kind by extension (the webviews report MIME types unevenly, Windows says
 * `application/x-zip-compressed`); the MIME type only decides for files without an extension.
 */
export function detectImportKind(file: Pick<ImportFileInfo, "name" | "type">): CvImportKind | null {
  const extension = extensionOf(file.name);
  if (extension !== "")
    return Object.hasOwn(KIND_BY_EXTENSION, extension) ? (KIND_BY_EXTENSION[extension] ?? null) : null;
  const mime = (file.type.split(";")[0] ?? "").trim().toLowerCase();
  return Object.hasOwn(KIND_BY_MIME, mime) ? (KIND_BY_MIME[mime] ?? null) : null;
}

function contentTypeFor(kind: CvImportKind, reportedType: string): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return DOCX_MIME;
    case "json_resume":
      return "application/json";
    case "linkedin_zip":
      return reportedType.trim().toLowerCase() === "application/x-zip-compressed"
        ? "application/x-zip-compressed"
        : "application/zip";
  }
}

/** Checks one picked or dropped file against the import rules (type, then empty, then size). */
export function checkImportFile(file: ImportFileInfo): ImportFileCheck {
  const kind = detectImportKind(file);
  if (kind === null) return { ok: false, problem: "unsupported" };
  if (file.size <= 0) return { ok: false, problem: "empty" };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, problem: "tooLarge" };
  return {
    ok: true,
    file: { kind, requestKind: IMPORT_REQUEST_KIND[kind], contentType: contentTypeFor(kind, file.type) },
  };
}

/** A drop or pick must be exactly one file. */
export function checkImportFiles(files: readonly ImportFileInfo[]): ImportFileCheck {
  const [first] = files;
  if (files.length !== 1 || first === undefined) return { ok: false, problem: "multiple" };
  return checkImportFile(first);
}

/** Random Storage object id for `storagePaths.cvImport(uid, id)`; a UUID is a valid `IdSchema`. */
export function newImportFileId(randomUUID: () => string = () => crypto.randomUUID()): string {
  return IdSchema.parse(randomUUID());
}

/* ------------------------------------------------------------------------------------------------
 * Callable response
 * ---------------------------------------------------------------------------------------------- */

/** Checks the `cvImport` answer; null when it doesn't match the contract. */
export function parseCvImportResponse(data: unknown): CvImportResponse | null {
  const result = CvImportResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}

/* ------------------------------------------------------------------------------------------------
 * Confidence by JSON Pointer
 * ---------------------------------------------------------------------------------------------- */

/** Fields scored below this get "Needs a look". */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

/** RFC 6901 pointer from path segments: `pointerOf("work", 0, "startDate")` → `/work/0/startDate`. */
export function pointerOf(...segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

/** Accepts `#/work/0`, `work/0` and `/work/0/` for `/work/0`; `""`, `/` and `#` are the root. */
export function normalizePointer(pointer: string): string {
  let result = pointer.trim();
  if (result.startsWith("#")) result = result.slice(1);
  if (result !== "" && !result.startsWith("/")) result = `/${result}`;
  while (result.endsWith("/")) result = result.slice(0, -1);
  return result;
}

function isWithin(pointer: string, ancestor: string): boolean {
  return ancestor === "" || pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

/**
 * Confidence of the value at `pointer`: the lowest score recorded for the pointer itself, any parent
 * (a doubtful `/work/2` covers all its fields) or any child (a doubtful `/work/0/highlights/3` makes
 * the bullet list doubtful). Null when the server scored nothing related.
 */
export function confidenceAt(confidence: Readonly<Record<string, number>>, pointer: string): number | null {
  const target = normalizePointer(pointer);
  let lowest: number | null = null;
  for (const [key, score] of Object.entries(confidence)) {
    const scored = normalizePointer(key);
    if (isWithin(target, scored) || isWithin(scored, target))
      lowest = lowest === null ? score : Math.min(lowest, score);
  }
  return lowest;
}

export function isLowConfidence(score: number | null): boolean {
  return score !== null && score < LOW_CONFIDENCE_THRESHOLD;
}

/* ------------------------------------------------------------------------------------------------
 * Review model
 * ---------------------------------------------------------------------------------------------- */

/** Label key of a review field (the view maps each to a message). */
export type ReviewFieldKey =
  | "name"
  | "headline"
  | "email"
  | "phone"
  | "website"
  | "city"
  | "region"
  | "countryCode"
  | "summary"
  | "network"
  | "username"
  | "url"
  | "position"
  | "organization"
  | "location"
  | "description"
  | "startDate"
  | "endDate"
  | "highlights"
  | "institution"
  | "area"
  | "studyType"
  | "score"
  | "courses"
  | "level"
  | "keywords"
  | "language"
  | "fluency"
  | "issuer"
  | "date"
  | "title"
  | "awarder"
  | "publisher"
  | "releaseDate"
  | "reference"
  | "roles";

/**
 * `text` (one line), `longText` (paragraph), `date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `lines`
 * (a list, one entry per line: bullets, courses) and `commas` (a list, comma-separated: keywords).
 */
export type ReviewFieldKind = "text" | "longText" | "date" | "lines" | "commas";

export interface ReviewField {
  /** JSON Pointer into the résumé; also the field's identity. */
  readonly pointer: string;
  readonly path: readonly (string | number)[];
  readonly key: ReviewFieldKey;
  readonly kind: ReviewFieldKind;
  /** The extracted value as the field shows it (lists joined). */
  readonly value: string;
  readonly confidence: number | null;
  /** Below `LOW_CONFIDENCE_THRESHOLD`: shown with "Needs a look" until edited or confirmed. */
  readonly flagged: boolean;
}

export interface ReviewItem {
  readonly pointer: string;
  /** Position in its section's array; null for the single-item groups (header, summary). */
  readonly index: number | null;
  /** Fields whose current values name the item ("Engineer · Acme"), in order. */
  readonly headingPointers: readonly string[];
  readonly fields: readonly ReviewField[];
}

export type ReviewSectionKey = CvStandardSection | "summary" | "profiles";

export interface ReviewSection {
  readonly key: ReviewSectionKey;
  readonly pointer: string;
  readonly items: readonly ReviewItem[];
  readonly flaggedCount: number;
}

export interface ReviewModel {
  readonly sections: readonly ReviewSection[];
  /** Every field, in display order. */
  readonly fields: readonly ReviewField[];
  /** Fields that came back with a value ("We read 42 fields"). */
  readonly filledCount: number;
  /** Flagged fields, in display order. */
  readonly flagged: readonly ReviewField[];
}

interface FieldSpec {
  readonly key: ReviewFieldKey;
  readonly path: readonly string[];
  readonly kind: ReviewFieldKind;
  /** Shown even when empty, so the user can fill it in; other fields show only with a value. */
  readonly core?: true;
}

interface ListSectionSpec {
  readonly fields: readonly FieldSpec[];
  readonly heading: readonly ReviewFieldKey[];
}

const text = (key: ReviewFieldKey, field: string = key, core?: true): FieldSpec => ({
  key,
  path: [field],
  kind: "text",
  ...(core && { core }),
});
const longText = (key: ReviewFieldKey, field: string = key, core?: true): FieldSpec => ({
  key,
  path: [field],
  kind: "longText",
  ...(core && { core }),
});
const date = (key: ReviewFieldKey, core?: true): FieldSpec => ({
  key,
  path: [key],
  kind: "date",
  ...(core && { core }),
});
const lines = (key: ReviewFieldKey, core?: true): FieldSpec => ({
  key,
  path: [key],
  kind: "lines",
  ...(core && { core }),
});
const commas = (key: ReviewFieldKey, core?: true): FieldSpec => ({
  key,
  path: [key],
  kind: "commas",
  ...(core && { core }),
});

const HEADER_FIELDS: readonly FieldSpec[] = [
  text("name", "name", true),
  text("headline", "label", true),
  text("email", "email", true),
  text("phone", "phone", true),
  text("website", "url", true),
  { key: "city", path: ["location", "city"], kind: "text", core: true },
  { key: "region", path: ["location", "region"], kind: "text" },
  { key: "countryCode", path: ["location", "countryCode"], kind: "text" },
];

const PROFILE_SECTION: ListSectionSpec = {
  fields: [text("network", "network", true), text("url", "url", true), text("username")],
  heading: ["network", "username"],
};

/** Fields per standard list section (JSON Resume v1.0.0). */
const LIST_SECTIONS: Readonly<Record<Exclude<CvStandardSection, "basics">, ListSectionSpec>> = {
  work: {
    fields: [
      text("position", "position", true),
      text("organization", "name", true),
      text("location"),
      date("startDate", true),
      date("endDate", true),
      longText("summary"),
      lines("highlights", true),
      text("url"),
    ],
    heading: ["position", "organization"],
  },
  projects: {
    fields: [
      text("title", "name", true),
      longText("description", "description", true),
      date("startDate"),
      date("endDate"),
      lines("highlights"),
      commas("keywords"),
      lines("roles"),
      text("organization", "entity"),
      text("url"),
    ],
    heading: ["title"],
  },
  education: {
    fields: [
      text("institution", "institution", true),
      text("studyType", "studyType", true),
      text("area", "area", true),
      date("startDate", true),
      date("endDate", true),
      text("score"),
      lines("courses"),
      text("url"),
    ],
    heading: ["studyType", "area", "institution"],
  },
  skills: {
    fields: [text("name", "name", true), text("level"), commas("keywords", true)],
    heading: ["name"],
  },
  languages: {
    fields: [text("language", "language", true), text("fluency", "fluency", true)],
    heading: ["language"],
  },
  certificates: {
    fields: [text("name", "name", true), text("issuer", "issuer", true), date("date", true), text("url")],
    heading: ["name"],
  },
  awards: {
    fields: [
      text("title", "title", true),
      text("awarder", "awarder", true),
      date("date", true),
      longText("summary"),
    ],
    heading: ["title"],
  },
  publications: {
    fields: [
      text("title", "name", true),
      text("publisher", "publisher", true),
      date("releaseDate", true),
      text("url"),
      longText("summary"),
    ],
    heading: ["title"],
  },
  volunteer: {
    fields: [
      text("position", "position", true),
      text("organization", "organization", true),
      date("startDate", true),
      date("endDate", true),
      longText("summary"),
      lines("highlights"),
      text("url"),
    ],
    heading: ["position", "organization"],
  },
  interests: {
    fields: [text("name", "name", true), commas("keywords")],
    heading: ["name"],
  },
  references: {
    fields: [text("name", "name", true), longText("reference", "reference", true)],
    heading: ["name"],
  },
};

function valueAt(root: unknown, path: readonly (string | number)[]): unknown {
  let current = root;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function displayValue(raw: unknown, kind: ReviewFieldKind): string {
  if (kind === "lines" || kind === "commas") {
    if (!Array.isArray(raw)) return "";
    const entries = raw.filter((entry): entry is string => typeof entry === "string");
    return entries.join(kind === "lines" ? "\n" : ", ");
  }
  return typeof raw === "string" ? raw : "";
}

/**
 * The extracted résumé as review groups: header, summary, profiles, then each non-empty standard
 * section in render order, one item per entry. Optional fields show only when they have a value
 * or were flagged.
 */
export function buildReviewModel(
  resume: JsonResume,
  confidence: Readonly<Record<string, number>>,
): ReviewModel {
  const fields: ReviewField[] = [];
  const sections: ReviewSection[] = [];

  const makeFields = (base: readonly (string | number)[], specs: readonly FieldSpec[]): ReviewField[] => {
    const result: ReviewField[] = [];
    for (const spec of specs) {
      const path = [...base, ...spec.path];
      const pointer = pointerOf(...path);
      const value = displayValue(valueAt(resume, path), spec.kind);
      const score = confidenceAt(confidence, pointer);
      const flagged = isLowConfidence(score);
      // An empty optional field shows only when the server doubted that field itself (a doubtful
      // `/work/1` shouldn't surface every empty field of the role).
      if (
        !spec.core &&
        value.trim() === "" &&
        !Object.entries(confidence).some(
          ([key, scored]) => isLowConfidence(scored) && isWithin(normalizePointer(key), pointer),
        )
      )
        continue;
      result.push({ pointer, path, key: spec.key, kind: spec.kind, value, confidence: score, flagged });
    }
    fields.push(...result);
    return result;
  };

  const pushSection = (key: ReviewSectionKey, pointer: string, items: ReviewItem[]) => {
    const flaggedCount = items.reduce(
      (sum, item) => sum + item.fields.filter((field) => field.flagged).length,
      0,
    );
    sections.push({ key, pointer, items, flaggedCount });
  };

  const listItems = (
    base: readonly string[],
    entries: readonly unknown[],
    spec: ListSectionSpec,
  ): ReviewItem[] =>
    entries.map((_, index) => {
      const itemFields = makeFields([...base, index], spec.fields);
      return {
        pointer: pointerOf(...base, index),
        index,
        headingPointers: spec.heading
          .map((key) => itemFields.find((field) => field.key === key)?.pointer)
          .filter((pointer): pointer is string => pointer !== undefined),
        fields: itemFields,
      };
    });

  const basics = pointerOf("basics");
  pushSection("basics", basics, [
    { pointer: basics, index: null, headingPointers: [], fields: makeFields(["basics"], HEADER_FIELDS) },
  ]);
  const summary = pointerOf("basics", "summary");
  pushSection("summary", summary, [
    {
      pointer: summary,
      index: null,
      headingPointers: [],
      fields: makeFields(["basics"], [longText("summary", "summary", true)]),
    },
  ]);
  const profiles = resume.basics?.profiles ?? [];
  if (profiles.length > 0)
    pushSection(
      "profiles",
      pointerOf("basics", "profiles"),
      listItems(["basics", "profiles"], profiles, PROFILE_SECTION),
    );

  for (const section of CV_STANDARD_SECTIONS) {
    if (section === "basics") continue;
    const entries = resume[section] ?? [];
    if (entries.length === 0) continue;
    pushSection(section, pointerOf(section), listItems([section], entries, LIST_SECTIONS[section]));
  }

  return {
    sections,
    fields,
    filledCount: fields.filter((field) => field.value.trim() !== "").length,
    flagged: fields.filter((field) => field.flagged),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Edits
 * ---------------------------------------------------------------------------------------------- */

const LIMITS: Readonly<Record<ReviewFieldKind, number>> = {
  text: 500,
  longText: 20_000,
  date: 10,
  lines: 2_000,
  commas: 2_000,
};
const MAX_LIST_ENTRIES = 100;

/** `03/2022`, `3.2022` and `03-2022` become `2022-03`; everything else is only trimmed. */
export function normalizeResumeDate(input: string): string {
  const trimmed = input.trim();
  const monthFirst = /^(\d{1,2})[./-](\d{4})$/.exec(trimmed);
  if (monthFirst) {
    const [, month = "", year = ""] = monthFirst;
    return `${year}-${month.padStart(2, "0")}`;
  }
  return trimmed;
}

function listEntries(value: string, kind: "lines" | "commas"): string[] {
  return value
    .split(kind === "lines" ? /\r?\n/ : /[,\n]/)
    .map((entry) => (kind === "lines" ? entry.replace(/^\s*[•●▪◦*–-]\s+/, "") : entry).trim())
    .filter((entry) => entry !== "");
}

export type ReviewFieldProblem = "invalidDate" | "tooLong" | "tooMany";

/** Why `value` can't be saved in `field`, or null. Empty is always fine (the field is left out). */
export function reviewFieldProblem(
  field: Pick<ReviewField, "kind">,
  value: string,
): ReviewFieldProblem | null {
  switch (field.kind) {
    case "date": {
      const normalized = normalizeResumeDate(value);
      return normalized === "" || ResumeDateSchema.safeParse(normalized).success ? null : "invalidDate";
    }
    case "lines":
    case "commas": {
      const entries = listEntries(value, field.kind);
      if (entries.length > MAX_LIST_ENTRIES) return "tooMany";
      return entries.some((entry) => entry.length > LIMITS[field.kind]) ? "tooLong" : null;
    }
    default:
      return value.trim().length > LIMITS[field.kind] ? "tooLong" : null;
  }
}

function parsedValue(kind: ReviewFieldKind, value: string): string | string[] | undefined {
  switch (kind) {
    case "lines":
    case "commas": {
      const entries = listEntries(value, kind);
      return entries.length > 0 ? entries : undefined;
    }
    case "date": {
      const normalized = normalizeResumeDate(value);
      return normalized === "" ? undefined : normalized;
    }
    default: {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }
  }
}

function setAt(root: Record<string, unknown>, path: readonly (string | number)[], value: unknown): void {
  let current: Record<string | number, unknown> = root;
  for (const [index, segment] of path.entries()) {
    if (index === path.length - 1) {
      if (value === undefined) Reflect.deleteProperty(current, segment);
      else current[segment] = value;
      return;
    }
    const next = current[segment];
    if (next === null || typeof next !== "object") {
      if (value === undefined) return;
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    } else {
      current = next as Record<string | number, unknown>;
    }
  }
}

/**
 * The résumé with the review's edits applied: `values` maps field pointers to what the user typed;
 * unchanged fields keep the extracted value exactly. Emptied fields are removed; list fields split
 * into entries (leading bullet glyphs dropped).
 */
export function applyReviewEdits(
  resume: JsonResume,
  model: Pick<ReviewModel, "fields">,
  values: Readonly<Record<string, string>>,
): JsonResume {
  const result = structuredClone(resume) as Record<string, unknown>;
  for (const field of model.fields) {
    const value = values[field.pointer];
    if (value === undefined || value === field.value) continue;
    setAt(result, field.path, parsedValue(field.kind, value));
  }
  return result as JsonResume;
}

/* ------------------------------------------------------------------------------------------------
 * The new CV
 * ---------------------------------------------------------------------------------------------- */

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.some(hasValue);
  if (value !== null && typeof value === "object") return Object.values(value).some(hasValue);
  return value !== undefined && value !== null;
}

/** `basics` first, then every standard section with content, in `CV_STANDARD_SECTIONS` order. */
export function importSectionOrder(resume: JsonResume): CvStandardSection[] {
  return [
    "basics",
    ...CV_STANDARD_SECTIONS.filter((section) => section !== "basics" && hasValue(resume[section])),
  ];
}

/** `meta` of an imported CV: the new-CV defaults (paper from the app locale), sections it has. */
export function defaultImportMeta(resume: JsonResume, locale: string): CvMeta {
  return { ...defaultMeta(defaultPaperSize(locale)), sectionOrder: importSectionOrder(resume) };
}

const wordTable = (words: string): Readonly<Record<string, true>> =>
  Object.fromEntries(words.split(" ").map((word) => [word, true]));

const STOPWORDS: Readonly<Record<CvLanguage, Readonly<Record<string, true>>>> = {
  en: wordTable("and the with for of to on at an as by from my our"),
  tr: wordTable("ve ile için olarak bir bu da de gibi daha üzerinde sonra ayrıca"),
  de: wordTable("und der die das mit für von bei im ich zur zum den des eine auf als"),
};

/** Letters only one of the languages uses. */
const MARKERS: Readonly<Record<CvLanguage, RegExp | null>> = { en: null, tr: /[ğışİĞŞ]/g, de: /[ßä]/g };

function collectText(value: unknown, into: string[]): void {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) for (const entry of value) collectText(entry, into);
  else if (value !== null && typeof value === "object")
    for (const [key, entry] of Object.entries(value))
      if (key !== "url" && key !== "email") collectText(entry, into);
}

/**
 * Best guess at the language the CV is written in, from common words and language-specific
 * letters; `fallback` (the app language) when the text doesn't say.
 */
export function guessCvLanguage(resume: JsonResume, fallback: string): CvLanguage {
  const parts: string[] = [];
  collectText(resume, parts);
  const textContent = parts.join(" ");
  const words = textContent.toLowerCase().split(/[^\p{L}]+/u);
  const scores = CV_LANGUAGES.map((language) => {
    const marker = MARKERS[language];
    const markers = marker ? (textContent.match(marker)?.length ?? 0) : 0;
    const hits = words.filter((word) => STOPWORDS[language][word] === true).length;
    return { language, score: hits + 2 * markers };
  }).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best && best.score > 0 && best.score !== second?.score) return best.language;
  return cvLanguage(fallback);
}

const MAX_TITLE = 120;
const MAX_FILE_NAME = 255;

/**
 * Default CV title: the file name without its extension and with `_` as spaces
 * ("Deniz_Aksoy_CV_2025.pdf" → "Deniz Aksoy CV 2025"). LinkedIn exports are named after the
 * export, not the person, so they use the name from the CV instead.
 */
export function defaultImportTitle(fileName: string, kind: CvImportKind, resume: JsonResume): string {
  const name = resume.basics?.name?.trim() ?? "";
  const dot = fileName.lastIndexOf(".");
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const title = kind === "linkedin_zip" && name !== "" ? name : stem || name;
  return title.slice(0, MAX_TITLE);
}

/** What `ImportCvDialog` hands to `onCreate`: the new CV's first revision and its document fields. */
export interface ImportedCv {
  readonly content: CvContent;
  readonly title: string;
  readonly language: string;
  readonly importedFrom: {
    readonly kind: CvImportKind;
    readonly storagePath: string;
    readonly fileName: string;
  };
}

/** Assembles and validates the new CV (throws when the content doesn't satisfy `CvContentSchema`). */
export function buildImportedCv(input: {
  readonly resume: JsonResume;
  readonly title: string;
  readonly language: CvLanguage;
  /** App locale (paper size). */
  readonly locale: string;
  readonly kind: CvImportKind;
  readonly storagePath: string;
  readonly fileName: string;
}): ImportedCv {
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (title === "") throw new TypeError("An imported CV needs a title");
  return {
    content: CvContentSchema.parse({ ...input.resume, meta: defaultImportMeta(input.resume, input.locale) }),
    title,
    language: input.language,
    importedFrom: {
      kind: input.kind,
      storagePath: input.storagePath,
      fileName: input.fileName.slice(0, MAX_FILE_NAME),
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------------------------------- */

/**
 * What went wrong, in the user's terms. `canceled` is the user's own Cancel (no message).
 * Function errors follow the callable's `HttpsError` code + `details.reason`.
 */
export type ImportErrorKind =
  | "canceled"
  | "offline"
  | "signedOut"
  | "emailUnverified"
  | "uploadRejected"
  | "uploadFailed"
  | "fileMissing"
  | "dailyCap"
  | "aiDisabled"
  | "unreadableFile"
  | "noText"
  | "invalidFile"
  | "timeout"
  | "serverFailed"
  | "badResponse";

/**
 * The way forward offered for each error: `again` repeats the step that failed (same uploaded file
 * when reading failed), `upload` uploads the file again, `pick` asks for another file, null offers
 * only another file.
 */
export const IMPORT_ERROR_RECOVERY: Readonly<Record<ImportErrorKind, "again" | "upload" | "pick" | null>> = {
  canceled: "pick",
  offline: "again",
  signedOut: "again",
  emailUnverified: "again",
  uploadRejected: "pick",
  uploadFailed: "upload",
  fileMissing: "upload",
  dailyCap: null,
  aiDisabled: "again",
  unreadableFile: "pick",
  noText: "pick",
  invalidFile: "pick",
  timeout: "again",
  serverFailed: "again",
  badResponse: "again",
};

function errorField(error: unknown, field: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
}

/** Maps a Storage (`storage/…`) or callable (`functions/…`) error to what the user sees. */
export function classifyImportError(
  error: unknown,
  { online }: { readonly online: boolean },
): ImportErrorKind {
  const rawCode = errorField(error, "code");
  const code = typeof rawCode === "string" ? rawCode : "";
  if (code === "storage/canceled") return "canceled";
  if (!online) return "offline";
  const details = errorField(error, "details");
  const rawReason = errorField(details, "reason");
  const reason = typeof rawReason === "string" ? rawReason : "";
  switch (code) {
    case "storage/unauthenticated":
    case "functions/unauthenticated":
      return "signedOut";
    case "storage/unauthorized":
      return "uploadRejected";
    case "storage/retry-limit-exceeded":
    case "storage/quota-exceeded":
    case "storage/server-file-wrong-size":
    case "storage/unknown":
      return "uploadFailed";
    case "functions/permission-denied":
      return reason === "email_unverified" ? "emailUnverified" : "signedOut";
    case "functions/resource-exhausted":
      return "dailyCap";
    case "functions/failed-precondition":
      if (reason === "ai_disabled") return "aiDisabled";
      if (reason === "no_text") return "noText";
      return "unreadableFile";
    case "functions/invalid-argument":
      return "invalidFile";
    case "functions/not-found":
      return "fileMissing";
    case "functions/unavailable":
      return "offline";
    case "functions/deadline-exceeded":
      return "timeout";
    default:
      return code.startsWith("storage/") ? "uploadFailed" : "serverFailed";
  }
}
