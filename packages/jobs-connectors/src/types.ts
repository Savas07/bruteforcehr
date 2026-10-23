import type {
  AtsBoard,
  EmploymentType,
  JobMarket,
  JobSourceAttribution,
  JobSourceKind,
  JobSourceReason,
  SalaryRange,
  SavedSearchFilters,
} from "@bfhr/core";
import type { HttpClient } from "./http";

/** A source failure with a source-level reason (never request data; see `sourceErrorMessage`). */
export class SourceError extends Error {
  constructor(
    readonly reason: JobSourceReason,
    message: string,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

/**
 * One posting as a connector read it, before normalization (`toJobDraft`). Connectors map their
 * API fields here and leave inference (skills, language, remote type, seniority) to the shared code.
 */
export interface Listing {
  source: string;
  /** Id within the source; null only when the source has none (then the URL identifies it). */
  sourceId: string | null;
  url: string;
  applyUrl?: string | null;
  applyEmail?: string | null;
  isDirectFromEmployer: boolean;
  title: string;
  company: string;
  companyDomain?: string | null;
  /** Location wordings as published ("Berlin, Germany", "Remote - EU"). */
  locations: readonly string[];
  /** Explicit remote flag from the source, when it has one. */
  remote?: boolean | null;
  remoteEligibility?: string | null;
  employmentType?: EmploymentType | null;
  salary?: SalaryRange | null;
  /** Posting body as HTML or plain text. */
  description: string;
  postedAt?: Date | null;
  /** Application deadline published by the source. */
  deadline?: Date | null;
  /** Source tags/categories; skills are extracted from them too. */
  tags?: readonly string[];
  visaSponsorship?: boolean | null;
  /** Posting language when the source states it. */
  language?: string | null;
}

/** Cache for whole-feed responses shared across users (Cloud Storage in production). */
export interface FeedCache {
  /** The cached body when younger than `maxAgeMs`, else null. */
  get(key: string, maxAgeMs: number): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
}

/** Secrets of keyed sources (`null` = not configured → `skipped: no_key`). */
export type ConnectorSecrets = Readonly<Record<string, string | null>>;

export interface ConnectorContext {
  http: HttpClient;
  cache: FeedCache;
  secrets: ConnectorSecrets;
  now: Date;
}

/** What a search asks every source for. */
export interface SearchQuery {
  /** Free-text keywords ("backend engineer typescript"). */
  query: string;
  filters: SavedSearchFilters;
  /** Most listings a single source should return. */
  limit: number;
}
interface ConnectorInfo {
  id: string;
  label: string;
  kind: JobSourceKind;
  markets: readonly JobMarket[];
  attribution: JobSourceAttribution;
  /**
   * Completes a listing whose search result lacks the full description (detail page or endpoint).
   * Absent when search results are already complete. Called only for listings that pass filters.
   */
  fetchDetail?(listing: Listing, context: ConnectorContext): Promise<Listing>;
}

/** A job board / API searched by keyword (ADR 0005: `search`, `fetch`, rate limit, attribution). */
export interface SearchConnector extends ConnectorInfo {
  /** Secret names this source needs; any missing → skipped with `no_key`. */
  secrets: readonly string[];
  /** Whether on-demand `jobsSearch` may call it (Jooble's lifetime quota: saved searches only). */
  adHoc: boolean;
  /** Fixed per-day call budget across all users (Remotive: ≤ 4/day), enforced by the runner. */
  maxCallsPerDay: number | null;
  /** Whether this source can answer the search at all (market coverage, filters). */
  covers(query: SearchQuery): boolean;
  search(query: SearchQuery, context: ConnectorContext): Promise<Listing[]>;
}

/** An ATS board read for a followed company (`users/{uid}/watchlist`). */
export interface BoardConnector extends ConnectorInfo {
  ats: string;
  list(board: Pick<AtsBoard, "boardToken" | "region">, context: ConnectorContext): Promise<Listing[]>;
}
