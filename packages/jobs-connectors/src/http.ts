import { setTimeout as delay } from "node:timers/promises";
import { isAllowedByRobots, parseRobots, type RobotsRules } from "./robots";
import { SourceError } from "./types";

/** Honest User-Agent (ADR 0005). */
export function userAgent(version: string): string {
  return `BruteForceHR/${version} (+https://bruteforcehr.web.app/support)`;
}

/** Product token matched against robots.txt groups. */
export const ROBOTS_AGENT = "BruteForceHR";

export interface HttpResponse {
  status: number;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  headers?: Readonly<Record<string, string>>;
  body?: string;
  /**
   * robots.txt handling (ADR 0005): `binding` refuses disallowed paths (crawling search pages),
   * `record` fetches and records the verdict without refusing (user-shared/watchlisted pages),
   * `none` for APIs.
   */
  robots?: "binding" | "record" | "none";
  /** Minimum spacing between requests to this host (default: 1 s for APIs, 5 s with robots). */
  minIntervalMs?: number;
  /** Status codes the caller handles itself instead of an error (e.g. 404 = board not found). */
  acceptStatus?: readonly number[];
}

/** A robots.txt verdict recorded for a host (stored server-side, shown in the source's detail). */
export interface RobotsRecord {
  host: string;
  allowed: boolean;
  checkedAt: Date;
}

export interface HttpClientOptions {
  userAgent: string;
  fetch?: typeof fetch;
  /** Waits; injected so tests never sleep. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
  timeoutMs?: number;
  /** Largest Retry-After honoured before giving up with `rate_limited`. */
  maxRetryAfterMs?: number;
  onRobots?: (record: RobotsRecord) => void;
}

/** Markers that only appear on bot-challenge interstitials (any status). */
const CHALLENGE_PAGE_MARKERS = [
  /cf-chl|challenge-platform|cf_chl_opt/i,
  /Attention Required! \| Cloudflare/i,
  /<title>Just a moment\.\.\.<\/title>/i,
  /px-captcha|perimeterx/i,
  /are you a robot|unusual traffic from your|verify you are human/i,
];

/**
 * Markers that mean a block only on an error/interstitial status: real job pages may embed a
 * CAPTCHA widget on their application form or mention one in a script.
 */
const BLOCK_STATUS_MARKERS = [/captcha/i, /datadome/i, /Access Denied.{0,200}Reference #/is];

/** A bot challenge or CAPTCHA page. Seeing one stops the fetch: we never solve them (ADR 0005). */
export function isBotChallenge(response: Pick<HttpResponse, "status" | "body" | "headers">): boolean {
  if (response.headers["cf-mitigated"] === "challenge") return true;
  if (![200, 202, 403, 429, 503].includes(response.status)) return false;
  // Challenge interstitials are small; a full page that merely mentions a marker is not one.
  if (response.body.length > 200_000) return false;
  const sample = response.body.slice(0, 20_000);
  if (CHALLENGE_PAGE_MARKERS.some((marker) => marker.test(sample))) return true;
  return response.status !== 200 && BLOCK_STATUS_MARKERS.some((marker) => marker.test(sample));
}

/** Parses `Retry-After` (seconds or HTTP date) into milliseconds from `now`. */
export function retryAfterMs(value: string | undefined, now: number): number | null {
  if (value === undefined || value.trim() === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const RETRYABLE: readonly number[] = [429, 500, 502, 503, 504];

/**
 * Polite HTTP for connectors: honest UA, per-host spacing, exponential back-off on 429/5xx
 * honouring Retry-After, timeouts, robots.txt (binding or recorded), and bot-challenge detection
 * that stops instead of solving. No cookies, proxies or fingerprint tricks (ADR 0005).
 */
export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly nextAllowedAt = new Map<string, number>();
  private readonly robots = new Map<string, Promise<RobotsRules | null>>();

  constructor(private readonly options: HttpClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => delay(ms));
    this.now = options.now ?? Date.now;
  }

  async getJson(url: string, options: HttpRequestOptions = {}): Promise<unknown> {
    const response = await this.request(url, {
      ...options,
      headers: { Accept: "application/json", ...options.headers },
    });
    return parseJson(response.body);
  }

  async postJson(url: string, body: unknown, options: HttpRequestOptions = {}): Promise<unknown> {
    const response = await this.request(url, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
      headers: { Accept: "application/json", "Content-Type": "application/json", ...options.headers },
    });
    return parseJson(response.body);
  }

  async getText(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    return this.request(url, options);
  }

  async request(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const target = new URL(url);
    const robotsMode = options.robots ?? "none";
    if (robotsMode !== "none") {
      const allowed = await this.robotsAllows(target);
      this.options.onRobots?.({ host: target.host, allowed, checkedAt: new Date(this.now()) });
      if (!allowed && robotsMode === "binding")
        throw new SourceError("blocked", "robots.txt disallows this path");
    }
    const minInterval = options.minIntervalMs ?? (robotsMode === "none" ? 1_000 : 5_000);
    const maxRetries = this.options.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      await this.waitForHost(target.host, minInterval);
      let response: HttpResponse;
      try {
        response = await this.once(url, options);
      } catch (error) {
        if (error instanceof SourceError) throw error;
        if (attempt >= maxRetries) throw new SourceError("unavailable", "network error");
        await this.sleep(backoff(attempt));
        continue;
      }
      if (isBotChallenge(response)) throw new SourceError("blocked", "bot challenge");
      if (response.status >= 200 && response.status < 300) return response;
      if (options.acceptStatus?.includes(response.status)) return response;
      if (RETRYABLE.includes(response.status) && attempt < maxRetries) {
        const wait = retryAfterMs(response.headers["retry-after"], this.now()) ?? backoff(attempt);
        if (wait > (this.options.maxRetryAfterMs ?? 60_000)) {
          throw new SourceError("rate_limited", `retry after ${Math.round(wait / 1000)} s`);
        }
        await this.sleep(wait);
        continue;
      }
      if (response.status === 429) throw new SourceError("rate_limited", "HTTP 429");
      if (response.status === 401 || response.status === 403)
        throw new SourceError("blocked", `HTTP ${response.status}`);
      if (response.status >= 500) throw new SourceError("unavailable", `HTTP ${response.status}`);
      throw new SourceError("invalid_response", `HTTP ${response.status}`);
    }
  }

  private async once(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 20_000);
    try {
      const response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers: { "User-Agent": this.options.userAgent, ...options.headers },
        ...(options.body === undefined ? {} : { body: options.body }),
        redirect: "follow",
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: response.status, url: response.url || url, headers, body: await response.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  private async waitForHost(host: string, minIntervalMs: number): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextAllowedAt.get(host) ?? 0);
    this.nextAllowedAt.set(host, at + minIntervalMs);
    if (at > now) await this.sleep(at - now);
  }

  private async robotsAllows(target: URL): Promise<boolean> {
    let rules = this.robots.get(target.origin);
    if (rules === undefined) {
      rules = this.once(`${target.origin}/robots.txt`, {})
        .then((response) =>
          response.status >= 200 && response.status < 300 ? parseRobots(response.body) : null,
        )
        .catch(() => null);
      this.robots.set(target.origin, rules);
    }
    const parsed = await rules;
    // No robots.txt (404) or unreachable: nothing is disallowed.
    return parsed === null || isAllowedByRobots(parsed, ROBOTS_AGENT, `${target.pathname}${target.search}`);
  }
}

function backoff(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** attempt);
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new SourceError("invalid_response", "response is not JSON");
  }
}
