import { readFileSync } from "node:fs";
import path from "node:path";
import { groundJobExtraction, type JobExtractResult } from "@bfhr/ai";
import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { type FetchRequest, type ImportDependencies, importPosting, JobImportError } from "./import-posting";
import { FetchRefusedError, type SafeResponse } from "./safe-fetch";

// Recorded pages from packages/fixtures/job-pages (see scripts/record-job-page.ts there).
const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../../../../packages/fixtures/job-pages", name), "utf8");

const NOW = new Date("2026-10-24T09:00:00.000Z");

type Route = { status?: number; body: string; contentType?: string; finalUrl?: string };

function dependencies(routes: Record<string, Route>, overrides: Partial<ImportDependencies> = {}) {
  const requests: { url: string; request: FetchRequest }[] = [];
  const deps: ImportDependencies = {
    config: { deniedHosts: [], restrictedSitesEnabled: true },
    now: NOW,
    robots: async () => "allowed",
    aiEnabled: async () => true,
    aiExtract: async () => {
      throw new Error("AI not expected");
    },
    fetch: async (url, request): Promise<SafeResponse> => {
      requests.push({ url: url.href, request });
      const route = routes[url.href];
      if (route === undefined) throw new Error(`unexpected fetch ${url.href}`);
      return {
        status: route.status ?? 200,
        url: route.finalUrl ?? url.href,
        headers: { "content-type": route.contentType ?? "text/html; charset=utf-8" },
        body: Buffer.from(route.body),
      };
    },
    ...overrides,
  };
  return { deps, requests };
}

const reason = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof JobImportError) return error.reason;
    throw error;
  }
};

