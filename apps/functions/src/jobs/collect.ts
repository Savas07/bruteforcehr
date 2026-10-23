import { type JobSourceReason, passesSearchFilters, type SourceRunReport } from "@bfhr/core";
import {
  type BoardConnector,
  type ConnectorContext,
  type Listing,
  type SearchConnector,
  type SearchQuery,
  SourceError,
  toJobDraft,
  matchesQuery,
} from "@bfhr/jobs-connectors";
import type { JobDraft } from "./store";

/** A followed company's board, to read alongside the search sources (saved searches only). */
export interface WatchedBoard {
  ats: string;
  boardToken: string;
  region: "us" | "eu";
}

/** Per-source time limit: one slow source never holds up the run. */
export const SOURCE_TIMEOUT_MS = 45_000;
/** Listings without a usable description are completed via `fetchDetail`, at most this many per run. */
export const DETAIL_FETCHES_PER_RUN = 10;

export interface CollectGate {
  /** Shared call budget of the source (Remotive 4/day, Jooble lifetime quota). */
  admitSource(connector: SearchConnector): Promise<boolean>;
  /** Per-user connector-call budget; returns how many of `wanted` calls may run. */
  grantCalls(wanted: number): Promise<number>;
}

export interface CollectInput {
  query: SearchQuery;
  mode: "adhoc" | "saved";
  connectors: readonly SearchConnector[];
  boards: readonly BoardConnector[];
  watched: readonly WatchedBoard[];
  context: ConnectorContext;
  gate: CollectGate;
}

export interface CollectResult {
  drafts: JobDraft[];
  reports: SourceRunReport[];
  /** Postings returned by all sources, before filters and dedupe. */
  found: number;
}

function reasonOf(error: unknown): JobSourceReason {
  return error instanceof SourceError ? error.reason : "unavailable";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceError("unavailable", "source timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Which search sources take part and why the others are skipped. */
export function selectConnectors(input: Pick<CollectInput, "query" | "mode" | "connectors" | "context">): {
  run: SearchConnector[];
  skipped: SourceRunReport[];
} {
  const run: SearchConnector[] = [];
  const skipped: SourceRunReport[] = [];
  const wanted = input.query.filters.sources;
  for (const connector of input.connectors) {
    if (wanted.length > 0 && !wanted.includes(connector.id)) continue;
    if (!connector.covers(input.query)) continue;
    if (input.mode === "adhoc" && !connector.adHoc) continue;
    if (connector.secrets.some((name) => (input.context.secrets[name] ?? null) === null)) {
      skipped.push({ source: connector.id, status: "skipped", reason: "no_key", count: 0 });
      continue;
    }
    run.push(connector);
  }
  return { run, skipped };
}

/**
 * Runs every applicable source (and, for saved searches, the followed companies' boards) in
 * parallel, normalizes listings into job drafts and applies the search filters. Failures become
 * per-source reports; one failing source never fails the run.
 */
export async function collectListings(input: CollectInput): Promise<CollectResult> {
  const { query, context } = input;
  const { run, skipped } = selectConnectors(input);
  const reports: SourceRunReport[] = [...skipped];
  const boardsByAts = new Map(input.boards.map((board) => [board.ats, board] as const));
  const watched = input.mode === "saved" ? input.watched.filter((board) => boardsByAts.has(board.ats)) : [];
  const granted = await input.gate.grantCalls(run.length + watched.length);
  const tasks: { id: string; detail: SearchConnector | BoardConnector; promise: () => Promise<Listing[]> }[] =
    [];
  for (const connector of run) {
    tasks.push({
      id: connector.id,
      detail: connector,
      promise: async () => {
        if (!(await input.gate.admitSource(connector)))
          throw new SourceError("quota_exhausted", "call budget used up");
        return connector.search(query, context);
      },
    });
  }
  for (const board of watched) {
    const connector = boardsByAts.get(board.ats);
    if (connector === undefined) continue;
    tasks.push({
      id: connector.id,
      detail: connector,
      promise: async () =>
        (await connector.list(board, context)).filter((listing) => matchesQuery(listing, query)),
    });
  }

  const results = await Promise.all(
    tasks.map(async (task, index) => {
      if (index >= granted) {
        return {
          task,
          listings: [] as Listing[],
          error: new SourceError("rate_limited", "daily source budget used up"),
        };
      }
      try {
        return { task, listings: await withTimeout(task.promise(), SOURCE_TIMEOUT_MS), error: null };
      } catch (error) {
        return { task, listings: [] as Listing[], error };
      }
    }),
  );

  // One report per source id (several watched boards may share an ATS).
  const bySource = new Map<string, SourceRunReport>();
  let found = 0;
  const listings: { listing: Listing; connector: SearchConnector | BoardConnector }[] = [];
  for (const { task, listings: list, error } of results) {
    found += list.length;
    const previous = bySource.get(task.id);
    const report: SourceRunReport =
      error === null
        ? { source: task.id, status: "ok", reason: null, count: (previous?.count ?? 0) + list.length }
        : previous?.status === "ok"
          ? previous
          : { source: task.id, status: "error", reason: reasonOf(error), count: 0 };
    bySource.set(task.id, report);
    for (const listing of list) listings.push({ listing, connector: task.detail });
  }
  reports.push(...bySource.values());

  let detailBudget = DETAIL_FETCHES_PER_RUN;
  const drafts: JobDraft[] = [];
  for (const { listing, connector } of listings) {
    let complete = listing;
    if (connector.fetchDetail !== undefined && listing.description.length < 200 && detailBudget > 0) {
      detailBudget--;
      try {
        complete = await withTimeout(connector.fetchDetail(listing, context), SOURCE_TIMEOUT_MS);
      } catch {
        // Keep the short listing; the description stays as the source gave it.
      }
    }
    const draft = toJobDraft(complete, context.now);
    if (draft !== null && passesSearchFilters({ id: "draft", ...draft }, query.filters, context.now))
      drafts.push(draft);
  }
  return { drafts, reports, found };
}
