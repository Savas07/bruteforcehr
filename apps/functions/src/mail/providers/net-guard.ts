import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * IMAP/SMTP hosts come from the user, and the functions run inside Google Cloud: a host that
 * resolves to a private, loopback, link-local (metadata server 169.254.169.254) or other
 * non-public address is refused before any connection, so the connect form can't be used to
 * probe internal services. The resolved address is returned and used for the connection (with
 * the name kept for TLS), which closes the DNS-rebinding window between check and connect.
 */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  BLOCKED.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  BLOCKED.addSubnet(network, prefix, "ipv6");

export class BlockedHostError extends Error {
  constructor(readonly host: string) {
    super("host resolves to a non-public address");
    this.name = "BlockedHostError";
  }
}

export interface ResolvedHost {
  /** Address to connect to. */
  address: string;
  /** Name for TLS SNI and certificate checks. */
  servername: string;
}

/** Resolves `host` and refuses non-public addresses (`allowPrivate` only for in-process tests). */
export async function resolvePublicHost(host: string, allowPrivate = false): Promise<ResolvedHost> {
  const addresses = isIP(host) === 0 ? await lookup(host, { all: true, verbatim: true }) : [{ address: host, family: isIP(host) }];
  const first = addresses[0];
  if (first === undefined) throw new BlockedHostError(host);
  if (!allowPrivate) {
    for (const { address, family } of addresses) {
      if (BLOCKED.check(address, family === 6 ? "ipv6" : "ipv4")) throw new BlockedHostError(host);
    }
  }
  return { address: first.address, servername: host };
}
