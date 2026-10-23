import type { JobExtractResult } from "@bfhr/ai";
import {
  buildImportedJob,
  detectBlock,
  extractFromHtml,
  fillPosting,
  isComplete,
  type JobDraft,
  type JobImportErrorReason,
  type JobImportMethod,
  type JobImportRobots,
  METHOD_CONFIDENCE,
  type PageExtraction,
  RESTRICTED_SITES,
  importUrlFrom,
  siteFor,
  withApiResult,
} from "@bfhr/core";
import { decodeBody, FetchFailedError, FetchRefusedError, type SafeResponse } from "./safe-fetch";

/** Page and API bodies above this are refused (`too_large`). */
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 12_000;
/** Pages with less readable text than this have nothing for the AI fallback to read. */
const MIN_READABLE_CHARS = 200;

/** A refusal or failure the client shows by `reason`. */
export class JobImportError extends Error {
  constructor(
    readonly reason: JobImportErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "JobImportError";
  }
}

/** Owner switches in `serverOnly/jobImport` (ADR 0005 kill switch and denylist). */
export interface JobImportConfig {
  deniedHosts: readonly string[];
  /** Off: LinkedIn/Indeed/Glassdoor/StepStone/Xing/Kariyer.net pages are refused. */
  restrictedSitesEnabled: boolean;
}

export interface FetchRequest {
  accept: string;
  method?: "GET" | "POST";
  body?: string;
}

export interface ImportDependencies {
  /** Host-slot-limited, SSRF-guarded fetch. */
  fetch(url: URL, request: FetchRequest): Promise<SafeResponse>;
  robots(url: URL): Promise<JobImportRobots>;
  aiEnabled(): Promise<boolean>;
  /** The grounded AI fallback (metered against the daily cap). */
  aiExtract(url: string, pageText: string): Promise<JobExtractResult>;
  config: JobImportConfig;
  now: Date;
}

export interface ImportedPosting {
  draft: JobDraft;
  method: JobImportMethod;
  site: string | null;
  confidence: Record<string, number>;
  warnings: string[];
  model: string;
  promptVersion: string | null;
  finalUrl: string;
  robots: JobImportRobots;
  /** Present when the AI fallback ran (for the PII-free log line). */
  ai: JobExtractResult | null;
}

const HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((entry) => {
    const suffix = entry.toLowerCase().replace(/^\*?\./, "");
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

async function fetchOrFail(
  dependencies: ImportDependencies,
  url: URL,
  request: FetchRequest,
): Promise<SafeResponse> {
  try {
    return await dependencies.fetch(url, request);
  } catch (error) {
    if (error instanceof FetchRefusedError) {
      throw new JobImportError(
        error.refusal === "dns_failed" ? "fetch_failed" : "blocked_url",
        error.refusal === "dns_failed"
          ? "That website could not be found."
          : "That address can't be imported.",
      );
    }
    if (error instanceof FetchFailedError) {
      if (error.failure === "too_large")
        throw new JobImportError("too_large", "That page is too large to import.");
      throw new JobImportError("fetch_failed", "The website didn't answer. Please try again in a minute.");
    }
    throw error;
  }
}

/**
 * Imports one shared posting: canonical URL → guarded fetch → wall/CAPTCHA check → JSON-LD →
 * microdata → site adapter (+ its public API) → grounded AI fallback. Returns the draft job; it
 * never writes the user's data.
 */
export async function importPosting(
  input: string,
  dependencies: ImportDependencies,
): Promise<ImportedPosting> {
  const requested = importUrlFrom(input);
  if (requested === null) throw new JobImportError("invalid_url", "That doesn't look like a web address.");
  const checkAllowed = (url: URL): void => {
    const host = url.hostname.toLowerCase();
    if (hostMatches(host, dependencies.config.deniedHosts)) {
      throw new JobImportError("blocked_url", "Importing from this website is turned off.");
    }
    const site = siteFor(url);
    if (site !== null && RESTRICTED_SITES.includes(site.id) && !dependencies.config.restrictedSitesEnabled) {
      throw new JobImportError("blocked_url", "Importing from this website is turned off.");
    }
  };
  checkAllowed(requested);

  const robotsPromise = dependencies.robots(requested).catch((): JobImportRobots => "unavailable");
  const page = await fetchOrFail(dependencies, requested, { accept: HTML_ACCEPT });
  // Redirects (short links, locale hops) can land on another site: check and canonicalize again.
  const landed = importUrlFrom(page.url) ?? new URL(page.url);
  if (landed.hostname !== requested.hostname) checkAllowed(landed);

  const contentType = String(page.headers["content-type"] ?? "").toLowerCase();
  const html = decodeBody(page.body, contentType);
  if (page.status === 404 || page.status === 410) {
    throw new JobImportError("not_found", "This posting is no longer online.");
  }
  const extraction0 =
    contentType.includes("html") || contentType === "" || /^\s*</.test(html.slice(0, 200))
      ? extractFromHtml({ url: landed.href, html })
      : null;
  if (extraction0 === null) throw new JobImportError("not_html", "That link isn't a web page we can read.");

  const block = detectBlock({
    status: page.status,
    url: page.url,
    html,
    visibleTextLength: extraction0.readableText.length,
  });
  if (block !== null) {
    throw new JobImportError(
      "blocked_by_site",
      block === "login_wall"
        ? "This site only shows the posting after signing in."
        : "This site didn't let us read the page.",
    );
  }
  if (page.status === 429 || page.status >= 500) {
    throw new JobImportError("fetch_failed", "The website is busy. Please try again in a few minutes.");
  }
  if (page.status >= 400) throw new JobImportError("not_found", "This posting couldn't be opened.");

  const warnings: string[] = [];
  let extraction: PageExtraction = extraction0;
  if (extraction.api !== null) {
    try {
      const apiUrl = new URL(extraction.api.url);
      const response = await dependencies.fetch(apiUrl, {
        accept: "application/json",
        method: extraction.api.method,
        ...(extraction.api.body === undefined ? {} : { body: extraction.api.body }),
      });
      if (response.status === 200) {
        extraction = withApiResult(
          extraction,
          JSON.parse(decodeBody(response.body, "charset=utf-8")),
          landed.href,
        );
      } else {
        warnings.push("site_api_failed");
      }
    } catch (error) {
      if (!(
        error instanceof FetchFailedError ||
        error instanceof FetchRefusedError ||
        error instanceof SyntaxError
      ))
        throw error;
      warnings.push("site_api_failed");
    }
  }

  let posting = extraction.posting;
  let method = extraction.method;
  const confidence: Record<string, number> = {};
  for (const [field, filledBy] of Object.entries(extraction.fieldMethods)) {
    if (filledBy !== "ai") confidence[field] = METHOD_CONFIDENCE[filledBy];
  }
  let ai: JobExtractResult | null = null;
  if (!isComplete(posting)) {
    if (extraction.readableText.length < MIN_READABLE_CHARS) {
      throw new JobImportError("no_job_found", "We couldn't find a job posting on that page.");
    }
    if (!(await dependencies.aiEnabled())) {
      throw new JobImportError(
        "ai_disabled",
        "This page needs AI to read it, and AI features are turned off in your settings.",
      );
    }
    ai = await dependencies.aiExtract(landed.href, extraction.readableText);
    warnings.push(...ai.warnings);
    if (ai.posting === null)
      throw new JobImportError("no_job_found", "We couldn't find a job posting on that page.");
    const before = posting;
    posting = fillPosting(posting, ai.posting);
    for (const [field, value] of Object.entries(ai.confidence)) {
      const fromStructured =
        field === "description"
          ? before.description.length >= ai.posting.description.length
          : field in confidence;
      if (!fromStructured) confidence[field] = value;
    }
    method = "ai";
  }
  if (method === null || !isComplete(posting)) {
    throw new JobImportError("no_job_found", "We couldn't find a job posting on that page.");
  }
  if (posting.description === "" && method === "ai") {
    // The model found the posting but not where its description starts and ends: offer the
    // page's main text, which the user reviews before saving.
    posting = { ...posting, description: extraction.readableText };
    warnings.push("description_from_page");
  } else if (posting.description === "") {
    warnings.push("no_description");
  }

  const site = siteFor(landed);
  // The adapter's canonical URL wins; otherwise the page's own <link rel=canonical> on the same host.
  const pageCanonical = extraction.canonicalUrl === null ? null : new URL(extraction.canonicalUrl);
  const url =
    site?.canonicalUrl?.(landed) ??
    (pageCanonical !== null &&
    pageCanonical.hostname === landed.hostname &&
    pageCanonical.protocol === "https:"
      ? pageCanonical.href
      : landed.href);
  const draft = buildImportedJob(posting, {
    url,
    site,
    declaredLanguage: extraction.declaredLanguage,
    at: dependencies.now,
  });
  if (draft.description.length < posting.description.length) warnings.push("description_truncated");
  return {
    draft,
    method,
    site: site?.id === "ats" ? null : (site?.id ?? null),
    confidence,
    warnings,
    model: ai?.model ?? "none",
    promptVersion: ai?.promptVersion ?? null,
    finalUrl: url,
    robots: await robotsPromise,
    ai,
  };
}
