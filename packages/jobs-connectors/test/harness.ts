import { readFileSync } from "node:fs";
import { HttpClient } from "../src/http";
import type { ConnectorContext, ConnectorSecrets, FeedCache } from "../src/types";

/** A recorded HTTP exchange: the response a URL gets in tests (no live calls in unit tests). */
export interface Recorded {
  /** Matched against the full request URL: exact string, or a RegExp. */
  url: string | RegExp;
  method?: "GET" | "POST";
  status?: number;
  headers?: Record<string, string>;
  /** File under test/fixtures, or an inline body. */
  fixture?: string;
  body?: string;
}

export interface FakeFetch {
  fetch: typeof fetch;
  /** Every request made, in order. */
  calls: { url: string; method: string; headers: Record<string, string>; body: string | null }[];
}

export function fixture(path: string): string {
  return readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
}

/** A `fetch` that answers only recorded URLs and fails the test on anything else. */
export function fakeFetch(recorded: readonly Recorded[]): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, method, headers, body: typeof init?.body === "string" ? init.body : null });
    const hit = recorded.find(
      (entry) =>
        (entry.method ?? "GET") === method &&
        (typeof entry.url === "string" ? entry.url === url : entry.url.test(url)),
    );
    if (hit === undefined) {
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      throw new Error(`Unrecorded request: ${method} ${url}`);
    }
    const body = hit.fixture === undefined ? (hit.body ?? "") : fixture(hit.fixture);
    return new Response(body, { status: hit.status ?? 200, headers: hit.headers ?? {} });
  };
  return { fetch: impl as typeof fetch, calls };
}

/** In-memory feed cache. */
export function memoryCache(): FeedCache & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async get(key) {
      return entries.get(key) ?? null;
    },
    async put(key, body) {
      entries.set(key, body);
    },
  };
}

export const NOW = new Date("2026-10-24T08:00:00.000Z");

/** Connector context over recorded responses; sleeps are skipped and recorded. */
export function testContext(
  recorded: readonly Recorded[],
  secrets: ConnectorSecrets = {},
): ConnectorContext & { fake: FakeFetch; sleeps: number[] } {
  const fake = fakeFetch(recorded);
  const sleeps: number[] = [];
  let clock = NOW.getTime();
  const http = new HttpClient({
    userAgent: "BruteForceHR/test (+https://bruteforcehr.web.app/support)",
    fetch: fake.fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  // Unit tests record responses; the server's guarded page fetch is tested in apps/functions.
  return { http, pageHttp: http, cache: memoryCache(), secrets, now: NOW, fake, sleeps };
}
