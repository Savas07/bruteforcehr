import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodeBody,
  FetchFailedError,
  FetchRefusedError,
  type HopRequest,
  type HopResponse,
  isPublicAddress,
  resolvePublicTarget,
  type Resolver,
  safeFetch,
} from "./safe-fetch";

const dns =
  (table: Record<string, string[]>): Resolver =>
  async (host) => {
    const addresses = table[host];
    if (addresses === undefined) throw new Error(`ENOTFOUND ${host}`);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

const PUBLIC_DNS = dns({
  "jobs.example.com": ["93.184.216.34"],
  "evil.example.com": ["10.0.0.5"],
  "rebind.example.com": ["93.184.216.34", "127.0.0.1"],
  "v6.example.com": ["2606:2800:220:1:248:1893:25c8:1946"],
  "mapped.example.com": ["::ffff:169.254.169.254"],
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
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "2002:a00:1::",
    "ff02::1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:8.8.8.8"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("resolvePublicTarget", () => {
  const refusal = async (url: string): Promise<string> => {
    try {
      await resolvePublicTarget(new URL(url), PUBLIC_DNS);
      return "allowed";
    } catch (error) {
      if (error instanceof FetchRefusedError) return error.refusal;
      throw error;
    }
  };

  it.each([
    ["http://jobs.example.com/job/1", "not_https"],
    ["ftp://jobs.example.com/job/1", "not_https"],
    ["https://jobs.example.com:8443/job/1", "bad_port"],
    ["https://user:pw@jobs.example.com/job/1", "credentials"],
    ["https://localhost/job", "internal_host"],
    ["https://intranet/job", "internal_host"],
    ["https://metadata.google.internal/computeMetadata/v1/", "internal_host"],
    ["https://printer.local/", "internal_host"],
    ["https://127.0.0.1/", "private_address"],
    ["https://[::1]/", "private_address"],
    ["https://169.254.169.254/latest/meta-data/", "private_address"],
    ["https://evil.example.com/job", "private_address"],
    ["https://rebind.example.com/job", "private_address"],
    ["https://mapped.example.com/job", "private_address"],
    ["https://unknown.example.com/job", "dns_failed"],
    ["https://jobs.example.com/job/1", "allowed"],
    ["https://v6.example.com/job/1", "allowed"],
    ["https://93.184.216.34/job", "allowed"],
  ])("%s → %s", async (url, expected) => {
    expect(await refusal(url)).toBe(expected);
  });

  it("pins the checked address", async () => {
    const target = await resolvePublicTarget(new URL("https://jobs.example.com/x"), PUBLIC_DNS);
    expect(target).toMatchObject({ address: "93.184.216.34", family: 4 });
  });
});

describe("safeFetch", () => {
  const scripted = (responses: Record<string, HopResponse>) => {
    const hops: HopRequest[] = [];
    return {
      hops,
      transport: async (hop: HopRequest): Promise<HopResponse> => {
        hops.push(hop);
        const response = responses[hop.target.url.href];
        if (response === undefined) throw new Error(`unexpected ${hop.target.url.href}`);
        return response;
      },
    };
  };
  const html = (body: string, headers: Record<string, string> = {}): HopResponse => ({
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
    body: Buffer.from(body),
  });
  const redirect = (location: string, status = 302): HopResponse => ({
    status,
    headers: { location },
    body: Buffer.alloc(0),
  });
  const options = { maxBytes: 1_000, timeoutMs: 5_000, resolve: PUBLIC_DNS };

  it("follows public redirects and reports the final URL", async () => {
    const { transport, hops } = scripted({
      "https://jobs.example.com/short": redirect("/job/1"),
      "https://jobs.example.com/job/1": html("<h1>Job</h1>"),
    });
    const response = await safeFetch(new URL("https://jobs.example.com/short"), { ...options, transport });
    expect(response.url).toBe("https://jobs.example.com/job/1");
    expect(response.body.toString()).toBe("<h1>Job</h1>");
    expect(hops.map((hop) => hop.target.address)).toEqual(["93.184.216.34", "93.184.216.34"]);
  });

  it.each([
    ["a private host", "https://evil.example.com/admin", "private_address"],
    ["a loopback literal", "https://127.0.0.1/", "private_address"],
    ["the metadata server", "https://169.254.169.254/latest/meta-data/", "private_address"],
    ["plain http", "http://jobs.example.com/job/1", "not_https"],
  ])("refuses a redirect to %s before contacting it", async (_label, location, refusal) => {
    const { transport, hops } = scripted({ "https://jobs.example.com/job/1": redirect(location, 301) });
    await expect(
      safeFetch(new URL("https://jobs.example.com/job/1"), { ...options, transport }),
    ).rejects.toMatchObject({
      refusal,
    });
    expect(hops).toHaveLength(1);
  });

  it("stops after too many redirects", async () => {
    const { transport } = scripted({
      "https://jobs.example.com/a": redirect("/b"),
      "https://jobs.example.com/b": redirect("/a"),
    });
    await expect(
      safeFetch(new URL("https://jobs.example.com/a"), { ...options, transport, maxRedirects: 3 }),
    ).rejects.toMatchObject({
      failure: "too_many_redirects",
    });
  });

  it("caps decompressed size (gzip bomb)", async () => {
    const bomb = gzipSync(Buffer.alloc(1_000_000, 0x41));
    expect(bomb.length).toBeLessThan(2_000);
    const { transport } = scripted({
      "https://jobs.example.com/job/1": html("", { "content-encoding": "gzip" }),
    });
    const bombTransport = async (hop: HopRequest): Promise<HopResponse> => ({
      ...(await transport(hop)),
      body: bomb,
    });
    const fetching = safeFetch(new URL("https://jobs.example.com/job/1"), {
      ...options,
      maxBytes: 2_000,
      transport: bombTransport,
    });
    await expect(fetching).rejects.toBeInstanceOf(FetchFailedError);
    await expect(fetching).rejects.toMatchObject({ failure: "too_large" });
  });

  it("decodes gzip within the cap", async () => {
    const { transport } = scripted({
      "https://jobs.example.com/job/1": html("", { "content-encoding": "gzip" }),
    });
    const gz = async (hop: HopRequest): Promise<HopResponse> => ({
      ...(await transport(hop)),
      body: gzipSync(Buffer.from("<p>ok</p>")),
    });
    const response = await safeFetch(new URL("https://jobs.example.com/job/1"), {
      ...options,
      transport: gz,
    });
    expect(response.body.toString()).toBe("<p>ok</p>");
  });

  it("maps transport errors after the deadline to a timeout", async () => {
    const slow = (hop: HopRequest): Promise<HopResponse> => {
      const { promise, reject } = Promise.withResolvers<HopResponse>();
      hop.signal.addEventListener("abort", () => reject(new Error("aborted")));
      return promise;
    };
    await expect(
      safeFetch(new URL("https://jobs.example.com/job/1"), { ...options, timeoutMs: 20, transport: slow }),
    ).rejects.toMatchObject({
      failure: "timeout",
    });
  });
});

describe("decodeBody", () => {
  it("honours charset from the header, then <meta>, else UTF-8", () => {
    const turkish = Buffer.from([0xdd, 0xfe, 0x20, 0x69, 0x6c, 0x61, 0x6e, 0xfd]); // "İş ilanı" in windows-1254
    expect(decodeBody(turkish, "text/html; charset=windows-1254")).toBe("İş ilanı");
    expect(
      decodeBody(Buffer.from('<meta charset="iso-8859-1"><p>\u00fc</p>', "latin1"), undefined),
    ).toContain("ü");
    expect(decodeBody(Buffer.from("Grüße"), "text/html")).toBe("Grüße");
  });
});
