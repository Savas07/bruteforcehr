import { createHash } from "node:crypto";
import { extractJobPosting } from "@bfhr/ai";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  type JobImportErrorReason,
  type JobImportUrlResponse,
  JobImportUrlRequestSchema,
  JobImportUrlResponseSchema,
  jobFromWire,
  jobToWire,
  mergeJobListing,
} from "@bfhr/core";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import type { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "firebase-functions/v2/https";
import { ReasonedHttpsError, verifiedUid } from "../callable";
import { ANTHROPIC_API_KEY, aiProvider, toCallableError } from "../ai/common";
import { firestoreUsageLedger } from "../ai/usage-ledger";
import { findDuplicateJob } from "../jobs/store";
import {
  type ImportedPosting,
  importPosting,
  type JobImportConfig,
  JobImportError,
  MAX_PAGE_BYTES,
  PAGE_TIMEOUT_MS,
} from "./import-posting";
import { HostBudgetError, politeFetch, robotsFor, userAgent } from "./politeness";
import { z } from "zod";

/** Results are reused for a day unless the user asks to refresh (ADR 0005: one fetch per page per 24 h). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

class JobImportCallableError extends ReasonedHttpsError<JobImportErrorReason> {}

const ERROR_CODES: Readonly<Record<JobImportErrorReason, ConstructorParameters<typeof HttpsError>[0]>> = {
  email_unverified: "permission-denied",
  invalid_url: "invalid-argument",
  blocked_url: "permission-denied",
  not_found: "not-found",
  blocked_by_site: "failed-precondition",
  fetch_failed: "unavailable",
  too_large: "failed-precondition",
  not_html: "failed-precondition",
  no_job_found: "not-found",
  ai_disabled: "failed-precondition",
  daily_cap: "resource-exhausted",
  ai_unavailable: "unavailable",
  rate_limited: "resource-exhausted",
};

async function loadConfig(): Promise<JobImportConfig> {
  const snapshot = await getFirestore().doc(serverOnlyPaths.jobImportConfig()).get();
  const denied = snapshot.get("deniedHosts");
  return {
    deniedHosts: Array.isArray(denied)
      ? denied.filter((host): host is string => typeof host === "string")
      : [],
    restrictedSitesEnabled: snapshot.get("restrictedSitesEnabled") !== false,
  };
}

/** Cached import result (wire form), `serverOnly/jobImport/users/{uid}/jobImportPages/{sha256(url)}`. */
const CachedImportSchema = z.object({
  response: JobImportUrlResponseSchema.omit({ existingJobId: true }),
  expireAt: z.instanceof(Timestamp),
});
type CachedImport = z.infer<typeof CachedImportSchema>;

/**
 * `jobImportUrl({ url, refresh? })`: reads one job posting the user shared or pasted and returns
 * the document to write after the user confirms it (docs/adr/0005-job-sources-scraping.md "URL
 * import"). When the user already has the job (same link or same fingerprint), the response is
 * that job with this listing merged in, and `existingJobId` names it.
 */
export const jobImportUrl = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90, memory: "512MiB" },
  async (request): Promise<JobImportUrlResponse> => {
    const started = Date.now();
    const now = new Date();
    let outcome: string = "ok";
    let imported: ImportedPosting | null = null;
    let cached = false;
    try {
      const uid = verifiedUid(request);
      const parsed = JobImportUrlRequestSchema.safeParse(request.data);
      if (!parsed.success) throw new JobImportError("invalid_url", "Expected { url }.");

      const cacheRef = getFirestore().doc(
        serverOnlyPaths.jobImportPage(
          uid,
          createHash("sha256").update(parsed.data.url.trim()).digest("hex").slice(0, 40),
        ),
      );
      let base: Omit<JobImportUrlResponse, "existingJobId"> | null = null;
      if (parsed.data.refresh !== true) {
        const snapshot = await cacheRef.get();
        // An entry written by an older schema simply misses.
        const entry = CachedImportSchema.safeParse(snapshot.data());
        if (entry.success && entry.data.expireAt.toMillis() > now.getTime()) {
          base = entry.data.response;
          cached = true;
        }
      }
      if (base === null) {
        const config = await loadConfig();
        const ua = userAgent(__BFHR_VERSION__);
        imported = await importPosting(parsed.data.url, {
          config,
          now,
          fetch: (url, fetchRequest) =>
            politeFetch(url, {
              maxBytes: MAX_PAGE_BYTES,
              timeoutMs: PAGE_TIMEOUT_MS,
              method: fetchRequest.method ?? "GET",
              ...(fetchRequest.body === undefined ? {} : { body: fetchRequest.body }),
              headers: {
                "user-agent": ua,
                accept: fetchRequest.accept,
                "accept-language": "en,de;q=0.8,tr;q=0.7,*;q=0.5",
                ...(fetchRequest.body === undefined ? {} : { "content-type": "application/json" }),
              },
            }),
          robots: (url) => robotsFor(url, __BFHR_VERSION__),
          aiEnabled: async () =>
            (await getFirestore().doc(firestorePaths.user(uid)).get()).get("aiEnabled") !== false,
          aiExtract: (url, text) =>
            extractJobPosting(url, text, { provider: aiProvider(), ledger: firestoreUsageLedger(uid) }),
        });
        base = {
          job: jobToWire(imported.draft),
          method: imported.method,
          site: imported.site,
          confidence: imported.confidence,
          warnings: imported.warnings,
          model: imported.model,
          promptVersion: imported.promptVersion,
          finalUrl: imported.finalUrl,
          robots: imported.robots,
        };
        await cacheRef.set({
          response: base,
          expireAt: Timestamp.fromMillis(now.getTime() + CACHE_TTL_MS),
        } satisfies CachedImport);
      }

      const draft = jobFromWire(base.job);
      // Same lookup as the connectors (source key, then fingerprint / description similarity).
      const existing = await findDuplicateJob(getFirestore(), uid, draft);
      const response: JobImportUrlResponse =
        existing === null
          ? { ...base, existingJobId: null }
          : (() => {
              const { id, ...merged } = mergeJobListing(
                existing,
                { ...draft, createdAt: now, updatedAt: now },
                now,
              );
              return { ...base, job: jobToWire(merged), existingJobId: id };
            })();
      return JobImportUrlResponseSchema.parse(response);
    } catch (error) {
      const mapped = mapError(error);
      outcome = mapped.reason;
      throw mapped.error;
    } finally {
      // One PII-free line per import: host, method, outcome, counts; never page text or the uid.
      logger.info("job_import", {
        outcome,
        cached,
        site: imported?.site ?? null,
        method: imported?.method ?? null,
        robots: imported?.robots ?? null,
        warnings: imported?.warnings.length ?? 0,
        descriptionChars: imported?.draft.description.length ?? 0,
        model: imported?.model ?? null,
        costMicroUsd: imported?.ai?.metered.costMicroUsd ?? 0,
        latencyMs: Date.now() - started,
      });
    }
  },
);

function mapError(error: unknown): { error: HttpsError; reason: string } {
  if (error instanceof JobImportError) {
    return {
      error: new JobImportCallableError(ERROR_CODES[error.reason], error.reason, error.message),
      reason: error.reason,
    };
  }
  if (error instanceof HostBudgetError) {
    return {
      error: new JobImportCallableError(
        "resource-exhausted",
        "rate_limited",
        "We've read enough pages from this website for now. Please try again later.",
      ),
      reason: "rate_limited",
    };
  }
  // Auth, daily cap and AI provider failures share the AI callables' mapping and copy.
  const mapped = toCallableError(error);
  return { error: mapped.error, reason: mapped.outcome };
}
