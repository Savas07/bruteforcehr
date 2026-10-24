import { SourceError } from "@bfhr/jobs-connectors";
import { isDeniedHost } from "../jobImport/config";
import type { Resolver } from "../net/address-guard";
import { FetchRefusedError, type Transport, safeFetch } from "../net/safe-fetch";

/** Careers pages above this are refused (same cap as URL import). */
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 20_000;
/** Statuses whose responses can't carry a body in the Fetch API. */
const NULL_BODY_STATUSES: readonly number[] = [101, 103, 204, 205, 304];

/**
 * The `fetch` of `ConnectorContext.pageHttp`: pages at user-supplied URLs (followed careers
 * pages, their robots.txt) go through `safeFetch` (https on 443, every DNS answer public, socket
 * pinned to the checked address, every redirect checked again) and the ADR 0005 `deniedHosts`
 * list on every hop. A refused URL is `SourceError("blocked")`, so the HTTP client doesn't retry it.
 */
export function guardedPageFetch(
  deniedHosts: readonly string[],
  seams: { resolve?: Resolver; transport?: Transport } = {},
): typeof fetch {
  const guarded = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    try {
      const response = await safeFetch(url, {
        method: init?.method === "POST" ? "POST" : "GET",
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        maxBytes: MAX_PAGE_BYTES,
        timeoutMs: PAGE_TIMEOUT_MS,
        maxRedirects: 5,
        checkUrl: (hop) => {
          if (isDeniedHost(hop.hostname, deniedHosts))
            throw new FetchRefusedError("denied_host", "Fetching from this website is turned off.");
        },
        ...seams,
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        // The body is already decompressed and measured.
        if (value === undefined || name === "content-encoding" || name === "content-length") continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
      }
      const result = new Response(NULL_BODY_STATUSES.includes(response.status) ? null : new Uint8Array(response.body), {
        status: response.status,
        headers,
      });
      // `Response.url` is read-only and empty for constructed responses: the final URL after redirects.
      Object.defineProperty(result, "url", { value: response.url });
      return result;
    } catch (error) {
      if (error instanceof FetchRefusedError) throw new SourceError("blocked", `page refused: ${error.refusal}`);
      throw error;
    }
  };
  return guarded as typeof fetch;
}