describe("importPosting", () => {
  it("LinkedIn share text → canonical URL, JSON-LD draft, job board source", async () => {
    const url = "https://www.linkedin.com/jobs/view/4470036822";
    const { deps, requests } = dependencies({ [url]: { body: fixture("linkedin-adobe.html") } });
    const result = await importPosting(
      "Check this out https://www.linkedin.com/jobs/view/2027-university-graduate-software-engineer-at-adobe-4470036822/?trk=public_jobs",
      deps,
    );
    expect(requests.map((request) => request.url)).toEqual([url]);
    expect(result).toMatchObject({
      method: "json_ld",
      site: "linkedin",
      model: "none",
      finalUrl: url,
      robots: "allowed",
    });
    expect(JobSchema.parse({ ...result.draft, id: "x" }).company).toBe("Adobe");
    expect(result.draft.sources[0]).toMatchObject({ source: "url_import", url, isDirectFromEmployer: false });
    expect(result.confidence.title).toBe(0.95);
  });

  it("Greenhouse page without JSON-LD → public board API", async () => {
    const url = "https://job-boards.greenhouse.io/anthropic/jobs/5456619008";
    const api = "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5456619008?content=true";
    const { deps, requests } = dependencies({
      [url]: { body: fixture("greenhouse-anthropic.html") },
      [api]: { body: fixture("greenhouse-anthropic-api.json"), contentType: "application/json" },
    });
    const result = await importPosting(url, deps);
    expect(requests[1]?.request.accept).toBe("application/json");
    expect(result).toMatchObject({ method: "site", site: "greenhouse" });
    expect(result.draft).toMatchObject({ title: "3P Revenue Accounting & Reporting", company: "Anthropic" });
    expect(result.draft.sources[0]?.isDirectFromEmployer).toBe(true);
  });

  it("career page without a company → grounded AI fallback fills it", async () => {
    const url = "https://ultralytics.jobs.personio.com/job/1874062";
    let pageText = "";
    const aiExtract = async (_url: string, text: string): Promise<JobExtractResult> => {
      pageText = text;
      const grounded = groundJobExtraction(
        {
          isJobPosting: true,
          title: "Senior Software Engineer",
          company: "Ultralytics",
          locations: [],
          workplace: null,
          employmentType: null,
          salary: null,
          datePosted: null,
          validThrough: null,
          applyEmail: null,
          descriptionStart: null,
          descriptionEnd: null,
        },
        text,
      );
      return {
        ...grounded,
        model: "claude-haiku-5-5",
        promptVersion: "job-extract@1",
        metered: {} as JobExtractResult["metered"],
      };
    };
    const { deps } = dependencies({ [url]: { body: fixture("personio-ultralytics.html") } }, { aiExtract });
    const result = await importPosting(url, deps);
    expect(pageText).toContain("Ultralytics");
    expect(result).toMatchObject({ method: "ai", model: "claude-haiku-5-5", promptVersion: "job-extract@1" });
    expect(result.draft).toMatchObject({
      title: "Senior Software Engineer",
      company: "Ultralytics",
      companyDomain: null,
    });
    // Structured fields keep their own confidence; the AI-filled company gets the grounded one.
    expect(result.confidence.title).toBe(0.95);
    expect(result.confidence.company).toBe(0.9);
    // The JSON-LD description is longer than none: it stays.
    expect(result.draft.description).toMatch(/^Your mission/);
  });

  it("AI turned off → ai_disabled instead of a model call", async () => {
    const url = "https://ultralytics.jobs.personio.com/job/1874062";
    const { deps } = dependencies(
      { [url]: { body: fixture("personio-ultralytics.html") } },
      { aiEnabled: async () => false },
    );
    expect(await reason(importPosting(url, deps))).toBe("ai_disabled");
  });

  it.each([
    ["stepstone-blocked.html", 403],
    ["indeed-blocked.html", 401],
    ["glassdoor-blocked.html", 403],
    ["sap-cloudflare.html", 403],
    ["personio-vercel.html", 429],
  ])("%s → blocked_by_site (no CAPTCHA solving, no retry)", async (name, status) => {
    const url = "https://www.example-board.com/job/123";
    const { deps, requests } = dependencies({ [url]: { body: fixture(name), status } });
    expect(await reason(importPosting(url, deps))).toBe("blocked_by_site");
    expect(requests).toHaveLength(1);
  });

  it("redirect to a login page → blocked_by_site", async () => {
    const url = "https://www.linkedin.com/jobs/view/4470036822";
    const { deps } = dependencies({
      [url]: {
        body: "<html><body>Sign in</body></html>",
        finalUrl: "https://www.linkedin.com/authwall?sessionRedirect=x",
      },
    });
    expect(await reason(importPosting(url, deps))).toBe("blocked_by_site");
  });

  it.each([
    [404, "not_found"],
    [410, "not_found"],
    [503, "fetch_failed"],
    [429, "fetch_failed"],
  ])("HTTP %i → %s", async (status, expected) => {
    const url = "https://careers.example.com/job/1";
    const { deps } = dependencies({ [url]: { body: "<html><body><h1>Oops</h1></body></html>", status } });
    expect(await reason(importPosting(url, deps))).toBe(expected);
  });

  it("PDF → not_html", async () => {
    const url = "https://careers.example.com/job.pdf";
    const { deps } = dependencies({ [url]: { body: "%PDF-1.7", contentType: "application/pdf" } });
    expect(await reason(importPosting(url, deps))).toBe("not_html");
  });

  it("refused addresses (SSRF guard) → blocked_url", async () => {
    const { deps } = dependencies(
      {},
      {
        fetch: async () => {
          throw new FetchRefusedError("private_address", "private");
        },
      },
    );
    expect(await reason(importPosting("https://internal.example.com/job", deps))).toBe("blocked_url");
  });

  it("owner denylist and restricted-site switch → blocked_url without fetching", async () => {
    const denied = dependencies(
      {},
      { config: { deniedHosts: ["example.com"], restrictedSitesEnabled: true } },
    );
    expect(await reason(importPosting("https://jobs.example.com/1", denied.deps))).toBe("blocked_url");
    const restricted = dependencies({}, { config: { deniedHosts: [], restrictedSitesEnabled: false } });
    expect(
      await reason(importPosting("https://www.linkedin.com/jobs/view/4470036822", restricted.deps)),
    ).toBe("blocked_url");
    expect(denied.requests).toHaveLength(0);
    expect(restricted.requests).toHaveLength(0);
  });

  it("garbage input → invalid_url; tiny page → no_job_found", async () => {
    expect(await reason(importPosting("hello there", dependencies({}).deps))).toBe("invalid_url");
    const url = "https://careers.example.com/job/1";
    const { deps } = dependencies({ [url]: { body: "<html><body><p>Hi</p></body></html>" } });
    expect(await reason(importPosting(url, deps))).toBe("no_job_found");
  });
});
