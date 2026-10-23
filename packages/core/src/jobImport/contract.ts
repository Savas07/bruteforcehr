import { z } from "zod";
import { JobSchema, JobSourceLinkSchema, type Job, jobSourceKey } from "../job";

/**
 * Contract of the `jobImportUrl` callable (docs/adr/0005-job-sources-scraping.md, "URL import"):
 * the server fetches one posting the user shared, extracts it and returns a draft for the user to
 * confirm. It never writes the job; the client creates it (or updates the existing duplicate).
 */
export const JobImportUrlRequestSchema = z.object({
  /** The page the user shared or pasted. Only `https` is fetched. */
  url: z.string().trim().min(1).max(2048),
  /** Skip the 24 h result cache and fetch the page again. */
  refresh: z.boolean().optional(),
});
export type JobImportUrlRequest = z.infer<typeof JobImportUrlRequestSchema>;

/** Where the fields came from, most reliable first. */
export const JobImportMethodSchema = z.enum(["json_ld", "microdata", "site", "ai"]);
export type JobImportMethod = z.infer<typeof JobImportMethodSchema>;

/** robots.txt verdict for the shared page, recorded but not binding for user-shared pages (ADR 0005). */
export const JobImportRobotsSchema = z.enum(["allowed", "disallowed", "unavailable"]);
export type JobImportRobots = z.infer<typeof JobImportRobotsSchema>;

/** Callables send JSON, so domain `Date`s travel as ISO-8601 strings. */
const IsoTimestampSchema = z.iso.datetime({ offset: true });

const JobSourceLinkWireSchema = z.object({
  ...JobSourceLinkSchema.shape,
  postedAt: IsoTimestampSchema.nullable(),
  firstSeenAt: IsoTimestampSchema,
  lastSeenAt: IsoTimestampSchema,
});

const { id: _id, ...jobShapeWithoutId } = JobSchema.shape;

const sourceKeysMatch = (
  job: { sources: Parameters<typeof jobSourceKey>[0][]; sourceKeys: string[] },
  ctx: z.RefinementCtx,
): void => {
  const expected = job.sources.map(jobSourceKey);
  if (expected.length !== job.sourceKeys.length || expected.some((key, i) => job.sourceKeys[i] !== key)) {
    ctx.addIssue({
      code: "custom",
      message: "sourceKeys must equal sources.map(jobSourceKey)",
      path: ["sourceKeys"],
    });
  }
};

/** A `jobs` document without its id, as written by the client (domain `Date`s). */
export const JobDraftSchema = z.object(jobShapeWithoutId).superRefine(sourceKeysMatch);
export type JobDraft = Omit<Job, "id">;

/** `JobDraft` on the wire: every timestamp is an ISO-8601 string. */
export const JobWireSchema = z
  .object({
    ...jobShapeWithoutId,
    sources: z.array(JobSourceLinkWireSchema).min(1).max(20),
    postedAt: IsoTimestampSchema.nullable(),
    expiresAt: IsoTimestampSchema.nullable(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .superRefine(sourceKeysMatch);
export type JobWire = z.infer<typeof JobWireSchema>;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());
const date = (value: string | null): Date | null => (value === null ? null : new Date(value));

export function jobToWire(job: JobDraft): JobWire {
  return {
    ...job,
    sources: job.sources.map((source) => ({
      ...source,
      postedAt: iso(source.postedAt),
      firstSeenAt: source.firstSeenAt.toISOString(),
      lastSeenAt: source.lastSeenAt.toISOString(),
    })),
    postedAt: iso(job.postedAt),
    expiresAt: iso(job.expiresAt),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** The job document to write, from a `jobImportUrl` response (validated). */
export function jobFromWire(wire: JobWire): JobDraft {
  const parsed = JobWireSchema.parse(wire);
  return JobDraftSchema.parse({
    ...parsed,
    sources: parsed.sources.map((source) => ({
      ...source,
      postedAt: date(source.postedAt),
      firstSeenAt: new Date(source.firstSeenAt),
      lastSeenAt: new Date(source.lastSeenAt),
    })),
    postedAt: date(parsed.postedAt),
    expiresAt: date(parsed.expiresAt),
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
  });
}

export const JobImportUrlResponseSchema = z.object({
  /**
   * The document to write. `existingJobId === null`: a new job (client `create`). Otherwise the
   * existing job with this listing merged in (client `update` of that document).
   */
  job: JobWireSchema,
  existingJobId: z.string().min(1).nullable(),
  method: JobImportMethodSchema,
  /** Site adapter that produced or completed the fields (`linkedin`, `greenhouse`, …), if any. */
  site: z.string().min(1).max(40).nullable(),
  /** 0..1 per top-level job field the import filled (`title`, `company`, `locations`, …). */
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  /** Codes such as `dropped_ungrounded:salary` or `description_truncated`. */
  warnings: z.array(z.string()),
  /** Model id, or `none` when no model ran. */
  model: z.string().min(1),
  promptVersion: z.string().min(1).nullable(),
  /** Page address after redirects (canonical when the page names one). */
  finalUrl: z.string().url(),
  robots: JobImportRobotsSchema,
});
export type JobImportUrlResponse = z.infer<typeof JobImportUrlResponseSchema>;

/** `details.reason` of every `jobImportUrl` error; clients pick copy by reason. */
export const JOB_IMPORT_ERROR_REASONS = [
  "email_unverified",
  /** Not a web address. */
  "invalid_url",
  /** Not https, a private/reserved address, or a host the owner denied. */
  "blocked_url",
  /** 404/410: the posting is gone. */
  "not_found",
  /** Login wall, CAPTCHA, bot challenge or 401/403: offer "paste the description". */
  "blocked_by_site",
  /** Network error, timeout or 5xx. */
  "fetch_failed",
  "too_large",
  /** Not an HTML page (PDF, image, …). */
  "not_html",
  /** No posting found and the AI fallback is off or found nothing either. */
  "no_job_found",
  "ai_disabled",
  "daily_cap",
  "ai_unavailable",
  /** The host's daily page budget (ADR 0005) is used up. */
  "rate_limited",
] as const;
export const JobImportErrorReasonSchema = z.enum(JOB_IMPORT_ERROR_REASONS);
export type JobImportErrorReason = z.infer<typeof JobImportErrorReasonSchema>;
