import { describe, expect, it } from "vitest";
import { type Answer, AnswerSchema, answersForJob } from "./index";
import { ANSWERS_SAMPLE } from "./sample";

describe("AnswerSchema", () => {
  it("accepts the sample answers", () => {
    for (const answer of ANSWERS_SAMPLE) expect(AnswerSchema.safeParse(answer).success, answer.id).toBe(true);
  });

  it("allows one value per language and at least one value", () => {
    const [first] = ANSWERS_SAMPLE as [Answer];
    expect(AnswerSchema.safeParse({ ...first, values: [] }).success).toBe(false);
    expect(
      AnswerSchema.safeParse({
        ...first,
        values: [
          { language: "en", text: "a" },
          { language: "en", text: "b" },
        ],
      }).success,
    ).toBe(false);
    expect(AnswerSchema.safeParse({ ...first, kind: "favourite_colour" }).success).toBe(false);
    expect(AnswerSchema.safeParse({ ...first, countries: ["Germany"] }).success).toBe(false);
  });
});

describe("answersForJob", () => {
  const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

  it("picks the job country's answers before general ones, in kit order", () => {
    const rows = answersForJob(ANSWERS_SAMPLE, {
      countryCode: "DE",
      currency: "EUR",
      language: "de",
      fallbackLanguage: "en",
    });
    expect(ids(rows)).toEqual(["auth-eu", "notice", "salary-eur", "linkedin", "why"]);
    expect(rows[0]).toMatchObject({
      countrySpecific: true,
      language: "de",
      text: "EU-Bürger, keine Arbeitserlaubnis nötig.",
    });
    // No German value: the fallback language.
    expect(rows.find((row) => row.id === "why")?.language).toBe("en");
  });

  it("leaves out answers for other countries and currencies", () => {
    const rows = answersForJob(ANSWERS_SAMPLE, {
      countryCode: "GB",
      currency: "GBP",
      language: "en",
      fallbackLanguage: "tr",
    });
    expect(ids(rows)).toEqual(["auth-uk", "notice", "linkedin", "why"]);
  });

  it("shows every answer when the country and currency are unknown", () => {
    const rows = answersForJob(ANSWERS_SAMPLE, {
      countryCode: null,
      currency: null,
      language: null,
      fallbackLanguage: "tr",
    });
    expect(ids(rows)).toEqual(["auth-eu", "auth-uk", "notice", "salary-eur", "linkedin", "why"]);
    expect(rows.every((row) => !row.countrySpecific)).toBe(true);
    expect(rows.find((row) => row.id === "notice")?.language).toBe("tr");
    // No Turkish value and no posting language: the first value.
    expect(rows.find((row) => row.id === "why")?.language).toBe("en");
  });

  it("matches region-tagged values by base language", () => {
    const rows = answersForJob(ANSWERS_SAMPLE, {
      countryCode: "AT",
      currency: null,
      language: "de-AT",
      fallbackLanguage: "en",
    });
    expect(rows[0]).toMatchObject({ id: "auth-eu", language: "de", countrySpecific: true });
  });
});
