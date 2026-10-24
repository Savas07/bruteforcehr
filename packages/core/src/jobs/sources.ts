import { z } from "zod";
import { CountryCodeSchema, TimestampSchema, UrlSchema } from "../common";
import { JobSourceIdSchema } from "../job";

/** How a source is reached (docs/adr/0005-job-sources-scraping.md). */
export const JobSourceKindSchema = z.enum(["keyless", "keyed", "scrape"]);
export type JobSourceKind = z.infer<typeof JobSourceKindSchema>;

/**
 * Health of a source after its latest run.
 * - `ok`: the latest call succeeded.
 * - `degraded`: some calls failed or were rate limited; results may be incomplete.
 * - `failing`: the latest runs failed.
 * - `skipped`: not queried (see `reason`).
 */
export const JobSourceStateSchema = z.enum(["ok", "degraded", "failing", "skipped"]);
export type JobSourceState = z.infer<typeof JobSourceStateSchema>;

/** Why a source is skipped or not healthy. Source-level only: never user input (ADR 0011). */
export const JobSourceReasonSchema = z.enum([
  "no_key",
  "quota_exhausted",
  "rate_limited",
  "blocked",
  "unavailable",
  "invalid_response",
  "disabled",
]);
export type JobSourceReason = z.infer<typeof JobSourceReasonSchema>;

/** Attribution rendered on job cards and detail (Remotive: name + link; Adzuna: label ≥ 116×23 px). */
export const JobSourceAttributionSchema = z.object({
  label: z.string().min(1).max(60),
  url: UrlSchema,
  /** Minimum rendered size of the label/logo in points, when the source's terms require one. */
  minSize: z.object({ width: z.int().positive(), height: z.int().positive() }).nullable(),
});
export type JobSourceAttribution = z.infer<typeof JobSourceAttributionSchema>;

/** Market a source covers: a country code or `remote` (worldwide remote). */
export const JobMarketSchema = z.union([CountryCodeSchema, z.literal("remote")]);
export type JobMarket = z.infer<typeof JobMarketSchema>;

/**
 * `jobSources/{sourceId}` — project-wide source health, read by every signed-in user (Settings ›
 * Job sources) and written by Cloud Functions only. Keys are project secrets, so health is global.
 * `lastError` is a fixed source-level message (`sourceErrorMessage`), never request data.
 */
export const JobSourceStatusSchema = z.object({
  id: JobSourceIdSchema,
  label: z.string().min(1).max(60),
  kind: JobSourceKindSchema,
  markets: z.array(JobMarketSchema).max(60),
  state: JobSourceStateSchema,
  reason: JobSourceReasonSchema.nullable(),
  lastRunAt: TimestampSchema.nullable(),
  lastSuccessAt: TimestampSchema.nullable(),
  lastError: z.string().max(200).nullable(),
  /** Postings returned by the latest successful call. */
  lastResultCount: z.int().min(0).nullable(),
  /** Lifetime/periodic request quota (Jooble: 500 per key, lifetime). */
  quota: z.object({ used: z.int().min(0), limit: z.int().positive() }).nullable(),
  attribution: JobSourceAttributionSchema,
  updatedAt: TimestampSchema,
});
export type JobSourceStatus = z.infer<typeof JobSourceStatusSchema>;

const REASON_MESSAGES: Readonly<Record<JobSourceReason, string>> = {
  no_key: "No API key configured.",
  quota_exhausted: "The request quota for this source is used up.",
  rate_limited: "The source asked us to slow down; retrying later.",
  blocked: "The source refused automated access (bot check or block).",
  unavailable: "The source did not respond or returned a server error.",
  invalid_response: "The source returned data we could not read.",
  disabled: "Turned off by the owner.",
};

/**
 * The only text that may be stored in `jobSources/{id}.lastError`: a fixed message per reason.
 * The document is readable by every user, so queries, uids, emails and URLs never reach it.
 */
export function sourceErrorMessage(reason: JobSourceReason): string {
  return REASON_MESSAGES[reason];
}
