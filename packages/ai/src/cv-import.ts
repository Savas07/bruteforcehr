import { type CvImportSourceKind, type JsonResume, JsonResumeSchema, ResumeDateSchema } from "@bfhr/core";
import { type MeteredResult, type UsageLedger, generateWithinBudget } from "./budget";
import { importJsonResume, JSON_RESUME_MAPPER_VERSION, sanitizeResume } from "./extract/json-resume";
import { importLinkedInZip, LINKEDIN_MAPPER_VERSION } from "./extract/linkedin";
import { extractDocxText, extractPdfText } from "./extract/text";
import { GroundingSource, findUngrounded } from "./grounding/grounding";
import type { ModelId } from "./models";
import {
  CV_IMPORT_PROMPT_VERSION,
  CV_IMPORT_SYSTEM,
  type CvImportItem,
  type CvImportOutput,
  CvImportOutputSchema,
  cvImportUserPrompt,
  IMPORT_SECTIONS,
  type ImportSection,
} from "./prompts/cv-import";
import type { AiProvider, Effort } from "./provider";

/** Model settings for CV import (docs/adr/0010-ai.md; chosen by the eval in eval/report.md). */
export const CV_IMPORT_MODEL: ModelId = "claude-sonnet-5-5";
export const CV_IMPORT_EFFORT: Effort = "low";
export const CV_IMPORT_MAX_OUTPUT_TOKENS = 16_000;
/** Longer CV text is cut (≈ 12 pages); the import warns `source_truncated`. */
export const MAX_SOURCE_CHARS = 40_000;

/** Penalty when the model marked a field as uncertain. */
const UNCERTAIN_FACTOR = 0.6;

/** How a value is checked against the source (see `groundImport`). */
type Kind = "phrase" | "text" | "email" | "phone" | "url" | "date";

/** Keys with a check other than `phrase` (names, titles, companies, skills: verbatim or all words). */
const KIND_BY_KEY: Readonly<Record<string, Kind>> = {
  email: "email",
  phone: "phone",
  url: "url",
  startDate: "date",
  endDate: "date",
  date: "date",
  releaseDate: "date",
  summary: "text",
  description: "text",
  reference: "text",
};

const LOCATION_KEYS: readonly string[] = ["address", "postalCode", "city", "region", "countryCode"];

export interface GroundedImport {
  resume: JsonResume;
  confidence: Record<string, number>;
  warnings: string[];
  /** Values the model returned that the source does not contain (removed). */
  droppedValues: number;
}

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * Applies the grounding check to a model's structured CV: each value is kept only if the source
 * contains it (verbatim, or all of its words for names and titles; numbers, dates and entities for
 * free text), and gets a confidence = model item confidence × uncertainty × grounding factor.
 */
