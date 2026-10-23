import { setTimeout as sleep } from "node:timers/promises";
import { serverOnlyPaths } from "@bfhr/api";
import { type JobImportRobots, robotsVerdict } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import {
  decodeBody,
  FetchFailedError,
  FetchRefusedError,
  type SafeFetchOptions,
  type SafeResponse,
  safeFetch,
} from "./safe-fetch";

/** Politeness limits of ADR 0005 for scraped hosts. */
export const HOST_MIN_INTERVAL_MS = 5_000;
export const HOST_DAILY_PAGES = 200;
/** A wait longer than this fails the import (`rate_limited`) instead of holding the callable. */
const MAX_WAIT_MS = 12_000;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1_000;

/** Honest User-Agent (ADR 0005); the product token robots.txt groups are matched against. */
export const USER_AGENT_TOKEN = "BruteForceHR";
export function userAgent(version: string): string {
  return `${USER_AGENT_TOKEN}/${version} (+https://bruteforcehr.web.app/support)`;
}

export class HostBudgetError extends Error {
  constructor(readonly host: string) {
    super(`page budget for ${host} is used up`);
    this.name = "HostBudgetError";
  }
}

const hostKey = (url: URL): string => url.hostname.toLowerCase().replace(/^www\./, "");

/**
 * Reserves the next request slot for a host (shared by all users, `serverOnly/jobImport/hosts/{host}`):
 * at most one request per 5 s and 200 per UTC day. Waits for the slot when it is close.
 */
export async function reserveHostSlot(url: URL, now = Date.now()): Promise<void> {
  const host = hostKey(url);
  const ref = getFirestore().doc(serverOnlyPaths.jobImportHost(host));
  const day = new Date(now).toISOString().slice(0, 10);
  const waitMs = await getFirestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const sameDay = snapshot.get("day") === day;
    const count = sameDay ? Number(snapshot.get("count") ?? 0) : 0;
    if (count >= HOST_DAILY_PAGES) throw new HostBudgetError(host);
    const nextAllowed = Math.max(now, Number(snapshot.get("nextAllowedAtMs") ?? 0));
    const wait = nextAllowed - now;
    if (wait > MAX_WAIT_MS) throw new HostBudgetError(host);
    tx.set(
      ref,
      { host, day, count: count + 1, nextAllowedAtMs: nextAllowed + HOST_MIN_INTERVAL_MS },
      { merge: true },
    );
    return wait;
  });
  if (waitMs > 0) await sleep(waitMs);
}

/** `safeFetch` behind the host slot. */
export async function politeFetch(url: URL, options: SafeFetchOptions): Promise<SafeResponse> {
  await reserveHostSlot(url);
  return safeFetch(url, options);
}

/**
 * robots.txt verdict for the page, recorded with the import (not binding for user-shared pages,
 * ADR 0005). Cached per host for 24 h; a missing file (4xx) allows, an unreachable one is
 * `unavailable`. Not spaced by the host slot: one tiny request per host per day.
 */
export async function robotsFor(url: URL, version: string): Promise<JobImportRobots> {
  const ref = getFirestore().doc(serverOnlyPaths.jobImportHost(hostKey(url)));
  const path = `${url.pathname}${url.search}`;
  const cached = await ref.get();
  const fetchedAt = Number(cached.get("robotsFetchedAtMs") ?? 0);
  if (Date.now() - fetchedAt < ROBOTS_TTL_MS && typeof cached.get("robotsTxt") === "string") {
    return robotsVerdict(String(cached.get("robotsTxt")), USER_AGENT_TOKEN, path);
  }
  let txt: string | null;
  try {
    const response = await safeFetch(new URL("/robots.txt", url.origin), {
      maxBytes: 512 * 1024,
      timeoutMs: 4_000,
      maxRedirects: 3,
      headers: { "user-agent": userAgent(version), accept: "text/plain" },
    });
    if (response.status >= 500 || response.status === 429) return "unavailable";
    txt = response.status >= 400 ? "" : decodeBody(response.body, response.headers["content-type"]);
  } catch (error) {
    if (error instanceof FetchFailedError || error instanceof FetchRefusedError) return "unavailable";
    throw error;
  }
  await ref.set({ robotsTxt: txt.slice(0, 500_000), robotsFetchedAtMs: Date.now() }, { merge: true });
  return robotsVerdict(txt, USER_AGENT_TOKEN, path);
}
