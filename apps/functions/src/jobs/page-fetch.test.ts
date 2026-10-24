import { BOARD_CONNECTORS, HttpClient, SourceError } from "@bfhr/jobs-connectors";
import { describe, expect, it } from "vitest";
import type { Resolver } from "../net/address-guard";
import type { HopRequest, HopResponse } from "../net/safe-fetch";
import { guardedPageFetch } from "./page-fetch";

const resolve: Resolver = async (host) => {
  const table: Record<string, string[]> = {
    "careers.acme.example": ["93.184.216.34"],
    "jobs.acme.example": ["93.184.216.35"],
    "rebind.example": ["93.184.216.36", "10.0.0.7"],
    "denied.example": ["93.184.216.37"],
  };
  const addresses = table[host];
  if (addresses === undefined) throw new Error(`ENOTFOUND ${host}`);
  return addresses.map((address) => ({ address, family: 4 }));
};

const POSTING_PAGE = `<html><script type="application/ld+json">${JSON.stringify({
  "@type": "JobPosting",
  title: "Backend Engineer",
  url: "/jobs/1",
  hiringOrganization: { name: "Acme" },
})}</script></html>`;

/** Scripted hops by URL; records every hop that reached the network. */
function scripted(responses: Record<string, HopResponse>) {
  const hops: HopRequest[] = [];
  const transport = async (hop: HopRequest): Promise<HopResponse> => {
    hops.push(hop);
    const response = responses[hop.target.url.href];
    if (response === undefined) return { status: 404, headers: {}, body: Buffer.alloc(0) };
    return response;
  };
  return { hops, transport };
}

const page = (body: string): HopResponse => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: Buffer.from(body),
});
const redirect = (location: string): HopResponse => ({
  status: 302,
  headers: { location },
  body: Buffer.alloc(0),
});

function client(fetch: typeof globalThis.fetch) {
  return new HttpClient({
    userAgent: "BruteForceHR/test",
    fetch,
    sleep: async () => undefined,
    maxRetries: 0,
  });
}

describe("guardedPageFetch", () => {
  it("returns the page with the final URL after checked redirects", async () => {
    const { hops, transport } = scripted({
      "https://careers.acme.example/": redirect("https://jobs.acme.example/open"),
      "https://jobs.acme.example/open": page(POSTING_PAGE),
    });
    const response = await guardedPageFetch([], { resolve, transport })("https://careers.acme.example/");
    expect(response.status).toBe(200);
    expect(response.url).toBe("https://jobs.acme.example/open");
    expect(await response.text()).toBe(POSTING_PAGE);
    // Each hop is pinned to the address that passed the check.
    expect(hops.map((hop) => hop.target.address)).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it.each([
    ["plain http", "http://careers.acme.example/", {}],
    ["another port", "https://careers.acme.example:8443/", {}],
    ["the metadata server", "https://169.254.169.254/computeMetadata/v1/", {}],
    ["an IPv4-mapped private literal", "https://[::ffff:10.0.0.1]/", {}],
    ["a name with a private answer", "https://rebind.example/", {}],
    ["a denied host", "https://denied.example/careers", {}],
    [
      "a redirect to a private address",
      "https://careers.acme.example/",
      { "https://careers.acme.example/": redirect("https://127.0.0.1:6379/") },
    ],
    [
      "a redirect to a denied host",
      "https://careers.acme.example/",
      { "https://careers.acme.example/": redirect("https://www.denied.example/") },
    ],
  ])(
    "refuses %s as blocked without contacting it",
    async (_label, url, responses: Record<string, HopResponse>) => {
      const { hops, transport } = scripted(responses);
      const refusal = await guardedPageFetch(["denied.example"], { resolve, transport })(url).catch(
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(SourceError);
      expect(refusal).toMatchObject({ reason: "blocked" });
      expect(hops.length).toBeLessThanOrEqual(1);
      expect(hops.every((hop) => hop.target.url.href === url)).toBe(true);
    },
  );

  it("is what the careers page connector reads followed pages through", async () => {
    const careersPage = BOARD_CONNECTORS.find((connector) => connector.ats === "web");
    if (careersPage === undefined) throw new Error("no careers page connector");
    const { transport } = scripted({ "https://careers.acme.example/": page(POSTING_PAGE) });
    const pageHttp = client(guardedPageFetch([], { resolve, transport }));
    const unused = client(async () => {
      throw new Error("the API client must not fetch user URLs");
    });
    const context = {
      http: unused,
      pageHttp,
      cache: { get: async () => null, put: async () => undefined },
      secrets: {},
      now: new Date(),
    };
    const listings = await careersPage.list(
      { boardToken: "https://careers.acme.example/", region: "us" },
      context,
    );
    expect(listings.map((listing) => [listing.title, listing.url])).toEqual([
      ["Backend Engineer", "https://careers.acme.example/jobs/1"],
    ]);
    await expect(
      careersPage.list({ boardToken: "https://169.254.169.254/latest/meta-data/", region: "us" }, context),
    ).rejects.toMatchObject({ reason: "blocked" });
  });
});
