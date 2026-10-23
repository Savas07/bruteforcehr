import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { SourceError } from "../types";
import { greenhouse } from "./greenhouse";

const URL_US = "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true";

describe("greenhouse", () => {
  it("lists a board and normalizes its postings", async () => {
    const context = testContext([{ url: URL_US, fixture: "greenhouse-gitlab.json" }]);
    const listings = await greenhouse.list({ boardToken: "gitlab", region: "us" }, context);
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "greenhouse",
      sourceId: "gitlab:8860302002",
      url: "https://job-boards.greenhouse.io/gitlab/jobs/8860302002",
      isDirectFromEmployer: true,
      title: "Account Executive - France",
      company: "GitLab",
      locations: ["Remote, France"],
    });
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(draft).not.toBeNull();
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.remoteType).toBe("remote");
    expect(draft?.locations[0]?.countryCode).toBe("FR");
    expect(draft?.description).not.toMatch(/<|&lt;/);
    expect(listings[2]?.locations).toEqual([
      "Remote, Canada",
      "Remote, United Kingdom",
      "Remote, United States",
    ]);
    expect(context.fake.calls[0]?.headers["user-agent"]).toMatch(/^BruteForceHR\//);
  });

  it("reads EU-hosted boards from the same API host", async () => {
    const context = testContext([
      { url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true", body: '{"jobs":[]}' },
    ]);
    expect(await greenhouse.list({ boardToken: "acme", region: "eu" }, context)).toEqual([]);
  });

  it("reports a missing board", async () => {
    const context = testContext([{ url: URL_US.replace("gitlab", "nope"), status: 404, body: "{}" }]);
    await expect(greenhouse.list({ boardToken: "nope", region: "us" }, context)).rejects.toBeInstanceOf(
      SourceError,
    );
  });
});
