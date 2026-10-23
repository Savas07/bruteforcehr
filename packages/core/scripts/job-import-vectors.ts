/**
 * `conformance/job-import.json`: real `jobImportUrl` responses built from recorded pages
 * (packages/fixtures/job-pages) by the same parsers the function runs, plus the error reasons.
 * BFHRCore decodes them, re-encodes them losslessly and turns `job` into a `Job`.
 */
import { readFileSync } from "node:fs";
import {
  buildImportedJob,
  extractFromHtml,
  JOB_IMPORT_ERROR_REASONS,
  type JobImportUrlResponse,
  JobImportUrlResponseSchema,
  jobToWire,
  withApiResult,
} from "../src/index";

const AT = new Date("2026-10-24T09:00:00.000Z");
const page = (name: string): string =>
  readFileSync(new URL(`../../fixtures/job-pages/${name}`, import.meta.url), "utf8");

function response(
  name: string,
  url: string,
  existingJobId: string | null,
  api?: string,
): JobImportUrlResponse {
  let extraction = extractFromHtml({ url, html: page(`${name}.html`) });
  if (api !== undefined) extraction = withApiResult(extraction, JSON.parse(page(api)), url);
  const job = buildImportedJob(extraction.posting, {
    url,
    site: extraction.site,
    declaredLanguage: extraction.declaredLanguage,
    at: AT,
  });
  return JobImportUrlResponseSchema.parse({
    job: jobToWire(job),
    existingJobId,
    method: extraction.method,
    site: extraction.site?.id ?? null,
    confidence: { title: 0.95, company: 0.95 },
    warnings: [],
    model: "none",
    promptVersion: null,
    finalUrl: url,
    robots: "allowed",
  });
}

export function buildJobImportVectors(): {
  responses: JobImportUrlResponse[];
  errorReasons: readonly string[];
} {
  return {
    responses: [
      response("ashby-ramp", "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245", null),
      response(
        "kariyer-logo",
        "https://www.kariyer.net/is-ilani/logo-yazilim-san-ve-tic-a-s-yazilim-gelistirme-uzmani-4573334",
        "job-existing-1",
      ),
      response(
        "greenhouse-anthropic",
        "https://job-boards.greenhouse.io/anthropic/jobs/5456619008",
        null,
        "greenhouse-anthropic-api.json",
      ),
    ],
    errorReasons: JOB_IMPORT_ERROR_REASONS,
  };
}
