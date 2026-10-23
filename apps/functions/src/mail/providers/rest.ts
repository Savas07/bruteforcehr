// Shared plumbing for the REST providers (Gmail API, Microsoft Graph, OAuth endpoints): bearer
// auth with one refresh-and-retry on 401, and the HTTP → mail error mapping of ./types.ts. Error
// messages carry the provider label, the status and the provider error code only: never bodies,
// subjects or addresses.
import {
  type AccessTokenSource,
  type Fetch,
  MailAuthError,
  MailScopeError,
  MailTransientError,
} from "./types";

/** Provider-specific reading of an error response. */
export interface RestErrorDialect {
  /** Machine-readable error code from the parsed JSON body (null when absent). */
  code(body: unknown): string | null;
  /** The 403 means "the token lacks a scope" (as opposed to a rate limit or a policy). */
  insufficientScope(status: number, code: string | null, headers: Headers): boolean;
  /** Rate limits reported with a status other than 429 (Gmail uses 403 `rateLimitExceeded`). */
  rateLimited(status: number, code: string | null): boolean;
}

export interface RestRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** Scope reported in `MailScopeError` when the provider says the grant is insufficient. */
  scope: string;
  /** Statuses returned to the caller as-is instead of throwing (e.g. 404 → skip). */
  pass?: readonly number[];
  /** Call-specific mapping that wins over the generic one (e.g. 410 → cursor expired). */
  mapError?: (status: number, code: string | null) => Error | null;
}

/** Seconds from a `Retry-After` header (delta-seconds or HTTP-date), null when absent/invalid. */
export function retryAfterSeconds(headers: Headers, now: number = Date.now()): number | null {
  const value = headers.get("retry-after");
  if (value === null || value.trim() === "") return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class RestClient {
  readonly #tokens: AccessTokenSource;
  readonly #fetch: Fetch;
  readonly #label: string;
  readonly #dialect: RestErrorDialect;
  readonly #retryUnauthorized: boolean;

  constructor(options: {
    tokens: AccessTokenSource;
    fetch: Fetch;
    label: string;
    dialect: RestErrorDialect;
    /** False when the token cannot be refreshed (a raw access token from the OAuth callback). */
    retryUnauthorized?: boolean;
  }) {
    this.#tokens = options.tokens;
    this.#fetch = options.fetch;
    this.#label = options.label;
    this.#dialect = options.dialect;
    this.#retryUnauthorized = options.retryUnauthorized ?? true;
  }

  /** Authorized request; throws mapped errors for every non-2xx status not listed in `pass`. */
  async request(url: string, request: RestRequest): Promise<Response> {
    let response = await this.#send(url, request, await this.#tokens.get());
    if (response.status === 401 && this.#retryUnauthorized) {
      await response.body?.cancel();
      this.#tokens.invalidate();
      response = await this.#send(url, request, await this.#tokens.get());
    }
    return this.#check(response, request);
  }

  async json<T>(url: string, request: RestRequest): Promise<T> {
    const response = await this.request(url, request);
    return (await response.json()) as T;
  }

  /** Request without `Authorization` (pre-authenticated URLs such as Graph upload sessions). */
  async unauthenticated(url: string, request: RestRequest): Promise<Response> {
    return this.#check(await this.#send(url, request, null), request);
  }

  async #send(url: string, request: RestRequest, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { ...request.headers };
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    try {
      return await this.#fetch(url, {
        method: request.method ?? "GET",
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
      });
    } catch {
      throw new MailTransientError(`${this.#label} network error`);
    }
  }

  async #check(response: Response, request: RestRequest): Promise<Response> {
    const { status } = response;
    if (response.ok || request.pass?.includes(status)) return response;
    const code = this.#dialect.code(await readJson(response));
    const mapped = request.mapError?.(status, code);
    if (mapped) throw mapped;
    throw httpError(this.#label, status, code, response.headers, this.#dialect, request.scope);
  }
}

/** The generic HTTP → mail error mapping (also used by the OAuth endpoints). */
export function httpError(
  label: string,
  status: number,
  code: string | null,
  headers: Headers,
  dialect: RestErrorDialect,
  scope: string,
): Error {
  const suffix = code === null ? "" : ` ${code}`;
  if (status === 401) return new MailAuthError(`${label} unauthorized${suffix}`);
  if (status === 429 || status >= 500 || dialect.rateLimited(status, code)) {
    return new MailTransientError(`${label} ${status}${suffix}`, retryAfterSeconds(headers));
  }
  if (status === 403 && dialect.insufficientScope(status, code, headers)) return new MailScopeError(scope);
  return new Error(`${label} ${status}${suffix}`);
}

/** Runs `task` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Query string with literal keys (Graph's `$filter` etc.) and percent-encoded values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    parts.push(`${key}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}
