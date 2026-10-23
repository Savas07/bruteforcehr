import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { workable } from "./workable";

// Fixture: live response of apply.workable.com for the `blueground` account, 2026-10-24, trimmed to 3 jobs.
const URL_BLUEGROUND = "https://apply.workable.com/api/v1/widget/accounts/blueground?details=true";

describe("workable", () => {
  it("lists an account's jobs and normalizes them", async () => {
    const context = testContext([{ url: URL_BLUEGROUND, fixture: "workable-blueground.json" }]);
    const listings = await workable.list({ boardToken: "blueground", region: "us" }, context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([URL_BLUEGROUND]);
    expect(context.fake.calls[0]?.headers).toMatchObject({ accept: "application/json" });
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "workable",
      sourceId: "blueground:186545F8C1",
      url: "https://apply.workable.com/j/186545F8C1",
      applyUrl: "https://apply.workable.com/j/186545F8C1/apply",
      isDirectFromEmployer: true,
      title: "Client Experience Coordinator (English & Greek Speaker) - Talent Pool",
      company: "Blueground",
      locations: ["Athens, Attica, Greece"],
      remote: false,
      employmentType: "full_time",
      postedAt: new Date("2026-02-12"),
      tags: ["Shared Services", "Customer Service"],
    });
    expect(listings[1]).toMatchObject({
      sourceId: "blueground:407973D643",
      locations: ["Brazil"],
      remote: true,
      tags: [],
    });
    expect(listings[2]?.locations).toEqual(["Vienna, Vienna, Austria"]);
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.remoteType).toBe("onsite");
    expect(draft?.description).not.toMatch(/<|&lt;/);
    expect(toJobDraft(listings[1] ?? first, NOW)?.remoteType).toBe("remote");
  });

  it("falls back to the top-level place and the subdomain", async () => {
    const body = JSON.stringify({
      jobs: [
        {
          title: "Engineer",
          shortcode: "AB12",
          url: "https://apply.workable.com/j/AB12",
          city: "Berlin",
          country: "Germany",
          locations: [],
        },
      ],
    });
    const context = testContext([{ url: URL_BLUEGROUND.replace("blueground", "acme"), body }]);
    const [listing] = await workable.list({ boardToken: "acme", region: "us" }, context);
    expect(listing).toMatchObject({
      company: "acme",
      locations: ["Berlin, Germany"],
      applyUrl: "https://apply.workable.com/j/AB12",
      remote: null,
      description: "",
    });
  });

  it("reports a missing account and an unexpected payload", async () => {
    const context = testContext([
      { url: URL_BLUEGROUND.replace("blueground", "nope"), status: 404, body: "Not Found" },
      { url: URL_BLUEGROUND.replace("blueground", "odd"), body: '{"name":"Odd"}' },
    ]);
    await expect(workable.list({ boardToken: "nope", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(workable.list({ boardToken: "odd", region: "us" }, context)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });
});
