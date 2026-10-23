import type { CvAssistAction, CvAssistLanguage, JsonResume } from "@bfhr/core";

/**
 * Synthetic CVs for the import eval (no real people: invented names, `example.com` emails,
 * `+90 555 …`/`+49 151 …`/`+1 555 …` style numbers, fictional or generic companies).
 *
 * A fixture is a document (blocks) plus the JSON Resume a careful human would type from it.
 * `eval/build-fixtures.ts` renders the blocks to the fixture's format (PDF or DOCX) so the eval
 * exercises the production text extractors; `expected` must contain only what the document shows.
 */
export type Block =
  /** The person's name, rendered large. */
  | { kind: "name"; text: string }
  /** A plain line (headline, contact line, location). */
  | { kind: "line"; text: string }
  /** A section heading ("Experience", "Berufserfahrung", "Deneyim"). */
  | { kind: "heading"; text: string }
  /** An entry header: `left` (e.g. "Senior Engineer — Acme GmbH") with `right` (e.g. dates) right-aligned, optional `sub` line below. */
  | { kind: "entry"; left: string; right?: string; sub?: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  /** Rows of cells (Lebenslauf/Europass style "dates | details"); a cell may contain `\n`. */
  | { kind: "table"; rows: string[][] };

export type FixtureLayout =
  /** One column, headings, entries with right-aligned dates. */
  | "single-column"
  /** Narrow left sidebar (contact, skills, languages) next to the main column. */
  | "sidebar"
  /** Tabular German Lebenslauf / Europass: dates in a left column, details right. */
  | "table"
  /** Dense one-page CV: inline separators ("|", "·"), no bullets. */
  | "compact";

export interface CvFixture {
  /** `<lang>-<nn>-<slug>`, e.g. `de-03-lebenslauf-table`. */
  id: string;
  language: CvAssistLanguage;
  format: "pdf" | "docx";
  layout: FixtureLayout;
  /** What makes this fixture hard (dates style, missing fields, two columns, …). */
  notes: string;
  /** Main column, top to bottom. */
  main: Block[];
  /** Sidebar column (layout `sidebar` only). */
  sidebar?: Block[];
  /** Ground truth: only values visible in the document; dates as YYYY, YYYY-MM or YYYY-MM-DD; no `meta`. */
  expected: JsonResume;
}

/** A cvAssist eval case. Every entity, number and date in a suggestion must come from `text`/`context`. */
export interface AssistCase {
  id: string;
  action: CvAssistAction;
  /** Language of `text`. */
  language: CvAssistLanguage;
  targetLanguage?: CvAssistLanguage;
  text: string;
  context: { section: string; role?: string; company?: string };
  /** Terms each suggestion must keep verbatim (product names, companies, numbers from the source). */
  mustKeep: string[];
  /** The source has no metric, so a good rewrite should offer a placeholder such as `[X%]`. */
  expectPlaceholder: boolean;
}
