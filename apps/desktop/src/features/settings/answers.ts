/**
 * Settings › Application answers (research/apply.md "Answers library management"): the editor's
 * pure logic. An answer has a kind (the kit's group), a label, one text per language (EN/TR/DE
 * edited here; others are kept), the countries it is for (codes or `EU`; none = everywhere) and,
 * for salary expectations, a currency. Order is `position` within a kind.
 */
import {
  ANSWER_COUNTRIES_MAX,
  ANSWER_KINDS,
  ANSWER_LABEL_MAX,
  ANSWER_TEXT_MAX,
  type Answer,
  type AnswerKind,
} from "@bfhr/core";
import type { AnswerInput } from "../../data/jobs/repository";

export const ANSWER_LANGUAGES = ["en", "tr", "de"] as const;
export type AnswerLanguage = (typeof ANSWER_LANGUAGES)[number];

/** Currencies offered for salary expectations, by the target markets (kickoff §0). */
export const ANSWER_CURRENCIES = ["EUR", "TRY", "GBP", "USD", "CHF"] as const;

export interface AnswerForm {
  readonly kind: AnswerKind;
  readonly label: string;
  readonly values: Readonly<Record<AnswerLanguage, string>>;
  /** Countries as typed: codes separated by commas or spaces ("DE, NL, EU"). */
  readonly countries: string;
  /** "" = any posting. */
  readonly currency: string;
}

export type AnswerFormError = "label" | "values" | "countries" | "tooManyCountries";

const base = (tag: string) => tag.toLowerCase().split("-")[0] ?? tag;

export function answerForm(answer: Answer | null, kind: AnswerKind = "work_authorization"): AnswerForm {
  const text = (language: AnswerLanguage) => answer?.values.find((value) => base(value.language) === language)?.text ?? "";
  return {
    kind: answer?.kind ?? kind,
    label: answer?.label ?? "",
    values: { en: text("en"), tr: text("tr"), de: text("de") },
    countries: answer?.countries.join(", ") ?? "",
    currency: answer?.currency ?? "",
  };
}

/** The countries field as codes (upper case, de-duplicated); null when one isn't a code or `EU`. */
export function parseCountries(text: string): string[] | null {
  const entries = [...new Set(text.split(/[\s,;]+/u).filter(Boolean).map((entry) => entry.toUpperCase()))];
  return entries.every((entry) => entry === "EU" || /^[A-Z]{2}$/u.test(entry)) ? entries : null;
}

/** What to save, or the first problem (in form order). Values in other languages are kept. */
export function answerInput(
  form: AnswerForm,
  existing: Answer | null,
  position: number,
): { readonly input: AnswerInput } | { readonly error: AnswerFormError } {
  const label = form.label.trim().slice(0, ANSWER_LABEL_MAX);
  if (label === "") return { error: "label" };
  const edited = ANSWER_LANGUAGES.flatMap((language) => {
    const text = form.values[language].trim().slice(0, ANSWER_TEXT_MAX);
    return text === "" ? [] : [{ language, text }];
  });
  const kept = (existing?.values ?? []).filter((value) => !ANSWER_LANGUAGES.some((language) => language === base(value.language)));
  const values = [...edited, ...kept];
  if (edited.length === 0) return { error: "values" };
  const countries = parseCountries(form.countries);
  if (countries === null) return { error: "countries" };
  if (countries.length > ANSWER_COUNTRIES_MAX) return { error: "tooManyCountries" };
  return {
    input: {
      kind: form.kind,
      label,
      values,
      countries,
      currency: form.kind === "salary_expectation" && form.currency !== "" ? form.currency : null,
      position,
    },
  };
}

/** Answers in kit order: by kind, then `position`, then id. */
export function sortedAnswers(answers: readonly Answer[]): Answer[] {
  return answers.toSorted(
    (a, b) =>
      ANSWER_KINDS.indexOf(a.kind) - ANSWER_KINDS.indexOf(b.kind) ||
      a.position - b.position ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The next position at the end of `kind`. */
export function nextPosition(answers: readonly Answer[], kind: AnswerKind): number {
  return Math.max(-1, ...answers.filter((answer) => answer.kind === kind).map((answer) => answer.position)) + 1;
}

/**
 * Moves `answerId` one place up (-1) or down (+1) within its kind and renumbers the kind 0…n-1;
 * returns only the answers whose position changes (empty at either end).
 */
export function moveAnswer(
  answers: readonly Answer[],
  answerId: string,
  step: -1 | 1,
): { readonly answerId: string; readonly position: number }[] {
  const moved = answers.find((answer) => answer.id === answerId);
  if (!moved) return [];
  const kind = sortedAnswers(answers).filter((answer) => answer.kind === moved.kind);
  const index = kind.findIndex((answer) => answer.id === answerId);
  const target = index + step;
  if (target < 0 || target >= kind.length) return [];
  const order = [...kind];
  order.splice(index, 1);
  order.splice(target, 0, moved);
  return order.flatMap((answer, position) => (answer.position === position ? [] : [{ answerId: answer.id, position }]));
}
