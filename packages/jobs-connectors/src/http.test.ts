import { describe, expect, it } from "vitest";
import { testContext } from "../test/harness";
import { HttpClient, isBotChallenge, retryAfterMs, userAgent } from "./http";
import { isAllowedByRobots, parseRobots } from "./robots";
import { SourceError } from "./types";

const API = "https://api.example.com/jobs";

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SourceError) return error.reason;
    throw error;
  }
  return "ok";
}

describe("HttpClient", () => {
  it("sends the honest User-Agent and spaces requests per host", async () => {
    const context = testContext([{ url: API, body: "{}" }]);
    await context.http.getJson(API);
    await context.http.getJson(API);
    expect(context.fake.calls[0]?.headers["user-agent"]).toBe(
      "BruteForceHR/test (+https://bruteforcehr.web.app/support)",
    );
    expect(context.sleeps).toEqual([1_000]);
    expect(userAgent("1.2.3")).toBe("BruteForceHR/1.2.3 (+https://bruteforcehr.web.app/support)");
  });

  it("retries 503 with exponential back-off, then succeeds", async () => {
    let calls = 0;
    const context = testContext([]);
    let clock = 0;
    const http = new HttpClient({
      userAgent: "BruteForceHR/test",
      now: () => clock,
      sleep: async (ms) => {
        context.sleeps.push(ms);
        clock += ms;
      },
      fetch: (async () => {
        calls++;
        return calls < 3 ? new Response("busy", { status: 503 }) : new Response('{"ok":true}');
      }) as typeof fetch,
    });
    expect(await http.getJson(API)).toEqual({ ok: true });
    // Back-off waits (1 s, 2 s) also satisfy the per-host spacing, so no extra waits appear.
    expect(context.sleeps).toEqual([1_000, 2_000]);
  });

  it("honours Retry-After and gives up on long waits", async () => {
    const short = testContext([{ url: API, status: 429, headers: { "retry-after": "2" }, body: "" }]);
    expect(await reason(short.http.getJson(API))).toBe("rate_limited");
    expect(short.sleeps).toContain(2_000);
    const long = testContext([{ url: API, status: 429, headers: { "retry-after": "3600" }, body: "" }]);
    expect(await reason(long.http.getJson(API))).toBe("rate_limited");
    expect(long.fake.calls).toHaveLength(1);
  });

  it("maps status codes to source reasons", async () => {
    expect(await reason(testContext([{ url: API, status: 401 }]).http.getJson(API))).toBe("blocked");
    expect(await reason(testContext([{ url: API, status: 400 }]).http.getJson(API))).toBe("invalid_response");
    expect(await reason(testContext([{ url: API, body: "<html>" }]).http.getJson(API))).toBe(
      "invalid_response",
    );
    const accepted = await testContext([{ url: API, status: 404, body: "nope" }]).http.request(API, {
      acceptStatus: [404],
    });
    expect(accepted.status).toBe(404);
  });

  it("stops at bot challenges and CAPTCHAs instead of solving them", async () => {
    const page = "<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>";
    const context = testContext([{ url: "https://board.example/jobs", status: 403, body: page }]);
    expect(await reason(context.http.getText("https://board.example/jobs"))).toBe("blocked");
    expect(context.fake.calls).toHaveLength(1);
    expect(isBotChallenge({ status: 200, body: "<form><div class='g-recaptcha'></div>", headers: {} })).toBe(
      true,
    );
    expect(isBotChallenge({ status: 200, body: "<h1>Jobs</h1>", headers: {} })).toBe(false);
    expect(isBotChallenge({ status: 200, body: "", headers: { "cf-mitigated": "challenge" } })).toBe(true);
  });

  it("applies robots.txt: binding refuses, record only records", async () => {
    const recorded = [
      { url: "https://board.example/robots.txt", body: "User-agent: *\nDisallow: /search\n" },
      { url: "https://board.example/search?q=x", body: "<html>results</html>" },
    ];
    const binding = testContext(recorded);
    expect(
      await reason(binding.http.getText("https://board.example/search?q=x", { robots: "binding" })),
    ).toBe("blocked");
    expect(binding.fake.calls.map((call) => call.url)).toEqual(["https://board.example/robots.txt"]);

    const records: boolean[] = [];
    const context = testContext(recorded);
    const http = new HttpClient({
      userAgent: "BruteForceHR/test",
      fetch: context.fake.fetch,
      sleep: async () => undefined,
      onRobots: (record) => records.push(record.allowed),
    });
    const response = await http.getText("https://board.example/search?q=x", { robots: "record" });
    expect(response.body).toBe("<html>results</html>");
    expect(records).toEqual([false]);
  });

  it("parses Retry-After seconds and dates", () => {
    expect(retryAfterMs("5", 0)).toBe(5_000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 0)).toBe(10_000);
    expect(retryAfterMs(undefined, 0)).toBeNull();
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(
    [
      "# comment",
      "User-agent: BadBot",
      "Disallow: /",
      "",
      "User-agent: *",
      "Disallow: /private",
      "Allow: /private/jobs",
      "Disallow: /*.pdf$",
      "Disallow:",
      "",
      "User-agent: BruteForceHR",
      "User-agent: OtherBot",
      "Disallow: /api/",
    ].join("\n"),
  );

  it("uses the group naming our agent, else *", () => {
    expect(isAllowedByRobots(rules, "BruteForceHR", "/api/x")).toBe(false);
    expect(isAllowedByRobots(rules, "BruteForceHR", "/private")).toBe(true);
    expect(isAllowedByRobots(rules, "SomeBot", "/private/x")).toBe(false);
    expect(isAllowedByRobots(rules, "SomeBot", "/private/jobs/1")).toBe(true);
    expect(isAllowedByRobots(rules, "SomeBot", "/files/cv.pdf")).toBe(false);
    expect(isAllowedByRobots(rules, "SomeBot", "/files/cv.pdf?x")).toBe(true);
    expect(isAllowedByRobots(rules, "BadBot", "/")).toBe(false);
  });

  it("allows everything without rules", () => {
    expect(isAllowedByRobots(parseRobots(""), "BruteForceHR", "/anything")).toBe(true);
  });
});
