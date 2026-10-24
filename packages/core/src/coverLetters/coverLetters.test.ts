import { describe, expect, it } from "vitest";
import {
  CoverLetterDraftRequestSchema,
  fillMergeFields,
  mergeFieldsIn,
  STARTER_COVER_LETTER_TEMPLATES,
} from "./index";

describe("merge fields", () => {
  it("lists the fields of a text once, in order", () => {
    expect(mergeFieldsIn("{company}: {role} at {company}, {unknown} {name}")).toEqual([
      "company",
      "role",
      "name",
    ]);
  });

  it("fills known values and keeps unknown ones as tokens", () => {
    expect(
      fillMergeFields("Dear {hiring_manager}, the {role} role at {company}. {name} · {date}", {
        role: "Data Engineer",
        company: "Nordwind GmbH",
        name: "  ",
        hiring_manager: null,
      }),
    ).toEqual({
      text: "Dear {hiring_manager}, the Data Engineer role at Nordwind GmbH. {name} · {date}",
      unresolved: ["hiring_manager", "name", "date"],
    });
  });

  it("does not treat values as tokens again", () => {
    expect(fillMergeFields("{company}", { company: "{name} Ltd" }).text).toBe("{name} Ltd");
  });
});

describe("starter templates", () => {
  it("has one per letter language, using only known merge fields", () => {
    expect(STARTER_COVER_LETTER_TEMPLATES.map((template) => template.language)).toEqual(["en", "tr", "de"]);
    for (const template of STARTER_COVER_LETTER_TEMPLATES) {
      expect(mergeFieldsIn(template.body)).toEqual(expect.arrayContaining(["role", "company", "name"]));
      expect(template.body).not.toMatch(/\{(?!role\}|company\}|name\})[^}]*\}/);
    }
  });
});

describe("CoverLetterDraftRequestSchema", () => {
  it("takes an optional template", () => {
    const base = { cvId: "cv1", revisionId: "r1", jobId: "j1", tone: "warm", language: "de" };
    expect(CoverLetterDraftRequestSchema.safeParse(base).success).toBe(true);
    expect(CoverLetterDraftRequestSchema.safeParse({ ...base, templateId: "starter-de" }).success).toBe(true);
    expect(CoverLetterDraftRequestSchema.safeParse({ ...base, tone: "direct" }).success).toBe(false);
  });
});
