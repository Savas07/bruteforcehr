import { z } from "zod";
import { IdSchema } from "../common";
import { JobSourceIdSchema, SavedSearchFiltersSchema } from "../job";
import { JobSourceReasonSchema } from "./sources";

/**
 * Callable contracts of the Jobs backend (docs/adr/0011-embeddings-matching.md). Every callable
 * writes `users/{uid}/jobs` + `jobMatches` server-side; clients render by listening to `jobMatches`.
 */

/** `details.reason` of a Jobs callable error, so clients pick the right copy. */
export const JobsErrorReasonSchema = z.enum([
  "email_unverified",
  "invalid_request",
  /** Per-user rate limit or daily search budget reached (`resource-exhausted`). */
  "search_rate_limited",
  "saved_search_not_found",
  /** Every source was skipped or failed; nothing could be searched. */
  "no_sources",
]);
export type JobsErrorReason = z.infer<typeof JobsErrorReasonSchema>;

/** `jobsSearch` request: an on-demand search with the saved-search filter model. */
export const JobsSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  filters: SavedSearchFiltersSchema,
  /** Most matches to return ids for (default 30). */
  limit: z.int().min(1).max(50).optional(),
});
export type JobsSearchRequest = z.infer<typeof JobsSearchRequestSchema>;

/** Outcome of one source in a run (also aggregated into `jobSources/{id}`). */
export const SourceRunReportSchema = z.object({
  source: JobSourceIdSchema,
  status: z.enum(["ok", "skipped", "error"]),
  reason: JobSourceReasonSchema.nullable(),
  /** Postings this source returned (before dedupe and filters). */
  count: z.int().min(0),
});
export type SourceRunReport = z.infer<typeof SourceRunReportSchema>;

export const JobsSearchResponseSchema = z.object({
  /** Matched job ids (= jobMatches ids), best score first, at most `limit`. */
  jobIds: z.array(IdSchema).max(50),
  counts: z.object({
    /** Postings returned by all sources. */
    found: z.int().min(0),
    /** New `jobs` documents. */
    created: z.int().min(0),
    /** Existing jobs merged with a new listing or seen again. */
    updated: z.int().min(0),
    /** `jobMatches` written. */
    matched: z.int().min(0),
  }),
  sources: z.array(SourceRunReportSchema).max(60),
});
export type JobsSearchResponse = z.infer<typeof JobsSearchResponseSchema>;

export const SavedSearchRunNowRequestSchema = z.object({ savedSearchId: IdSchema });
export type SavedSearchRunNowRequest = z.infer<typeof SavedSearchRunNowRequestSchema>;

/** `savedSearchRunNow` returns the same shape as `jobsSearch` (`JobsSearchResponseSchema`). */
export type SavedSearchRunResponse = JobsSearchResponse;

/**
 * `jobMatchesRefresh`: re-score the given jobs (or the newest 200 when omitted) against the current
 * profile and default CV. Missing matches are created; the user's `state` is never changed.
 */
export const JobMatchesRefreshRequestSchema = z.object({
  jobIds: z.array(IdSchema).min(1).max(200).optional(),
});
export type JobMatchesRefreshRequest = z.infer<typeof JobMatchesRefreshRequestSchema>;

export const JobMatchesRefreshResponseSchema = z.object({ matched: z.int().min(0) });
export type JobMatchesRefreshResponse = z.infer<typeof JobMatchesRefreshResponseSchema>;
