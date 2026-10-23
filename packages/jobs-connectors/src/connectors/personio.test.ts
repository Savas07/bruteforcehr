import { JobSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { NOW, testContext } from "../../test/harness";
import { toJobDraft } from "../listing";
import { personio } from "./personio";

// Fixture: live response of ottonova.jobs.personio.de/xml, 2026-10-24, trimmed to 3 positions
// (description CDATA shortened).
const URL_OTTONOVA = "https://ottonova.jobs.personio.de/xml";

describe("personio", () => {
  it("parses the XML feed and normalizes its positions", async () => {
    const context = testContext([{ url: URL_OTTONOVA, fixture: "personio-ottonova.xml" }]);
    const listings = await personio.list({ boardToken: "ottonova", region: "us" }, context);
    expect(context.fake.calls.map((call) => call.url)).toEqual([URL_OTTONOVA]);
    expect(context.fake.calls[0]?.headers["accept"]).toContain("application/xml");
    expect(listings).toHaveLength(3);
    expect(listings[0]).toMatchObject({
      source: "personio",
      sourceId: "ottonova:2690964",
      url: "https://ottonova.jobs.personio.de/job/2690964",
      applyUrl: "https://ottonova.jobs.personio.de/job/2690964",
      isDirectFromEmployer: true,
      // Entities decoded.
      title: "Senior AI Engineer – Architecture & Platform (m/w/d)",
      company: "ottonova Technology Services GmbH",
      locations: ["München"],
      employmentType: "full_time",
      postedAt: new Date("2026-06-29T15:20:46Z"),
      tags: ["Data & Analytics", "Technology"],
    });
    // CDATA kept verbatim, one block per description section.
    expect(listings[0]?.description).toMatch(/^<h3>YOUR TEAM<\/h3>ottonova is Germany’s first/);
    expect(listings[0]?.description).toContain(
      "<h3>YOUR IMPACT</h3><strong>Your Focus: Implementing AI Use Cases<br></strong>",
    );
    expect(listings[1]).toMatchObject({
      sourceId: "ottonova:2807356",
      title: "Head of Finance & Controlling (m/w/d)",
      description: "",
    });
    expect(listings[2]).toMatchObject({
      sourceId: "ottonova:2573573",
      locations: ["München", "Köln"],
      // `full-or-part-time` names no single type.
      employmentType: null,
      company: "ottonova Krankenversicherung AG",
    });
    expect(listings[2]?.tags).toContain("Solvency 2");
    const [first] = listings;
    if (first === undefined) throw new Error("no listing");
    const draft = toJobDraft(first, NOW);
    expect(JobSchema.safeParse({ id: "j", ...draft }).success).toBe(true);
    expect(draft?.locations[0]?.countryCode).toBe("DE");
    expect(draft?.description).not.toMatch(/<|&lt;|CDATA/);
    expect(JobSchema.safeParse({ id: "j", ...toJobDraft(listings[1] ?? first, NOW) }).success).toBe(true);
  });

  it("reads the documented example (multi-line CDATA, intern, offset time zone)", async () => {
    const body = `<workzag-jobs><position><id>4103</id><office>Munich</office><name>Praktikant (m/w)</name>
      <jobDescriptions><jobDescription><name>Beschreibung</name><value><![CDATA[
        Für unser Büro &amp; Team<br>]]></value></jobDescription></jobDescriptions>
      <employmentType>intern</employmentType><schedule>full-time</schedule>
      <createdAt>2016-05-31T12:14:07+0200</createdAt></position></workzag-jobs>`;
    const context = testContext([{ url: URL_OTTONOVA.replace("ottonova", "acme"), body }]);
    const [listing] = await personio.list({ boardToken: "acme", region: "us" }, context);
    expect(listing).toMatchObject({
      company: "acme",
      locations: ["Munich"],
      employmentType: "internship",
      description: "<h3>Beschreibung</h3>Für unser Büro &amp; Team<br>",
      postedAt: new Date("2016-05-31T10:14:07Z"),
    });
  });

  it("reports a missing board and an unexpected payload", async () => {
    const context = testContext([
      {
        url: URL_OTTONOVA.replace("ottonova", "nope"),
        status: 404,
        body: "<html><body>Go to personio.com</body></html>",
      },
      { url: URL_OTTONOVA.replace("ottonova", "html"), body: "<html><body>Careers</body></html>" },
      {
        url: URL_OTTONOVA.replace("ottonova", "odd"),
        body: "<workzag-jobs><position><name>No id</name></position></workzag-jobs>",
      },
    ]);
    for (const boardToken of ["nope", "html", "odd"]) {
      await expect(personio.list({ boardToken, region: "us" }, context)).rejects.toMatchObject({
        reason: "invalid_response",
      });
    }
    expect(
      await personio.list(
        { boardToken: "empty", region: "us" },
        testContext([
          {
            url: URL_OTTONOVA.replace("ottonova", "empty"),
            body: '<?xml version="1.0"?>\n<workzag-jobs>\n</workzag-jobs>',
          },
        ]),
      ),
    ).toEqual([]);
  });
});
