import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { mailEndpointAllowed, type MailEndpoint } from "@bfhr/core";

/**
 * The one address guard for every outbound connection to a user-chosen host (HTTPS pages in
 * `safe-fetch.ts`, IMAP/SMTP servers in `mail/providers/imap.ts`). The functions run inside Google
 * Cloud, so a host that resolves to a private, loopback, link-local (metadata server
 * 169.254.169.254), shared, documentation, translation or multicast address is refused before any
 * connection. Callers connect to the checked address (the name is kept for TLS), which closes the
 * DNS-rebinding window between check and connect.
 */

/** Non-public IPv4 ranges (IANA IPv4 Special-Purpose Address Registry, plus multicast/reserved). */
const BLOCKED_V4 = new BlockList();
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
  BLOCKED_V4.addSubnet(network, prefix, "ipv4");
}

/**
 * Non-public IPv6 ranges (IANA IPv6 Special-Purpose Address Registry, plus ULA, link/site-local,
 * multicast and the deprecated IPv4-compatible block). Kept in a separate list from IPv4: BlockList
 * checks IPv4 addresses against IPv6 rules in their mapped form, so mixing them would let an IPv6
 * rule decide IPv4 hosts. IPv4-mapped addresses (`::ffff:a.b.c.d`) are judged explicitly by their
 * IPv4 part in `isPublicAddress`.
 */
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, "ipv6");
}

/** `::ffff:a.b.c.d` or `::ffff:XXXX:XXXX` → the embedded IPv4 address. */
function mappedIpv4(address: string): string | null {
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address);
  if (dotted?.[1] !== undefined) return dotted[1];
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/iu.exec(address);
  if (hex?.[1] === undefined || hex[2] === undefined) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** True for a public unicast address; IPv4-mapped IPv6 is judged by its IPv4 part. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !BLOCKED_V4.check(address, "ipv4");
  if (family !== 6) return false;
  const mapped = mappedIpv4(address);
  if (mapped !== null) return isIP(mapped) === 4 && !BLOCKED_V4.check(mapped, "ipv4");
  return !BLOCKED_V6.check(address, "ipv6");
}

const INTERNAL_HOST =
  /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|arpa)$|^metadata(\.|$)/iu;

/** A single-label or internal-looking host name (`localhost`, `*.internal`, `metadata`, …). */
export function isInternalHostName(host: string): boolean {
  return !host.includes(".") || INTERNAL_HOST.test(host);
}

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;

export const systemResolver: Resolver = (host) => dnsLookup(host, { all: true, verbatim: true });

/** Why a host was refused. */
export type HostRefusal = "internal_host" | "private_address" | "dns_failed";

export class BlockedHostError extends Error {
  constructor(
    readonly host: string,
    readonly refusal: HostRefusal,
  ) {
    super(
      refusal === "dns_failed"
        ? "host name could not be resolved"
        : refusal === "internal_host"
          ? "host is not a public name"
          : "host resolves to a non-public address",
    );
    this.name = "BlockedHostError";
  }
}

export interface ResolvedHost {
  /** Address to connect to. */
  address: string;
  family: 4 | 6;
  /** Name for TLS SNI and certificate checks. */
  servername: string;
}

/**
 * Resolves `host` (a name or an IP literal, brackets and a trailing dot allowed) and returns an
 * address to connect to. Every DNS answer must be public: a mix is how rebinding sneaks an
 * internal address in. Throws `BlockedHostError`.
 */
export async function resolvePublicHost(
  input: string,
  options: { resolve?: Resolver; allowPrivate?: boolean } = {},
): Promise<ResolvedHost> {
  const host = input.replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  const literal = isIP(host);
  if (literal !== 0) {
    if (options.allowPrivate !== true && !isPublicAddress(host))
      throw new BlockedHostError(host, "private_address");
    return { address: host, family: literal === 6 ? 6 : 4, servername: host };
  }
  if (options.allowPrivate !== true && isInternalHostName(host))
    throw new BlockedHostError(host, "internal_host");
  let addresses: { address: string; family: number }[];
  try {
    addresses = await (options.resolve ?? systemResolver)(host);
  } catch {
    throw new BlockedHostError(host, "dns_failed");
  }
  const first = addresses[0];
  if (first === undefined) throw new BlockedHostError(host, "dns_failed");
  if (options.allowPrivate !== true && !addresses.every((entry) => isPublicAddress(entry.address)))
    throw new BlockedHostError(host, "private_address");
  return { address: first.address, family: first.family === 6 ? 6 : 4, servername: host };
}

/** An IMAP or SMTP endpoint outside `MAIL_ENDPOINT_PORTS` (@bfhr/core). */
export class MailPortError extends Error {
  constructor(readonly kind: "imap" | "smtp") {
    super(`${kind} port/security pair is not allowed`);
    this.name = "MailPortError";
  }
}

/**
 * Checks a user-chosen mail server: an allowed port/security pair, then a public address
 * (`allowPrivate` only for in-process test servers, which also use other ports).
 */
export async function resolveMailServer(
  kind: "imap" | "smtp",
  endpoint: MailEndpoint,
  options: { resolve?: Resolver; allowPrivate?: boolean } = {},
): Promise<ResolvedHost> {
  if (options.allowPrivate !== true && !mailEndpointAllowed(kind, endpoint)) throw new MailPortError(kind);
  return resolvePublicHost(endpoint.host, options);
}
