import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { BlockedHostError, resolvePublicHost, type Resolver } from "./address-guard";

/**
 * Outbound HTTPS for user-supplied URLs (server-side request forgery guard), used by URL import
 * and followed careers pages. Every hop:
 * - is `https:` on port 443, without credentials, to a host name that is not local/internal;
 * - resolves through DNS, and **every** resolved address must be public unicast (`address-guard.ts`);
 *   the connection is then pinned to the checked address (no second lookup an attacker could rebind);
 * - passes the caller's `checkUrl` (ADR 0005 `deniedHosts`);
 * - follows at most `maxRedirects` redirects, each validated the same way.
 * Bodies are capped (compressed and decompressed), and the whole exchange has a deadline.
 */

/** Why a URL was refused before any byte was sent to it. */
export type FetchRefusal =
  | "not_https"
  | "bad_port"
  | "credentials"
  | "internal_host"
  | "private_address"
  | "dns_failed"
  | "denied_host";

export class FetchRefusedError extends Error {
  constructor(
    readonly refusal: FetchRefusal,
    message: string,
  ) {
    super(message);
    this.name = "FetchRefusedError";
  }
}

/** Network failure, timeout, oversized body or too many redirects. */
export type FetchFailure = "timeout" | "too_large" | "too_many_redirects" | "network";

export class FetchFailedError extends Error {
  constructor(
    readonly failure: FetchFailure,
    message: string,
  ) {
    super(message);
    this.name = "FetchFailedError";
  }
}

export interface ResolvedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** Validates a URL and resolves its host to a checked public address (throws `FetchRefusedError`). */
export async function resolvePublicTarget(url: URL, resolve?: Resolver): Promise<ResolvedTarget> {
  if (url.protocol !== "https:")
    throw new FetchRefusedError("not_https", "Only https pages can be imported.");
  if (url.port !== "" && url.port !== "443")
    throw new FetchRefusedError("bad_port", "Only the default https port is allowed.");
  if (url.username !== "" || url.password !== "")
    throw new FetchRefusedError("credentials", "URLs with credentials are refused.");
  try {
    const resolved = await resolvePublicHost(url.hostname, resolve === undefined ? {} : { resolve });
    return { url, address: resolved.address, family: resolved.family };
  } catch (error) {
    if (!(error instanceof BlockedHostError)) throw error;
    const message =
      error.refusal === "dns_failed"
        ? "The host name could not be resolved."
        : error.refusal === "internal_host"
          ? "That host is not a public website."
          : "That host resolves to a non-public address.";
    throw new FetchRefusedError(error.refusal, message);
  }
}

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  /** Cap for the body as received and as decompressed. */
  maxBytes: number;
  /** Deadline for the whole exchange including redirects. */
  timeoutMs: number;
  maxRedirects?: number;
  resolve?: Resolver;
  /** Called for the first URL and every redirect target; throws to refuse it (e.g. `deniedHosts`). */
  checkUrl?: (url: URL) => void;
  /** Test seam: performs one validated hop. */
  transport?: Transport;
}

export interface SafeResponse {
  status: number;
  /** Final URL after redirects. */
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface HopRequest {
  target: ResolvedTarget;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body: string | undefined;
  maxBytes: number;
  signal: AbortSignal;
}

export interface HopResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export type Transport = (hop: HopRequest) => Promise<HopResponse>;

/** One HTTPS exchange over a socket pinned to the validated address. */
function httpsTransport(hop: HopRequest): Promise<HopResponse> {
  const { promise, resolve, reject } = Promise.withResolvers<HopResponse>();
  const { target } = hop;
  const req = request(
    {
      protocol: "https:",
      host: target.url.hostname,
      servername: isIP(target.url.hostname) === 0 ? target.url.hostname : undefined,
      port: 443,
      method: hop.method,
      path: `${target.url.pathname}${target.url.search}`,
      headers: hop.headers,
      signal: hop.signal,
      // Pin the connection to the address that passed the check (Happy Eyeballs asks for `all`).
      lookup: (_hostname, options, callback) => {
        if ("all" in options && options.all === true) {
          callback(null, [{ address: target.address, family: target.family }]);
        } else {
          callback(null, target.address, target.family);
        }
      },
    },
    (response) => {
      const declared = Number(response.headers["content-length"] ?? Number.NaN);
      if (Number.isFinite(declared) && declared > hop.maxBytes) {
        response.destroy();
        reject(new FetchFailedError("too_large", "The page is too large."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > hop.maxBytes) {
          response.destroy();
          reject(new FetchFailedError("too_large", "The page is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }),
      );
      response.on("error", reject);
    },
  );
  req.on("error", reject);
  req.end(hop.body);
  return promise;
}

function decompress(body: Buffer, encoding: string | undefined, maxBytes: number): Buffer {
  const options = { maxOutputLength: maxBytes };
  try {
    switch ((encoding ?? "").trim().toLowerCase()) {
      case "gzip":
      case "x-gzip":
        return gunzipSync(body, options);
      case "br":
        return brotliDecompressSync(body, options);
      case "deflate":
        return inflateSync(body, options);
      default:
        return body;
    }
  } catch (error) {
    if (error instanceof RangeError) throw new FetchFailedError("too_large", "The page is too large.");
    throw new FetchFailedError("network", "The page could not be decoded.");
  }
}

/**
 * Fetches a user-supplied https URL under the guard described above. Throws `FetchRefusedError`
 * for URLs it will not contact and `FetchFailedError` for network trouble; HTTP error statuses are
 * returned, not thrown.
 */
export async function safeFetch(input: URL, options: SafeFetchOptions): Promise<SafeResponse> {
  const transport = options.transport ?? httpsTransport;
  const maxRedirects = options.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(options.timeoutMs);
  let url = new URL(input.href);
  let method = options.method ?? "GET";
  let body = options.body;
  for (let hop = 0; ; hop++) {
    options.checkUrl?.(url);
    const target = await resolvePublicTarget(url, options.resolve);
    let response: HopResponse;
    try {
      response = await transport({
        target,
        method,
        headers: { "accept-encoding": "gzip, br, deflate", ...options.headers },
        body,
        maxBytes: options.maxBytes,
        signal,
      });
    } catch (error) {
      if (error instanceof FetchFailedError) throw error;
      if (signal.aborted) throw new FetchFailedError("timeout", "The site took too long to answer.");
      throw new FetchFailedError("network", "The site could not be reached.");
    }
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location !== undefined) {
      if (hop >= maxRedirects)
        throw new FetchFailedError("too_many_redirects", "The page redirects too often.");
      url = new URL(location, url);
      if (response.status !== 307 && response.status !== 308) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    const encoding = response.headers["content-encoding"];
    return {
      status: response.status,
      url: url.href,
      headers: response.headers,
      body: decompress(response.body, Array.isArray(encoding) ? encoding[0] : encoding, options.maxBytes * 4),
    };
  }
}

/** Decodes an HTML/JSON body: charset from Content-Type, else `<meta charset>`, else UTF-8. */
export function decodeBody(body: Buffer, contentType: string | undefined): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1];
  const head = body.subarray(0, 2048).toString("latin1");
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const label = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(label).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
