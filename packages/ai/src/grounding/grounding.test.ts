import { describe, expect, it } from "vitest";
import { GROUNDING_CASES } from "../../eval/adversarial";
import { GroundingSource, findUngrounded, fold, repairWithPlaceholders } from "./grounding";

describe("fold", () => {
  it("folds case, diacritics, Turkish i and ß", () => {
    expect(fold("İSTANBUL Işık Straße – Müller")).toBe("istanbul isik strasse - muller");
  });
});

describe("grounding cases (eval/adversarial.ts)", () => {
  it.each(GROUNDING_CASES.map((c) => [c.id, c] as const))("%s", (_id, testCase) => {
    const source = new GroundingSource(testCase.source);
    const issues = findUngrounded(testCase.output, source, { entities: testCase.entities });
    expect(issues.map((issue) => issue.text)).toEqual(testCase.ungrounded);
    if (testCase.repaired !== undefined) {
      expect(repairWithPlaceholders(testCase.output, source, { entities: testCase.entities }).text).toBe(
        testCase.repaired,
      );
    }
  });
});

describe("GroundingSource", () => {
  const source = new GroundingSource(
    "Ayşe Yılmaz\n+90 (532) 555 12 34 · ayse.yilmaz@example.com\nlinkedin.com/in/ayseyilmaz\nOcak 2020 – Halen",
  );

  it("matches phones across national and international notation", () => {
    expect(source.hasPhone("0532 555 12 34")).toBe(true);
    expect(source.hasPhone("+90 532 555 12 35")).toBe(false);
  });

  it("matches emails case-insensitively and phrases ignoring punctuation", () => {
    expect(source.hasEmail("Ayse.Yilmaz@example.com")).toBe(true);
    expect(source.hasPhrase("AYŞE YILMAZ")).toBe(true);
    expect(source.hasPhrase("Ayşe Demir")).toBe(false);
  });

  it("knows Turkish month names at month precision only", () => {
    expect(source.hasDate("2020-01")).toBe(true);
    expect(source.hasDate("2020")).toBe(true);
    expect(source.hasDate("2020-02")).toBe(false);
    expect(source.hasDate("2020-01-15")).toBe(false);
  });

  it("reads ambiguous day/month orders both ways", () => {
    const dates = new GroundingSource("04/05/2021");
    expect(dates.hasDate("2021-05-04")).toBe(true);
    expect(dates.hasDate("2021-04-05")).toBe(true);
  });
});

describe("repairWithPlaceholders", () => {
  it("reports ungrounded entities instead of hiding them behind a placeholder", () => {
    const source = new GroundingSource("Built the data pipeline.");
    const repair = repairWithPlaceholders("Built the Snowflake data pipeline, cutting costs 30%.", source, {
      entities: "hard+capitalized",
    });
    expect(repair.rejected.map((issue) => issue.text)).toEqual(["Snowflake"]);
    expect(repair.text).toBe("Built the Snowflake data pipeline, cutting costs [X%].");
  });

  it("does not check German nouns under the hard policy but still checks acronyms", () => {
    const source = new GroundingSource("Verantwortlich für Kundenprojekte.");
    expect(findUngrounded("Leitung von Kundenprojekten", source, { entities: "hard" })).toEqual([]);
    expect(
      findUngrounded("Leitung von KPI-Projekten", source, { entities: "hard" }).map((i) => i.text),
    ).toEqual(["KPI"]);
  });
});
