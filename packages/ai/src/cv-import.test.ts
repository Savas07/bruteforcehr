import { readFile } from "node:fs/promises";
import type { JsonResume } from "@bfhr/core";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { CV_FIXTURES } from "../eval/fixtures/cvs";
import { groundImport, importCv } from "./cv-import";
import { extractDocxText, extractPdfText } from "./extract/text";
import type { CvImportItem, CvImportOutput } from "./prompts/cv-import";
import { memoryLedger, scriptedProvider } from "./test-helpers";

const LOCATION = ["address", "postalCode", "city", "region", "countryCode"];

/** What a perfect model reply for `resume` looks like (the generic item format). */
function itemsFor(resume: JsonResume): CvImportOutput {
  const items: CvImportItem[] = [];
  const toItem = (section: CvImportItem["section"], value: Record<string, unknown>): CvImportItem => ({
    section,
    fields: Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, v]) => ({ key: key as CvImportItem["fields"][number]["key"], value: v })),
    lists: Object.entries(value)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
      .map(([key, values]) => ({ key: key as CvImportItem["lists"][number]["key"], values })),
    confidence: 0.95,
    uncertain: [],
  });
  if (resume.basics !== undefined) {
    const { location, profiles, ...rest } = resume.basics;
    items.push(
      toItem("basics", {
        ...rest,
        ...Object.fromEntries(Object.entries(location ?? {}).filter(([k]) => LOCATION.includes(k))),
      }),
    );
    for (const profile of profiles ?? []) items.push(toItem("profile", profile));
  }
  for (const section of [
    "work",
    "education",
    "skills",
    "languages",
    "certificates",
    "projects",
    "volunteer",
    "awards",
    "publications",
    "interests",
    "references",
  ] as const) {
    for (const entry of resume[section] ?? []) items.push(toItem(section, entry as Record<string, unknown>));
  }
  return { items, unmappedSections: [] };
}

async function fixtureText(id: string): Promise<{ text: string; bytes: Uint8Array; format: "pdf" | "docx" }> {
  const fixture = CV_FIXTURES.find((f) => f.id === id);
  if (fixture === undefined) throw new Error(id);
  const bytes = new Uint8Array(
    await readFile(new URL(`../eval/fixtures/files/${fixture.id}.${fixture.format}`, import.meta.url)),
  );
  const text = fixture.format === "pdf" ? await extractPdfText(bytes) : await extractDocxText(bytes);
  return { text, bytes, format: fixture.format };
}

describe("groundImport on every eval fixture", () => {
  it.each(CV_FIXTURES.map((f) => [f.id, f] as const))("keeps every true value of %s", async (id, fixture) => {
    const { text } = await fixtureText(id);
    const result = groundImport(itemsFor(fixture.expected), text);
    expect(result.warnings).toEqual([]);
    expect(result.resume).toEqual(fixture.expected);
  });
});