export function groundImport(output: CvImportOutput, sourceText: string): GroundedImport {
  const source = new GroundingSource(sourceText);
  const confidence: Record<string, number> = {};
  const warnings: string[] = [];
  let droppedValues = 0;

  const drop = (pointer: string, code = "dropped_ungrounded"): undefined => {
    droppedValues++;
    warnings.push(`${code}:${pointer}`);
    return undefined;
  };

  /** Grounding factor of a short value (name, title, company, skill): 1 verbatim, 0.85 all words. */
  const phraseFactor = (value: string): number | undefined => {
    if (source.hasPhrase(value)) return 1;
    const words = value.match(/[\p{L}\p{N}][\p{L}\p{N}.+#&-]*/gu) ?? [];
    const allWords =
      words.length > 0 && words.every((word) => source.hasWord(word) || source.hasEntity(word));
    return allWords && findUngrounded(value, source, { entities: "hard" }).length === 0 ? 0.85 : undefined;
  };

  /** Free text (summary, bullet): no ungrounded number/date/entity and ≥ 90 % of words from the source. */
  const textFactor = (value: string): number | undefined => {
    if (findUngrounded(value, source, { entities: "hard" }).length > 0) return undefined;
    // Whitespace tokens, so `S/4HANA` or `Node.js` count as one word, like in the source index.
    const words = value
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, ""))
      .filter((token) => (token.match(/\p{L}/gu)?.length ?? 0) >= 3);
    if (words.length === 0) return source.hasPhrase(value) ? 1 : undefined;
    const found = words.filter((word) => source.hasWord(word) || source.hasEntity(word)).length;
    const coverage = found / words.length;
    if (coverage < 0.9) return undefined;
    return coverage >= 0.99 ? 1 : 0.9;
  };

  const field = (pointer: string, raw: string, kind: Kind, base: number): string | undefined => {
    const value = raw.trim();
    if (value === "") return undefined;
    let factor: number | undefined;
    let kept = value;
    switch (kind) {
      case "phrase":
        factor = phraseFactor(value);
        break;
      case "text":
        factor = textFactor(value);
        break;
      case "email":
        factor = source.hasEmail(value) ? 1 : undefined;
        break;
      case "phone":
        factor = source.hasPhone(value) ? 1 : undefined;
        break;
      case "url": {
        const bare = value
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .replace(/\/+$/, "");
        factor = source.hasPhrase(bare) ? 1 : undefined;
        break;
      }
      case "date": {
        if (!ResumeDateSchema.safeParse(value).success) return drop(pointer, "dropped_invalid_date");
        const year = value.slice(0, 4);
        if (source.hasDate(value)) factor = 1;
        else if (value.length > 4 && source.hasDate(year)) {
          kept = year;
          factor = 0.7;
          warnings.push(`date_month_dropped:${pointer}`);
        } else if (value.length === 4 && source.hasNumber([String(Number(year))])) factor = 0.9;
        break;
      }
    }
    if (factor === undefined) return drop(pointer);
    confidence[pointer] = Math.round(base * factor * 100) / 100;
    return kept;
  };

  /** Grounds a list of strings, keeping indexes dense in the result. */
  const strings = (pointer: string, values: readonly string[], kind: Kind, base: number): string[] => {
    const kept: string[] = [];
    for (const value of values) {
      const result = field(`${pointer}/${kept.length}`, value, kind, base);
      if (result !== undefined) kept.push(result);
    }
    return kept;
  };

  /** Key names the model marked uncertain (it sometimes appends an explanation after the name). */
  const uncertainKeys = (out: CvImportItem): string[] =>
    out.uncertain.map((entry) => entry.split(/[\s:(]/)[0] ?? "");

  /**
   * Grounds one generic item into a JSON Resume object, using only the keys its section allows
   * (`IMPORT_SECTIONS`); `pointer` is where the object will sit in the resume.
   */
  const build = (pointer: string, out: CvImportItem, keyPointer = (key: string) => `${pointer}/${key}`) => {
    const allowed = IMPORT_SECTIONS[out.section];
    const base = clamp01(out.confidence);
    const unsure = uncertainKeys(out);
    const result: Record<string, unknown> = {};
    for (const { key, value } of out.fields) {
      if (!(allowed.fields as readonly string[]).includes(key) || key in result) continue;
      const kept = field(
        keyPointer(key),
        value,
        KIND_BY_KEY[key] ?? "phrase",
        base * (unsure.includes(key) ? UNCERTAIN_FACTOR : 1),
      );
      if (kept !== undefined) result[key] = kept;
    }
    for (const { key, values } of out.lists) {
      if (!(allowed.lists as readonly string[]).includes(key) || key in result) continue;
      const kind = key === "highlights" ? "text" : "phrase";
      const kept = strings(
        keyPointer(key),
        values,
        kind,
        base * (unsure.includes(key) ? UNCERTAIN_FACTOR : 1),
      );
      if (kept.length > 0) result[key] = kept;
    }
    return result;
  };

  const basics: Record<string, unknown> = {};
  const location: Record<string, unknown> = {};
  const profiles: Record<string, unknown>[] = [];
  const sections: Partial<Record<Exclude<ImportSection, "basics" | "profile">, Record<string, unknown>[]>> =
    {};
  for (const out of output.items) {
    if (out.section === "basics") {
      // Location keys live under basics.location; a second basics item only fills gaps.
      const built = build("/basics", out, (key) =>
        LOCATION_KEYS.includes(key) ? `/basics/location/${key}` : `/basics/${key}`,
      );
      for (const [key, value] of Object.entries(built)) {
        const target = LOCATION_KEYS.includes(key) ? location : basics;
        if (!(key in target)) target[key] = value;
      }
    } else if (out.section === "profile") {
      const pointer = `/basics/profiles/${profiles.length}`;
      const built = build(pointer, out);
      // A network name alone says nothing about the person.
      if ("url" in built || "username" in built) profiles.push(built);
      else Reflect.deleteProperty(confidence, `${pointer}/network`);
    } else {
      const list = (sections[out.section] ??= []);
      const built = build(`/${out.section}/${list.length}`, out);
      if (Object.keys(built).length > 0) list.push(built);
    }
  }
  if (Object.keys(location).length > 0) basics["location"] = location;
  if (profiles.length > 0) basics["profiles"] = profiles;
  const draft = { ...(Object.keys(basics).length > 0 ? { basics } : {}), ...sections };

  for (const heading of output.unmappedSections) {
    if (heading.trim() !== "" && source.hasPhrase(heading))
      warnings.push(`unmapped_section:${heading.trim().slice(0, 80)}`);
  }

  // Lengths and list sizes are enforced by the stored schema; the sanitizer removes what fails.
  const { resume, removed } = sanitizeResume(JSON.parse(JSON.stringify(draft)));
  for (const pointer of removed) {
    for (const key of Object.keys(confidence))
      if (key === pointer || key.startsWith(`${pointer}/`)) Reflect.deleteProperty(confidence, key);
    warnings.push(`dropped_invalid:${pointer}`);
  }
  return { resume: JsonResumeSchema.parse(resume), confidence, warnings, droppedValues };
}

export interface CvImportResult extends GroundedImport {
  model: string;
  promptVersion: string;
  sourceChars: number;
  metered?: MeteredResult<CvImportOutput>;
}

export interface CvImportDependencies {
  provider: AiProvider;
  ledger: UsageLedger;
  model?: ModelId;
  effort?: Effort;
}

/** Structures CV text with the model, then grounds every value against that text. */
export async function importCvText(text: string, deps: CvImportDependencies): Promise<CvImportResult> {
  const truncated = text.length > MAX_SOURCE_CHARS;
  const sourceText = truncated ? text.slice(0, MAX_SOURCE_CHARS) : text;
  const metered = await generateWithinBudget(deps.provider, deps.ledger, {
    model: deps.model ?? CV_IMPORT_MODEL,
    effort: deps.effort ?? CV_IMPORT_EFFORT,
    system: CV_IMPORT_SYSTEM,
    user: cvImportUserPrompt(sourceText),
    schema: CvImportOutputSchema,
    maxOutputTokens: CV_IMPORT_MAX_OUTPUT_TOKENS,
  });
  const grounded = groundImport(metered.data, sourceText);
  return {
    ...grounded,
    warnings: truncated ? ["source_truncated", ...grounded.warnings] : grounded.warnings,
    model: metered.model,
    promptVersion: CV_IMPORT_PROMPT_VERSION,
    sourceChars: sourceText.length,
    metered,
  };
}

/** `cvImport` for any source kind: deterministic for JSON Resume and LinkedIn, model for PDF/DOCX. */
export async function importCv(
  kind: CvImportSourceKind,
  bytes: Uint8Array,
  deps: CvImportDependencies,
): Promise<CvImportResult> {
  switch (kind) {
    case "json": {
      const result = importJsonResume(bytes);
      return {
        ...result,
        droppedValues: 0,
        model: "none",
        promptVersion: JSON_RESUME_MAPPER_VERSION,
        sourceChars: bytes.length,
      };
    }
    case "linkedin-zip": {
      const mapped = importLinkedInZip(bytes);
      const { resume, removed } = sanitizeResume(mapped.resume);
      const confidence = Object.fromEntries(
        Object.entries(mapped.confidence).filter(
          ([key]) => !removed.some((p) => key === p || key.startsWith(`${p}/`)),
        ),
      );
      return {
        resume,
        confidence,
        warnings: [...mapped.warnings, ...removed.map((pointer) => `dropped_invalid:${pointer}`)],
        droppedValues: 0,
        model: "none",
        promptVersion: LINKEDIN_MAPPER_VERSION,
        sourceChars: bytes.length,
      };
    }
    case "pdf":
      return importCvText(await extractPdfText(bytes), deps);
    case "docx":
      return importCvText(await extractDocxText(bytes), deps);
  }
}
