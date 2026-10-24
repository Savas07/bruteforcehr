import { z } from "zod";
import { CountryCodeSchema, CurrencySchema, IdSchema, LanguageTagSchema, TimestampSchema } from "../common";
import { EU_AUTHORIZATION_COUNTRIES } from "../matching/score";

/* ------------------------------------------------------------------------------------------------
 * Answers library (BRIEF §4.4.3 external-apply kit, ADR 0002 "Answers library"):
 * `users/{uid}/answers/{id}`, one document per answer, managed in Settings › Application answers
 * and copied from the kit. `firebase/firestore.rules` mirrors the constants below.
 * ---------------------------------------------------------------------------------------------- */

/** Kit groups, in display order: Work authorization, Availability, Compensation, Links, Q&A. */
export const ANSWER_KINDS = [
  "work_authorization",
  "notice_period",
  "salary_expectation",
  "link",
  "qa",
] as const;
export const AnswerKindSchema = z.enum(ANSWER_KINDS);
export type AnswerKind = z.infer<typeof AnswerKindSchema>;

export const ANSWER_LABEL_MAX = 200;
export const ANSWER_TEXT_MAX = 4_000;
/** One value per language; EN/TR/DE plus a few spare. */
export const ANSWER_VALUES_MAX = 6;
export const ANSWER_COUNTRIES_MAX = 30;

export const AnswerValueSchema = z.object({
  language: LanguageTagSchema,
  text: z.string().min(1).max(ANSWER_TEXT_MAX),
});
export type AnswerValue = z.infer<typeof AnswerValueSchema>;

/** `users/{uid}/answers/{id}`. */
export const AnswerSchema = z
  .object({
    id: IdSchema,
    kind: AnswerKindSchema,
    /** The question or row label ("Notice period", "Why do you want to work here?"). */
    label: z.string().min(1).max(ANSWER_LABEL_MAX),
    /** The answer per language; the kit picks the job's language, then the fallback language. */
    values: z.array(AnswerValueSchema).min(1).max(ANSWER_VALUES_MAX),
    /** Where the answer applies: country codes or `EU` (EU/EEA + CH). Empty = everywhere. */
    countries: z.array(z.union([CountryCodeSchema, z.literal("EU")])).max(ANSWER_COUNTRIES_MAX),
    /** Salary expectations: the currency the amount is in; null = any posting. */
    currency: CurrencySchema.nullable(),
    /** Sort order within its kind (ascending). */
    position: z.int().min(0).max(100_000),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .superRefine((answer, ctx) => {
    const languages = answer.values.map((value) => value.language);
    if (new Set(languages).size !== languages.length)
      ctx.addIssue({ code: "custom", message: "One value per language", path: ["values"] });
  });
export type Answer = z.infer<typeof AnswerSchema>;

/** One row of the application kit: the answer's text in the language chosen for the job. */
export interface KitAnswer {
  readonly id: string;
  readonly kind: AnswerKind;
  readonly label: string;
  readonly text: string;
  readonly language: string;
  /** The answer names the job's country (or the EU for an EU job), not just "everywhere". */
  readonly countrySpecific: boolean;
}

export interface KitContext {
  /** The job's country (`jobs.locations[0].countryCode`), null when unknown or remote. */
  readonly countryCode: string | null;
  /** The posting's currency (`jobs.salary.currency`), null when unknown. */
  readonly currency: string | null;
  /** The posting's language. */
  readonly language: string | null;
  /** Used when an answer has no value in the posting's language (the profile's UI language). */
  readonly fallbackLanguage: string;
}

const baseLanguage = (tag: string): string => tag.toLowerCase().split("-")[0] ?? tag;

/**
 * The answers that apply to a job, in kit order (kind, then country-specific before general,
 * then `position`). An answer tagged with countries applies when one of them is the job's country
 * (`EU` covers EU/EEA + CH); with an unknown country every answer applies. A salary answer with
 * a currency is left out when the posting names another currency. Each answer's text is the value
 * in the posting's language, else the fallback language, else its first value.
 */
export function answersForJob(answers: readonly Answer[], context: KitContext): KitAnswer[] {
  const country = context.countryCode;
  const matches = (region: string) =>
    region === country ||
    (region === "EU" && country !== null && EU_AUTHORIZATION_COUNTRIES.includes(country));
  const wanted = [context.language, context.fallbackLanguage]
    .filter((tag): tag is string => tag !== null)
    .map(baseLanguage);
  const rows: (KitAnswer & { position: number })[] = [];
  for (const answer of answers) {
    if (country !== null && answer.countries.length > 0 && !answer.countries.some(matches)) continue;
    if (context.currency !== null && answer.currency !== null && answer.currency !== context.currency)
      continue;
    const value =
      wanted
        .map((base) => answer.values.find((candidate) => baseLanguage(candidate.language) === base))
        .find((candidate) => candidate !== undefined) ?? answer.values[0];
    if (value === undefined) continue;
    rows.push({
      id: answer.id,
      kind: answer.kind,
      label: answer.label,
      text: value.text,
      language: value.language,
      countrySpecific: country !== null && answer.countries.some(matches),
      position: answer.position,
    });
  }
  // Code-unit order for the last tie-break, so the Swift port sorts identically.
  return rows
    .sort(
      (a, b) =>
        ANSWER_KINDS.indexOf(a.kind) - ANSWER_KINDS.indexOf(b.kind) ||
        Number(b.countrySpecific) - Number(a.countrySpecific) ||
        a.position - b.position ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map(({ position: _position, ...row }) => row);
}
