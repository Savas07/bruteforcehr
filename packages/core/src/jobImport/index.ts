// URL import of a single job posting (ADR 0005 "URL import"): the callable contract and the pure
// parsers the `jobImportUrl` function runs. Generic HTML helpers stay internal to this folder.
export * from "./contract";
export { detectBlock, type PageBlock } from "./block";
export { buildImportedJob, type ImportedJobContext, URL_IMPORT_JOB_SOURCE } from "./build";
export {
  extractFromHtml,
  MAX_READABLE_CHARS,
  METHOD_CONFIDENCE,
  type PageExtraction,
  withApiResult,
} from "./extract";
export { EMPTY_POSTING, type ExtractedPosting, fillPosting, isComplete } from "./posting";
export { robotsVerdict, type RobotsVerdict } from "./robots";
export { type ApiRequest, RESTRICTED_SITES, type SiteAdapter, siteFor } from "./sites";
export { importUrlFrom } from "./url";
