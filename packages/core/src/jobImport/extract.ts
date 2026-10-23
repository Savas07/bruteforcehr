import { WebUrl } from "./web-url";
import type { JobImportMethod } from "./contract";
import { type HtmlElement, blockText, canonicalUrl, find, parseHtml, textOf } from "./html";
import { EMPTY_POSTING, type ExtractedPosting, fillPosting, filledFields, isComplete } from "./posting";
import { jsonLdJobPostings, microdataJobPostings, postingFromSchemaOrg } from "./schema-org";
import { type ApiRequest, type SiteAdapter, siteFor } from "./sites";

/** Confidence of a field by the extractor that filled it (structured data the site publishes ranks highest). */
export const METHOD_CONFIDENCE: Readonly<Record<Exclude<JobImportMethod, "ai">, number>> = {
  json_ld: 0.95,
  microdata: 0.9,
  site: 0.85,
};

/** Readable text handed to the AI fallback is cut here (≈ 8k tokens). */
export const MAX_READABLE_CHARS = 30_000;

export interface PageExtraction {
  posting: ExtractedPosting;
  /** First extractor that made the posting complete (title + company), or null. */
  method: JobImportMethod | null;
  site: SiteAdapter | null;
  /** The extractor that filled each field (`title`, `company`, `locations`, …). */
  fieldMethods: Record<string, JobImportMethod>;
  /** The adapter's public API to call when the page alone is incomplete or has no description. */
  api: ApiRequest | null;
  /** Main page text for the AI fallback and its grounding check. */
  readableText: string;
  /** `<link rel=canonical>` of the page, when present. */
  canonicalUrl: string | null;
  /** `<html lang>`. */
  declaredLanguage: string | null;
}

/** Visible text of the page's main content (navigation, header, footer, forms and asides skipped). */
export function readableText(document: HtmlElement): string {
  const main =
    find(document, (element) => element.tag === "main" || element.attrs.role === "main") ??
    find(document, (element) => element.tag === "article") ??
    find(document, (element) => element.tag === "body") ??
    document;
  const chrome = (element: HtmlElement): boolean =>
    ["nav", "header", "footer", "aside", "form", "dialog"].includes(element.tag) ||
    ["navigation", "banner", "contentinfo", "dialog", "search"].includes(element.attrs.role ?? "") ||
    element.attrs["aria-hidden"] === "true" ||
    "hidden" in element.attrs;
  // The <title> often names the company ("Senior Engineer at Acme"), so it leads the text.
  const title = textOf(find(document, (element) => element.tag === "title"));
  const body = blockText(main, chrome);
  return (title === "" || body.startsWith(title) ? body : `${title}\n\n${body}`).slice(0, MAX_READABLE_CHARS);
}

function record(
  fieldMethods: Record<string, JobImportMethod>,
  before: ExtractedPosting,
  after: ExtractedPosting,
  method: JobImportMethod,
): void {
  const had = new Set(filledFields(before));
  for (const field of filledFields(after))
    if (!had.has(field) && fieldMethods[field] === undefined) fieldMethods[field] = method;
  // A longer description from a later extractor replaces a shorter one.
  if (after.description !== before.description && after.description !== "") fieldMethods.description = method;
}

/**
 * Structured extraction from one fetched HTML page, in order: schema.org JSON-LD, microdata, then
 * the site adapter's HTML reader. Each later step only fills fields still empty.
 */
export function extractFromHtml(page: { url: string; html: string }): PageExtraction {
  const url = new WebUrl(page.url);
  const document = parseHtml(page.html);
  const site = siteFor(url);
  const fieldMethods: Record<string, JobImportMethod> = {};
  let posting: ExtractedPosting = EMPTY_POSTING;
  let method: JobImportMethod | null = null;

  const steps: [JobImportMethod, () => ExtractedPosting | null][] = [
    [
      "json_ld",
      () =>
        jsonLdJobPostings(document)
          .map(postingFromSchemaOrg)
          .find((item) => item.title !== null) ?? null,
    ],
    [
      "microdata",
      () =>
        microdataJobPostings(document)
          .map(postingFromSchemaOrg)
          .find((item) => item.title !== null) ?? null,
    ],
    ["site", () => site?.parseHtml?.(document, url) ?? null],
  ];
  for (const [step, run] of steps) {
    const found = run();
    if (found === null) continue;
    const next = fillPosting(posting, found);
    record(fieldMethods, posting, next, step);
    posting = next;
    if (method === null && isComplete(posting)) method = step;
  }

  const html = find(document, (element) => element.tag === "html");
  const needsApi = !isComplete(posting) || posting.description.length < 200;
  return {
    posting,
    method,
    site,
    fieldMethods,
    api: needsApi ? (site?.apiRequest?.(url) ?? null) : null,
    readableText: readableText(document),
    canonicalUrl: canonicalUrl(document, page.url) ?? null,
    declaredLanguage: html?.attrs.lang ?? null,
  };
}

/** Adds what the adapter's public API returned (`extraction.api`) to a page extraction. */
export function withApiResult(extraction: PageExtraction, json: unknown, url: string): PageExtraction {
  const found = extraction.site?.parseApi?.(json, new WebUrl(url)) ?? null;
  if (found === null) return extraction;
  const fieldMethods = { ...extraction.fieldMethods };
  const posting = fillPosting(extraction.posting, found);
  record(fieldMethods, extraction.posting, posting, "site");
  return {
    ...extraction,
    posting,
    fieldMethods,
    method: extraction.method ?? (isComplete(posting) ? "site" : null),
  };
}
