import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

/**
 * Outbound HTTPS for user-supplied URLs (server-side request forgery guard). Every hop:
 * - is `https:` on port 443, without credentials, to a host name that is not local/internal;
 * - resolves through DNS, and **every** resolved address must be public unicast; the connection
 *   is then pinned to the checked address (no second lookup an attacker could rebind);
 * - follows at most `maxRedirects` redirects, each validated the same way.
 * Bodies are capped (compressed and decompressed), and the whole exchange has a deadline.
 */

/** Why a URL was refused before any byte was sent to it. */
export type FetchRefusal =
  "not_https" | "bad_port" | "credentials" | "internal_host" | "private_address" | "dns_failed";

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

/** Non-public IPv4/IPv6 ranges (IANA special-purpose registries). */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

/** True for a public unicast address; IPv4-mapped IPv6 is judged by its IPv4 part. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !BLOCKED.check(address, "ipv4");
  if (family !== 6) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return !BLOCKED.check(mapped[1], "ipv4");
  if (/^::ffff:/i.test(address)) return false;
  return !BLOCKED.check(address, "ipv6");
}

const INTERNAL_HOST =
  /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|arpa)$|^metadata(\.|$)/i;

export interface ResolvedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

const systemResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Validates a URL and resolves its host to a checked public address (throws `FetchRefusedError`). */
export async function resolvePublicTarget(
  url: URL,
  resolve: Resolver = systemResolver,
): Promise<ResolvedTarget> {
  if (url.protocol !== "https:")
    throw new FetchRefusedError("not_https", "Only https pages can be imported.");
  if (url.port !== "" && url.port !== "443")
    throw new FetchRefusedError("bad_port", "Only the default https port is allowed.");
  if (url.username !== "" || url.password !== "")
    throw new FetchRefusedError("credentials", "URLs with credentials are refused.");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const literal = isIP(host);
  if (literal !== 0) {
    if (!isPublicAddress(host)) throw new FetchRefusedError("private_address", "That address is not public.");
    return { url, address: host, family: literal as 4 | 6 };
  }
  if (!host.includes(".") || INTERNAL_HOST.test(host)) {
    throw new FetchRefusedError("internal_host", "That host is not a public website.");
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new FetchRefusedError("dns_failed", "The host name could not be resolved.");
  }
  const first = addresses[0];
  if (first === undefined) throw new FetchRefusedError("dns_failed", "The host name could not be resolved.");
  // All answers must be public: a mix is how DNS rebinding sneaks an internal address in.
  if (!addresses.every((entry) => isPublicAddress(entry.address))) {
    throw new FetchRefusedError("private_address", "That host resolves to a non-public address.");
  }
  return { url, address: first.address, family: first.family === 6 ? 6 : 4 };
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