describe("groundImport", () => {
  const source = [
    "Jane Doe",
    "jane.doe@example.com · +44 7700 900123",
    "Experience",
    "Kestrel Analytics Ltd — Data Analyst, 2019 – Present",
    "• Built churn dashboards in Looker for 12 regional teams",
    "• Automated weekly reporting",
  ].join("\n");

  it("removes values that are not in the source and keeps the rest", () => {
    const output: CvImportOutput = {
      items: [
        {
          section: "basics",
          fields: [
            { key: "name", value: "Jane Doe" },
            { key: "email", value: "jane@kestrel.io" },
            { key: "phone", value: "07700 900123" },
            { key: "countryCode", value: "GB" },
          ],
          lists: [],
          confidence: 0.9,
          uncertain: [],
        },
        {
          section: "work",
          fields: [
            { key: "name", value: "Kestrel Analytics Ltd" },
            { key: "position", value: "Senior Data Analyst" },
            { key: "startDate", value: "2019-03" },
            { key: "summary", value: "Led a team of 5 analysts at Kestrel Analytics Ltd." },
          ],
          lists: [
            {
              key: "highlights",
              values: [
                "Built churn dashboards in Looker for 12 regional teams",
                "Automated weekly reporting, saving 10 hours a week",
                "Built churn dashboards in Tableau for 12 regional teams",
              ],
            },
          ],
          confidence: 0.8,
          uncertain: ["startDate: month unclear"],
        },
      ],
      unmappedSections: ["Hobbies", "Experience"],
    };
    const result = groundImport(output, source);
    expect(result.resume).toEqual({
      basics: { name: "Jane Doe", phone: "07700 900123" },
      work: [
        {
          name: "Kestrel Analytics Ltd",
          startDate: "2019",
          highlights: ["Built churn dashboards in Looker for 12 regional teams"],
        },
      ],
    });
    expect(result.warnings).toEqual([
      "dropped_ungrounded:/basics/email",
      "dropped_ungrounded:/basics/location/countryCode",
      "dropped_ungrounded:/work/0/position",
      "date_month_dropped:/work/0/startDate",
      "dropped_ungrounded:/work/0/summary",
      "dropped_ungrounded:/work/0/highlights/1",
      "dropped_ungrounded:/work/0/highlights/1",
      "unmapped_section:Experience",
    ]);
    expect(result.droppedValues).toBe(6);
    expect(result.confidence).toEqual({
      "/basics/name": 0.9,
      "/basics/phone": 0.9,
      "/work/0/name": 0.8,
      // uncertain (×0.6) and month dropped (×0.7)
      "/work/0/startDate": 0.34,
      "/work/0/highlights/0": 0.8,
    });
  });

  it("ignores keys a section does not allow and drops invalid dates", () => {
    const result = groundImport(
      {
        items: [
          {
            section: "languages",
            fields: [
              { key: "language", value: "Jane" },
              { key: "startDate", value: "2019" },
            ],
            lists: [{ key: "highlights", values: ["Automated weekly reporting"] }],
            confidence: 1,
            uncertain: [],
          },
          {
            section: "work",
            fields: [
              { key: "name", value: "Kestrel Analytics Ltd" },
              { key: "endDate", value: "Present" },
            ],
            lists: [],
            confidence: 1.4,
            uncertain: [],
          },
        ],
        unmappedSections: [],
      },
      source,
    );
    expect(result.resume).toEqual({
      languages: [{ language: "Jane" }],
      work: [{ name: "Kestrel Analytics Ltd" }],
    });
    expect(result.warnings).toEqual(["dropped_invalid_date:/work/0/endDate"]);
    expect(result.confidence["/work/0/name"]).toBe(1);
  });
});

