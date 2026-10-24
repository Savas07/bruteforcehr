import type { Answer } from "@bfhr/core";
import { AnswerSchema } from "@bfhr/core";
import { FIXTURE_NOW } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { answerForm, answerInput, moveAnswer, nextPosition, parseCountries, sortedAnswers } from "./answers";

const answer = (id: string, fields: Partial<Answer>): Answer => ({
  id,
  kind: "notice_period",
  label: "Notice period",
  values: [{ language: "en", text: "Three months" }],
  countries: [],
  currency: null,
  position: 0,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  ...fields,
});

describe("answers editor", () => {
  it("round-trips an answer and keeps values in other languages", () => {
    const existing = answer("a", {
      values: [
        { language: "en", text: "Three months" },
        { language: "nl", text: "Drie maanden" },
      ],
      countries: ["DE", "EU"],
    });
    const form = answerForm(existing);
    expect(form).toMatchObject({ countries: "DE, EU", values: { en: "Three months", tr: "", de: "" } });
    const result = answerInput({ ...form, values: { ...form.values, de: " Drei Monate " } }, existing, 4);
    if (!("input" in result)) throw new Error(result.error);
    expect(result.input.values).toEqual([
      { language: "en", text: "Three months" },
      { language: "de", text: "Drei Monate" },
      { language: "nl", text: "Drie maanden" },
    ]);
    expect(AnswerSchema.safeParse({ ...result.input, id: "a", createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW }).success).toBe(true);
  });

  it("says what is missing, in form order", () => {
    const form = answerForm(null);
    expect(answerInput(form, null, 0)).toEqual({ error: "label" });
    expect(answerInput({ ...form, label: "Notice" }, null, 0)).toEqual({ error: "values" });
    expect(answerInput({ ...form, label: "Notice", values: { en: "1 month", tr: "", de: "" }, countries: "Germany" }, null, 0)).toEqual({
      error: "countries",
    });
    expect(parseCountries("de, eu nl;NL")).toEqual(["DE", "EU", "NL"]);
  });

  it("keeps a currency only for salary expectations", () => {
    const form = { ...answerForm(null, "salary_expectation"), label: "Salary", values: { en: "€70k", tr: "", de: "" }, currency: "EUR" };
    const salary = answerInput(form, null, 0);
    const link = answerInput({ ...form, kind: "link" }, null, 0);
    expect("input" in salary && salary.input.currency).toBe("EUR");
    expect("input" in link && link.input.currency).toBeNull();
  });

  it("orders within a kind and renumbers on a move", () => {
    const answers = [
      answer("b", { position: 1 }),
      answer("a", { position: 0 }),
      answer("l", { kind: "link", position: 0 }),
      answer("c", { position: 5 }),
    ];
    expect(sortedAnswers(answers).map((entry) => entry.id)).toEqual(["a", "b", "c", "l"]);
    expect(nextPosition(answers, "notice_period")).toBe(6);
    expect(nextPosition(answers, "qa")).toBe(0);
    expect(moveAnswer(answers, "c", -1)).toEqual([
      { answerId: "c", position: 1 },
      { answerId: "b", position: 2 },
    ]);
    expect(moveAnswer(answers, "a", -1)).toEqual([]);
  });
});
