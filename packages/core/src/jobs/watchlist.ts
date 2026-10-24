import { z } from "zod";
import { IdSchema, TimestampSchema } from "../common";
import { JobSourceIdSchema } from "../job";
import { httpUrlParts } from "./normalize";

/**
 * Resolution state of a followed company.
 * - `pending`: added or edited; the server has not resolved the careers URL yet.
 * - `ok`: postings were fetched from the detected board.
 * - `not_found`: no supported job board or JSON-LD postings at this address.
 * - `error`: the board did not answer (retried on the next run).
 */
export const WatchedCompanyStatusSchema = z.enum(["pending", "ok", "not_found", "error"]);
export type WatchedCompanyStatus = z.infer<typeof WatchedCompanyStatusSchema>;

/** Longest careers URL a client may store (mirrored by firestore.rules). */
export const WATCHLIST_CAREERS_URL_MAX_LENGTH = 2048;

/**
 * A followed company's careers page. The server fetches it, so only https is accepted (the rules
 * check `^https://` and the length; the fetch guard checks host, port and addresses).
 */
export const CareersUrlSchema = z.url({ protocol: /^https$/ }).max(WATCHLIST_CAREERS_URL_MAX_LENGTH);

/**
 * `users/{uid}/watchlist/{id}` — "Companies you follow" (PRD M4-JOB-2). The user enters a careers
 * URL; the server detects the ATS (`detectAtsBoard`) and fetches its postings on every saved-search
 * run. Clients write only `WATCHLIST_CLIENT_FIELDS`; resolution fields are server-written.
 */
export const WatchedCompanySchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  careersUrl: CareersUrlSchema,
  enabled: z.boolean(),
  /** Detected board type: an ATS source slug, or `web` for a careers page with JSON-LD postings. */
  ats: JobSourceIdSchema.nullable(),
  /** Board token / company slug within the ATS. */
  boardToken: z.string().min(1).max(200).nullable(),
  companyDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    .nullable(),
  status: WatchedCompanyStatusSchema,
  /** Fixed message for `not_found`/`error`; never echoes page content. */
  lastError: z.string().max(200).nullable(),
  openJobs: z.int().min(0).nullable(),
  lastFetchedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type WatchedCompany = z.infer<typeof WatchedCompanySchema>;

/**
 * Fields a client may change on update (mirrored by firestore.rules). On create the client also
 * sets `createdAt` and `WATCHLIST_PENDING_FIELDS`; everything else is server-written.
 */
export const WATCHLIST_CLIENT_FIELDS = ["name", "careersUrl", "enabled", "updatedAt"] as const;

/** Server-written fields; a client create sets them to `WATCHLIST_PENDING_FIELDS`. */
export const WATCHLIST_PENDING_FIELDS = {
  ats: null,
  boardToken: null,
  companyDomain: null,
  status: "pending",
  lastError: null,
  openJobs: null,
  lastFetchedAt: null,
} as const satisfies Partial<WatchedCompany>;

/** ATS boards with a keyless public postings API (docs/adr/0005-job-sources-scraping.md). */
export const ATS_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
  "personio",
] as const;
export type AtsSource = (typeof ATS_SOURCES)[number];

export interface AtsBoard {
  ats: AtsSource;
  boardToken: string;
  /** Lever and Greenhouse host EU boards on separate API hosts. */
  region: "us" | "eu";
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/**
 * The ATS board behind a careers URL, from its host and first path segment, or null for any other
 * page (then the server looks for schema.org `JobPosting` JSON-LD on it).
 */
export function detectAtsBoard(url: string): AtsBoard | null {
  const parsed = httpUrlParts(url);
  if (parsed === null) return null;
  const host = parsed.host.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter((part) => part !== "");
  // boards-api.greenhouse.io/v1/boards/{token}/jobs
  const first = (segments[0] === "v1" && segments[1] === "boards" ? segments[2] : segments[0]) ?? "";
  const sub = host.split(".")[0] ?? "";
  const board = (ats: AtsSource, token: string, region: "us" | "eu" = "us"): AtsBoard | null =>
    TOKEN.test(token) ? { ats, boardToken: token, region } : null;

  switch (host) {
    case "boards.greenhouse.io":
    case "job-boards.greenhouse.io":
    case "boards-api.greenhouse.io":
      return board("greenhouse", parsed.query["for"] ?? first);
    case "boards.eu.greenhouse.io":
    case "job-boards.eu.greenhouse.io":
      return board("greenhouse", parsed.query["for"] ?? first, "eu");
    case "jobs.lever.co":
      return board("lever", first);
    case "jobs.eu.lever.co":
      return board("lever", first, "eu");
    case "jobs.ashbyhq.com":
      return board("ashby", first);
    case "careers.smartrecruiters.com":
    case "jobs.smartrecruiters.com":
      return board("smartrecruiters", first);
    case "apply.workable.com":
      return board("workable", first);
  }
  if (host.endsWith(".workable.com") && host.split(".").length === 3 && sub !== "www" && sub !== "apply") {
    return board("workable", sub);
  }
  if (host.endsWith(".recruitee.com") && host.split(".").length === 3) return board("recruitee", sub);
  if (/^[a-z0-9-]+\.jobs\.personio\.(de|com)$/.test(host)) return board("personio", sub);
  return null;
}
