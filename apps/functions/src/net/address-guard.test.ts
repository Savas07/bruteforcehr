import { describe, expect, it } from "vitest";
import {
  BlockedHostError,
  isPublicAddress,
  MailPortError,
  resolveMailServer,
  resolvePublicHost,
  type Resolver,
} from "./address-guard";

const dns =
  (table: Record<string, string[]>): Resolver =>
  async (host) => {
    const addresses = table[host];
    if (addresses === undefined) throw new Error(`ENOTFOUND ${host}`);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

const DNS = dns({
  "imap.example.com": ["93.184.216.34"],
  "internal.example.com": ["10.0.0.5"],
  "rebind.example.com": ["93.184.216.34", "127.0.0.1"],
  "mapped.example.com": ["::ffff:169.254.169.254"],
  "v6.example.com": ["2606:2800:220:1:248:1893:25c8:1946"],
});

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::7f00:1",
    "fe80::1",
    "fec0::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "64:ff9b::a00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:db8::1",
    "2002:a00:1::",
    "3fff::1",
    // IPv4-mapped, dotted and hex forms, judged by the IPv4 part.
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "::FFFF:a9fe:a9fe",
    "0:0:0:0:0:ffff:7f00:1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1",
    "2606:2800:220:1:248:1893:25c8:1946",
    "2a00:1450:4001:80b::200e",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe("resolvePublicHost", () => {
  const refusal = async (host: string): Promise<string> => {
    try {
      const resolved = await resolvePublicHost(host, { resolve: DNS });
      return resolved.address;
    } catch (error) {
      if (error instanceof BlockedHostError) return error.refusal;
      throw error;
    }
  };

  it.each([
    ["imap.example.com", "93.184.216.34"],
    ["imap.example.com.", "93.184.216.34"],
    ["v6.example.com", "2606:2800:220:1:248:1893:25c8:1946"],
    ["8.8.8.8", "8.8.8.8"],
    ["[2a00:1450:4001:80b::200e]", "2a00:1450:4001:80b::200e"],
    ["127.0.0.1", "private_address"],
    ["169.254.169.254", "private_address"],
    ["::1", "private_address"],
    ["[::ffff:10.1.2.3]", "private_address"],
    ["internal.example.com", "private_address"],
    ["rebind.example.com", "private_address"],
    ["mapped.example.com", "private_address"],
    ["localhost", "internal_host"],
    ["metadata.google.internal", "internal_host"],
    ["mailserver", "internal_host"],
    ["unknown.example.com", "dns_failed"],
  ])("%s → %s", async (host, expected) => {
    expect(await refusal(host)).toBe(expected);
  });

  it("keeps the name for TLS", async () => {
    expect(await resolvePublicHost("imap.example.com", { resolve: DNS })).toEqual({
      address: "93.184.216.34",
      family: 4,
      servername: "imap.example.com",
    });
  });
});

describe("resolveMailServer", () => {
  it.each([
    ["imap", 993, "tls"],
    ["imap", 143, "starttls"],
    ["smtp", 465, "tls"],
    ["smtp", 587, "starttls"],
  ] as const)("allows %s on %i with %s", async (kind, port, security) => {
    await expect(
      resolveMailServer(kind, { host: "imap.example.com", port, security }, { resolve: DNS }),
    ).resolves.toMatchObject({ address: "93.184.216.34" });
  });

  it.each([
    ["imap", 143, "tls"],
    ["imap", 993, "starttls"],
    ["imap", 22, "tls"],
    ["imap", 587, "starttls"],
    ["smtp", 25, "starttls"],
    ["smtp", 587, "tls"],
    ["smtp", 993, "tls"],
    ["smtp", 6379, "starttls"],
  ] as const)("refuses %s on %i with %s before resolving", async (kind, port, security) => {
    const resolve: Resolver = async () => {
      throw new Error("must not resolve");
    };
    await expect(
      resolveMailServer(kind, { host: "imap.example.com", port, security }, { resolve }),
    ).rejects.toBeInstanceOf(MailPortError);
  });

  it("refuses an allowed port on a private host", async () => {
    await expect(
      resolveMailServer(
        "imap",
        { host: "internal.example.com", port: 993, security: "tls" },
        { resolve: DNS },
      ),
    ).rejects.toMatchObject({ refusal: "private_address" });
  });
});
