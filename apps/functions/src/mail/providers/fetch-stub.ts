// Test seam for the REST providers: a route table standing in for `fetch`, recording every
// request so tests can assert URLs, query parameters, headers and bodies. Never used at runtime.
import type { AccessTokenSource, Fetch } from "./types";

export interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  /** Objects are sent as JSON; strings and bytes as-is. */
  body?: unknown;
}

export interface StubRoute {
  /** `"<METHOD> <origin+path>"`; the query string is ignored for matching. */
  match: string | ((request: RecordedRequest) => boolean);
  /** One response per matching call, in order (the last one repeats). */
  responses: StubResponse[];
}

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string | Uint8Array | null;
}

export function fetchStub(routes: StubRoute[]): { fetch: Fetch; calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = [];
  const served = new Map<StubRoute, number>();
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const rawBody = init?.body;
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: typeof rawBody === "string" || rawBody instanceof Uint8Array ? rawBody : null,
    };
    calls.push(request);
    const key = `${request.method} ${request.url.origin}${request.url.pathname}`;
    const route = routes.find((candidate) =>
      typeof candidate.match === "string" ? candidate.match === key : candidate.match(request),
    );
    if (route === undefined) throw new Error(`fetch stub: no route for ${key}`);
    const index = served.get(route) ?? 0;
    served.set(route, index + 1);
    const response = route.responses[Math.min(index, route.responses.length - 1)] ?? {};
    const { body } = response;
    const headers = new Headers(response.headers);
    let payload: string | Uint8Array | null = null;
    if (typeof body === "string" || body instanceof Uint8Array) payload = body;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
    return new Response(payload, { status: response.status ?? 200, headers });
  };
  return { fetch: fetch as Fetch, calls };
}

/** Token source handing out `token-1`, `token-2`, … and counting invalidations. */
export function stubTokens(): AccessTokenSource & { invalidations: number } {
  let issued = 1;
  let current = "token-1";
  return {
    invalidations: 0,
    get() {
      return Promise.resolve(current);
    },
    invalidate() {
      this.invalidations += 1;
      issued += 1;
      current = `token-${issued}`;
    },
  };
}