describe("importCv", () => {
  it("runs PDF imports through the model under the budget and grounds the reply", async () => {
    const fixture = CV_FIXTURES.find((f) => f.format === "pdf" && f.language === "de");
    if (fixture === undefined) throw new Error("no German PDF fixture");
    const { bytes } = await fixtureText(fixture.id);
    const reply = itemsFor(fixture.expected);
    reply.items.push({
      section: "certificates",
      fields: [{ key: "name", value: "PMP" }],
      lists: [],
      confidence: 0.9,
      uncertain: [],
    });
    const provider = scriptedProvider([reply]);
    const { ledger, state } = memoryLedger();
    const result = await importCv("pdf", bytes, { provider, ledger });
    expect(result.resume).toEqual(fixture.expected);
    expect(result.droppedValues).toBe(1);
    expect(result).toMatchObject({ model: "claude-sonnet-5-5", promptVersion: "cv-import@1" });
    expect(provider.requests[0]?.user).toContain("<cv_text>");
    expect(state.reserves).toHaveLength(1);
    expect(state.settles[0]?.[1]).toBe(7_000); // 1000 in × $2 + 500 out × $10, in micro-USD
  });

  it("validates JSON Resume files without a model, removing invalid values", async () => {
    const json = {
      $schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
      basics: { name: "Jane Doe", email: "jane@example.com" },
      work: [{ name: "Acme", startDate: "2019-3", endDate: "2021-04", highlights: ["Shipped"] }],
      meta: { theme: "elegant" },
    };
    const provider = scriptedProvider([]);
    const result = await importCv("json", strToU8(JSON.stringify(json)), {
      provider,
      ledger: memoryLedger().ledger,
    });
    expect(result.resume).toEqual({
      basics: { name: "Jane Doe", email: "jane@example.com" },
      work: [{ name: "Acme", endDate: "2021-04", highlights: ["Shipped"] }],
    });
    expect(result.warnings).toEqual(["dropped_invalid:/work/0/startDate"]);
    expect(result).toMatchObject({ model: "none", promptVersion: "json-resume@1" });
    expect(result.confidence["/work/0/highlights/0"]).toBe(1);
    expect(provider.requests).toHaveLength(0);
  });

  it("maps a LinkedIn data export deterministically", async () => {
    const zip = zipSync({
      "Basic_LinkedInDataExport_10-01-2026/Profile.csv": strToU8(
        '\uFEFFFirst Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers\r\nDeniz,Aksoy,,,"Mar 3, 1994",Frontend Engineer,"Builds accessible web apps.",Software,34000,"Istanbul, Türkiye",[denizcodes],"[PORTFOLIO:https://deniz.example.com]",\r\n',
      ),
      "Email Addresses.csv": strToU8(
        "Email Address,Confirmed,Primary,Updated On\nold@example.com,Yes,No,1/1/20\ndeniz@example.com,Yes,Yes,1/1/24\n",
      ),
      "Positions.csv": strToU8(
        'Company Name,Title,Description,Location,Started On,Finished On\nLumenfold,Frontend Engineer,"- Built the design system\n- Cut bundle size by 30%","Istanbul, Türkiye",Jan 2022,\nAnatolia Yazılım,Junior Developer,Maintained internal tools.,,Sep 2019,Dec 2021\n',
      ),
      "Education.csv": strToU8(
        "School Name,Start Date,End Date,Notes,Degree Name,Activities\nBoğaziçi Üniversitesi,2015,2019,,Lisans,\n",
      ),
      "Skills.csv": strToU8("Name\nReact\nTypeScript\n"),
      "Languages.csv": strToU8("Name,Proficiency\nEnglish,Full professional proficiency\n"),
      "Connections.csv": strToU8("Notes:\nPrivacy note\n\nFirst Name,Last Name\nA,B\n"),
    });
    const result = await importCv("linkedin-zip", zip, {
      provider: scriptedProvider([]),
      ledger: memoryLedger().ledger,
    });
    expect(result.resume).toEqual({
      basics: {
        name: "Deniz Aksoy",
        label: "Frontend Engineer",
        email: "deniz@example.com",
        url: "https://deniz.example.com",
        summary: "Builds accessible web apps.",
        location: { city: "Istanbul", postalCode: "34000" },
        profiles: [{ network: "Twitter", username: "denizcodes" }],
      },
      work: [
        {
          name: "Lumenfold",
          position: "Frontend Engineer",
          location: "Istanbul, Türkiye",
          startDate: "2022-01",
          highlights: ["Built the design system", "Cut bundle size by 30%"],
        },
        {
          name: "Anatolia Yazılım",
          position: "Junior Developer",
          startDate: "2019-09",
          endDate: "2021-12",
          summary: "Maintained internal tools.",
        },
      ],
      education: [
        { institution: "Boğaziçi Üniversitesi", studyType: "Lisans", startDate: "2015", endDate: "2019" },
      ],
      skills: [{ name: "React" }, { name: "TypeScript" }],
      languages: [{ language: "English", fluency: "Full professional proficiency" }],
    });
    expect(result.warnings).toEqual([]);
    expect(result).toMatchObject({ model: "none", promptVersion: "linkedin-zip@1" });
  });

  it("rejects files that are not what the kind says", async () => {
    const deps = { provider: scriptedProvider([]), ledger: memoryLedger().ledger };
    await expect(importCv("pdf", strToU8("hello"), deps)).rejects.toMatchObject({
      reason: "unreadable_file",
    });
    await expect(importCv("docx", strToU8("%PDF-1.7"), deps)).rejects.toMatchObject({
      reason: "unreadable_file",
    });
    await expect(importCv("json", strToU8("[1,2]"), deps)).rejects.toMatchObject({
      reason: "unreadable_file",
    });
    await expect(importCv("linkedin-zip", strToU8("nope"), deps)).rejects.toMatchObject({
      reason: "unreadable_file",
    });
  });
});
